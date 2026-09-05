/**
 * Ratings, on the server.
 *
 * The blind window lives here rather than in the screens, because a rule that
 * only the UI honours is not a rule. Nothing in this file ever returns a
 * rating the viewer is not yet allowed to read — the filter is applied before
 * the data leaves, not after it arrives.
 *
 * Never import this from client code.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";
import { assignmentById } from "./offer-store.server";
import {
  aggregate,
  checkRating,
  isVisible,
  visibleAt,
  type Aggregate,
  type Rating,
  type RaterRole,
} from "@/lib/marketplace/ratings";

const DATA_FILE = dataFile("ratings.json");

interface Db {
  ratings: Rating[];
}

let db: Db | null = null;

const newId = () => randomBytes(12).toString("hex");

function load(): Db {
  if (db) return db;
  if (!existsSync(DATA_FILE)) {
    db = { ratings: [] };
    return db;
  }
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<Db>;
    db = { ratings: Array.isArray(raw.ratings) ? raw.ratings : [] };
  } catch (err) {
    console.error("[ratings] could not read the store, starting empty", err);
    db = { ratings: [] };
  }
  return db;
}

function save(next: Db) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, DATA_FILE);
  db = next;
}

const forAssignment = (assignmentId: string): Rating[] =>
  load().ratings.filter((r) => r.assignmentId === assignmentId);

/** The rating the other side wrote on the same job, if they have. */
function counterpartOf(rating: Rating): Rating | null {
  return forAssignment(rating.assignmentId).find((r) => r.raterId !== rating.raterId) ?? null;
}

// ── writing ────────────────────────────────────────────────────────────────

export interface RatingResult {
  rating?: Rating;
  /** When it becomes readable by the person it is about. */
  visibleAt?: string | null;
  error?: string;
}

/**
 * One person rates the other, once, on a job they both finished.
 *
 * Refused on anything but a completed assignment. A cancelled job has nothing
 * to rate — whatever went wrong there is a dispute, and a one-star review is
 * not how a dispute gets recorded.
 */
export function submitRating(args: {
  assignmentId: string;
  raterId: string;
  score: number;
  comment?: string | null;
  now?: number;
}): RatingResult {
  const assignment = assignmentById(args.assignmentId);
  if (!assignment) return { error: "No such job." };

  const isPilot = assignment.pilotId === args.raterId;
  const isDispatcher = assignment.dispatcherId === args.raterId;
  if (!isPilot && !isDispatcher) return { error: "No such job." };

  if (assignment.status !== "completed") {
    return {
      error:
        assignment.status === "cancelled"
          ? "This job was cancelled, so there is nothing to rate."
          : "You can rate each other once the job is finished.",
    };
  }

  const check = checkRating({ score: args.score, comment: args.comment });
  if (!check.ok) return { error: check.reason };

  const store = load();
  if (
    store.ratings.some((r) => r.assignmentId === args.assignmentId && r.raterId === args.raterId)
  ) {
    /*
     * One rating per person per job, and it cannot be edited.
     *
     * A score you can revise after reading the reply is a score somebody can
     * be leaned on to change, which is exactly what the blind window exists to
     * prevent.
     */
    return { error: "You have already rated this job." };
  }

  const raterRole: RaterRole = isPilot ? "pilot" : "dispatcher";
  const rating: Rating = {
    id: newId(),
    assignmentId: assignment.id,
    loadId: assignment.loadId,
    raterId: args.raterId,
    raterRole,
    rateeId: isPilot ? assignment.dispatcherId : assignment.pilotId,
    score: args.score,
    comment: (args.comment ?? "").trim().slice(0, 1000) || null,
    createdAt: new Date(args.now ?? Date.now()).toISOString(),
  };

  save({ ratings: [...store.ratings, rating] });
  return { rating, visibleAt: visibleAt(rating, counterpartOf(rating)) };
}

// ── reading ────────────────────────────────────────────────────────────────

/** Whether this person still owes a rating on this job. */
export function hasRated(assignmentId: string, raterId: string): boolean {
  return forAssignment(assignmentId).some((r) => r.raterId === raterId);
}

/**
 * The ratings about someone that anybody is allowed to read.
 *
 * Filtered here, so a caller cannot forget to. A hidden rating is not returned
 * in a form the reader could count, let alone display.
 */
export function visibleRatingsAbout(userId: string, now = Date.now()): Rating[] {
  return load()
    .ratings.filter((r) => r.rateeId === userId)
    .filter((r) => isVisible(r, counterpartOf(r), now))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Someone's score as it may be shown. Null average until something is readable. */
export function ratingFor(userId: string, now = Date.now()): Aggregate {
  return aggregate(visibleRatingsAbout(userId, now));
}

/**
 * What one person may see about one job: their own rating always, the other
 * side's only once the window is up.
 */
export function ratingsOnAssignment(
  assignmentId: string,
  viewerId: string,
  now = Date.now(),
): { mine: Rating | null; theirs: Rating | null; theirsVisibleAt: string | null } {
  const all = forAssignment(assignmentId);
  const mine = all.find((r) => r.raterId === viewerId) ?? null;
  const other = all.find((r) => r.raterId !== viewerId) ?? null;

  if (!other) return { mine, theirs: null, theirsVisibleAt: null };

  return {
    mine,
    theirs: isVisible(other, mine, now) ? other : null,
    theirsVisibleAt: isVisible(other, mine, now) ? null : visibleAt(other, null),
  };
}

/** For the data-rights export: everything this person wrote or received. */
export function ratingDataFor(userId: string): { written: Rating[]; received: Rating[] } {
  const all = load().ratings;
  return {
    written: all.filter((r) => r.raterId === userId),
    received: all.filter((r) => r.rateeId === userId),
  };
}

/**
 * Deletes what this person wrote, and anonymises what they received.
 *
 * A rating somebody left about a pilot is the pilot's record, not the
 * dispatcher's — deleting the dispatcher's account should not erase the
 * pilot's history. The author is unlinked instead.
 */
export function deleteRatingData(userId: string): { received: number; unlinked: number } {
  const store = load();
  const received = store.ratings.filter((r) => r.rateeId === userId).length;
  let unlinked = 0;

  const ratings = store.ratings
    // Scores about somebody who no longer exists are about nobody. They go.
    .filter((r) => r.rateeId !== userId)
    .map((r) => {
      if (r.raterId !== userId) return r;
      unlinked += 1;
      // What they said about the other person stays on that person's record;
      // the link back to the author does not.
      return { ...r, raterId: "" };
    });

  save({ ratings });
  return { received, unlinked };
}

/** Test seam. */
export function resetRatingStore() {
  db = { ratings: [] };
}

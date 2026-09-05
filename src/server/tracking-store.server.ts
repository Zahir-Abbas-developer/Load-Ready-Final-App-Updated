/**
 * Where a pilot has been while working a job.
 *
 * The most sensitive store in the product, so it is the smallest: a position,
 * an assignment, and nothing else. No account id is written on a position —
 * the assignment already names both parties, and duplicating the pilot's id
 * onto every row would make the file itself a movement history keyed by
 * person.
 *
 * Nothing here decides *whether* a position may be recorded. That is the
 * route's job, checked against the assignment's live status, because a store
 * that both authorises and writes is one edit away from writing without
 * authorising.
 *
 * Never import this from client code.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";
import { isExpired, shouldRecord, type Position } from "@/lib/tracking/rules";

const DATA_FILE = dataFile("tracking.json");

export interface TrackedPosition extends Position {
  assignmentId: string;
}

interface Db {
  positions: TrackedPosition[];
  /** Pilots who have agreed to share their location while working. */
  consents: Array<{ userId: string; agreedAt: string; revokedAt: string | null }>;
}

let db: Db | null = null;

/**
 * A hard ceiling per job, so one phone with a stuck loop cannot fill the disk.
 *
 * At one fix every thirty seconds this is about twenty hours of escorting,
 * which is longer than any legal driving day.
 */
export const MAX_PER_ASSIGNMENT = 2_500;

function load(): Db {
  if (db) return db;
  if (!existsSync(DATA_FILE)) {
    db = { positions: [], consents: [] };
    return db;
  }
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<Db>;
    db = {
      positions: Array.isArray(raw.positions) ? raw.positions : [],
      consents: Array.isArray(raw.consents) ? raw.consents : [],
    };
  } catch (err) {
    console.error("[tracking] could not read the store, starting empty", err);
    db = { positions: [], consents: [] };
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

// ── consent ────────────────────────────────────────────────────────────────

/**
 * Whether this pilot has agreed to share their location while working.
 *
 * Asked once, revocable, and checked before anything is recorded. A consent
 * that cannot be withdrawn is not consent — revoking it stops the recording
 * and leaves what is already stored to the retention sweep, which is the
 * honest position rather than pretending the history never happened.
 */
export function hasConsented(userId: string): boolean {
  const row = load().consents.find((c) => c.userId === userId);
  return Boolean(row && !row.revokedAt);
}

export function setConsent(userId: string, agreed: boolean, now = Date.now()) {
  const store = load();
  const at = new Date(now).toISOString();
  const others = store.consents.filter((c) => c.userId !== userId);
  save({
    ...store,
    consents: [
      ...others,
      agreed
        ? { userId, agreedAt: at, revokedAt: null }
        : {
            userId,
            agreedAt: store.consents.find((c) => c.userId === userId)?.agreedAt ?? at,
            revokedAt: at,
          },
    ],
  });
}

// ── live fan-out ───────────────────────────────────────────────────────────

type Listener = (position: TrackedPosition) => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribe(assignmentId: string, listener: Listener): () => void {
  const set = listeners.get(assignmentId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(assignmentId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(assignmentId);
  };
}

function fanOut(position: TrackedPosition) {
  for (const listener of listeners.get(position.assignmentId) ?? []) {
    try {
      listener(position);
    } catch (err) {
      console.error("[tracking] a listener threw", err);
    }
  }
}

// ── writing ────────────────────────────────────────────────────────────────

export const lastPosition = (assignmentId: string): TrackedPosition | null => {
  const mine = load().positions.filter((p) => p.assignmentId === assignmentId);
  return mine.length === 0 ? null : mine[mine.length - 1];
};

export interface RecordResult {
  /** How many of the offered fixes were worth keeping. */
  recorded: number;
  /** How many were dropped as too close in time or space to the last one. */
  thinned: number;
  last: TrackedPosition | null;
}

/**
 * Records a batch of fixes, keeping only the ones that say something new.
 *
 * A batch rather than one at a time because a pilot loses signal in every
 * cutting and tunnel on the route; the app queues what it could not send and
 * offers it all when the phone comes back. They are applied in time order so
 * the thinning behaves the same as it would have live.
 */
export function recordPositions(assignmentId: string, offered: Position[]): RecordResult {
  const store = load();
  const ordered = [...offered].sort((a, b) => a.at - b.at);

  let last = lastPosition(assignmentId);
  const kept: TrackedPosition[] = [];

  for (const position of ordered) {
    if (!shouldRecord(position, last)) continue;
    const tracked: TrackedPosition = { ...position, assignmentId };
    kept.push(tracked);
    last = tracked;
  }

  if (kept.length === 0) return { recorded: 0, thinned: ordered.length, last };

  const mine = [...store.positions.filter((p) => p.assignmentId === assignmentId), ...kept].slice(
    -MAX_PER_ASSIGNMENT,
  );
  const others = store.positions.filter((p) => p.assignmentId !== assignmentId);

  save({ ...store, positions: [...others, ...mine] });
  for (const position of kept) fanOut(position);

  return { recorded: kept.length, thinned: ordered.length - kept.length, last };
}

// ── reading ────────────────────────────────────────────────────────────────

export const trailFor = (assignmentId: string, limit = MAX_PER_ASSIGNMENT): TrackedPosition[] =>
  load()
    .positions.filter((p) => p.assignmentId === assignmentId)
    .slice(-limit);

// ── retention ──────────────────────────────────────────────────────────────

/**
 * Removes everything past the retention window.
 *
 * The promise in the privacy policy is ninety days, and a promise nothing
 * enforces is a sentence rather than a limit.
 */
export function purgeExpired(now = Date.now()): number {
  const store = load();
  const keep = store.positions.filter((p) => !isExpired(p, now));
  const removed = store.positions.length - keep.length;
  if (removed > 0) save({ ...store, positions: keep });
  return removed;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startRetentionSweep(intervalMs = 6 * 60 * 60 * 1000) {
  if (timer) return;
  const run = () => {
    try {
      const removed = purgeExpired();
      if (removed > 0) console.log(`[tracking] removed ${removed} expired position(s)`);
    } catch (err) {
      console.error("[tracking] retention sweep failed", err);
    }
  };
  run();
  timer = setInterval(run, intervalMs);
  timer.unref?.();
}

export function stopRetentionSweep() {
  if (timer) clearInterval(timer);
  timer = null;
}

// ── data rights ────────────────────────────────────────────────────────────

/**
 * This person's own movements, by way of the assignments they were the pilot on.
 *
 * The caller passes the assignment ids because this store does not know who
 * anybody is — which is the point of it not knowing.
 */
export function trackingDataFor(userId: string, assignmentIds: string[]) {
  const wanted = new Set(assignmentIds);
  return {
    locationConsent: load().consents.find((c) => c.userId === userId) ?? null,
    positions: load().positions.filter((p) => wanted.has(p.assignmentId)),
  };
}

export function deleteTrackingData(userId: string, assignmentIds: string[]): number {
  const store = load();
  const wanted = new Set(assignmentIds);
  const keep = store.positions.filter((p) => !wanted.has(p.assignmentId));
  const removed = store.positions.length - keep.length;
  save({
    positions: keep,
    consents: store.consents.filter((c) => c.userId !== userId),
  });
  return removed;
}

/** Test seam. */
export function resetTrackingStore() {
  db = { positions: [], consents: [] };
  listeners.clear();
}

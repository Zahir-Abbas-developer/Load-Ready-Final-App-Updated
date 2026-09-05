/**
 * Offers and assignments.
 *
 * This is where the marketplace actually commits people to things, so three
 * rules run through it:
 *
 * 1. **Eligibility is checked here, not trusted from the board.** The board's
 *    eligibility is guidance rendered in a browser; this is the gate. A pilot
 *    whose insurance lapsed between opening the app and tapping Accept is
 *    refused here, and that is the only check that counts.
 * 2. **First eligible accept wins, and the race is decided synchronously.** The
 *    whole accept path is one synchronous pass over the store with no `await`
 *    in the middle, so two pilots tapping at once cannot both be assigned.
 * 3. **Accepting one offer declines the others on that position**, because a
 *    pilot left "pending" on a slot somebody else has is a pilot holding a day
 *    free for a job they will never get.
 *
 * Never import this from client code.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";
import { loadById, saveLoad } from "./load-store.server";
import { pilotRecord, withLiveStatus } from "./profile-store.server";
import { isEntitledPilot } from "./billing-store.server";
import { ineligibilityFor } from "@/lib/marketplace/matching";
import {
  checkBid,
  isExpired,
  type Assignment,
  type AssignmentStatus,
  type Offer,
} from "@/lib/marketplace/offers";
import {
  canAdvance,
  canMarkNoShow,
  checkCompletion,
  deriveWork,
  noticeHours,
  type Mover,
} from "@/lib/marketplace/lifecycle";
import type { Load } from "@/lib/marketplace/types";

const DATA_FILE = dataFile("offers.json");

interface Db {
  offers: Offer[];
  assignments: Assignment[];
}

let db: Db | null = null;

const newId = () => randomBytes(12).toString("hex");

/**
 * Fills in the lifecycle fields on an assignment written before H3 added them.
 *
 * An assignment made in H2 has no history, so one is invented from the only
 * event we know happened: it was created. Cheaper than a migration for a
 * JSON store, and it means an existing hire keeps working rather than
 * rendering as an empty timeline.
 */
function normalise(a: Assignment): Assignment {
  return {
    ...a,
    history:
      Array.isArray(a.history) && a.history.length > 0
        ? a.history
        : [{ status: "assigned", at: a.createdAt, by: "dispatcher" }],
    completionNotes: a.completionNotes ?? null,
    milesDriven: a.milesDriven ?? null,
    cancelledBy: a.cancelledBy ?? null,
    cancellationNoticeHours: a.cancellationNoticeHours ?? null,
    noShow: a.noShow ?? false,
  };
}

function load(): Db {
  if (db) return db;
  if (!existsSync(DATA_FILE)) {
    db = { offers: [], assignments: [] };
    return db;
  }
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<Db>;
    db = {
      offers: Array.isArray(raw.offers) ? raw.offers : [],
      assignments: (Array.isArray(raw.assignments) ? raw.assignments : []).map(normalise),
    };
  } catch (err) {
    console.error("[offers] could not read the store, starting empty", err);
    db = { offers: [], assignments: [] };
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

// ── reading ────────────────────────────────────────────────────────────────

export const offersForLoad = (loadId: string): Offer[] =>
  load().offers.filter((o) => o.loadId === loadId);

export const offersByPilot = (pilotId: string): Offer[] =>
  load()
    .offers.filter((o) => o.pilotId === pilotId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

export const offerById = (id: string): Offer | null =>
  load().offers.find((o) => o.id === id) ?? null;

export const assignmentsForLoad = (loadId: string): Assignment[] =>
  load().assignments.filter((a) => a.loadId === loadId);

export const assignmentsForPilot = (pilotId: string): Assignment[] =>
  load()
    .assignments.filter((a) => a.pilotId === pilotId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

/**
 * Whether these two people are working a job together right now.
 *
 * The single question ADR-8 turns on: contact details are revealed when, and
 * only when, an assignment exists between them. Everything that unmasks
 * anything asks this.
 */
export function hasAssignmentBetween(pilotId: string, dispatcherId: string): boolean {
  return load().assignments.some(
    (a) => a.pilotId === pilotId && a.dispatcherId === dispatcherId && a.status !== "cancelled",
  );
}

/**
 * Jobs this person is in the middle of, on either side.
 *
 * Asked before an account deletion: there is somebody at a yard at six
 * tomorrow morning expecting them, and vanishing is not one of the options.
 */
export function liveAssignmentsFor(userId: string): Assignment[] {
  return load().assignments.filter(
    (a) =>
      (a.pilotId === userId || a.dispatcherId === userId) &&
      a.status !== "completed" &&
      a.status !== "cancelled",
  );
}

export function assignmentFor(loadId: string, pilotId: string): Assignment | null {
  return (
    load().assignments.find(
      (a) => a.loadId === loadId && a.pilotId === pilotId && a.status !== "cancelled",
    ) ?? null
  );
}

// ── making an offer ────────────────────────────────────────────────────────

export interface OfferResult {
  offer?: Offer;
  assignment?: Assignment;
  error?: string;
  /** Set when the refusal is about the pilot rather than the request. */
  reasons?: string[];
}

/**
 * The gate every offer passes.
 *
 * Returns the load and slot when the pilot may act on them, or the reason they
 * may not. Synchronous on purpose — see rule 2 at the top of the file.
 */
function gate(
  loadId: string,
  slotId: string,
  pilotId: string,
  pilotName: string,
  now: number,
): { load: Load; slotIndex: number } | { error: string; reasons?: string[] } {
  const l = loadById(loadId);
  if (!l) return { error: "No such load." };

  const slotIndex = l.slots.findIndex((s) => s.id === slotId);
  if (slotIndex < 0) return { error: "No such position on this load." };

  if (isExpired(l, now)) {
    return { error: "This load has already started." };
  }

  const record = withLiveStatus(pilotRecord(pilotId, pilotName));
  const entitled = isEntitledPilot(pilotId, now);
  const reasons = ineligibilityFor(l, l.slots[slotIndex], { record, entitled, now });

  if (reasons.length > 0) {
    /*
     * Lead with the reason that is about the *load* rather than the pilot.
     *
     * Losing a race for a fixed-price position is the commonest refusal there
     * is, and "you cannot take this position" sends somebody off to check
     * their own certifications when the truth is that another pilot was three
     * seconds faster. Say which it was.
     */
    const aboutTheLoad = reasons.find(
      (r) => r.code === "slot-taken" || r.code === "load-not-open" || r.code === "not-invited",
    );
    return {
      error: aboutTheLoad?.reason ?? "You cannot take this position.",
      reasons: reasons.map((r) => r.reason),
    };
  }

  return { load: l, slotIndex };
}

/**
 * A pilot offers on a position.
 *
 * On a fixed-price position this **is** the acceptance: the pilot is assigned
 * immediately and everybody else's offer on that slot is declined. On a bidding
 * position it creates an offer the dispatcher decides on.
 */
export function makeOffer(args: {
  loadId: string;
  slotId: string;
  pilotId: string;
  pilotName: string;
  amountCents: number;
  pickupEstimate?: string | null;
  notes?: string | null;
  now?: number;
}): OfferResult {
  const now = args.now ?? Date.now();
  const gated = gate(args.loadId, args.slotId, args.pilotId, args.pilotName, now);
  if ("error" in gated) return gated;

  const { load: l, slotIndex } = gated;
  const slot = l.slots[slotIndex];

  const bid = checkBid(slot, args.amountCents);
  if (!bid.ok) return { error: bid.reason ?? "That price is not one this dispatcher asked for." };

  const store = load();

  // One live offer per pilot per position. Changing your mind edits the offer
  // rather than stacking a second one the dispatcher has to compare.
  const existing = store.offers.find(
    (o) =>
      o.loadId === l.id &&
      o.slotId === slot.id &&
      o.pilotId === args.pilotId &&
      o.status === "pending",
  );

  const timestamp = new Date(now).toISOString();
  const offer: Offer = existing
    ? {
        ...existing,
        amountCents: args.amountCents,
        pickupEstimate: args.pickupEstimate ?? null,
        notes: args.notes ?? null,
        updatedAt: timestamp,
      }
    : {
        id: newId(),
        loadId: l.id,
        slotId: slot.id,
        pilotId: args.pilotId,
        amountCents: args.amountCents,
        pickupEstimate: args.pickupEstimate ?? null,
        notes: args.notes ?? null,
        status: "pending",
        declineReason: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

  const offers = [...store.offers.filter((o) => o.id !== offer.id), offer];

  if (slot.pricingMode === "bidding") {
    save({ ...store, offers });
    return { offer };
  }

  /*
   * Fixed price: this is the acceptance. Everything below happens in this one
   * synchronous block — the slot is re-read from the store rather than from the
   * copy taken earlier, so two pilots tapping Accept at the same moment cannot
   * both find it free.
   */
  const fresh = loadById(l.id);
  if (!fresh || fresh.slots[slotIndex].assignedPilotId) {
    return { error: "Somebody took that position a moment ago." };
  }

  return commitAssignment({ load: fresh, slotIndex, offer, offers, store, now });
}

/** Withdraws a pilot's own live offer. */
export function withdrawOffer(offerId: string, pilotId: string): OfferResult {
  const store = load();
  const offer = store.offers.find((o) => o.id === offerId && o.pilotId === pilotId);
  if (!offer) return { error: "No such offer." };
  if (offer.status !== "pending") return { error: "That offer is no longer open." };

  const next: Offer = { ...offer, status: "withdrawn", updatedAt: new Date().toISOString() };
  save({ ...store, offers: [...store.offers.filter((o) => o.id !== offerId), next] });
  return { offer: next };
}

// ── the dispatcher's decision ──────────────────────────────────────────────

export function acceptOffer(offerId: string, dispatcherId: string, now = Date.now()): OfferResult {
  const store = load();
  const offer = store.offers.find((o) => o.id === offerId);
  if (!offer) return { error: "No such offer." };
  if (offer.status !== "pending") return { error: "That offer is no longer open." };

  const l = loadById(offer.loadId);
  if (!l || l.dispatcherId !== dispatcherId) return { error: "No such offer." };
  if (isExpired(l, now)) return { error: "This load has already started." };

  const slotIndex = l.slots.findIndex((s) => s.id === offer.slotId);
  if (slotIndex < 0) return { error: "No such position on this load." };
  if (l.slots[slotIndex].assignedPilotId) {
    return { error: "That position is already filled." };
  }

  /*
   * Re-checked at the moment of acceptance, not when the offer was made.
   * A bid placed three days ago by a pilot whose insurance has since lapsed is
   * not a bid we can accept — and the dispatcher would never know.
   */
  const record = withLiveStatus(pilotRecord(offer.pilotId));
  const reasons = ineligibilityFor(l, l.slots[slotIndex], {
    record,
    entitled: isEntitledPilot(offer.pilotId, now),
    now,
  });
  if (reasons.length > 0) {
    return {
      error: "This pilot can no longer take the position.",
      reasons: reasons.map((r) => r.reason),
    };
  }

  return commitAssignment({ load: l, slotIndex, offer, offers: store.offers, store, now });
}

export function declineOffer(offerId: string, dispatcherId: string, reason: string): OfferResult {
  const store = load();
  const offer = store.offers.find((o) => o.id === offerId);
  if (!offer) return { error: "No such offer." };
  if (offer.status !== "pending") return { error: "That offer is no longer open." };

  const l = loadById(offer.loadId);
  if (!l || l.dispatcherId !== dispatcherId) return { error: "No such offer." };

  const next: Offer = {
    ...offer,
    status: "declined",
    // Optional, per the plan — but stored when given, because a pilot who is
    // told why bids better next time.
    declineReason: reason.trim().slice(0, 300) || null,
    updatedAt: new Date().toISOString(),
  };
  save({ ...store, offers: [...store.offers.filter((o) => o.id !== offerId), next] });
  return { offer: next };
}

/**
 * Creates the assignment, fills the slot, and clears the field.
 *
 * One write. The slot, the accepted offer, the declined ones and the load's
 * derived status all change together, so there is no moment where a slot is
 * filled but its losing offers still say "pending".
 */
function commitAssignment(args: {
  load: Load;
  slotIndex: number;
  offer: Offer;
  offers: Offer[];
  store: Db;
  now: number;
}): OfferResult {
  const { load: l, slotIndex, offer, store, now } = args;
  const timestamp = new Date(now).toISOString();

  const assignment: Assignment = {
    id: newId(),
    loadId: l.id,
    slotId: offer.slotId,
    pilotId: offer.pilotId,
    dispatcherId: l.dispatcherId,
    offerId: offer.id,
    agreedAmountCents: offer.amountCents,
    status: "assigned",
    history: [{ status: "assigned", at: timestamp, by: "dispatcher" }],
    completionNotes: null,
    milesDriven: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    cancelledAt: null,
    cancellationReason: null,
    cancelledBy: null,
    cancellationNoticeHours: null,
    noShow: false,
  };

  const offers = args.offers.map((o) => {
    if (o.id === offer.id) return { ...o, status: "accepted" as const, updatedAt: timestamp };
    // Everybody else who wanted this position is told now rather than left
    // holding a day free for a job they will never get.
    if (o.loadId === l.id && o.slotId === offer.slotId && o.status === "pending") {
      return { ...o, status: "declined" as const, updatedAt: timestamp };
    }
    return o;
  });

  const slots = l.slots.map((s, i) =>
    i === slotIndex ? { ...s, assignedPilotId: offer.pilotId } : s,
  );
  const filled = slots.filter((s) => s.assignedPilotId).length;

  saveLoad({
    ...l,
    slots,
    status: filled === slots.length ? "filled" : "partially_filled",
    updatedAt: timestamp,
  });

  save({ offers, assignments: [...store.assignments, assignment] });
  return { offer: { ...offer, status: "accepted", updatedAt: timestamp }, assignment };
}

/**
 * Marks offers on started loads as expired.
 *
 * Read-through rather than scheduled: an offer's status is asked for far more
 * often than a load starts, and computing it on read means there is no window
 * where a job has begun and its offers still look open.
 */
export function expireStaleOffers(now = Date.now()): number {
  const store = load();
  let changed = 0;

  const offers = store.offers.map((o) => {
    if (o.status !== "pending") return o;
    const l = loadById(o.loadId);
    if (!l || !isExpired(l, now)) return o;
    changed += 1;
    return { ...o, status: "expired" as const, updatedAt: new Date(now).toISOString() };
  });

  if (changed > 0) save({ ...store, offers });
  return changed;
}

// ── the job itself ─────────────────────────────────────────────────────────

export const assignmentById = (id: string): Assignment | null =>
  load().assignments.find((a) => a.id === id) ?? null;

/** Every assignment on the loads this dispatcher posted. */
/** Every assignment, for the administrator's console. */
export const allAssignments = (): Assignment[] =>
  [...load().assignments].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

/** Every offer, for the console's fill-rate figures. */
export const allOffers = (): Offer[] => [...load().offers];

export const assignmentsForDispatcher = (dispatcherId: string): Assignment[] =>
  load()
    .assignments.filter((a) => a.dispatcherId === dispatcherId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

export interface AssignmentResult {
  assignment?: Assignment;
  error?: string;
}

function writeAssignment(next: Assignment) {
  const store = load();
  save({
    ...store,
    assignments: [...store.assignments.filter((a) => a.id !== next.id), next],
  });
  syncLoadStatus(next.loadId);
}

/**
 * Puts the load's own status back in step with the jobs on it.
 *
 * The slots say who is hired; the assignments say what is happening. A load
 * whose escorts have all finished but which still reads "Filled" is something
 * the dispatcher has to work around, so it is recomputed on every move.
 */
function syncLoadStatus(loadId: string) {
  const l = loadById(loadId);
  if (!l || l.status === "cancelled" || l.status === "draft") return;

  const work = deriveWork(assignmentsForLoad(loadId));
  const filled = l.slots.filter((s) => s.assignedPilotId).length;

  const status: Load["status"] =
    work === "completed" && filled === l.slots.length
      ? "completed"
      : work === "in_progress"
        ? "in_progress"
        : filled === 0
          ? "open"
          : filled === l.slots.length
            ? "filled"
            : "partially_filled";

  if (status !== l.status) saveLoad({ ...l, status, updatedAt: new Date().toISOString() });
}

/**
 * The pilot moves the job on one step.
 *
 * `to` is required rather than implied. A button that just says "next" sends
 * whatever the screen last thought the state was — and a pilot on a bad
 * connection tapping twice would skip a step without either side noticing.
 */
export function advanceAssignment(args: {
  assignmentId: string;
  actorId: string;
  to: AssignmentStatus;
  now?: number;
}): AssignmentResult {
  const now = args.now ?? Date.now();
  const current = assignmentById(args.assignmentId);
  if (!current) return { error: "No such job." };

  const isPilot = current.pilotId === args.actorId;
  const isDispatcher = current.dispatcherId === args.actorId;
  if (!isPilot && !isDispatcher) return { error: "No such job." };

  const mover: Mover = isPilot ? "pilot" : "dispatcher";
  const check = canAdvance(current.status, args.to, mover);
  if (!check.ok) return { error: check.reason };

  const at = new Date(now).toISOString();
  const next: Assignment = {
    ...current,
    status: args.to,
    history: [...current.history, { status: args.to, at, by: mover }],
    updatedAt: at,
  };
  writeAssignment(next);
  return { assignment: next };
}

/**
 * The pilot closes the job.
 *
 * Same move as any other step, plus the two things that only exist at the end:
 * the miles they actually ran and anything the dispatcher needs on the record.
 */
export function completeAssignment(args: {
  assignmentId: string;
  actorId: string;
  notes?: string | null;
  milesDriven?: number | null;
  now?: number;
}): AssignmentResult {
  const current = assignmentById(args.assignmentId);
  if (!current) return { error: "No such job." };
  if (current.pilotId !== args.actorId) {
    return { error: "Only the pilot on this job can finish it." };
  }

  const ok = checkCompletion({ milesDriven: args.milesDriven ?? null });
  if (!ok.ok) return { error: ok.reason };

  const check = canAdvance(current.status, "completed", "pilot");
  if (!check.ok) return { error: check.reason };

  const now = args.now ?? Date.now();
  const at = new Date(now).toISOString();
  const next: Assignment = {
    ...current,
    status: "completed",
    history: [...current.history, { status: "completed", at, by: "pilot" }],
    completionNotes: (args.notes ?? "").trim().slice(0, 2000) || null,
    milesDriven: args.milesDriven ?? null,
    updatedAt: at,
  };
  writeAssignment(next);
  return { assignment: next };
}

/**
 * Either side walks away.
 *
 * The reason is required and how much notice was given is recorded, because a
 * pattern of two-hour cancellations is something the other side deserves to be
 * able to point at. The slot is freed so the dispatcher can hire again.
 */
export function cancelAssignment(args: {
  assignmentId: string;
  actorId: string;
  reason: string;
  now?: number;
}): AssignmentResult {
  const now = args.now ?? Date.now();
  const current = assignmentById(args.assignmentId);
  if (!current) return { error: "No such job." };

  const isPilot = current.pilotId === args.actorId;
  const isDispatcher = current.dispatcherId === args.actorId;
  if (!isPilot && !isDispatcher) return { error: "No such job." };

  if (current.status === "cancelled") return { assignment: current };
  if (current.status === "completed") {
    return { error: "This job is finished. Ask support if something needs correcting." };
  }

  const reason = args.reason.trim();
  if (reason.length < 3) {
    return { error: "Give a reason — the other side is told it." };
  }

  const l = loadById(current.loadId);
  const at = new Date(now).toISOString();
  const next: Assignment = {
    ...current,
    status: "cancelled",
    history: [
      ...current.history,
      { status: "cancelled", at, by: isPilot ? "pilot" : "dispatcher" },
    ],
    cancelledAt: at,
    cancelledBy: isPilot ? "pilot" : "dispatcher",
    cancellationReason: reason.slice(0, 500),
    cancellationNoticeHours: l ? noticeHours(l.pickupFrom, now) : null,
    updatedAt: at,
  };

  freeSlot(current);
  writeAssignment(next);
  return { assignment: next };
}

/**
 * The dispatcher records that the pilot never turned up.
 *
 * A cancellation, filed as what it actually was. Only from `assigned`, and only
 * once the pickup window has closed — a no-show is a mark on somebody's record
 * and should not be leaveable by being impatient.
 */
export function markNoShow(args: {
  assignmentId: string;
  dispatcherId: string;
  reason: string;
  now?: number;
}): AssignmentResult {
  const now = args.now ?? Date.now();
  const current = assignmentById(args.assignmentId);
  if (!current || current.dispatcherId !== args.dispatcherId) return { error: "No such job." };

  const l = loadById(current.loadId);
  if (!l) return { error: "No such load." };

  const check = canMarkNoShow(current, l.pickupTo, now);
  if (!check.ok) return { error: check.reason };

  const at = new Date(now).toISOString();
  const next: Assignment = {
    ...current,
    status: "cancelled",
    history: [...current.history, { status: "cancelled", at, by: "dispatcher" }],
    cancelledAt: at,
    cancelledBy: "dispatcher",
    cancellationReason: args.reason.trim().slice(0, 500) || "The pilot did not arrive.",
    cancellationNoticeHours: noticeHours(l.pickupFrom, now),
    noShow: true,
    updatedAt: at,
  };

  freeSlot(current);
  writeAssignment(next);
  return { assignment: next };
}

/**
 * Puts the position back on the market.
 *
 * A cancelled assignment leaves a slot nobody is filling. Clearing the pilot
 * from it is what lets the dispatcher hire a replacement — otherwise a
 * cancellation two days out silently takes the position off the board.
 */
function freeSlot(assignment: Assignment) {
  const l = loadById(assignment.loadId);
  if (!l) return;
  const slots = l.slots.map((s) =>
    s.id === assignment.slotId && s.assignedPilotId === assignment.pilotId
      ? { ...s, assignedPilotId: null }
      : s,
  );
  saveLoad({ ...l, slots, updatedAt: new Date().toISOString() });
}

/** Test seam. */
export function resetOfferStore() {
  db = { offers: [], assignments: [] };
}

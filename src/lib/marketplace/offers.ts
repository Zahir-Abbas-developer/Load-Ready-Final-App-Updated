/**
 * Offers and assignments — the moment two strangers commit to a job.
 *
 * Everything here is pure so the rules can be tested against every state. The
 * two that matter most:
 *
 * - **A bid has to be inside the dispatcher's guardrails.** A pilot who bids
 *   below the floor is undercutting a price nobody offered; one above the
 *   ceiling is wasting both their afternoons.
 * - **Applicants are ranked so a dispatcher can choose quickly**, and the
 *   ranking says what it is ranking on, because "why is this one first" is the
 *   first question anybody asks of a sorted list.
 */
import type { EscortSlot, PublicLoad } from "./types";

export type OfferStatus = "pending" | "accepted" | "declined" | "withdrawn" | "expired";

export interface Offer {
  id: string;
  loadId: string;
  slotId: string;
  pilotId: string;
  /** Cents. Equal to the slot price on a fixed-price load. */
  amountCents: number;
  /** When the pilot expects to reach the pickup. Free text — no route data yet. */
  pickupEstimate: string | null;
  notes: string | null;
  status: OfferStatus;
  /** Why the dispatcher said no. Optional; shown to the pilot when given. */
  declineReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AssignmentStatus =
  "assigned" | "en_route" | "on_site" | "escorting" | "completed" | "cancelled";

/** One step of the job, with who said so and when. */
export interface StatusEvent {
  status: AssignmentStatus;
  at: string;
  by: "pilot" | "dispatcher" | "admin";
}

export interface Assignment {
  id: string;
  loadId: string;
  slotId: string;
  pilotId: string;
  dispatcherId: string;
  offerId: string;
  agreedAmountCents: number;
  status: AssignmentStatus;
  /**
   * Every step, in order, oldest first.
   *
   * This is the record the job sheet prints and a detention argument turns on,
   * so it is appended to and never rewritten.
   */
  history: StatusEvent[];
  /** What the pilot logged when they closed the job. */
  completionNotes: string | null;
  milesDriven: number | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  /** Which side walked away, and how much warning they gave. */
  cancelledBy: "pilot" | "dispatcher" | null;
  cancellationNoticeHours: number | null;
  /** The pilot never turned up. A cancellation, recorded as what it was. */
  noShow: boolean;
}

// ── what a bid may be ──────────────────────────────────────────────────────

export interface BidCheck {
  ok: boolean;
  /** Shown to the pilot. */
  reason?: string;
}

/**
 * Whether this amount is one the dispatcher asked for.
 *
 * On a fixed-price position there is nothing to decide: the price is the price,
 * and a pilot "accepting" at a different number has not accepted anything.
 */
export function checkBid(slot: EscortSlot, amountCents: number): BidCheck {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, reason: "Enter what you want to be paid." };
  }

  if (slot.pricingMode === "fixed") {
    if (amountCents !== slot.amountCents) {
      return {
        ok: false,
        reason: "This position is a fixed price. Accept it as posted or leave it.",
      };
    }
    return { ok: true };
  }

  const floor = slot.amountCents;
  const ceiling = slot.maxAmountCents ?? Number.POSITIVE_INFINITY;

  if (amountCents < floor) {
    return {
      ok: false,
      reason: `The lowest this dispatcher is taking is ${money(floor)}.`,
    };
  }
  if (amountCents > ceiling) {
    return {
      ok: false,
      reason: `The most this dispatcher will pay is ${money(ceiling)}.`,
    };
  }
  return { ok: true };
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

// ── expiry ─────────────────────────────────────────────────────────────────

/**
 * An offer stops meaning anything once the job it is for has started.
 *
 * The plan's rule. A pilot who bid three weeks ago and heard nothing should not
 * discover on the day that they are expected in another state — and a
 * dispatcher scrolling old applicants should not be able to accept one of them
 * by mistake.
 */
export function isExpired(load: Pick<PublicLoad, "pickupFrom">, now = Date.now()): boolean {
  const start = Date.parse(load.pickupFrom);
  return Number.isFinite(start) && start <= now;
}

// ── ranking applicants ─────────────────────────────────────────────────────

export interface ApplicantSummary {
  offer: Offer;
  pilot: {
    userId: string;
    displayName: string;
    yearsExperience: number | null;
    badges: string[];
    city: string | null;
    region: string | null;
  };
}

/**
 * The order a dispatcher sees applicants in.
 *
 * Price first, and lowest first, because that is the number the dispatcher set
 * a ceiling on and the one they are choosing between. Then verification, then
 * experience — a cheap unverified pilot should not sit above a slightly dearer
 * verified one purely on price, so the tie-breaks do real work.
 *
 * Deliberately *not* weighted into a single score. A dispatcher hiring somebody
 * to escort a 148,000 lb transformer deserves to see the inputs, not a number
 * they cannot interrogate.
 */
export function rankApplicants(applicants: ApplicantSummary[]): ApplicantSummary[] {
  return [...applicants].sort((a, b) => {
    if (a.offer.amountCents !== b.offer.amountCents) {
      return a.offer.amountCents - b.offer.amountCents;
    }

    const verified = (x: ApplicantSummary) => (x.pilot.badges.includes("Verified") ? 0 : 1);
    if (verified(a) !== verified(b)) return verified(a) - verified(b);

    const years = (x: ApplicantSummary) => x.pilot.yearsExperience ?? 0;
    if (years(a) !== years(b)) return years(b) - years(a);

    // Stable last resort, so the list does not reshuffle between refreshes.
    return a.offer.createdAt.localeCompare(b.offer.createdAt);
  });
}

/** Offers that are still live: not withdrawn, declined, expired or superseded. */
export const isLive = (offer: Offer) => offer.status === "pending";

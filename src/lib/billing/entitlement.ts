/**
 * Who may bid on and accept loads.
 *
 * This is the rule from ADR-3, written once, as a pure function so it can be
 * tested against every state a subscription can reach. Nothing else in the app
 * is allowed to decide entitlement — not a component, not a route, not a
 * feature flag. If a screen wants to know, it asks the server, and the server
 * asks this.
 *
 * Deliberately shared between client and server. The client copy exists only to
 * render the right banner; it is never trusted. Every gated action is checked
 * again on the server, because a value that arrives from a browser is a claim,
 * not a fact.
 */

/** Where the subscription came from. `manual` is an administrator's grant. */
export type SubscriptionSource = "stripe" | "apple" | "google" | "manual";

export type SubscriptionStatus =
  "none" | "incomplete" | "trialing" | "active" | "past_due" | "canceled";

/** An administrator's thumb on the scale, in either direction. */
export type SubscriptionOverride = "none" | "comped" | "suspended";

export interface Subscription {
  userId: string;
  source: SubscriptionSource;
  providerSubscriptionId: string | null;
  status: SubscriptionStatus;
  priceId: string | null;
  /** ISO timestamps, or null when they do not apply. */
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  override: SubscriptionOverride;
  overrideReason: string | null;
  updatedAt: string;
}

/**
 * How long a failed payment keeps working while the pilot fixes their card.
 *
 * A pilot mid-escort whose card expires must not lose access to the assignment
 * they are running. Seven days is the plan's figure and is roughly Stripe's own
 * dunning window.
 */
export const PAST_DUE_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function emptySubscription(userId: string): Subscription {
  return {
    userId,
    source: "manual",
    providerSubscriptionId: null,
    status: "none",
    priceId: null,
    trialEnd: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    override: "none",
    overrideReason: null,
    updatedAt: new Date(0).toISOString(),
  };
}

function msSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : now - t;
}

/**
 * The entitlement check. `trialing` and `active` pass; `past_due` passes while
 * inside the grace window; a comp always passes and a suspension never does.
 *
 * `canceled` does not pass. Stripe only moves a subscription to `canceled` when
 * the paid period has actually run out, so a pilot who cancels keeps working
 * until the day they paid for and then drops to browse-only — which is what the
 * plan asks for.
 */
export function isEntitled(sub: Subscription | null, now: number = Date.now()): boolean {
  if (!sub) return false;

  // A suspension is an administrator saying no. It outranks everything,
  // including an active payment, or it would be useless as a safety control.
  if (sub.override === "suspended") return false;
  if (sub.override === "comped") return true;

  switch (sub.status) {
    case "trialing":
    case "active":
      return true;

    case "past_due": {
      // Measure the grace from the end of the period that was not paid for.
      // Falling back to when we last heard about it keeps a mirror with no
      // period end from granting access forever.
      const elapsed = msSince(sub.currentPeriodEnd, now) ?? msSince(sub.updatedAt, now);
      if (elapsed === null) return false;
      return elapsed <= PAST_DUE_GRACE_DAYS * DAY_MS;
    }

    default:
      return false;
  }
}

/** Days left in a trial, rounded up, or null when there is no trial running. */
export function trialDaysLeft(sub: Subscription | null, now: number = Date.now()): number | null {
  if (!sub || sub.status !== "trialing" || !sub.trialEnd) return null;
  const end = Date.parse(sub.trialEnd);
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - now) / DAY_MS));
}

/** Days left before a past-due subscription stops working. */
export function graceDaysLeft(sub: Subscription | null, now: number = Date.now()): number | null {
  if (!sub || sub.status !== "past_due" || sub.override !== "none") return null;
  const elapsed = msSince(sub.currentPeriodEnd, now) ?? msSince(sub.updatedAt, now);
  if (elapsed === null) return null;
  return Math.max(0, Math.ceil((PAST_DUE_GRACE_DAYS * DAY_MS - elapsed) / DAY_MS));
}

/**
 * What the pilot should be told, as a single tag the UI switches on. Kept here
 * rather than in a component so the wording cannot drift from the rule.
 */
export type BillingNotice =
  "none" | "needs-subscription" | "trialing" | "past-due" | "lapsed" | "suspended";

export function billingNotice(sub: Subscription | null, now: number = Date.now()): BillingNotice {
  if (!sub) return "needs-subscription";
  if (sub.override === "suspended") return "suspended";
  if (sub.override === "comped") return "none";

  switch (sub.status) {
    case "trialing":
      return "trialing";
    case "active":
      return "none";
    case "past_due":
      return isEntitled(sub, now) ? "past-due" : "lapsed";
    case "canceled":
      return "lapsed";
    default:
      return "needs-subscription";
  }
}

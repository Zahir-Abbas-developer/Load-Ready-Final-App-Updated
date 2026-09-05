/**
 * The shape of a plan as the client receives it.
 *
 * There are no prices in this file, and there must never be. CLAUDE.md rule 15
 * says prices are read from the provider, never hardcoded in the client — a
 * number baked into the bundle is a number that keeps being shown after you
 * change it in Stripe, which is the kind of mistake that ends in a chargeback.
 * The client asks `GET /api/billing` and renders whatever comes back.
 */
export type PlanInterval = "month" | "year";

export interface Plan {
  /** Stable identifier used when starting a checkout. */
  id: string;
  /** The provider's own price identifier, once there is one. */
  priceId: string | null;
  name: string;
  interval: PlanInterval;
  amountCents: number;
  currency: string;
  /** Filled in for the annual plan: "Save $30.88 a year". */
  note?: string;
}

/** Formats an amount the way the plan picker shows it. */
export function formatPrice(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    // $14.99 keeps its cents; $149 should not read "$149.00" beside it.
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}

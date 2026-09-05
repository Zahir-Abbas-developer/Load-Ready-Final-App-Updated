/**
 * The billing provider port, and the two implementations behind it.
 *
 * Same shape as the backend bypass in C2, and for the same reason: the founder
 * does not have Stripe keys yet, and the work should not wait for them.
 *
 *   manual  — the default. No payments are taken and no card is collected.
 *             Access is granted by an administrator, which is a real feature
 *             (comped launch partners) rather than a pretend checkout.
 *   stripe  — the real thing, wired when the keys arrive.
 *
 * The line that matters most is in `manualBillingProvider.startCheckout`: it
 * refuses. A "bypass" that let a pilot click a button and become entitled would
 * be a way to get a paid product for free, and it would still be there on the
 * day this ships. Entitlement without payment is an administrator's decision,
 * recorded with a reason, and nothing a browser can ask for.
 */
import type { Plan } from "@/lib/billing/plans";

export type BillingProviderName = "manual" | "stripe";

export interface CheckoutRequest {
  userId: string;
  email: string;
  planId: string;
}

export type CheckoutResult =
  { ok: true; url: string } | { ok: false; reason: string; unavailable: true };

export interface BillingProvider {
  readonly name: BillingProviderName;
  /** True when a pilot can pay for themselves right now. */
  readonly selfServe: boolean;
  listPlans(): Plan[];
  /** How long a new subscription runs before the first charge. */
  trialDays(): number;
  startCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  /** Link to the provider's own "manage my card" page. */
  portalUrl(userId: string): Promise<string | null>;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * The published prices: $14.99 a month, $149 a year (LOADREADY_MASTER_PLAN
 * section 1). They are overridable from the environment so a change does not
 * need a deploy, and they are served to the client rather than compiled into
 * it. Once Stripe is live these come from Stripe and this becomes the fallback
 * for the manual provider alone.
 */
function configuredPlans(): Plan[] {
  const currency = process.env.LOADREADY_PRICE_CURRENCY || "USD";
  const monthly = envInt("LOADREADY_PRICE_MONTHLY_CENTS", 1499);
  const annual = envInt("LOADREADY_PRICE_ANNUAL_CENTS", 14900);

  const savingCents = monthly * 12 - annual;
  const plans: Plan[] = [
    {
      id: "monthly",
      priceId: process.env.STRIPE_PRICE_MONTHLY || null,
      name: "Monthly",
      interval: "month",
      amountCents: monthly,
      currency,
    },
    {
      id: "annual",
      priceId: process.env.STRIPE_PRICE_ANNUAL || null,
      name: "Annual",
      interval: "year",
      amountCents: annual,
      currency,
    },
  ];

  if (savingCents > 0) {
    const saving = (savingCents / 100).toFixed(2).replace(/\.00$/, "");
    plans[1].note = `Save $${saving} a year`;
  }
  return plans;
}

/** The plan's TRIAL_DAYS. Seven is the recommendation; the founder decides. */
export function trialDays(): number {
  return envInt("LOADREADY_TRIAL_DAYS", 7);
}

const manualBillingProvider: BillingProvider = {
  name: "manual",
  selfServe: false,
  listPlans: configuredPlans,
  trialDays,

  async startCheckout() {
    // Not "not implemented yet" — refused. See the note at the top of the file.
    return {
      ok: false,
      unavailable: true,
      reason: "Card payments are not switched on yet. Ask an administrator for access.",
    };
  },

  async portalUrl() {
    return null;
  },
};

/**
 * Placeholder for the real provider.
 *
 * It is deliberately not a half-written Stripe integration. Checkout sessions,
 * signature-verified webhooks, idempotency on `stripe_events` and the customer
 * portal are the substance of this phase's remaining work and cannot be written
 * blind against an account nobody can log into — guessing at them would produce
 * code that looks finished, is never run, and is trusted with money.
 *
 * Selecting it without the keys fails loudly rather than falling back to
 * `manual`, because a silent fallback is how a deployment ends up believing it
 * is charging people when it is not.
 */
const stripeBillingProvider: BillingProvider = {
  name: "stripe",
  selfServe: true,
  listPlans: configuredPlans,
  trialDays,

  async startCheckout() {
    throw new Error(
      "The Stripe provider is not wired yet. Set LOADREADY_BILLING=manual, or finish Phase D2 " +
        "(see docs/STRIPE_SETUP.md) before pointing a deployment at Stripe.",
    );
  },

  async portalUrl() {
    throw new Error("The Stripe provider is not wired yet.");
  },
};

export function billingProviderName(): BillingProviderName {
  return process.env.LOADREADY_BILLING?.trim().toLowerCase() === "stripe" ? "stripe" : "manual";
}

export function billingProvider(): BillingProvider {
  return billingProviderName() === "stripe" ? stripeBillingProvider : manualBillingProvider;
}

export { configuredPlans, manualBillingProvider, stripeBillingProvider };

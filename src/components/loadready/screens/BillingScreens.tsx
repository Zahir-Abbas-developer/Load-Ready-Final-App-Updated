import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, CreditCard, Loader2, ShieldOff, X } from "lucide-react";
import { PrimaryButton } from "../PrimaryButton";
import { useBilling } from "@/lib/billing-context";
import { formatPrice, type Plan } from "@/lib/billing/plans";

/**
 * The pilot subscription, on screen.
 *
 * Nothing here renders for a dispatcher or an administrator: `billingApplies`
 * is false for them and the server sends no prices at all (ADR-1). The guard
 * lives in each exported component rather than at the call site, so adding a
 * new one cannot forget it.
 *
 * Prices are never written in this file. They arrive from the server, which
 * reads them from the payment provider (CLAUDE.md rule 15).
 */

/** What the subscription buys. Facts about the product, not marketing. */
const INCLUDED = [
  "Bid on and accept escort loads",
  "See dispatcher contact details once you are assigned",
  "Run assignments with live tracking and in-trip chat",
  "Keep your verified profile and documents on file",
];

function Card({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "warn" }) {
  const border = tone === "warn" ? "border-destructive/40 bg-destructive/5" : "border-border";
  return <div className={`rounded-2xl border ${border} bg-surface p-4`}>{children}</div>;
}

function PlanOption({
  plan,
  selected,
  onSelect,
}: {
  plan: Plan;
  selected: boolean;
  onSelect: () => void;
}) {
  const per = plan.interval === "month" ? "per month" : "per year";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
        selected ? "border-primary bg-accent" : "border-border bg-surface hover:border-primary/40"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">{plan.name}</span>
        <span className="text-lg font-bold text-primary">
          {formatPrice(plan.amountCents, plan.currency)}
        </span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-3">
        {plan.note ? (
          <span className="text-[11px] font-semibold text-success">{plan.note}</span>
        ) : (
          <span />
        )}
        <span className="text-[11px] text-muted-foreground">{per}</span>
      </div>
    </button>
  );
}

/**
 * The banner on the pilot's dashboard.
 *
 * Renders nothing when there is nothing to say — a paid-up pilot should not be
 * reminded daily that they are paying.
 */
export function SubscriptionBanner({ onOpen }: { onOpen: () => void }) {
  const { billingApplies, loading, notice, trialDaysLeft, graceDaysLeft } = useBilling();
  if (!billingApplies || loading || notice === "none") return null;

  const copy: Record<string, { title: string; body: string; warn: boolean }> = {
    "needs-subscription": {
      title: "Subscribe to start bidding",
      body: "You can browse loads now. Bidding and accepting need an active subscription.",
      warn: false,
    },
    trialing: {
      title:
        trialDaysLeft === 0
          ? "Your trial ends today"
          : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your trial`,
      body: "Your access continues automatically when the trial ends.",
      warn: trialDaysLeft !== null && trialDaysLeft <= 2,
    },
    "past-due": {
      title: "Your last payment failed",
      body:
        graceDaysLeft === null
          ? "Update your card to keep bidding."
          : `Update your card within ${graceDaysLeft} day${graceDaysLeft === 1 ? "" : "s"} to keep bidding.`,
      warn: true,
    },
    lapsed: {
      title: "Browse only",
      body: "Your subscription has ended. You can still see loads, but not bid or accept.",
      warn: true,
    },
    suspended: {
      title: "Your account is suspended",
      body: "Bidding is turned off. Contact support@loadready.ai.",
      warn: true,
    },
  };

  const text = copy[notice];
  if (!text) return null;

  return (
    <button
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
        text.warn
          ? "border-destructive/40 bg-destructive/5 hover:border-destructive/60"
          : "border-border bg-surface hover:border-primary/40"
      }`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent">
        {notice === "suspended" ? (
          <ShieldOff className="h-5 w-5 text-primary" />
        ) : text.warn ? (
          <AlertTriangle className="h-5 w-5 text-primary" />
        ) : (
          <CreditCard className="h-5 w-5 text-primary" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{text.title}</div>
        <div className="text-[11px] text-muted-foreground">{text.body}</div>
      </div>
    </button>
  );
}

/** The full subscription screen: status, what it includes, and the plans. */
export function SubscriptionSheet({ onClose }: { onClose: () => void }) {
  const billing = useBilling();
  const [planId, setPlanId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!billing.billingApplies) return null;

  const selected = planId || billing.plans[0]?.id || "";

  const subscribe = async () => {
    if (busy || !selected) return;
    setBusy(true);
    setError(await billing.startCheckout(selected));
    setBusy(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Subscription"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-3xl bg-background"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 pt-4 pb-3">
          <h3 className="font-bold">Subscription</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {billing.entitled && (
            <Card>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success" />
                <span className="text-sm font-semibold">You can bid and accept loads</span>
              </div>
              {billing.currentPeriodEnd && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {billing.cancelAtPeriodEnd ? "Access ends" : "Renews"} on{" "}
                  {new Date(billing.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </Card>
          )}

          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              What it includes
            </h4>
            <ul className="space-y-2">
              {INCLUDED.map((item) => (
                <li key={item} className="flex gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Dispatchers post loads for free. Only pilots subscribe.
            </p>
          </div>

          {billing.plans.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Plans
              </h4>
              {billing.plans.map((plan) => (
                <PlanOption
                  key={plan.id}
                  plan={plan}
                  selected={plan.id === selected}
                  onSelect={() => setPlanId(plan.id)}
                />
              ))}
              {billing.trialDays > 0 && billing.selfServe && (
                <p className="text-[11px] text-muted-foreground">
                  {billing.trialDays}-day free trial. Card required; cancel any time before it ends
                  and you are not charged.
                </p>
              )}
            </div>
          )}

          {/*
            No payment provider is connected yet. Saying so plainly beats a
            button that appears to take a card and does not — and a pilot who
            reads this knows what to do next.
          */}
          {!billing.selfServe && (
            <Card tone="warn">
              <div className="text-sm font-semibold">Card payments are not switched on yet</div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                LoadReady is not charging cards during this preview. An administrator can turn on
                your access — email support@loadready.ai and we will set it up.
              </p>
            </Card>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}
        </div>

        {billing.selfServe && !billing.entitled && (
          <div className="border-t border-border bg-background px-5 py-3">
            <PrimaryButton onClick={subscribe} disabled={busy || !selected}>
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Opening checkout…
                </span>
              ) : billing.trialDays > 0 ? (
                "Start your free trial"
              ) : (
                "Subscribe"
              )}
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Wraps an action a pilot must be subscribed to take.
 *
 * The button is not hidden — a pilot who cannot see the thing they are missing
 * cannot decide to pay for it. It is visibly locked, and tapping it opens the
 * subscription screen.
 */
export function EntitlementGate({
  children,
  onBlocked,
  label = "Subscribe to bid",
}: {
  children: ReactNode;
  onBlocked: () => void;
  label?: string;
}) {
  const { billingApplies, entitled, loading } = useBilling();
  if (!billingApplies || entitled || loading) return <>{children}</>;

  return (
    <button
      type="button"
      onClick={onBlocked}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-primary bg-background px-4 text-sm font-semibold text-primary"
    >
      <CreditCard className="h-4 w-4" />
      {label}
    </button>
  );
}

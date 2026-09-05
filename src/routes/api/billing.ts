import { createFileRoute } from "@tanstack/react-router";
import { authorize, isDenied } from "@/server/authz.server";
import { recordAudit } from "@/server/audit-store.server";
import { checkRateLimit } from "@/server/rate-limit.server";
import {
  auditFor,
  isEntitledPilot,
  setOverride,
  subscriptionFor,
} from "@/server/billing-store.server";
import { billingProvider } from "@/server/billing/provider.server";
import { billingNotice, graceDaysLeft, trialDaysLeft } from "@/lib/billing/entitlement";
import type { SubscriptionOverride } from "@/lib/billing/entitlement";

/**
 * Everything the pilot subscription needs, behind one endpoint.
 *
 * Two rules run through all of it:
 *
 * 1. **Dispatchers never see billing** (ADR-1). Not a disabled button, not an
 *    empty plan list — a dispatcher's response carries no prices, no plans and
 *    no subscription at all. Hiding it in the UI would still ship the prices to
 *    their browser, and a free side of a marketplace that keeps being shown a
 *    price is a free side that thinks it is about to be charged.
 * 2. **The client cannot make itself entitled.** The only write here that
 *    changes access is `admin-set-override`, which is administrators only and
 *    is written to an audit log with a reason.
 */

const CHECKOUT_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };
const ADMIN_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };

const VALID_OVERRIDES: SubscriptionOverride[] = ["none", "comped", "suspended"];

/** What a pilot is allowed to know about their own subscription. */
function publicSubscription(userId: string) {
  const sub = subscriptionFor(userId);
  return {
    status: sub.status,
    source: sub.source,
    trialEnd: sub.trialEnd,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    override: sub.override,
    // The reason an administrator typed is an internal note about the person,
    // so it is not handed back to them.
  };
}

export const Route = createFileRoute("/api/billing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authorize(request, "billing:GET");
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        // Rule 1. Nothing below this line runs for a dispatcher or an admin.
        if (caller.role !== "pilot") {
          return Response.json({ billingApplies: false });
        }

        const provider = billingProvider();
        const sub = subscriptionFor(caller.id);

        return Response.json({
          billingApplies: true,
          entitled: isEntitledPilot(caller.id),
          notice: billingNotice(sub),
          trialDaysLeft: trialDaysLeft(sub),
          graceDaysLeft: graceDaysLeft(sub),
          subscription: publicSubscription(caller.id),
          plans: provider.listPlans(),
          trialDays: provider.trialDays(),
          selfServe: provider.selfServe,
          provider: provider.name,
        });
      },

      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Malformed request." }, { status: 400 });
        }

        const action = String(body.action ?? "");

        // One gate, driven by the matrix. Previously each case rolled its own
        // role check, so a new case inherited none.
        const auth = await authorize(request, `billing:${action}`);
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        switch (action) {
          case "start-checkout": {
            const gate = checkRateLimit(`checkout:${caller.id}`, CHECKOUT_LIMIT);
            if (!gate.ok) {
              return Response.json(
                { error: "Too many attempts. Try again shortly." },
                { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
              );
            }

            const provider = billingProvider();
            const planId = String(body.planId ?? "");
            if (!provider.listPlans().some((p) => p.id === planId)) {
              return Response.json({ error: "Unknown plan." }, { status: 400 });
            }

            const result = await provider.startCheckout({
              userId: caller.id,
              email: caller.email,
              planId,
            });

            // The manual provider refuses on purpose. 503 rather than 500: the
            // request was fine, the capability is not switched on.
            if (!result.ok) {
              return Response.json({ error: result.reason, unavailable: true }, { status: 503 });
            }
            return Response.json({ url: result.url });
          }

          case "admin-read": {
            const userId = String(body.userId ?? "");
            if (!userId) return Response.json({ error: "Which pilot?" }, { status: 400 });
            return Response.json({
              subscription: subscriptionFor(userId),
              entitled: isEntitledPilot(userId),
              audit: auditFor(userId),
            });
          }

          case "admin-set-override": {
            const gate = checkRateLimit(`billing-admin:${caller.id}`, ADMIN_LIMIT);
            if (!gate.ok) {
              return Response.json(
                { error: "Too many changes. Try again shortly." },
                { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
              );
            }

            const userId = String(body.userId ?? "");
            const override = String(body.override ?? "") as SubscriptionOverride;
            if (!userId) return Response.json({ error: "Which pilot?" }, { status: 400 });
            if (!VALID_OVERRIDES.includes(override)) {
              return Response.json({ error: "Unknown override." }, { status: 400 });
            }

            const { subscription, error } = setOverride({
              userId,
              override,
              reason: String(body.reason ?? ""),
              actorId: caller.id,
              actorEmail: caller.email,
            });
            if (error) return Response.json({ error }, { status: 400 });

            recordAudit({
              actorId: caller.id,
              actorEmail: caller.email,
              action: `billing.${override}`,
              subject: userId,
              detail: String(body.reason ?? "").slice(0, 200),
            });

            return Response.json({ subscription, entitled: isEntitledPilot(userId) });
          }

          default:
            return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
        }
      },
    },
  },
});

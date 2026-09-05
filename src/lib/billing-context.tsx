import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth-context";
import type { BillingNotice, SubscriptionStatus } from "@/lib/billing/entitlement";
import type { Plan } from "@/lib/billing/plans";

/**
 * The pilot's subscription, as the app sees it.
 *
 * `entitled` here decides what a screen *renders*. It never decides what the
 * server *allows* — every gated action is checked again against
 * `isEntitledPilot()` on the way in. If those two ever disagree, the server
 * wins and the user sees an error, which is the right way round.
 *
 * For a dispatcher or an administrator `billingApplies` is false and everything
 * else is empty, because the server does not send them any of it (ADR-1).
 */
export interface BillingState {
  loading: boolean;
  billingApplies: boolean;
  entitled: boolean;
  notice: BillingNotice;
  trialDaysLeft: number | null;
  graceDaysLeft: number | null;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  plans: Plan[];
  trialDays: number;
  /** False while no payment provider is connected — an admin grants access instead. */
  selfServe: boolean;
  refresh: () => Promise<void>;
  /** Resolves with an error message, or null when a checkout URL was opened. */
  startCheckout: (planId: string) => Promise<string | null>;
}

type BillingSnapshot = Omit<BillingState, "loading" | "refresh" | "startCheckout">;

const empty: BillingSnapshot = {
  billingApplies: false,
  entitled: false,
  notice: "none",
  trialDaysLeft: null,
  graceDaysLeft: null,
  status: "none",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  plans: [],
  trialDays: 0,
  selfServe: false,
};

const Ctx = createContext<BillingState | null>(null);

interface BillingResponse {
  billingApplies?: boolean;
  entitled?: boolean;
  notice?: BillingNotice;
  trialDaysLeft?: number | null;
  graceDaysLeft?: number | null;
  subscription?: {
    status?: SubscriptionStatus;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
  };
  plans?: Plan[];
  trialDays?: number;
  selfServe?: boolean;
}

export function BillingProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [state, setState] = useState(empty);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // No session, or a role that is never billed: do not even ask. Saves a
    // request per page load for the whole free side of the marketplace.
    if (!user || role !== "pilot") {
      setState(empty);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/billing");
      const data = (await res.json()) as BillingResponse;
      if (!res.ok || !data.billingApplies) {
        setState(empty);
        return;
      }
      setState({
        billingApplies: true,
        entitled: data.entitled === true,
        notice: data.notice ?? "needs-subscription",
        trialDaysLeft: data.trialDaysLeft ?? null,
        graceDaysLeft: data.graceDaysLeft ?? null,
        status: data.subscription?.status ?? "none",
        currentPeriodEnd: data.subscription?.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: data.subscription?.cancelAtPeriodEnd === true,
        plans: data.plans ?? [],
        trialDays: data.trialDays ?? 0,
        selfServe: data.selfServe === true,
      });
    } catch {
      // Offline, or the server is down. Staying unentitled is the safe way to
      // fail: the worst case is a pilot briefly seeing the paywall, not an
      // unpaid account bidding on loads.
      setState(empty);
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startCheckout = useCallback(async (planId: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start-checkout", planId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) return data.error ?? "Could not start checkout.";
      window.location.href = data.url;
      return null;
    } catch {
      return "Could not reach the server. Check your connection.";
    }
  }, []);

  const value = useMemo<BillingState>(
    () => ({ ...state, loading, refresh, startCheckout }),
    [state, loading, refresh, startCheckout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBilling(): BillingState {
  const v = useContext(Ctx);
  if (!v) throw new Error("BillingProvider missing");
  return v;
}

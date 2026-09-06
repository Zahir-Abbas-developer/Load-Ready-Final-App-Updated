import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, ShieldOff, Undo2 } from "lucide-react";
import type { AccountUser } from "@/lib/auth-context";
import type { Subscription, SubscriptionOverride } from "@/lib/billing/entitlement";
import { EmptyState, ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";

/**
 * Grant, suspend and review pilot access.
 *
 * With no payment provider connected, this is the *only* way a pilot becomes
 * entitled — which is deliberate. The alternative was a checkout button that
 * pretends to take a card, and that would still be in the product on the day it
 * starts charging people.
 *
 * A grant is also a real feature, not scaffolding: launch partners and comped
 * accounts need exactly this once Stripe is live, which is why every change
 * takes a reason and is written to an audit log.
 *
 * Everything is re-checked on the server. The admin-only guard here is so the
 * screen makes sense, not so it is safe.
 */

interface Row {
  account: AccountUser;
  subscription: Subscription | null;
  entitled: boolean;
}

function StatusPill({ row }: { row: Row }) {
  const override = row.subscription?.override ?? "none";
  const label =
    override === "comped"
      ? "Granted"
      : override === "suspended"
        ? "Suspended"
        : row.entitled
          ? "Subscribed"
          : "No access";
  const tone =
    override === "suspended"
      ? "bg-destructive/10 text-destructive"
      : row.entitled
        ? "bg-success/10 text-success"
        : "bg-surface text-muted-foreground";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

export function PilotAccessPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{
    account: AccountUser;
    override: SubscriptionOverride;
    reason: string;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "list-accounts" }),
      });
      const data = (await res.json()) as { accounts?: AccountUser[]; error?: string };
      if (data.error) {
        setError(data.error);
        setRows([]);
        return;
      }

      // Only pilots have a subscription. Asking about a dispatcher would be
      // meaningless and would put billing in front of the free side (ADR-1).
      const pilots = (data.accounts ?? []).filter((a) => a.role === "pilot");
      const detail = await Promise.all(
        pilots.map(async (account) => {
          const r = await fetch("/api/billing", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ action: "admin-read", userId: account.id }),
          });
          const d = (await r.json()) as { subscription?: Subscription; entitled?: boolean };
          return {
            account,
            subscription: d.subscription ?? null,
            entitled: d.entitled === true,
          };
        }),
      );
      setRows(detail);
    } catch {
      setError("Could not reach the server.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (userId: string, override: SubscriptionOverride, reason: string) => {
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "admin-set-override", userId, override, reason }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) setError(data.error);
      else await load();
    } catch {
      setError("Could not reach the server.");
    }
    setBusyId(null);
    setPrompt(null);
  };

  if (rows === null) return <LoadingState message="Loading pilot accounts…" />;

  if (error && rows.length === 0) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Pilots need access to bid on or accept loads. While card payments are switched off, you
          grant it here. Every change is recorded with your name and reason.
        </p>
        <button
          onClick={() => void load()}
          aria-label="Refresh"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-surface px-3 text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No pilot accounts yet"
          message="Approved pilot signups appear here so you can turn on their access."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const override = row.subscription?.override ?? "none";
            const busy = busyId === row.account.id;
            return (
              <div key={row.account.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{row.account.fullName}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {row.account.email}
                    </div>
                  </div>
                  <StatusPill row={row} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {override !== "comped" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        setPrompt({ account: row.account, override: "comped", reason: "" })
                      }
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Grant access
                    </button>
                  )}
                  {override !== "suspended" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        setPrompt({ account: row.account, override: "suspended", reason: "" })
                      }
                      className="flex h-9 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-xs font-semibold text-destructive disabled:opacity-50"
                    >
                      <ShieldOff className="h-3.5 w-3.5" /> Suspend
                    </button>
                  )}
                  {override !== "none" && (
                    <button
                      disabled={busy}
                      onClick={() => void apply(row.account.id, "none", "Override cleared")}
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-background px-3 text-xs font-semibold disabled:opacity-50"
                    >
                      <Undo2 className="h-3.5 w-3.5" /> Clear
                    </button>
                  )}
                </div>

                {row.subscription?.overrideReason && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Reason: {row.subscription.overrideReason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {prompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm access change"
        >
          <div className="w-full max-w-sm rounded-2xl bg-background p-5">
            <h3 className="font-bold">
              {prompt.override === "comped" ? "Grant access" : "Suspend access"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {prompt.override === "comped"
                ? `${prompt.account.fullName} will be able to bid on and accept loads without paying.`
                : `${prompt.account.fullName} will not be able to bid or accept, even if they are paying.`}
            </p>
            <label className="mt-4 mb-1 block text-xs font-semibold" htmlFor="override-reason">
              Reason
            </label>
            <input
              id="override-reason"
              value={prompt.reason}
              onChange={(e) => setPrompt({ ...prompt, reason: e.target.value })}
              placeholder="Launch partner, comped for 3 months"
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-primary "
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setPrompt(null)}
                className="h-11 flex-1 rounded-full border border-border font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => void apply(prompt.account.id, prompt.override, prompt.reason)}
                disabled={prompt.reason.trim().length < 3}
                className="h-11 flex-1 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

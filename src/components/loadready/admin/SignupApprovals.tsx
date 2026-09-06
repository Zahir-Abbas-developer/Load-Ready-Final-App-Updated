import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Inbox, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import type { AccountUser } from "@/lib/auth-context";

type Filter = "pending" | "approved" | "rejected" | "all";

/**
 * Real account review queue.
 *
 * Reads and writes /api/auth — the server re-checks that the caller is an
 * admin on every call, so nothing here is trusted from the browser.
 */
export function SignupApprovals() {
  const [accounts, setAccounts] = useState<AccountUser[] | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reject, setReject] = useState<{ id: string; reason: string } | null>(null);

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
      if (data.error) setError(data.error);
      setAccounts(data.accounts ?? []);
    } catch {
      setError("Could not reach the server.");
      setAccounts([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (userId: string, approve: boolean, reason?: string) => {
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "decide", userId, approve, reason }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) setError(data.error);
      else await load();
    } catch {
      setError("Could not reach the server.");
    }
    setBusyId(null);
    setReject(null);
  };

  if (accounts === null) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const pendingCount = accounts.filter((a) => a.approval === "pending").length;
  const items = accounts.filter((a) => (filter === "all" ? true : a.approval === filter));

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 -mx-3 px-3 admin-mobile-scroll">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-9 px-3 rounded-lg text-xs font-semibold capitalize shrink-0 whitespace-nowrap ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-background border border-border"
            }`}
          >
            {f} {f === "pending" && pendingCount > 0 && `(${pendingCount})`}
          </button>
        ))}
        <button
          onClick={() => void load()}
          className="h-9 px-3 rounded-lg text-xs font-semibold bg-background border border-border shrink-0 flex items-center gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {items.map((a) => (
          <div key={a.id} className="rounded-2xl bg-background border border-border p-3">
            <div className="flex flex-col gap-3 min-w-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-semibold text-sm break-words">{a.fullName}</span>
                  <span className="text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full bg-accent text-primary">
                    {a.role}
                  </span>
                  <StatusPill approval={a.approval} />
                  {a.builtIn && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-border text-muted-foreground">
                      team account
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground break-all">{a.email}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Signed up {new Date(a.createdAt).toLocaleString()}
                </div>
                {a.rejectionReason && (
                  <div className="mt-2 text-xs text-destructive">Reason: {a.rejectionReason}</div>
                )}
              </div>

              {a.approval === "pending" && !a.builtIn && (
                <div className="grid grid-cols-2 gap-2 w-full">
                  <button
                    disabled={busyId === a.id}
                    onClick={() => void decide(a.id, true)}
                    className="h-10 rounded-lg bg-success text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0" /> Approve
                  </button>
                  <button
                    disabled={busyId === a.id}
                    onClick={() => setReject({ id: a.id, reason: "" })}
                    className="h-10 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <X className="h-4 w-4 shrink-0" /> Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="rounded-2xl border border-border bg-background py-12 text-center">
            <Inbox className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No {filter === "all" ? "" : filter} accounts to show.
            </p>
          </div>
        )}
      </div>

      {reject && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
          onClick={() => setReject(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] bg-background rounded-t-3xl p-5 pb-8"
          >
            <h3 className="text-lg font-bold mb-1">Reject account</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Tell them why — they will see this on their next sign-in attempt.
            </p>
            <textarea
              value={reject.reason}
              onChange={(e) => setReject({ ...reject, reason: e.target.value })}
              rows={3}
              placeholder="Certification could not be verified…"
              className="w-full rounded-xl bg-surface border border-border p-3 text-sm focus:border-primary"
            />
            <div className="mt-3 flex gap-2 justify-end">
              <button
                onClick={() => setReject(null)}
                className="h-9 px-4 rounded-lg border border-border text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => void decide(reject.id, false, reject.reason)}
                className="h-9 px-4 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold"
              >
                Confirm reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ approval }: { approval: AccountUser["approval"] }) {
  const tone =
    approval === "approved"
      ? "bg-success/15 text-success"
      : approval === "rejected"
        ? "bg-destructive/15 text-destructive"
        : "bg-warning/15 text-warning";
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${tone}`}>
      {approval}
    </span>
  );
}

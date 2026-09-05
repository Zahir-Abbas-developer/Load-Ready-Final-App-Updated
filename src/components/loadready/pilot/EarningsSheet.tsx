import { useEffect, useState } from "react";
import { Wallet, X } from "lucide-react";
import * as api from "@/lib/marketplace/api";
import * as jobsApi from "@/lib/marketplace/assignments-api";
import { EmptyState, ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";
import type { Job } from "@/lib/marketplace/assignments-api";

/**
 * What this pilot has earned — and who actually pays it.
 *
 * What was here showed "in escrow", a platform fee and a net payout, none of
 * which exist. LoadReady never holds or releases money for a job: the
 * dispatcher pays the pilot directly (D1), and the only number we can honestly
 * show is what the two of them agreed.
 *
 * So this is an agreed-pay record against finished work, and it says plainly
 * that chasing the money is between them. A screen that implies we are holding
 * a pilot's money is one they will ring us about when it does not arrive.
 */
export function EarningsSheet({ onClose }: { onClose: () => void }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    jobsApi
      .myJobs()
      .then(setJobs)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load your earnings."),
      );
  }, []);

  const done = (jobs ?? []).filter((j) => j.assignment.status === "completed");
  const agreed = done.reduce((sum, j) => sum + j.assignment.agreedAmountCents, 0);
  const booked = (jobs ?? [])
    .filter((j) => !["completed", "cancelled"].includes(j.assignment.status))
    .reduce((sum, j) => sum + j.assignment.agreedAmountCents, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="My earnings"
        className="flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-3xl bg-background"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 pt-4 pb-3">
          <h3 className="font-bold">My earnings</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error ? (
            <ErrorState message={error} />
          ) : !jobs ? (
            <LoadingState message="Loading your earnings…" />
          ) : (
            <>
              <div className="mb-3 rounded-2xl bg-gradient-to-br from-primary to-[var(--primary-pressed)] p-5 text-primary-foreground">
                <div className="text-xs opacity-90">Agreed on finished jobs</div>
                <div className="text-3xl font-bold">{api.formatMoney(agreed)}</div>
                <div className="mt-1 text-xs opacity-90">
                  {done.length} job{done.length === 1 ? "" : "s"}
                  {booked > 0 ? ` · ${api.formatMoney(booked)} booked and not yet finished` : ""}
                </div>
              </div>

              <p className="mb-4 rounded-xl bg-surface p-3 text-[11px] text-muted-foreground">
                These are the rates you and the dispatcher agreed.{" "}
                <strong>They pay you directly</strong> — LoadReady never holds the money for a job
                and takes nothing out of it. Your subscription is the only thing you pay us.
              </p>

              {done.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="Nothing finished yet"
                  message="When you close a job, the rate you agreed appears here as a record you can point at."
                />
              ) : (
                <div className="space-y-2">
                  {done.map((j) => (
                    <div
                      key={j.assignment.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{j.load?.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {j.load?.reference} · {j.company.companyName || "Dispatcher"}
                          {j.assignment.milesDriven !== null
                            ? ` · ${j.assignment.milesDriven} mi`
                            : ""}
                        </div>
                      </div>
                      <div className="shrink-0 font-bold text-success">
                        {api.formatMoney(j.assignment.agreedAmountCents)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

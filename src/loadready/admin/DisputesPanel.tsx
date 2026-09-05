import { useCallback, useEffect, useState } from "react";
import { Eye, Flag, Loader2, Lock, Scale } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";
import { REPORT_REASONS } from "@/lib/settings/reports";

/**
 * Reports, and the disputes they become.
 *
 * The screen exists mostly to make one thing obvious: **opening a dispute is
 * what lets an administrator read two people's private conversation**, and
 * every read is written into those people's own data export. Until this phase
 * nobody could read a job's messages at all, which was the right default; this
 * is the door, and it says so.
 */

interface Report {
  id: string;
  assignmentId: string;
  messageId: string | null;
  reason: keyof typeof REPORT_REASONS;
  detail: string | null;
  createdAt: string;
}

interface Dispute {
  id: string;
  assignmentId: string;
  summary: string;
  status: "open" | "resolved";
  resolution: string | null;
  createdAt: string;
}

interface Evidence {
  dispute: Dispute;
  messages: Array<{ id: string; senderName: string; body: string; createdAt: string }>;
  proofs: Array<{ id: string; kind: string; note: string | null; createdAt: string }>;
  trail: number;
  reads: Array<{ id: string; adminEmail: string; kind: string; at: string }>;
}

export function DisputesPanel() {
  const [data, setData] = useState<{ reports: Report[]; disputes: Dispute[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin?view=disputes", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load the queue.");
      setData((await res.json()) as { reports: Report[]; disputes: Dispute[] });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the queue.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "That did not work.");
      await refresh();
      setOpening(null);
      setResolving(null);
      setSummary("");
      setResolution("");
      setEvidence(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    }
    setBusy(false);
  };

  const look = async (disputeId: string) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin?view=evidence&disputeId=${encodeURIComponent(disputeId)}`,
        {
          credentials: "include",
        },
      );
      const payload = (await res.json().catch(() => ({}))) as Evidence & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Could not open the evidence.");
      setEvidence(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the evidence.");
    }
    setBusy(false);
  };

  if (error && !data) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!data) return <LoadingState message="Loading…" />;

  return (
    <div className="space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Reports waiting
        </h3>
        {data.reports.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing reported. Either side of a job can report the other from their messages.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.reports.map((report) => (
              <li key={report.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-start gap-2">
                  <Flag className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="font-semibold">{REPORT_REASONS[report.reason]}</div>
                    {report.detail && <p className="mt-0.5">{report.detail}</p>}
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {new Date(report.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                {opening === report.assignmentId ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      aria-label="What the dispute is about"
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      placeholder="What you are looking into — this is the reason on the record"
                      className="h-9 flex-1 rounded-lg border border-border bg-surface px-2.5 text-xs"
                    />
                    <button
                      disabled={busy || summary.trim().length < 3}
                      onClick={() =>
                        void post({
                          action: "open-dispute",
                          assignmentId: report.assignmentId,
                          reason: summary,
                          reportIds: [report.id],
                        })
                      }
                      className="h-9 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      Open
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setOpening(report.assignmentId)}
                    className="mt-2 h-8 rounded-lg border border-border px-3 text-[11px] font-semibold"
                  >
                    Open a dispute
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Disputes
        </h3>
        {data.disputes.length === 0 ? (
          <p className="text-xs text-muted-foreground">None open.</p>
        ) : (
          <ul className="space-y-2">
            {data.disputes.map((dispute) => (
              <li key={dispute.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-start gap-2">
                  <Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="font-semibold">{dispute.summary}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {dispute.status === "open" ? "Open" : "Resolved"} ·{" "}
                      {new Date(dispute.createdAt).toLocaleString()}
                    </div>
                    {dispute.resolution && <p className="mt-1">Decided: {dispute.resolution}</p>}
                  </div>
                </div>

                {dispute.status === "open" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      disabled={busy}
                      onClick={() => void look(dispute.id)}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-semibold"
                    >
                      {busy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Eye className="h-3 w-3" aria-hidden />
                      )}
                      Read the evidence
                    </button>
                    <button
                      onClick={() => setResolving(dispute.id)}
                      className="h-8 rounded-lg border border-border px-3 text-[11px] font-semibold"
                    >
                      Resolve
                    </button>
                  </div>
                )}

                {resolving === dispute.id && (
                  <div className="mt-2 flex gap-2">
                    <input
                      aria-label="What was decided"
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      placeholder="What was decided"
                      className="h-9 flex-1 rounded-lg border border-border bg-surface px-2.5 text-xs"
                    />
                    <button
                      disabled={busy || resolution.trim().length < 3}
                      onClick={() =>
                        void post({
                          action: "resolve-dispute",
                          disputeId: dispute.id,
                          reason: resolution,
                        })
                      }
                      className="h-9 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {evidence && (
        <section className="rounded-2xl border border-primary/30 bg-accent p-4">
          <div className="mb-2 flex items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="text-xs">
              <strong>You are reading two people&apos;s private conversation.</strong> This has been
              recorded, and it appears in both of their data exports as a read by{" "}
              {evidence.reads[0]?.adminEmail ?? "you"}.
            </div>
          </div>

          <h4 className="mt-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Messages ({evidence.messages.length})
          </h4>
          <ul className="mt-1 space-y-1">
            {evidence.messages.map((m) => (
              <li key={m.id} className="rounded-lg bg-background p-2 text-xs">
                <span className="font-semibold">{m.senderName}: </span>
                {m.body}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {new Date(m.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>

          <h4 className="mt-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Proof ({evidence.proofs.length}) · Positions recorded: {evidence.trail}
          </h4>
          <ul className="mt-1 space-y-1">
            {evidence.proofs.map((p) => (
              <li key={p.id} className="rounded-lg bg-background p-2 text-xs">
                {p.kind === "photo" ? "Photo" : p.note} · {new Date(p.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>

          <button
            onClick={() => setEvidence(null)}
            className="mt-3 h-9 w-full rounded-lg border border-border bg-background text-xs font-semibold"
          >
            Close
          </button>
        </section>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, XCircle } from "lucide-react";
import * as api from "@/lib/profile/api";
import { documentLabel, regionName } from "@/lib/profile/catalog";
import { daysUntilExpiry, missingForReview } from "@/lib/profile/completion";
import type { PilotDocument, PilotRecord } from "@/lib/profile/types";
import { EmptyState, ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";

/**
 * The pilot verification queue.
 *
 * This is the screen that had nothing behind it: profiles and documents lived
 * in each pilot's own browser, so an administrator was being asked to approve
 * people whose paperwork they could not see. Now the documents are real files
 * on the server and this opens them.
 *
 * Every decision is the server's to make — the buttons here send an action and
 * render whatever comes back. A rejection always carries a reason, because
 * "rejected" with no explanation sends a driver back to a form with no idea
 * what to change.
 */

type Filter = "in_review" | "approved" | "rejected" | "all";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "in_review", label: "Awaiting review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

function DocumentReview({
  userId,
  doc,
  onDecided,
  onError,
}: {
  userId: string;
  doc: PilotDocument;
  onDecided: (record: PilotRecord) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const days = daysUntilExpiry(doc);

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      const { record } = await api.reviewDocument({
        userId,
        documentId: doc.id,
        approve,
        reason: approve ? "" : reason,
      });
      onDecided(record);
      setRejecting(false);
      setReason("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "That decision did not save.");
    }
    setBusy(false);
  };

  const open = async () => {
    if (!doc.fileId) return;
    const url = await api.signedFileUrl(doc.fileId);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{documentLabel(doc.docType)}</div>
          <div className="text-[11px] text-muted-foreground">
            {doc.documentNumber ? `No. ${doc.documentNumber} · ` : ""}
            {doc.expiryDate
              ? days !== null && days < 0
                ? `expired ${Math.abs(days)} days ago`
                : `expires ${doc.expiryDate}`
              : "no expiry given"}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            doc.status === "approved"
              ? "bg-success/10 text-success"
              : doc.status === "rejected" || doc.status === "expired"
                ? "bg-destructive/10 text-destructive"
                : "bg-surface text-muted-foreground"
          }`}
        >
          {doc.status}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {doc.fileId && (
          <button
            onClick={() => void open()}
            className="flex h-8 items-center gap-1 rounded-lg bg-surface px-2.5 text-[11px] font-semibold"
          >
            <ExternalLink className="h-3 w-3" /> Open document
          </button>
        )}
        {doc.status !== "approved" && (
          <button
            disabled={busy}
            onClick={() => void decide(true)}
            className="flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Approve
          </button>
        )}
        {doc.status !== "rejected" && (
          <button
            disabled={busy}
            onClick={() => setRejecting((r) => !r)}
            className="flex h-8 items-center gap-1 rounded-lg border border-destructive/40 px-2.5 text-[11px] font-semibold text-destructive disabled:opacity-50"
          >
            <XCircle className="h-3 w-3" /> Reject
          </button>
        )}
      </div>

      {rejecting && (
        <div className="mt-2 flex gap-2">
          <input
            aria-label="Reason for rejection"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Blurred, expired, name does not match…"
            className="h-9 flex-1 rounded-lg border border-border bg-surface px-2.5 text-xs"
          />
          <button
            disabled={busy || reason.trim().length < 3}
            onClick={() => void decide(false)}
            className="h-9 rounded-lg bg-destructive px-3 text-[11px] font-semibold text-destructive-foreground disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}

      {doc.rejectionReason && (
        <p className="mt-2 text-[11px] text-destructive">Rejected: {doc.rejectionReason}</p>
      )}
    </div>
  );
}

function PilotCard({
  entry,
  onUpdated,
  onError,
}: {
  entry: api.QueueEntry;
  onUpdated: (record: PilotRecord) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { record, completion } = entry;
  const p = record.profile;
  const missing = missingForReview(record);

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      const { record: next } = await api.reviewProfile({ userId: p.userId, approve, note });
      onUpdated(next);
      setNote("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "That decision did not save.");
    }
    setBusy(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <button onClick={() => setOpen((o) => !o)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {p.legalName || "Unnamed pilot"}
              {p.businessName ? ` · ${p.businessName}` : ""}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {p.city && p.region ? `${p.city}, ${regionName(p.region)} · ` : ""}
              {record.documents.length} document{record.documents.length === 1 ? "" : "s"} ·{" "}
              {record.certifications.length} certification
              {record.certifications.length === 1 ? "" : "s"} · {completion}% complete
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              p.verificationStatus === "approved"
                ? "bg-success/10 text-success"
                : p.verificationStatus === "rejected"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-accent text-primary"
            }`}
          >
            {p.verificationStatus.replace("_", " ")}
          </span>
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {missing.length > 0 && (
            <div className="rounded-xl bg-accent/50 p-3">
              <div className="text-[11px] font-semibold">Still missing</div>
              <ul className="mt-1 list-inside list-disc text-[11px] text-muted-foreground">
                {missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            {record.documents.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                This pilot has not uploaded anything yet.
              </p>
            ) : (
              record.documents.map((doc) => (
                <DocumentReview
                  key={doc.id}
                  userId={p.userId}
                  doc={doc}
                  onDecided={onUpdated}
                  onError={onError}
                />
              ))
            )}
          </div>

          {record.certifications.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              Certified in: {record.certifications.map((c) => regionName(c.region)).join(", ")}
            </div>
          )}

          <div className="space-y-2 border-t border-border pt-3">
            <input
              aria-label="Note to the pilot"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note to the pilot (required to reject)"
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
            <div className="flex gap-2">
              <button
                disabled={busy || missing.length > 0}
                onClick={() => void decide(true)}
                title={missing.length > 0 ? "Required details are still missing" : undefined}
                className="h-10 flex-1 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Approve pilot
              </button>
              <button
                disabled={busy || note.trim().length < 3}
                onClick={() => void decide(false)}
                className="h-10 flex-1 rounded-full border border-destructive/40 text-sm font-semibold text-destructive disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function VerificationQueue() {
  const [entries, setEntries] = useState<api.QueueEntry[] | null>(null);
  const [filter, setFilter] = useState<Filter>("in_review");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { records } = await api.reviewQueue();
      setEntries(records);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the queue.");
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (record: PilotRecord) =>
    setEntries((current) =>
      (current ?? []).map((e) =>
        e.record.profile.userId === record.profile.userId ? { ...e, record } : e,
      ),
    );

  if (!entries && error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!entries) return <LoadingState message="Loading the verification queue…" />;

  const shown =
    filter === "all"
      ? entries
      : entries.filter((e) => e.record.profile.verificationStatus === filter);

  return (
    <div>
      <div className="admin-mobile-scroll -mx-3 mb-4 flex items-center gap-2 overflow-x-auto px-3 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`h-9 shrink-0 rounded-lg px-3 text-xs font-semibold whitespace-nowrap ${
              filter === f.id ? "bg-primary text-primary-foreground" : "bg-surface"
            }`}
          >
            {f.label}
          </button>
        ))}
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

      {shown.length === 0 ? (
        <EmptyState
          title={filter === "in_review" ? "Nothing waiting" : "Nothing here"}
          message={
            filter === "in_review"
              ? "Pilots appear here once they submit their profile for review. You will see their documents and can approve or reject each one."
              : "No pilot profiles with this status."
          }
        />
      ) : (
        <div className="space-y-2">
          {shown.map((entry) => (
            <PilotCard
              key={entry.record.profile.userId}
              entry={entry}
              onUpdated={replace}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

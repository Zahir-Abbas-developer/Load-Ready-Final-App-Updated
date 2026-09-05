import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import {
  LEGAL_DOCUMENTS,
  unresolvedPlaceholders,
  type LegalDocumentKind,
} from "@/lib/legal/documents";
import { ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";

/**
 * Publishing the policies.
 *
 * The founder pastes the finished text from their lawyer here; nothing about
 * the legal documents lives in code that has to be edited and redeployed. A
 * published version is never edited — a correction is a new version, because
 * somebody accepted the last one and that acceptance has to keep pointing at
 * the words they actually saw.
 */

interface LegalVersion {
  kind: LegalDocumentKind;
  version: number;
  body: string;
  effectiveAt: string;
  requiresReacceptance: boolean;
  publishedBy: string;
  publishedAt: string;
  unresolved: string[];
}

interface Readiness {
  ready: boolean;
  blocking: Array<{ kind: LegalDocumentKind; unresolved: string[]; isDraft: boolean }>;
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/legal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "That did not work.");
  return data;
}

export function AdminLegalPanel() {
  const [documents, setDocuments] = useState<LegalVersion[] | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<LegalDocumentKind | null>(null);
  const [draft, setDraft] = useState("");
  const [requiresReacceptance, setRequiresReacceptance] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/legal", { credentials: "include" });
      const data = (await res.json()) as { documents?: LegalVersion[] };
      setDocuments(data.documents ?? []);
      setReadiness(await post<Readiness>({ action: "readiness" }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the policies.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await post({ action: "publish", kind: editing, body: draft, requiresReacceptance });
      setEditing(null);
      setDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not publish.");
    }
    setBusy(false);
  };

  if (error && !documents) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!documents) return <LoadingState message="Loading the policies…" />;

  const blanks = editing ? unresolvedPlaceholders(draft) : [];

  return (
    <div>
      {/* ── the launch blocker ─────────────────────────────────────────── */}
      {readiness && !readiness.ready && (
        <div className="mb-4 flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div className="text-sm">
            <div className="font-semibold text-destructive">
              {readiness.blocking.length} document
              {readiness.blocking.length === 1 ? " is" : "s are"} not ready to launch behind
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              A policy that is still a draft, or still has a blank where the company name or the
              governing law should be, is not an agreement — and an acceptance recorded against it
              is an agreement with nobody. Paste the finished text below before launch.
            </p>
          </div>
        </div>
      )}
      {readiness?.ready && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-success/30 bg-success/5 p-4 text-sm">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
          <span>Every policy has been published and has no blanks left in it.</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="mb-3 flex justify-end">
        <button
          onClick={() => void load()}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-surface px-3 text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="space-y-2">
        {documents.map((doc) => {
          const meta = LEGAL_DOCUMENTS.find((m) => m.kind === doc.kind);
          const isDraft = doc.publishedBy === "system";
          return (
            <div key={doc.kind} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{meta?.title ?? doc.kind}</div>
                  <div className="text-[11px] text-muted-foreground">
                    v{doc.version} · published by {doc.publishedBy} ·{" "}
                    {new Date(doc.publishedAt).toLocaleDateString()}
                  </div>
                  {doc.unresolved.length > 0 && (
                    <div className="mt-1 text-[11px] font-semibold text-destructive">
                      Blanks: <span className="font-mono">{doc.unresolved.join(", ")}</span>
                    </div>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    isDraft || doc.unresolved.length > 0
                      ? "bg-destructive/10 text-destructive"
                      : "bg-success/10 text-success"
                  }`}
                >
                  {isDraft ? "Draft" : doc.unresolved.length > 0 ? "Incomplete" : "Published"}
                </span>
              </div>

              <button
                onClick={() => {
                  setEditing(doc.kind);
                  setDraft(doc.body);
                  setRequiresReacceptance(true);
                }}
                className="mt-3 h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
              >
                Publish a new version
              </button>
            </div>
          );
        })}
      </div>

      {/* ── the editor ─────────────────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-background p-5">
            <h3 className="font-bold">{LEGAL_DOCUMENTS.find((m) => m.kind === editing)?.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Paste the finished text. It is stored exactly as typed and shown as plain text — the
              app never renders HTML from it, so nothing pasted here can run in anyone&apos;s
              browser.
            </p>

            <textarea
              aria-label="Policy text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="mt-3 min-h-64 flex-1 rounded-xl border border-border bg-surface p-3 font-mono text-xs"
            />

            {blanks.length > 0 && (
              <p className="mt-2 text-xs text-destructive">
                Still has {blanks.length} blank{blanks.length === 1 ? "" : "s"}:{" "}
                <span className="font-mono">{blanks.join(", ")}</span>. You can publish it, and it
                will keep being flagged until they are filled in.
              </p>
            )}

            <label className="mt-3 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={requiresReacceptance}
                onChange={(e) => setRequiresReacceptance(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-[var(--primary)]"
              />
              <span>
                <span className="font-semibold">Everyone has to agree again</span>
                <span className="block text-[11px] text-muted-foreground">
                  Leave this on unless the change is cosmetic. Asking people to re-agree to a typo
                  fix teaches them to click past the dialog without reading it.
                </span>
              </span>
            </label>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setEditing(null)}
                className="h-11 flex-1 rounded-full border border-border font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => void publish()}
                disabled={busy || draft.trim().length < 200}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

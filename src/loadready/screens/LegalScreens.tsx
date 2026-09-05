import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, FileText, Loader2, X } from "lucide-react";
import { PrimaryButton } from "../PrimaryButton";
import { LEGAL_DOCUMENTS, type LegalDocumentKind } from "@/lib/legal/documents";
import { ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";

/**
 * Reading the policies, and accepting them.
 *
 * Every document currently in force is a draft with unfilled blanks — the party
 * name and the governing law are not known, and loadready.ai's own published
 * terms have the same gaps. That is shown to the reader rather than hidden. A
 * person who accepts an agreement with a blank where one party's name should be
 * has agreed with nobody, and pretending otherwise in the interface is how that
 * becomes somebody's problem later.
 */

interface LegalVersion {
  kind: LegalDocumentKind;
  version: number;
  body: string;
  effectiveAt: string;
  publishedBy: string;
  unresolved: string[];
}

async function getLegal(): Promise<{
  documents: LegalVersion[];
  outstanding: Array<{ kind: LegalDocumentKind; version: number }>;
}> {
  const res = await fetch("/api/legal", { credentials: "include" });
  if (!res.ok) throw new Error("Could not load the policies.");
  return (await res.json()) as {
    documents: LegalVersion[];
    outstanding: Array<{ kind: LegalDocumentKind; version: number }>;
  };
}

async function acceptDocument(kind: LegalDocumentKind) {
  const res = await fetch("/api/legal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "accept", kind }),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "That did not save.");
}

/** Says plainly that what follows is not finished. */
function DraftNotice({ version }: { version: LegalVersion }) {
  const isDraft = version.publishedBy === "system";
  if (!isDraft && version.unresolved.length === 0) return null;

  return (
    <div className="mb-4 flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
      <div className="text-sm">
        <div className="font-semibold text-destructive">This is a draft, not a policy</div>
        <p className="mt-1 text-xs text-muted-foreground">
          {isDraft
            ? "It is a placeholder so the app can be built and tested. No lawyer has seen it and it binds nobody."
            : "It has been published, but it still has blanks where facts should be."}
          {version.unresolved.length > 0 && (
            <>
              {" "}
              Still to fill in: <span className="font-mono">{version.unresolved.join(", ")}</span>.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * The very small subset of Markdown the drafts use.
 *
 * Not a Markdown library: the bodies are pasted in by an administrator, so
 * anything that renders raw HTML from them would be a way to put script into
 * every user's legal page. Text goes in as text, and only headings, bullets,
 * block quotes and bold are recognised.
 */
function PolicyBody({ body }: { body: string }) {
  const lines = body.split("\n");

  const inline = (text: string) =>
    text
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      );

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        if (trimmed.startsWith("# ")) {
          return (
            <h2 key={i} className="pt-2 text-xl font-bold">
              {trimmed.slice(2)}
            </h2>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={i} className="pt-2 font-semibold">
              {trimmed.slice(3)}
            </h3>
          );
        }
        if (trimmed.startsWith("> ")) {
          return (
            <p key={i} className="border-l-2 border-destructive/40 pl-3 text-xs text-destructive">
              {inline(trimmed.slice(2))}
            </p>
          );
        }
        if (trimmed.startsWith("- ")) {
          return (
            <p key={i} className="flex gap-2 pl-1">
              <span aria-hidden>•</span>
              <span>{inline(trimmed.slice(2))}</span>
            </p>
          );
        }
        return <p key={i}>{inline(trimmed)}</p>;
      })}
    </div>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-3xl bg-background"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 pt-4 pb-3">
          <h3 className="font-bold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/** The list of policies, and a reader for each. */
export function LegalPanel() {
  const [documents, setDocuments] = useState<LegalVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<LegalVersion | null>(null);

  const load = useCallback(async () => {
    try {
      setDocuments((await getLegal()).documents);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the policies.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!documents) return <LoadingState message="Loading the policies…" />;

  return (
    <div className="space-y-2">
      {documents.map((doc) => {
        const meta = LEGAL_DOCUMENTS.find((m) => m.kind === doc.kind);
        const isDraft = doc.publishedBy === "system" || doc.unresolved.length > 0;
        return (
          <button
            key={doc.kind}
            onClick={() => setOpen(doc)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left hover:border-primary/40"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent">
              <FileText className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {meta?.title ?? doc.kind}
                {isDraft && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                    DRAFT
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {meta?.summary} · v{doc.version}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        );
      })}

      {open && (
        <Sheet
          title={LEGAL_DOCUMENTS.find((m) => m.kind === open.kind)?.title ?? "Policy"}
          onClose={() => setOpen(null)}
        >
          <DraftNotice version={open} />
          <PolicyBody body={open.body} />
        </Sheet>
      )}
    </div>
  );
}

/**
 * Blocks the app when a policy has changed in a way that needs agreeing again.
 *
 * Only for versions published as needing it — a typo fix does not drag every
 * driver through a dialog, which is how people learn to click past these.
 */
export function ReacceptanceGate({ onDone }: { onDone: () => void }) {
  const [outstanding, setOutstanding] = useState<LegalVersion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { documents, outstanding: pending } = await getLegal();
        const needed = pending
          .map((p) => documents.find((d) => d.kind === p.kind))
          .filter((d): d is LegalVersion => Boolean(d));
        setOutstanding(needed);
        if (needed.length === 0) onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load the policies.");
      }
    })();
    // Runs once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!outstanding || outstanding.length === 0) return <LoadingState message="Checking…" />;

  const doc = outstanding[index];
  const meta = LEGAL_DOCUMENTS.find((m) => m.kind === doc.kind);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptDocument(doc.kind);
      if (index + 1 < outstanding.length) setIndex(index + 1);
      else onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.");
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-dvh flex-col px-6 py-8">
      <h1 className="text-2xl font-bold text-primary">{meta?.title ?? "Please review"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {outstanding.length > 1 ? `${index + 1} of ${outstanding.length}. ` : ""}
        This has changed since you last agreed to it.
      </p>

      <div className="mt-4 flex-1 overflow-y-auto rounded-2xl border border-border bg-surface p-4">
        <DraftNotice version={doc} />
        <PolicyBody body={doc.body} />
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="mt-4">
        <PrimaryButton onClick={() => void accept()} disabled={busy}>
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </span>
          ) : (
            `I agree to the ${meta?.title ?? "policy"}`
          )}
        </PrimaryButton>
      </div>
    </div>
  );
}

/**
 * The agreements that belong to a stage of the funnel rather than to signup —
 * the Pilot Operator Agreement, the Company Agreement.
 *
 * Renders nothing while the documents are still drafts, because nothing is
 * asked of anybody until real text is published. `onChange` tells the parent
 * how many are still outstanding, so a Submit button can wait for them.
 */
export function OnboardingAgreements({
  stage,
  onChange,
}: {
  stage: "signup" | "onboarding";
  onChange?: (outstanding: number) => void;
}) {
  const [pending, setPending] = useState<LegalVersion[]>([]);
  const [reading, setReading] = useState<LegalVersion | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { documents, outstanding } = await getLegal();
      const mine = outstanding
        .map((o) => documents.find((d) => d.kind === o.kind))
        .filter((d): d is LegalVersion => {
          if (!d) return false;
          return LEGAL_DOCUMENTS.find((m) => m.kind === d.kind)?.acceptedAt === stage;
        });
      setPending(mine);
      onChange?.(mine.length);
    } catch {
      // Not a reason to block a wizard the person is halfway through. They are
      // asked again next time.
      onChange?.(0);
    }
  }, [stage, onChange]);

  useEffect(() => {
    void load();
  }, [load]);

  if (pending.length === 0) return null;

  const accept = async (doc: LegalVersion) => {
    setBusy(doc.kind);
    setError(null);
    try {
      await acceptDocument(doc.kind);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.");
    }
    setBusy(null);
  };

  return (
    <div className="space-y-2">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {pending.map((doc) => {
        const meta = LEGAL_DOCUMENTS.find((m) => m.kind === doc.kind);
        return (
          <div key={doc.kind} className="rounded-2xl border border-primary/30 bg-accent p-4">
            <div className="text-sm font-semibold">{meta?.title}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">{meta?.summary}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => setReading(doc)}
                className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-semibold"
              >
                Read it
              </button>
              <button
                disabled={busy === doc.kind}
                onClick={() => void accept(doc)}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy === doc.kind && <Loader2 className="h-3 w-3 animate-spin" />}I agree
              </button>
            </div>
          </div>
        );
      })}

      {reading && (
        <Sheet
          title={LEGAL_DOCUMENTS.find((m) => m.kind === reading.kind)?.title ?? "Agreement"}
          onClose={() => setReading(null)}
        >
          <DraftNotice version={reading} />
          <PolicyBody body={reading.body} />
        </Sheet>
      )}
    </div>
  );
}

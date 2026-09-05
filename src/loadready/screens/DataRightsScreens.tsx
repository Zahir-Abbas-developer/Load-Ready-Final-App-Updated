import { useEffect, useState } from "react";
import { AlertTriangle, Download, Loader2, Trash2 } from "lucide-react";
import { PrimaryButton } from "../PrimaryButton";
import { COMPANY } from "@/lib/legal/documents";

/**
 * Take a copy of your data, or close your account.
 *
 * Both self-serve, which is not only good manners: Apple and Google require
 * account deletion to be startable inside the app, and loadready.ai currently
 * tells people to send an email.
 */

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "That did not work.");
  }
  return res;
}

export function DataRightsPanel() {
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [graceDays, setGraceDays] = useState(7);

  useEffect(() => {
    void (async () => {
      try {
        const res = await post({ action: "deletion-status" });
        const data = (await res.json()) as { graceDays?: number };
        if (data.graceDays) setGraceDays(data.graceDays);
      } catch {
        // The default of seven is right; this only makes the copy match the
        // server if it ever changes.
      }
    })();
  }, []);

  const download = async () => {
    setBusy("export");
    setError(null);
    try {
      const res = await post({ action: "export" });
      const blob = await res.blob();

      // Saved by the browser rather than shown: it is a file somebody keeps,
      // and rendering a driving licence's download link on screen is not it.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "loadready-my-data.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build your export.");
    }
    setBusy(null);
  };

  const requestDeletion = async () => {
    setBusy("delete");
    setError(null);
    try {
      await post({ action: "request-deletion", password });
      // Every session was dropped; a reload lands on the signed-out screen.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the deletion.");
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <section>
        <h4 className="mb-1 text-sm font-semibold">Download your data</h4>
        <p className="mb-3 text-xs text-muted-foreground">
          Everything LoadReady holds about you, as one file: your account, profile, documents,
          certifications, vehicle, settings, subscription, what you have agreed to, and the messages
          you sent. The other party&apos;s messages are theirs, not yours, so they are not included.
        </p>
        <button
          onClick={() => void download()}
          disabled={busy !== null}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary text-sm font-semibold text-primary disabled:opacity-50"
        >
          {busy === "export" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download a copy
        </button>
      </section>

      <section>
        <h4 className="mb-1 text-sm font-semibold">Close your account</h4>
        <p className="mb-3 text-xs text-muted-foreground">
          Your profile, documents, certifications, settings and messages are deleted for good after{" "}
          {graceDays} days. You can change your mind at any point before that by signing in again.
          Records of what an administrator did stay, because they are about them rather than about
          you.
        </p>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-destructive/40 text-sm font-semibold text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Close my account
          </button>
        ) : (
          <div className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <p className="text-xs">
                After {graceDays} days this cannot be undone. Download a copy of your data first if
                you want one — you will not be able to afterwards.
              </p>
            </div>

            <div>
              <label htmlFor="delete-password" className="mb-1 block text-xs font-medium">
                Confirm your password
              </label>
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
              />
            </div>

            <label className="flex items-start gap-3 text-xs">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-[var(--primary)]"
              />
              <span>
                I understand my documents and profile will be permanently deleted after {graceDays}{" "}
                days.
              </span>
            </label>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setConfirming(false);
                  setPassword("");
                  setUnderstood(false);
                }}
                className="h-11 flex-1 rounded-full border border-border text-sm font-semibold"
              >
                Keep my account
              </button>
              <button
                onClick={() => void requestDeletion()}
                disabled={busy !== null || !understood || password.length === 0}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-destructive text-sm font-semibold text-destructive-foreground disabled:opacity-50"
              >
                {busy === "delete" && <Loader2 className="h-4 w-4 animate-spin" />}
                Close it
              </button>
            </div>
          </div>
        )}
      </section>

      <p className="text-[11px] text-muted-foreground">
        Questions about your data: {COMPANY.privacy}
      </p>
    </div>
  );
}

/**
 * The only screen an account inside its grace period can reach.
 *
 * Signing in is deliberately still possible: locking somebody out of the
 * account they are trying to recover would be a cruel way to enforce a waiting
 * period. The server refuses everything else, so this is the whole app for them
 * until they choose.
 */
export function DeletionPendingScreen({
  dueAt,
  onCancelled,
  onSignOut,
}: {
  dueAt: number | null;
  onCancelled: () => void;
  onSignOut: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const daysLeft =
    dueAt === null ? null : Math.max(0, Math.ceil((dueAt - Date.now()) / (24 * 60 * 60 * 1000)));

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await post({ action: "cancel-deletion" });
      onCancelled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore your account.");
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      const res = await post({ action: "export" });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "loadready-my-data.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build your export.");
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <Trash2 className="h-8 w-8 text-destructive" aria-hidden />
      </div>

      <h1 className="mt-5 text-2xl font-bold">Your account is closing</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {daysLeft === null
          ? "Everything will be deleted shortly."
          : daysLeft === 0
            ? "Everything will be deleted today."
            : `Everything will be deleted in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`}{" "}
        Until then you can change your mind, and you can still take a copy of your data.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 w-full max-w-xs rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="mt-7 w-full max-w-xs space-y-2">
        <PrimaryButton onClick={() => void cancel()} disabled={busy}>
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Restoring…
            </span>
          ) : (
            "Keep my account"
          )}
        </PrimaryButton>

        <button
          onClick={() => void download()}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold"
        >
          <Download className="h-4 w-4" /> Download my data
        </button>

        <button
          onClick={onSignOut}
          className="min-h-11 w-full text-sm text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

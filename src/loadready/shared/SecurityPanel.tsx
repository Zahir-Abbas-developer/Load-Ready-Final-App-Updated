import { useCallback, useEffect, useState } from "react";
import { Check, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/**
 * The account's own security settings.
 *
 * "Security" was in the profile menu with **nothing behind it** — the row had
 * no action, so tapping it did nothing at all. This is what it should have
 * opened.
 *
 * Everything here already existed on the server and was only ever offered to
 * administrators. The endpoints are per-account (`SIGNED_IN`, not admin), so a
 * pilot who wants a second factor on the account that holds their licence and
 * their insurance can have one — which is a reasonable thing to want.
 *
 * Two things deliberately absent:
 *
 * - **Changing a password in place.** There is no endpoint for it, and adding
 *   one that takes a new password from an already-open session is the kind of
 *   thing to design rather than bolt on. The emailed reset link is the same
 *   journey with a proof of identity in the middle, and it already works.
 * - **Sign out everywhere.** An administrator can do it to somebody
 *   (Phase J2); there is no self-serve version, and inventing one here would
 *   mean a screen that only appears to work.
 */

interface Status {
  enabled: boolean;
  /** How many single-use codes are left, once it is on. */
  recoveryCodesLeft?: number;
}

export function SecurityPanel() {
  const { user } = useAuth();

  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Set while enrolling: the secret to scan, and the code being typed. */
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);

  const [resetSent, setResetSent] = useState(false);

  const post = async <T,>(body: Record<string, unknown>): Promise<T> => {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "That did not work.");
    return data;
  };

  const read = useCallback(async () => {
    try {
      setStatus(await post<Status>({ action: "mfa-status" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read your settings.");
    }
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const started = await post<{ secret?: string; uri?: string }>({ action: "mfa-begin" });
      setSecret(started.secret ?? null);
      setUri(started.uri ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start.");
    }
    setBusy(false);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const done = await post<{ recoveryCodes?: string[] }>({ action: "mfa-confirm", code });
      setRecovery(done.recoveryCodes ?? []);
      setSecret(null);
      setCode("");
      await read();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code is not right.");
    }
    setBusy(false);
  };

  const sendReset = async () => {
    setBusy(true);
    setError(null);
    try {
      await post({ action: "request-password-reset", email: user?.email });
      setResetSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that.");
    }
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* ── the recovery codes, shown once ─────────────────────────────── */}
      {recovery && (
        <section className="rounded-xl border border-border bg-surface p-3">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <Check className="h-4 w-4 text-success" /> Two-factor sign-in is on
          </h4>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Write these down and keep them somewhere other than your phone. Each one signs you in
            once if you lose the phone, and{" "}
            <strong className="text-foreground">this is the only time they are shown</strong>.
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-xs">
            {recovery.map((c) => (
              <li key={c} className="rounded-lg bg-background px-2 py-1.5">
                {c}
              </li>
            ))}
          </ul>
          <button
            onClick={() => setRecovery(null)}
            className="mt-2.5 h-11 w-full rounded-xl border border-border text-sm font-semibold"
          >
            I have written them down
          </button>
        </section>
      )}

      {/* ── two-factor ─────────────────────────────────────────────────── */}
      <section>
        <h4 className="mb-2 text-sm font-semibold">Two-factor sign-in</h4>

        {status === null ? (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Checking…
          </p>
        ) : status.enabled ? (
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-success" /> On
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              You need a six-digit code from your authenticator app as well as your password.
              {typeof status.recoveryCodesLeft === "number" &&
                ` ${status.recoveryCodesLeft} recovery code${status.recoveryCodesLeft === 1 ? "" : "s"} left.`}
            </p>
          </div>
        ) : secret ? (
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-[11px] text-muted-foreground">
              Scan this with Google Authenticator, 1Password, Authy — anything that shows six-digit
              codes. Cannot scan? Enter this key by hand.
            </p>
            <p className="mt-2 rounded-lg bg-background px-2 py-2 font-mono text-xs break-all">
              {secret}
            </p>
            {uri && <span className="sr-only">{uri}</span>}

            <label className="mt-3 block text-[11px] text-muted-foreground" htmlFor="mfa-code">
              Enter the code your app shows now
            </label>
            <input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-center font-mono text-lg tracking-[0.3em]"
            />
            <button
              onClick={() => void confirm()}
              disabled={busy || code.length !== 6}
              className="mt-2 h-11 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Checking…" : "Turn it on"}
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-[11px] text-muted-foreground">
              A second factor means somebody who learns your password still cannot sign in. Worth it
              on an account that holds your licence, your insurance and your work.
            </p>
            <button
              onClick={() => void begin()}
              disabled={busy}
              className="mt-2 h-11 w-full rounded-xl border border-border text-sm font-semibold disabled:opacity-60"
            >
              {busy ? "Starting…" : "Set it up"}
            </button>
          </div>
        )}
      </section>

      {/* ── password ───────────────────────────────────────────────────── */}
      <section>
        <h4 className="mb-2 text-sm font-semibold">Password</h4>
        <div className="rounded-xl border border-border bg-surface p-3">
          {resetSent ? (
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              If that address has an account, a link is on its way. It works once and expires.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                We email you a link rather than changing it here — so somebody using your unlocked
                phone cannot lock you out of your own account.
              </p>
              <button
                onClick={() => void sendReset()}
                disabled={busy}
                className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-semibold disabled:opacity-60"
              >
                <KeyRound className="h-4 w-4" />
                {busy ? "Sending…" : "Email me a reset link"}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

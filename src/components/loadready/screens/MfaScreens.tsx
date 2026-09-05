import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import qrcode from "qrcode-generator";
import { PrimaryButton } from "../PrimaryButton";

/**
 * Two-factor sign-in.
 *
 * The QR is drawn here rather than fetched, because an image of a secret should
 * not travel anywhere it does not have to. `qrcode-generator` has no
 * dependencies of its own, which matters for something in the path of every
 * administrator sign-in.
 */

const field =
  "w-full h-[52px] px-4 rounded-xl bg-surface border border-border text-foreground text-center text-2xl tracking-[0.4em] font-semibold focus:border-primary";

/** An SVG QR for the otpauth:// URI. Error correction M, the usual choice. */
function QrCode({ value }: { value: string }) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();

  const count = qr.getModuleCount();
  const cells: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) cells.push(`M${col} ${row}h1v1h-1z`);
    }
  }

  return (
    <svg
      viewBox={`0 0 ${count} ${count}`}
      role="img"
      aria-label="Scan this with your authenticator app"
      className="h-48 w-48 rounded-xl bg-white p-2"
      shapeRendering="crispEdges"
    >
      <path d={cells.join("")} fill="#000" />
    </svg>
  );
}

function CodeInput({
  value,
  onChange,
  label = "Six-digit code",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <div>
      <label htmlFor="mfa-code" className="mb-2 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id="mfa-code"
        // Not type="number": a leading zero must survive, and spinners on a
        // six-digit code are a nuisance on a phone.
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={14}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="000000"
        className={field}
      />
    </div>
  );
}

/**
 * Shown after the password, when the account has a second factor.
 *
 * The challenge grants nothing on its own — no cookie is set until the code is
 * right — so this screen is not a gate that can be skipped by navigating away.
 */
export function MfaChallengeScreen({
  challenge,
  onVerified,
  onBackToLogin,
}: {
  challenge: string;
  onVerified: () => void;
  onBackToLogin: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "verify-mfa", challenge, code }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "That code is not right.");
        setBusy(false);
        return;
      }
      onVerified();
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6">
      <div className="flex flex-col items-center pb-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
          <ShieldCheck className="h-7 w-7 text-primary" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-primary">Enter your code</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Open your authenticator app and enter the six digits for LoadReady.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <CodeInput value={code} onChange={setCode} />

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <PrimaryButton type="submit" disabled={busy || code.trim().length < 6}>
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking…
            </span>
          ) : (
            "Sign in"
          )}
        </PrimaryButton>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Lost your phone? Enter one of your recovery codes instead.
      </p>

      <button
        type="button"
        onClick={onBackToLogin}
        className="mt-4 min-h-11 text-sm text-muted-foreground hover:text-foreground"
      >
        Back to sign in
      </button>
    </div>
  );
}

interface Status {
  enabled: boolean;
  enrolling: boolean;
  recoveryCodesLeft: number;
}

/**
 * Enrolment. Required for administrators before the console opens.
 *
 * The recovery codes are shown once, because they are stored only as hashes.
 * The screen refuses to move on until they have been acknowledged — a person
 * who closes this without saving them has no way back in if the phone is lost.
 */
export function MfaEnrolScreen({ onDone }: { onDone: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as Record<string, unknown> & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "That did not work.");
    return data;
  };

  useEffect(() => {
    void (async () => {
      try {
        const s = (await post({ action: "mfa-status" })) as unknown as Status;
        setStatus(s);
        if (!s.enabled) {
          const { secret: sec, uri: u } = (await post({ action: "mfa-begin" })) as {
            secret?: string;
            uri?: string;
          };
          setSecret(sec ?? null);
          setUri(u ?? null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start setup.");
      }
    })();
    // Runs once, on arrival.
  }, []);

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { recoveryCodes } = (await post({ action: "mfa-confirm", code })) as {
        recoveryCodes?: string[];
      };
      setRecovery(recoveryCodes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code is not right.");
    }
    setBusy(false);
  };

  if (error && !secret && !recovery) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      </div>
    );
  }

  // ── the codes, shown once ───────────────────────────────────────────────
  if (recovery) {
    return (
      <div className="flex min-h-dvh flex-col justify-center px-6 py-10">
        <h1 className="text-2xl font-bold text-primary">Save your recovery codes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Each of these works once, in place of your phone. This is the only time they are shown —
          they are stored hashed, so nobody, including us, can read them back to you.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface p-4 font-mono text-sm">
          {recovery.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(recovery.join("\n"));
            setCopied(true);
          }}
          className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold"
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy all"}
        </button>

        <label className="mt-4 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="mt-0.5 h-5 w-5 accent-[var(--primary)]"
          />
          <span>I have saved these somewhere I can reach without this device.</span>
        </label>

        <div className="mt-5">
          <PrimaryButton onClick={onDone} disabled={!saved}>
            Done
          </PrimaryButton>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // ── scan and confirm ────────────────────────────────────────────────────
  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <div className="flex flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
          <KeyRound className="h-7 w-7 text-primary" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-primary">Set up two-factor sign-in</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Administrators need a second factor. Scan this with Google Authenticator, 1Password, Authy
          or any app that does six-digit codes.
        </p>
      </div>

      {uri && (
        <div className="mt-5 flex justify-center">
          <QrCode value={uri} />
        </div>
      )}

      {secret && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs font-semibold">Cannot scan?</div>
          <p className="mt-1 text-[11px] text-muted-foreground">Enter this key by hand instead.</p>
          <code className="mt-2 block font-mono text-sm break-all">
            {secret.replace(/(.{4})/g, "$1 ").trim()}
          </code>
        </div>
      )}

      <form onSubmit={confirm} className="mt-5 flex flex-col gap-4">
        <CodeInput value={code} onChange={setCode} label="Enter the code your app shows now" />

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <PrimaryButton type="submit" disabled={busy || code.trim().length < 6}>
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking…
            </span>
          ) : (
            "Turn on two-factor sign-in"
          )}
        </PrimaryButton>
      </form>
    </div>
  );
}

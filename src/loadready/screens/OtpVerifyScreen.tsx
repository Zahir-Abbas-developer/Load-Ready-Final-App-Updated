import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { AlertTriangle, Loader2, MailCheck, RefreshCw } from "lucide-react";
import { PrimaryButton } from "../PrimaryButton";
import { useAuth } from "@/lib/auth-context";

const LENGTH = 6;

/**
 * Step two of signup: prove the address is reachable.
 *
 * The code is checked on the server against a hash, with a limited number of
 * attempts and a ten-minute life. Nothing here can be bypassed from the
 * browser — until the right code arrives, no account exists at all.
 */
export function OtpVerifyScreen({
  email,
  /** Set when the server could not actually send the email. */
  deliveryNote,
  onVerified,
  onBackToLogin,
}: {
  email: string;
  deliveryNote?: string;
  onVerified: () => void;
  onBackToLogin: () => void;
}) {
  const { verifyOtp, resendOtp } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | undefined>(deliveryNote);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const code = digits.join("");

  const submit = async (value: string) => {
    if (busy || value.length !== LENGTH) return;
    setBusy(true);
    setError(null);
    setNote(null);

    const { error: err } = await verifyOtp(email, value);
    if (err) {
      setError(err);
      setDigits(Array(LENGTH).fill(""));
      inputs.current[0]?.focus();
      setBusy(false);
      return;
    }
    onVerified();
  };

  const setDigit = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < LENGTH - 1) inputs.current[i + 1]?.focus();
    const joined = next.join("");
    if (joined.length === LENGTH && !next.includes("")) void submit(joined);
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < LENGTH - 1) inputs.current[i + 1]?.focus();
  };

  // Let people paste the whole code at once.
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!text) return;
    e.preventDefault();
    const next = Array(LENGTH).fill("");
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    if (text.length === LENGTH) void submit(text);
    else inputs.current[text.length]?.focus();
  };

  const resend = async () => {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setError(null);
    setNote(null);

    const res = await resendOtp(email);
    if (res.error) setError(res.error);
    else {
      setNote(res.codeSent ? "A new code is on its way." : "A new code was generated.");
      setWarning(res.deliveryNote);
      setCooldown(60);
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
      <div className="h-16 w-16 rounded-full bg-accent flex items-center justify-center">
        <MailCheck className="h-8 w-8 text-primary" />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-primary">Enter your code</h1>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        We sent a {LENGTH}-digit code to{" "}
        <span className="font-semibold text-foreground break-all">{email}</span>.
      </p>

      {warning && (
        <div
          role="alert"
          className="mt-4 w-full max-w-xs rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-left text-xs text-warning-foreground"
        >
          <div className="flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            <span>
              <span className="font-semibold">The email could not be sent.</span> {warning} Ask your
              LoadReady administrator for the code.
            </span>
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-2" onPaste={onPaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${i + 1}`}
            disabled={busy}
            className="h-14 w-11 rounded-xl border border-border bg-surface text-center text-xl font-bold text-foreground focus:border-primary disabled:opacity-60"
          />
        ))}
      </div>

      {error && <p className="mt-4 text-sm font-medium text-destructive">{error}</p>}
      {note && <p className="mt-4 text-sm font-medium text-success">{note}</p>}

      <div className="mt-7 w-full max-w-xs space-y-3">
        <PrimaryButton onClick={() => void submit(code)} disabled={code.length !== LENGTH || busy}>
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking…
            </span>
          ) : (
            "Verify"
          )}
        </PrimaryButton>

        <button
          onClick={() => void resend()}
          disabled={busy || cooldown > 0}
          className="w-full h-11 rounded-full border border-border text-sm font-semibold hover:bg-surface disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>

        <button
          onClick={onBackToLogin}
          className="w-full text-sm text-muted-foreground hover:text-foreground"
        >
          Back to sign in
        </button>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">The code expires in 10 minutes.</p>
    </div>
  );
}

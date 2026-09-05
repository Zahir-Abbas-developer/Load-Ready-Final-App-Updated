import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Loader2, MailCheck } from "lucide-react";
import { PrimaryButton } from "../PrimaryButton";
import { useAuth } from "@/lib/auth-context";
import {
  MIN_PASSWORD_LENGTH,
  firstError,
  requestPasswordResetSchema,
  resetPasswordSchema,
} from "@/lib/auth-schemas";

const field =
  "w-full h-[52px] px-4 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:border-primary";
const label = "block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2";

/**
 * Step one: ask for a reset link.
 *
 * The confirmation is deliberately the same whether or not that address has an
 * account. Saying "no account with that email" here would undo the work done to
 * stop signup leaking the same fact (CLAUDE.md rule 8).
 */
export function ForgotPasswordScreen({ onBackToLogin }: { onBackToLogin: () => void }) {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const parsed = requestPasswordResetSchema.safeParse({ email });
    if (!parsed.success) {
      setError(firstError(parsed));
      return;
    }

    setError(null);
    setBusy(true);
    const { error: err } = await requestPasswordReset(parsed.data.email);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
          <MailCheck className="h-8 w-8 text-primary" aria-hidden />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-primary">Check your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          If there is an account for{" "}
          <span className="font-semibold break-all text-foreground">{email}</span>, a reset link is
          on its way. It works once and expires in an hour.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Nothing after a minute or two? Check your spam folder.
        </p>
        <div className="mt-7 w-full max-w-xs">
          <PrimaryButton onClick={onBackToLogin}>Back to sign in</PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6">
      <div className="flex flex-col items-center pb-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
          <KeyRound className="h-7 w-7 text-primary" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-primary">Forgot your password?</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Enter your email and we will send you a link to choose a new one.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="reset-email" className={label}>
            Email
          </label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className={field}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <PrimaryButton type="submit" disabled={busy}>
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Sending…
            </span>
          ) : (
            "Send reset link"
          )}
        </PrimaryButton>
      </form>

      <button
        type="button"
        onClick={onBackToLogin}
        className="mt-6 min-h-11 text-sm text-muted-foreground hover:text-foreground"
      >
        Back to sign in
      </button>
    </div>
  );
}

/** Step two: reached from the emailed link, which carries the token. */
export function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const parsed = resetPasswordSchema.safeParse({ token, password, confirmPassword });
    if (!parsed.success) {
      setError(firstError(parsed));
      return;
    }

    setError(null);
    setBusy(true);
    const { error: err } = await resetPassword(token, password, confirmPassword);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
        <h1 className="text-2xl font-bold text-primary">Password changed</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          You have been signed out everywhere else, so anyone who had your old password no longer
          has access. Sign in with the new one.
        </p>
        <div className="mt-7 w-full max-w-xs">
          <PrimaryButton onClick={onDone}>Sign in</PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6">
      <div className="flex flex-col items-center pb-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
          <KeyRound className="h-7 w-7 text-primary" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-primary">Choose a new password</h1>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="new-password" className={label}>
            New password
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              className={`${field} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirm-new-password" className={label}>
            Confirm new password
          </label>
          <input
            id="confirm-new-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Type it again"
            className={field}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <PrimaryButton type="submit" disabled={busy}>
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </span>
          ) : (
            "Save new password"
          )}
        </PrimaryButton>
      </form>
    </div>
  );
}

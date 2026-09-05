import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { LoadReadyMark } from "@/components/loadready/brand/Brand";
import { PrimaryButton } from "../PrimaryButton";
import { useAuth } from "@/lib/auth-context";

/**
 * Real sign-in screen backed by Supabase email + password auth.
 *
 * Access is decided server-side: the account's row in public.user_roles picks
 * which dashboard the user lands on, and RLS keeps a pilot out of admin data
 * even if they get to the screen some other way.
 */
export function LoginScreen({
  onCreateAccount,
  onForgotPassword,
  onMfaRequired,
}: {
  onCreateAccount: () => void;
  onForgotPassword: () => void;
  /** The password was right and the account needs a code as well. */
  onMfaRequired?: (challenge: string) => void;
}) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const { error: err, challenge } = await signIn(email, password);
    if (err) {
      setError(err.toLowerCase().includes("invalid") ? "Wrong email or password." : err);
      setBusy(false);
      return;
    }

    // No session yet — the second factor still has to be answered.
    if (challenge) {
      setBusy(false);
      onMfaRequired?.(challenge);
      return;
    }
    // On success the auth listener swaps this screen out, so no reset needed.
  };

  const canSubmit = email.trim().length > 3 && password.length > 0 && !busy;

  return (
    <div className="flex flex-col min-h-screen px-6">
      <div className="flex flex-col items-center pt-14 pb-8">
        <LoadReadyMark className="h-20 w-20" />
        <h1 className="mt-4 text-2xl font-bold text-primary">Welcome to LoadReady</h1>
        <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full h-[52px] px-4 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:border-primary"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className="w-full h-[52px] pl-4 pr-14 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              /* 44px: this is tapped in a cab, often with gloves on. */
              className="absolute right-1 top-1/2 -translate-y-1/2 h-11 w-11 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <PrimaryButton type="submit" disabled={!canSubmit} className="mt-2">
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
            </span>
          ) : (
            "Sign in"
          )}
        </PrimaryButton>
      </form>

      <button
        type="button"
        onClick={onForgotPassword}
        className="mt-4 min-h-11 text-sm text-muted-foreground hover:text-foreground"
      >
        Forgot your password?
      </button>

      <button
        type="button"
        onClick={onCreateAccount}
        /* Padded to 44px tall; it was a 20px line of text. */
        className="mt-6 min-h-11 px-3 py-3 text-sm text-muted-foreground hover:text-foreground"
      >
        New to LoadReady? <span className="font-semibold text-primary">Create an account</span>
      </button>

      <div className="mt-auto pb-8 pt-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <LockKeyhole className="h-3.5 w-3.5" />
        New accounts are reviewed before they go live.
      </div>
    </div>
  );
}

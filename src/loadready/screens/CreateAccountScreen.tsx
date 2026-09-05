import { useState, type FormEvent } from "react";
import { Briefcase, Check, Eye, EyeOff, Loader2, Truck } from "lucide-react";
import { LoadReadyMark } from "@/components/loadready/brand/Brand";
import { PrimaryButton } from "../PrimaryButton";
import { useAuth } from "@/lib/auth-context";

type SignupRole = "pilot" | "dispatcher";

const MIN_PASSWORD = 8;

/**
 * Step one of self-service signup.
 *
 * Submitting does not create an account — the server holds the details, emails
 * a six-digit code, and waits. Only the right code turns this into a real
 * account, and even then an administrator has to approve it. The role is
 * validated server-side, so a signup cannot ask to become an admin.
 */
export function CreateAccountScreen({
  onSignedUp,
  onBackToLogin,
}: {
  onSignedUp: (email: string, deliveryNote?: string) => void;
  onBackToLogin: () => void;
}) {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<SignupRole | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;

  const canSubmit =
    fullName.trim().length > 1 &&
    email.trim().length > 3 &&
    password.length >= MIN_PASSWORD &&
    confirm === password &&
    role !== null &&
    !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !role) return;
    setError(null);
    setBusy(true);

    /*
     * `confirmPassword` goes with it. The server checks the two match rather
     * than trusting this screen to — and it was being left out entirely, so
     * every signup came back "Required" and nobody outside the seeded accounts
     * could create one.
     */
    const res = await signUp({ email, password, confirmPassword: confirm, fullName, role });
    if (res.error) {
      setError(res.error);
      setBusy(false);
      return;
    }
    onSignedUp(email.trim(), res.deliveryNote);
  };

  const RoleCard = ({
    value,
    icon: Icon,
    title,
    body,
  }: {
    value: SignupRole;
    icon: typeof Truck;
    title: string;
    body: string;
  }) => {
    const active = role === value;
    return (
      <button
        type="button"
        onClick={() => setRole(value)}
        aria-pressed={active}
        className={`w-full text-left p-3 rounded-2xl border-2 transition-all flex gap-3 items-start ${
          active ? "border-primary bg-accent" : "border-border bg-surface"
        }`}
      >
        <div
          className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${
            active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{body}</div>
        </div>
        <div
          className={`mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
            active ? "border-primary bg-primary" : "border-border"
          }`}
        >
          {active && <Check className="h-3 w-3 text-primary-foreground" />}
        </div>
      </button>
    );
  };

  const field =
    "w-full h-[52px] px-4 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:border-primary";
  const label = "block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2";

  return (
    <div className="flex flex-col min-h-screen px-6 pb-10">
      <div className="flex flex-col items-center pt-10 pb-6">
        <LoadReadyMark className="h-14 w-14" />
        <h1 className="mt-3 text-2xl font-bold text-primary">Create your account</h1>
        <p className="text-sm text-muted-foreground mt-1">It takes about a minute</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="fullName" className={label}>
            Full name
          </label>
          <input
            id="fullName"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jordan Blake"
            className={field}
          />
        </div>

        <div>
          <label htmlFor="signup-email" className={label}>
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className={field}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            We send a 6-digit code here — use an address you can open.
          </p>
        </div>

        <div>
          <label htmlFor="signup-password" className={label}>
            Password
          </label>
          <div className="relative">
            <input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`At least ${MIN_PASSWORD} characters`}
              className={`${field} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {passwordTooShort && (
            <p className="mt-1.5 text-xs text-destructive">
              Use at least {MIN_PASSWORD} characters.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="signup-confirm" className={label}>
            Confirm password
          </label>
          <input
            id="signup-confirm"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type it again"
            className={field}
          />
          {mismatch && <p className="mt-1.5 text-xs text-destructive">Passwords do not match.</p>}
        </div>

        <div>
          <span className={label}>I am a</span>
          <div className="flex flex-col gap-2">
            <RoleCard
              value="pilot"
              icon={Truck}
              title="Pilot car driver"
              body="I escort oversize/overweight loads with a certified pilot vehicle."
            />
            <RoleCard
              value="dispatcher"
              icon={Briefcase}
              title="Fleet dispatcher"
              body="I manage OS/OW loads and need pilot cars for my shipments."
            />
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

        <PrimaryButton type="submit" disabled={!canSubmit} className="mt-1">
          {busy ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Creating account…
            </span>
          ) : (
            "Create account"
          )}
        </PrimaryButton>

        <p className="text-center text-xs text-muted-foreground">
          We email you a code to confirm your address. A LoadReady administrator then reviews the
          account before it goes live.
        </p>
      </form>

      <button
        type="button"
        onClick={onBackToLogin}
        className="mt-6 text-sm text-muted-foreground hover:text-foreground"
      >
        Already have an account? <span className="font-semibold text-primary">Sign in</span>
      </button>
    </div>
  );
}

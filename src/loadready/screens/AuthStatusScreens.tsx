import { useState } from "react";
import { CheckCircle2, Clock, Loader2, MailCheck, XCircle } from "lucide-react";
import { LoadReadyMark } from "@/components/loadready/brand/Brand";
import { PrimaryButton } from "../PrimaryButton";
import { useAuth } from "@/lib/auth-context";

/**
 * Shown straight after signing up. The account exists but is not usable yet —
 * an administrator has to clear it first, so there is nothing to do but wait.
 */
export function SignupSubmittedScreen({
  email,
  onBackToLogin,
}: {
  email: string;
  onBackToLogin: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
      <div className="h-16 w-16 rounded-full bg-accent flex items-center justify-center">
        <MailCheck className="h-8 w-8 text-primary" />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-primary">Account created</h1>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        <span className="font-semibold text-foreground break-all">{email}</span> is registered. A
        LoadReady administrator reviews new accounts before they go live — you will be able to sign
        in once yours is approved.
      </p>
      <div className="mt-7 w-full max-w-xs">
        <PrimaryButton onClick={onBackToLogin}>Back to sign in</PrimaryButton>
      </div>
    </div>
  );
}

/**
 * Signed in, but an administrator has not cleared the account yet. Lets the
 * applicant re-check without signing out.
 */
export function PendingApprovalScreen() {
  const { user, role, refresh, signOut } = useAuth();
  const [checking, setChecking] = useState(false);

  const recheck = async () => {
    setChecking(true);
    await refresh();
    setChecking(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
      <LoadReadyMark className="h-14 w-14" />
      <div className="mt-5 h-14 w-14 rounded-full bg-warning/15 flex items-center justify-center">
        <Clock className="h-7 w-7 text-warning" />
      </div>
      <h1 className="mt-4 text-2xl font-bold text-foreground">Waiting for approval</h1>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        A LoadReady administrator is reviewing your{" "}
        <span className="font-semibold text-foreground">{role}</span> application. You will get in
        as soon as it is approved.
      </p>
      <p className="mt-3 text-xs text-muted-foreground break-all">{user?.email}</p>

      <div className="mt-7 w-full max-w-xs space-y-3">
        <PrimaryButton onClick={() => void recheck()} disabled={checking}>
          {checking ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking…
            </span>
          ) : (
            "Check again"
          )}
        </PrimaryButton>
        <button
          onClick={() => void signOut()}
          className="w-full h-11 rounded-full border border-border text-sm font-semibold hover:bg-surface"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/** An administrator turned the application down. */
export function RejectedScreen() {
  const { user, rejectionReason, signOut } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
      <div className="h-14 w-14 rounded-full bg-destructive/15 flex items-center justify-center">
        <XCircle className="h-7 w-7 text-destructive" />
      </div>
      <h1 className="mt-4 text-2xl font-bold text-foreground">Application not approved</h1>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        A LoadReady administrator reviewed your application and could not approve it.
      </p>
      {rejectionReason && (
        <div className="mt-4 w-full max-w-xs rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-left text-sm text-destructive">
          {rejectionReason}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground break-all">{user?.email}</p>
      <div className="mt-7 w-full max-w-xs">
        <button
          onClick={() => void signOut()}
          className="w-full h-11 rounded-full border border-border text-sm font-semibold hover:bg-surface"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/** Signed in, but somehow holding no role at all. */
export function NoRoleScreen() {
  const { user, signOut } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="h-14 w-14 rounded-full bg-surface border border-border flex items-center justify-center">
        <CheckCircle2 className="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-bold text-foreground">No access yet</h1>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground break-all">{user?.email}</span> is signed in,
        but has no role. Ask your LoadReady administrator to grant you access.
      </p>
      <button
        onClick={() => void signOut()}
        className="mt-2 h-10 px-5 rounded-full border border-border text-sm font-semibold hover:bg-surface"
      >
        Sign out
      </button>
    </div>
  );
}

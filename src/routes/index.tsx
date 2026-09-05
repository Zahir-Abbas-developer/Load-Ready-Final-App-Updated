import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { OnboardingProvider, useOnboarding, type OnboardingStep } from "@/lib/onboarding-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { BillingProvider } from "@/lib/billing-context";
import { AppShell } from "@/components/loadready/AppShell";
import { AnnouncementBanner, ViewingAsBanner } from "@/components/loadready/shared/ViewingAsBanner";
import { InstallPrompt } from "@/components/loadready/shared/InstallPrompt";
import { useNativeShell } from "@/lib/mobile/shell";
import { ErrorBoundary } from "@/components/loadready/ErrorBoundary";
import { LoginScreen } from "@/components/loadready/screens/LoginScreen";
import { CreateAccountScreen } from "@/components/loadready/screens/CreateAccountScreen";
import { OtpVerifyScreen } from "@/components/loadready/screens/OtpVerifyScreen";
import {
  ForgotPasswordScreen,
  ResetPasswordScreen,
} from "@/components/loadready/screens/PasswordResetScreens";
import { MfaChallengeScreen, MfaEnrolScreen } from "@/components/loadready/screens/MfaScreens";
import { ReacceptanceGate } from "@/components/loadready/screens/LegalScreens";
import { DeletionPendingScreen } from "@/components/loadready/screens/DataRightsScreens";
import {
  NoRoleScreen,
  PendingApprovalScreen,
  RejectedScreen,
  SignupSubmittedScreen,
} from "@/components/loadready/screens/AuthStatusScreens";
import { SplashScreen } from "@/components/loadready/screens/SplashScreen";
import { OnboardingSlide } from "@/components/loadready/screens/OnboardingSlide";
import {
  PilotStep1,
  PilotStep2,
  PilotStep3,
  PilotStep4,
  PilotStep5,
  PilotStep6,
  PilotApproved,
  DispatcherStep1,
  DispatcherStep2,
  DispatcherStep3,
  DispatcherStep4,
} from "@/components/loadready/screens/RegistrationSteps";
import { PilotHome, DispatcherHome } from "@/components/loadready/screens/HomeScreens";
import { AdminDashboard } from "@/components/loadready/screens/AdminDashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LoadReady — Pilot Cars & Fleet Dispatch for OS/OW Loads" },
      {
        name: "description",
        content:
          "Connect certified pilot car operators with fleet dispatchers for oversize/overweight load escorts across USA & Canada.",
      },
      { property: "og:title", content: "LoadReady — Pilot Cars & Fleet Dispatch" },
      {
        property: "og:description",
        content: "Plan, dispatch, and track OS/OW load escorts with verified pilot car operators.",
      },
    ],
  }),
  component: Index,
});

/** Steps that belong to the signed-out funnel. */
const PRE_AUTH_STEPS: OnboardingStep[] = [
  "splash",
  "slide1",
  "slide2",
  "slide3",
  "login",
  "create-account",
  "forgot-password",
  "reset-password",
  "verify-otp",
  "signup-done",
  "mfa-challenge",
];

function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

/** Intro slides, then sign in / create account. */
function SignedOut() {
  const { step, go, contact, setContact } = useOnboarding();
  // Only set when the server could not actually deliver the code.
  const [deliveryNote, setDeliveryNote] = useState<string | undefined>();
  const [resetToken, setResetToken] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState("");

  /*
   * The reset email links to /?reset=<token>. Take the token, then strip it
   * from the address bar: a reset link left in history or pasted into a chat is
   * a working key to the account until it is spent.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = new URLSearchParams(window.location.search).get("reset");
    if (!token) return;

    setResetToken(token);
    window.history.replaceState({}, "", window.location.pathname);
    go("reset-password");
    // Runs once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  switch (step) {
    case "splash":
      return <SplashScreen />;
    case "slide1":
      return <OnboardingSlide index={0} />;
    case "slide2":
      return <OnboardingSlide index={1} />;
    case "slide3":
      return <OnboardingSlide index={2} />;
    case "create-account":
      return (
        <CreateAccountScreen
          onSignedUp={(email, note) => {
            setContact(email);
            setDeliveryNote(note);
            go("verify-otp");
          }}
          onBackToLogin={() => go("login")}
        />
      );
    case "verify-otp":
      return (
        <OtpVerifyScreen
          email={contact}
          deliveryNote={deliveryNote}
          onVerified={() => go("signup-done")}
          onBackToLogin={() => go("login")}
        />
      );
    case "signup-done":
      return <SignupSubmittedScreen email={contact} onBackToLogin={() => go("login")} />;
    case "mfa-challenge":
      return (
        <MfaChallengeScreen
          challenge={mfaChallenge}
          // The cookie is set by now; a reload is the simplest way to pick the
          // session up everywhere at once.
          onVerified={() => window.location.reload()}
          onBackToLogin={() => go("login")}
        />
      );
    case "forgot-password":
      return <ForgotPasswordScreen onBackToLogin={() => go("login")} />;
    case "reset-password":
      return <ResetPasswordScreen token={resetToken} onDone={() => go("login")} />;
    default:
      return (
        <LoginScreen
          onCreateAccount={() => go("create-account")}
          onForgotPassword={() => go("forgot-password")}
          onMfaRequired={(challenge) => {
            setMfaChallenge(challenge);
            go("mfa-challenge");
          }}
        />
      );
  }
}

/** The app proper, for an approved account. */
function Screen() {
  const { step, role } = useOnboarding();
  switch (step) {
    case "pilot-step1":
      return <PilotStep1 />;
    case "pilot-step2":
      return <PilotStep2 />;
    case "pilot-step3":
      return <PilotStep3 />;
    case "pilot-step4":
      return <PilotStep4 />;
    case "pilot-step5":
      return <PilotStep5 />;
    case "pilot-step6":
      return <PilotStep6 />;
    case "pilot-approved":
      return <PilotApproved />;
    case "dispatcher-step1":
      return <DispatcherStep1 />;
    case "dispatcher-step2":
      return <DispatcherStep2 />;
    case "dispatcher-step3":
      return <DispatcherStep3 />;
    case "dispatcher-step4":
      return <DispatcherStep4 />;
    case "admin":
      return <AdminDashboard />;
    case "home":
    default:
      return role === "dispatcher" ? <DispatcherHome /> : <PilotHome />;
  }
}

/**
 * Signed-in shell. Mirrors the authenticated role into the onboarding context
 * (screens further down still read it from there) and moves the user off any
 * signed-out step onto their own dashboard.
 */
function AuthedApp() {
  const { role, user } = useAuth();
  const { step, go, role: onboardingRole, setRole } = useOnboarding();
  const [needsLegal, setNeedsLegal] = useState(false);

  /*
   * Asked once per session. Re-checking on every render would put a request in
   * front of every screen change for something that changes a few times a year.
   */
  useEffect(() => {
    if (!user || role === "admin") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/legal", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { outstanding?: unknown[] };
        if (!cancelled) setNeedsLegal((data.outstanding?.length ?? 0) > 0);
      } catch {
        // Offline. Not a reason to lock somebody out of the app they already
        // signed in to — the acceptance is asked for again next time.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, role]);

  useEffect(() => {
    if (role && role !== onboardingRole) setRole(role);
  }, [role, onboardingRole, setRole]);

  // The landing screen is decided by the role, never by whatever step happens
  // to be left over. "admin" is the admin's screen and nobody else's, so a
  // dispatcher or pilot standing on it gets moved to their own dashboard.
  const misplaced = role === "admin" ? step !== "admin" : step === "admin";
  const needsRedirect = PRE_AUTH_STEPS.includes(step) || misplaced;

  useEffect(() => {
    if (!role || !needsRedirect) return;
    go(role === "admin" ? "admin" : "home");
  }, [role, needsRedirect, go]);

  /*
   * CLAUDE.md requires a second factor on the admin role, so an administrator
   * who has not enrolled sees this and nothing else. The server refuses admin
   * actions in the same state, so this screen is the way through rather than
   * the lock itself.
   */
  if (role === "admin" && user && !user.mfaEnabled) {
    return <MfaEnrolScreen onDone={() => window.location.reload()} />;
  }

  // A policy changed in a way that needs agreeing to again. Checked after MFA
  // so an administrator is never asked to read a contract they are not party to.
  if (needsLegal) {
    return <ReacceptanceGate onDone={() => setNeedsLegal(false)} />;
  }

  // Avoid a flash of the wrong screen while the effect above redirects.
  if (needsRedirect) return <LoadingScreen />;

  return <Screen />;
}

/**
 * Decides what a visitor may see.
 *
 * The session is an httpOnly cookie the browser cannot forge, and every screen
 * past this point needs a granted role. New signups additionally wait for an
 * administrator to clear them; the three internal accounts ship approved.
 */
function Gate() {
  const { user, role, approval, loading, signOut, refresh } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <SignedOut />;

  /*
   * An account inside its deletion grace period. Checked before role and
   * approval, because none of those matter while it is on its way out — and
   * the server refuses everything else anyway.
   */
  if (user.deletionRequestedAt) {
    return (
      <DeletionPendingScreen
        dueAt={Date.parse(user.deletionRequestedAt) + 7 * 24 * 60 * 60 * 1000}
        onCancelled={() => void refresh()}
        onSignOut={() => void signOut()}
      />
    );
  }
  if (!role) return <NoRoleScreen />;
  if (approval === "rejected") return <RejectedScreen />;
  if (approval !== "approved") return <PendingApprovalScreen />;
  return <AuthedApp />;
}

/**
 * Scopes the navigation funnel to one account.
 *
 * Keying the provider on the user id remounts it with fresh state whenever the
 * account changes, so where one person had navigated to can never carry over
 * into the next person's session on the same tab.
 */
function SessionScopedApp() {
  const { user } = useAuth();
  return (
    <OnboardingProvider key={user?.id ?? "signed-out"}>
      <Gate />
    </OnboardingProvider>
  );
}

function Index() {
  // Link handling and native notifications, for as long as the app is open.
  // A no-op in a browser.
  useNativeShell();

  return (
    <AuthProvider>
      {/* Inside AuthProvider: it needs the session to know whether billing
          applies at all, and it asks the server for nothing when it does not. */}
      <BillingProvider>
        {/* Above everything, so an administrator inside somebody else's
            account cannot mistake it for their own. */}
        <AnnouncementBanner />
        <ViewingAsBanner />
        <InstallPrompt />
        <AppShell>
          <ErrorBoundary>
            <SessionScopedApp />
          </ErrorBoundary>
        </AppShell>
      </BillingProvider>
    </AuthProvider>
  );
}

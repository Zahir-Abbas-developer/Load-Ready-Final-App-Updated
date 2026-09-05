import { createFileRoute } from "@tanstack/react-router";
import { OnboardingProvider, useOnboarding } from "@/lib/onboarding-context";
import { PhoneFrame } from "@/components/bwm/Shell";
import { SplashScreen } from "@/components/bwm/screens/SplashScreen";
import { OnboardingSlide } from "@/components/bwm/screens/OnboardingSlide";
import { RoleScreen } from "@/components/bwm/screens/RoleScreen";
import { SignupScreen } from "@/components/bwm/screens/SignupScreen";
import { OtpScreen } from "@/components/bwm/screens/OtpScreen";
import {
  PilotStep1, PilotStep2, PilotStep3, PilotStep4, PilotStep5, PilotStep6,
  PilotApproved, DispatcherStep1, DispatcherStep2, DispatcherStep3, DispatcherStep4,
} from "@/components/bwm/screens/RegistrationSteps";
import { PilotHome, DispatcherHome } from "@/components/bwm/screens/HomeScreens";
import { AdminDashboard } from "@/components/bwm/screens/AdminDashboard";
import { DemoLauncher } from "@/components/bwm/DemoLauncher";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BWM — Pilot Cars & Fleet Dispatch for OS/OW Loads" },
      { name: "description", content: "Connect certified pilot car operators with fleet dispatchers for oversize/overweight load escorts across USA & Canada." },
      { property: "og:title", content: "BWM — Pilot Cars & Fleet Dispatch" },
      { property: "og:description", content: "Plan, dispatch, and track OS/OW load escorts with verified pilot car operators." },
    ],
  }),
  component: Index,
});

function Router() {
  const { step, role } = useOnboarding();
  switch (step) {
    case "splash": return <SplashScreen />;
    case "slide1": return <OnboardingSlide index={0} />;
    case "slide2": return <OnboardingSlide index={1} />;
    case "slide3": return <OnboardingSlide index={2} />;
    case "role": return <RoleScreen />;
    case "signup": return <SignupScreen />;
    case "otp": return <OtpScreen />;
    case "pilot-step1": return <PilotStep1 />;
    case "pilot-step2": return <PilotStep2 />;
    case "pilot-step3": return <PilotStep3 />;
    case "pilot-step4": return <PilotStep4 />;
    case "pilot-step5": return <PilotStep5 />;
    case "pilot-step6": return <PilotStep6 />;
    case "pilot-approved": return <PilotApproved />;
    case "dispatcher-step1": return <DispatcherStep1 />;
    case "dispatcher-step2": return <DispatcherStep2 />;
    case "dispatcher-step3": return <DispatcherStep3 />;
    case "dispatcher-step4": return <DispatcherStep4 />;
    case "home": return role === "dispatcher" ? <DispatcherHome /> : <PilotHome />;
    case "admin": return <AdminDashboard />;
    default: return <SplashScreen />;
  }
}

function Index() {
  return (
    <OnboardingProvider>
      <PhoneFrame>
        <Router />
      </PhoneFrame>
      <DemoLauncher />
    </OnboardingProvider>
  );
}

import { createContext, useContext, useState, type ReactNode } from "react";

export type Role = "pilot" | "dispatcher" | "admin" | null;

export type OnboardingStep =
  | "splash"
  | "slide1"
  | "slide2"
  | "slide3"
  | "login"
  | "create-account"
  | "forgot-password"
  | "reset-password"
  | "verify-otp"
  | "signup-done"
  | "mfa-challenge"
  | "mfa-enrol"
  | "pilot-step1"
  | "pilot-step2"
  | "pilot-step3"
  | "pilot-step4"
  | "pilot-step5"
  | "pilot-step6"
  | "pilot-approved"
  | "dispatcher-step1"
  | "dispatcher-step2"
  | "dispatcher-step3"
  | "dispatcher-step4"
  | "home"
  | "admin";

interface OnboardingState {
  step: OnboardingStep;
  go: (s: OnboardingStep) => void;
  back: () => void;
  role: Role;
  setRole: (r: Role) => void;
  contact: string;
  setContact: (c: string) => void;
  states: string[];
  setStates: (s: string[]) => void;
}

const Ctx = createContext<OnboardingState | null>(null);

/**
 * In-app navigation for the onboarding / registration funnel.
 *
 * This holds screen position only — it is not an auth boundary. Who you are
 * and what you may see comes from `useAuth()` (Supabase session + the role in
 * public.user_roles), and is enforced again by row level security.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<OnboardingStep>("splash");
  const [, setHistory] = useState<OnboardingStep[]>([]);
  const [role, setRole] = useState<Role>(null);
  const [contact, setContact] = useState("");
  const [states, setStates] = useState<string[]>([]);

  const go = (s: OnboardingStep) => {
    setHistory((h) => [...h, step]);
    setStep(s);
  };
  const back = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setStep(prev);
      return h.slice(0, -1);
    });
  };

  return (
    <Ctx.Provider value={{ step, go, back, role, setRole, contact, setContact, states, setStates }}>
      {children}
    </Ctx.Provider>
  );
}

export function useOnboarding() {
  const v = useContext(Ctx);
  if (!v) throw new Error("OnboardingProvider missing");
  return v;
}

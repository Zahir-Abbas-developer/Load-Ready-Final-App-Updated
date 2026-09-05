import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "pilot" | "dispatcher" | "admin" | null;

export type OnboardingStep =
  | "splash"
  | "slide1"
  | "slide2"
  | "slide3"
  | "role"
  | "signup"
  | "otp"
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
  demo: boolean;
  setDemo: (d: boolean) => void;
}

const Ctx = createContext<OnboardingState | null>(null);

const LS_KEY = "bwm:demo-session:v1";

type Persisted = {
  demo: boolean;
  role: Role;
  contact: string;
  step: OnboardingStep;
};

function readPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

export function clearDemoSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LS_KEY);
    // also clear any seeded demo content keys
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith("bwm:demo:"))
      .forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const initial = readPersisted();
  const [step, setStep] = useState<OnboardingStep>(initial?.step ?? "splash");
  const [history, setHistory] = useState<OnboardingStep[]>([]);
  const [role, setRole] = useState<Role>(initial?.role ?? null);
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [states, setStates] = useState<string[]>([]);
  const [demo, setDemo] = useState(initial?.demo ?? false);

  // Persist demo session to localStorage so refresh keeps you in demo.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (demo) {
        const data: Persisted = { demo, role, contact, step };
        window.localStorage.setItem(LS_KEY, JSON.stringify(data));
      } else {
        window.localStorage.removeItem(LS_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [demo, role, contact, step]);

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
    <Ctx.Provider value={{ step, go, back, role, setRole, contact, setContact, states, setStates, demo, setDemo }}>
      {children}
    </Ctx.Provider>
  );
}

export function useOnboarding() {
  const v = useContext(Ctx);
  if (!v) throw new Error("OnboardingProvider missing");
  return v;
}

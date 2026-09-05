import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { z } from "zod";
import type { signUpSchema } from "@/lib/auth-schemas";
import { unsubscribeThisBrowser } from "@/lib/notifications/push-api";

export type AppRole = "admin" | "pilot" | "dispatcher";
export type ApprovalStatus = "approved" | "pending" | "rejected";

export interface AccountUser {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  approval: ApprovalStatus;
  rejectionReason: string | null;
  createdAt: string;
  builtIn: boolean;
  /** Whether a second factor is set up. Never the secret itself. */
  mfaEnabled: boolean;
  /** Set while the account is inside its deletion grace period. */
  deletionRequestedAt?: string;
}

/**
 * What signing up needs, taken from the schema the server validates with.
 *
 * This used to be a hand-written interface listing four of the five fields —
 * `confirmPassword` was missing. The server checks the two passwords match
 * rather than trusting the screen to, so every signup was rejected with
 * "Required" and **nobody outside the seeded accounts could create an
 * account**. TypeScript was satisfied throughout, because the client had its
 * own idea of the shape.
 *
 * Derived from `signUpSchema` now, so the two cannot disagree again: adding a
 * field to the schema is a compile error at every call site until it is sent.
 */
export type SignUpInput = z.infer<typeof signUpSchema>;

/** What the server reports back after issuing a verification code. */
export interface SignUpStarted {
  error: string | null;
  /** False when the server has no mail provider configured. */
  codeSent: boolean;
  /** Why the code did not go out, when codeSent is false. */
  deliveryNote?: string;
}

interface AuthState {
  user: AccountUser | null;
  /**
   * True when an administrator is looking at this account rather than its
   * owner using it. Every screen shows a banner; the server refuses every
   * mutating action regardless.
   */
  viewingAs: boolean;
  /** A line an administrator has put up for everybody. Empty most of the time. */
  announcement: string;
  role: AppRole | null;
  approval: ApprovalStatus | null;
  rejectionReason: string | null;
  loading: boolean;
  /**
   * Signs in. When the account has a second factor the password alone is not
   * enough: `challenge` comes back instead of a session, and the caller has to
   * take the code before anything is reachable.
   */
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; challenge?: string }>;
  /** Step one — holds the details and emails a code. Creates no account. */
  signUp: (input: SignUpInput) => Promise<SignUpStarted>;
  /** Step two — the right code creates the account, still awaiting approval. */
  verifyOtp: (email: string, code: string) => Promise<{ error: string | null }>;
  resendOtp: (email: string) => Promise<SignUpStarted>;
  /** Always resolves the same way, whether or not the address has an account. */
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  resetPassword: (
    token: string,
    password: string,
    confirmPassword: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/**
 * Talks to /api/auth. The session lives in an httpOnly cookie the browser
 * cannot read, so there is no token to keep here — every call just needs
 * credentials: "include" and the server decides.
 */
async function post<T>(body: Record<string, unknown>): Promise<T & { error?: string }> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  try {
    return (await res.json()) as T & { error?: string };
  } catch {
    return { error: "The server did not respond properly." } as T & { error?: string };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [viewingAs, setViewingAs] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth", { credentials: "include" });
      const data = (await res.json()) as {
        user: AccountUser | null;
        viewingAs?: boolean;
        announcement?: string;
      };
      setUser(data.user ?? null);
      setViewingAs(data.viewingAs === true);
      setAnnouncement(data.announcement ?? "");
    } catch {
      setUser(null);
      setViewingAs(false);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await post<{ user?: AccountUser; mfaRequired?: boolean; challenge?: string }>({
      action: "login",
      email,
      password,
    });
    if (data.error) return { error: data.error };

    // No session was issued; the caller shows the code screen.
    if (data.mfaRequired && data.challenge) return { error: null, challenge: data.challenge };

    setUser(data.user ?? null);
    return { error: null };
  }, []);

  const signUp = useCallback(async (input: SignUpInput): Promise<SignUpStarted> => {
    const data = await post<{ codeSent?: boolean; deliveryNote?: string }>({
      action: "signup",
      ...input,
    });
    return {
      error: data.error ?? null,
      codeSent: data.codeSent ?? false,
      deliveryNote: data.deliveryNote,
    };
  }, []);

  const verifyOtp = useCallback(async (email: string, code: string) => {
    const data = await post<{ user?: AccountUser }>({ action: "verify-otp", email, code });
    return { error: data.error ?? null };
  }, []);

  const resendOtp = useCallback(async (email: string): Promise<SignUpStarted> => {
    const data = await post<{ codeSent?: boolean; deliveryNote?: string }>({
      action: "resend-otp",
      email,
    });
    return {
      error: data.error ?? null,
      codeSent: data.codeSent ?? false,
      deliveryNote: data.deliveryNote,
    };
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const data = await post({ action: "request-password-reset", email });
    return { error: data.error ?? null };
  }, []);

  const resetPassword = useCallback(
    async (token: string, password: string, confirmPassword: string) => {
      const data = await post({ action: "reset-password", token, password, confirmPassword });
      return { error: data.error ?? null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    /*
     * Push goes before the session does, and while the cookie still works.
     *
     * A truck-stop laptop or a shared phone must not keep waking for the
     * account that used it last — and the service worker, which fetches the
     * notification itself, would otherwise read whoever signs in next.
     */
    await unsubscribeThisBrowser();
    await post({ action: "logout" });
    setUser(null);
    setViewingAs(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      viewingAs,
      announcement,
      role: user?.role ?? null,
      approval: user?.approval ?? null,
      rejectionReason: user?.rejectionReason ?? null,
      loading,
      signIn,
      signUp,
      verifyOtp,
      resendOtp,
      requestPasswordReset,
      resetPassword,
      signOut,
      refresh,
    }),
    [
      user,
      viewingAs,
      announcement,
      loading,
      signIn,
      signUp,
      verifyOtp,
      resendOtp,
      requestPasswordReset,
      resetPassword,
      signOut,
      refresh,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}

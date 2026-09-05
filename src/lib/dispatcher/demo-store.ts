/*
 * The dispatcher's business-verification state, in the browser.
 *
 * All that is left of what used to be a whole shadow product here. Loads,
 * offers, hiring and the job lifecycle are real and on the server; the escrow
 * ledger and its platform fee went with them, because LoadReady never holds
 * money for a job — the dispatcher pays the pilot directly (D1).
 *
 * Dispatcher business verification has no server side yet (BACKLOG F-83), so
 * this one piece still lives here.
 */

const KEY = "loadready:dispatcher:v1";

export type BusinessVerificationStatus = "not_started" | "in_review" | "verified" | "rejected";
export type DocStatus = "pending" | "approved" | "rejected" | "expired";

export interface DispatcherProfile {
  user_id: string;
  company_name: string;
  legal_name: string;
  ein: string | null;
  mc_number: string | null;
  dot_number: string | null;
  contact_name: string;
  contact_phone: string;
  billing_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  website: string | null;
  verification_status: BusinessVerificationStatus;
  completion_pct: number;
}

export interface DispatcherDocument {
  id: string;
  doc_type: string;
  document_number: string | null;
  issuing_authority: string | null;
  expiry_date: string | null;
  file_url: string | null;
  status: DocStatus;
  rejection_reason: string | null;
  created_at: string;
}

export interface DispatcherState {
  profile: DispatcherProfile;
  documents: DispatcherDocument[];
}

export function seedDispatcherState(): DispatcherState {
  return {
    profile: {
      user_id: "",
      company_name: "",
      legal_name: "",
      ein: null,
      mc_number: null,
      dot_number: null,
      contact_name: "",
      contact_phone: "",
      billing_address: null,
      city: null,
      state: null,
      postal_code: null,
      country: null,
      website: null,
      verification_status: "not_started",
      completion_pct: 0,
    },
    documents: [],
  };
}

export function loadDispatcherState(): DispatcherState {
  if (typeof window === "undefined") return seedDispatcherState();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const seeded = seedDispatcherState();
      window.localStorage.setItem(KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw) as DispatcherState;
  } catch {
    return seedDispatcherState();
  }
}

export function saveDispatcherState(s: DispatcherState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function recomputeDispatcherCompletion(s: DispatcherState): number {
  const p = s.profile;
  const checks = [
    !!p.company_name,
    !!p.legal_name,
    !!p.ein,
    !!p.mc_number,
    !!p.dot_number,
    !!p.contact_name && !!p.contact_phone,
    !!p.billing_address && !!p.city && !!p.state,
    s.documents.some((d) => d.doc_type === "W-9" && d.status !== "rejected"),
    s.documents.some((d) => d.doc_type === "MC Authority" && d.status !== "rejected"),
    s.documents.some((d) => d.doc_type === "Certificate of Insurance" && d.status !== "rejected"),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

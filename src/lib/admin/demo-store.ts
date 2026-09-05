// Admin console demo store. Persists to localStorage so the verification
// queue, escrow controls, disputes, and audit log survive refresh. Mirrors
// the production tables (pilot_profiles, pilot_documents,
// dispatcher_profiles, dispatcher_documents, escrow_transactions, +
// future disputes table) so we can swap to live queries without
// changing the UI.

const KEY = "bwm:demo:admin:v2";

export type VerificationStatus = "pending" | "approved" | "rejected";
export type EscrowStatus =
  | "initiated"
  | "charged"
  | "held"
  | "released"
  | "paid_out"
  | "refunded"
  | "failed";
export type DisputeStatus = "open" | "investigating" | "resolved" | "refunded";
export type UserStatus = "active" | "pending" | "suspended" | "flagged" | "removed";
export type FlagReason =
  | "Suspicious activity"
  | "Fake documents"
  | "Payment issue"
  | "Customer complaint"
  | "Policy violation"
  | "Other";

export interface AdminUserNote {
  id: string;
  at: string;
  by: string;
  body: string;
}

export interface AdminUserActivity {
  id: string;
  at: string;
  kind: "trip" | "login" | "account" | "admin";
  label: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "Pilot" | "Dispatcher" | "Admin";
  status: UserStatus;
  joined_at: string;
  rating: number | null;
  trips: number;
  // Extended profile (optional — safe placeholder data in seed)
  phone?: string | null;
  last_active?: string | null;
  photo_url?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;
  address?: string | null;
  emergency_contact?: string | null;
  company_name?: string | null;
  business_email?: string | null;
  business_phone?: string | null;
  business_address?: string | null;
  trade_license_number?: string | null;
  trade_license_expiry?: string | null;
  tax_number?: string | null;
  email_verified?: boolean;
  phone_verified?: boolean;
  kyc_verified?: "approved" | "pending" | "rejected" | "not_started";
  business_verified?: "approved" | "pending" | "rejected" | "not_started";
  license_verified?: "approved" | "pending" | "rejected" | "not_started";
  flag_reason?: FlagReason | null;
  flag_note?: string | null;
  notes?: AdminUserNote[];
  activity?: AdminUserActivity[];
}

export interface VerificationItem {
  id: string;
  applicant_id: string;
  applicant_name: string;
  applicant_role: "Pilot" | "Dispatcher";
  doc_type: string;
  document_number: string | null;
  issuing_authority: string | null;
  submitted_at: string;
  status: VerificationStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface AdminEscrowTxn {
  id: string;
  job_id: string;
  job_title: string;
  dispatcher_name: string;
  pilot_name: string;
  amount: number;
  platform_fee: number;
  stripe_fee: number;
  net_to_pilot: number;
  status: EscrowStatus;
  notes: string | null;
  created_at: string;
}

export interface DisputeMessage {
  by: string;
  role: "admin" | "pilot" | "dispatcher";
  body: string;
  at: string;
}

export interface AdminDispute {
  id: string;
  trip_id: string;
  reason: string;
  detail: string;
  parties: string;
  pilot_id: string;
  dispatcher_id: string;
  amount: number;
  status: DisputeStatus;
  opened_at: string;
  resolved_at: string | null;
  resolution: string | null;
  messages: DisputeMessage[];
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
}

export interface AdminState {
  users: AdminUser[];
  verifications: VerificationItem[];
  escrow: AdminEscrowTxn[];
  disputes: AdminDispute[];
  audit: AuditEntry[];
  settings: {
    platform_fee_pct: number;
    payout_window_days: number;
    kyc_provider: string;
    support_email: string;
    auto_approve_below: number;
  };
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const now = () => new Date().toISOString();
const daysAgo = (d: number) => {
  const x = new Date();
  x.setDate(x.getDate() - d);
  return x.toISOString();
};

const PLATFORM_FEE_PCT = 0.12;
const STRIPE_FEE_PCT = 0.029;
const STRIPE_FEE_FIXED = 0.3;
function fee(amount: number) {
  const platform_fee = +(amount * PLATFORM_FEE_PCT).toFixed(2);
  const stripe_fee = +(amount * STRIPE_FEE_PCT + STRIPE_FEE_FIXED).toFixed(2);
  const net_to_pilot = +(amount - platform_fee - stripe_fee).toFixed(2);
  return { platform_fee, stripe_fee, net_to_pilot };
}

export function seedAdminState(): AdminState {
  const baseUsers: AdminUser[] = [
    { id: "U-001", name: "Mark Anton", email: "mark@bwm.test", role: "Pilot", status: "active", joined_at: daysAgo(120), rating: 4.8, trips: 142,
      phone: "+1 (415) 555-0142", last_active: daysAgo(0.05),
      date_of_birth: "1988-03-12", nationality: "United States",
      address: "2204 Lombard St, San Francisco, CA",
      emergency_contact: "Lena Anton · +1 (415) 555-0177",
      company_name: "Anton Pilot Cars LLC", business_email: "ops@antonpilots.com",
      business_phone: "+1 (415) 555-0143", business_address: "2204 Lombard St, San Francisco, CA",
      trade_license_number: "TL-CA-882140", trade_license_expiry: "2027-03-01", tax_number: "EIN 87-4421900",
      email_verified: true, phone_verified: true, kyc_verified: "approved", business_verified: "approved", license_verified: "approved" },
    { id: "U-002", name: "Sara Lee", email: "sara@bwm.test", role: "Dispatcher", status: "active", joined_at: daysAgo(95), rating: 4.9, trips: 88,
      phone: "+1 (312) 555-0188", last_active: daysAgo(0.2),
      date_of_birth: "1991-07-22", nationality: "United States",
      address: "880 N Lake Shore Dr, Chicago, IL",
      emergency_contact: "Daniel Lee · +1 (312) 555-0190",
      company_name: "Northwind Dispatch Co.", business_email: "dispatch@northwind.co",
      business_phone: "+1 (312) 555-0189", business_address: "880 N Lake Shore Dr, Chicago, IL",
      trade_license_number: "MC-991100", trade_license_expiry: "2026-09-15", tax_number: "EIN 12-9087665",
      email_verified: true, phone_verified: true, kyc_verified: "approved", business_verified: "approved", license_verified: "approved" },
    { id: "U-003", name: "John Carter", email: "john@bwm.test", role: "Pilot", status: "pending", joined_at: daysAgo(2), rating: null, trips: 0,
      phone: "+1 (713) 555-0223", last_active: daysAgo(0.5),
      date_of_birth: "1995-11-04", nationality: "United States",
      address: "1410 Heights Blvd, Houston, TX",
      emergency_contact: "Mira Carter · +1 (713) 555-0224",
      company_name: "Carter Escort Services", business_email: "john@carterescort.com",
      business_phone: "+1 (713) 555-0225", business_address: "1410 Heights Blvd, Houston, TX",
      trade_license_number: "DL-882140", trade_license_expiry: "2028-02-10", tax_number: null,
      email_verified: true, phone_verified: false, kyc_verified: "pending", business_verified: "pending", license_verified: "pending" },
    { id: "U-004", name: "Diana Lopez", email: "diana@bwm.test", role: "Pilot", status: "active", joined_at: daysAgo(64), rating: 4.7, trips: 56,
      phone: "+1 (602) 555-0301", last_active: daysAgo(1),
      date_of_birth: "1990-05-19", nationality: "United States",
      address: "55 W Camelback Rd, Phoenix, AZ",
      emergency_contact: "Carlos Lopez · +1 (602) 555-0302",
      company_name: "Lopez Lead Vehicles", business_email: "diana@lopezlead.com",
      business_phone: "+1 (602) 555-0303", business_address: "55 W Camelback Rd, Phoenix, AZ",
      trade_license_number: "TL-AZ-441288", trade_license_expiry: "2026-12-04", tax_number: "EIN 33-7711200",
      email_verified: true, phone_verified: true, kyc_verified: "approved", business_verified: "approved", license_verified: "approved" },
    { id: "U-005", name: "Ben Ortiz", email: "ben@bwm.test", role: "Dispatcher", status: "suspended", joined_at: daysAgo(210), rating: 3.2, trips: 21,
      phone: "+1 (305) 555-0410", last_active: daysAgo(7),
      date_of_birth: "1985-01-30", nationality: "United States",
      address: "320 Brickell Ave, Miami, FL",
      emergency_contact: "Sofia Ortiz · +1 (305) 555-0411",
      company_name: "Ortiz Freight Co.", business_email: "ben@ortizfreight.com",
      business_phone: "+1 (305) 555-0412", business_address: "320 Brickell Ave, Miami, FL",
      trade_license_number: "MC-660921", trade_license_expiry: "2025-04-01", tax_number: "EIN 55-2210094",
      email_verified: true, phone_verified: true, kyc_verified: "rejected", business_verified: "rejected", license_verified: "rejected" },
    { id: "U-006", name: "Rose Patel", email: "rose@bwm.test", role: "Pilot", status: "pending", joined_at: daysAgo(1), rating: null, trips: 0,
      phone: "+1 (206) 555-0512", last_active: daysAgo(0.3),
      date_of_birth: "1993-09-08", nationality: "United States",
      address: "200 Pine St, Seattle, WA",
      emergency_contact: "Anil Patel · +1 (206) 555-0513",
      company_name: "Patel Pilot Cars", business_email: "rose@patelpilot.com",
      business_phone: "+1 (206) 555-0514", business_address: "200 Pine St, Seattle, WA",
      trade_license_number: "P-CERT-3019", trade_license_expiry: "2027-08-22", tax_number: null,
      email_verified: false, phone_verified: false, kyc_verified: "pending", business_verified: "not_started", license_verified: "pending" },
  ];
  const users: AdminUser[] = baseUsers.map((u) => ({
    ...u,
    notes: [],
    activity: [
      { id: uid(), at: u.last_active ?? daysAgo(0.5), kind: "login" as const, label: "Signed in from web" },
      ...(u.trips > 0 ? [{ id: uid(), at: daysAgo(2), kind: "trip" as const, label: `Completed trip — ${u.role === "Pilot" ? "Lead vehicle" : "Booked load"}` }] : []),
      { id: uid(), at: u.joined_at, kind: "account" as const, label: "Account created" },
    ],
  }));

  const verifications: VerificationItem[] = [
    { id: uid(), applicant_id: "U-003", applicant_name: "John Carter", applicant_role: "Pilot", doc_type: "Driver's License", document_number: "DL-882140", issuing_authority: "TX DMV", submitted_at: daysAgo(2), status: "pending", rejection_reason: null, reviewed_by: null, reviewed_at: null },
    { id: uid(), applicant_id: "U-003", applicant_name: "John Carter", applicant_role: "Pilot", doc_type: "Insurance Certificate", document_number: "COI-44-991", issuing_authority: "Progressive", submitted_at: daysAgo(2), status: "pending", rejection_reason: null, reviewed_by: null, reviewed_at: null },
    { id: uid(), applicant_id: "U-006", applicant_name: "Rose Patel", applicant_role: "Pilot", doc_type: "Pilot Car Certification", document_number: "P-CERT-3019", issuing_authority: "TX DOT", submitted_at: daysAgo(1), status: "pending", rejection_reason: null, reviewed_by: null, reviewed_at: null },
    { id: uid(), applicant_id: "U-007", applicant_name: "Northstar Logistics", applicant_role: "Dispatcher", doc_type: "MC Authority", document_number: "MC-991221", issuing_authority: "FMCSA", submitted_at: daysAgo(3), status: "pending", rejection_reason: null, reviewed_by: null, reviewed_at: null },
    { id: uid(), applicant_id: "U-007", applicant_name: "Northstar Logistics", applicant_role: "Dispatcher", doc_type: "W-9", document_number: "W9-2026", issuing_authority: "IRS", submitted_at: daysAgo(3), status: "pending", rejection_reason: null, reviewed_by: null, reviewed_at: null },
    { id: uid(), applicant_id: "U-001", applicant_name: "Mark Anton", applicant_role: "Pilot", doc_type: "Insurance Renewal", document_number: "COI-44-882", issuing_authority: "Travelers", submitted_at: daysAgo(10), status: "approved", rejection_reason: null, reviewed_by: "Admin", reviewed_at: daysAgo(8) },
  ];

  const escrow: AdminEscrowTxn[] = [
    { id: "E-1001", job_id: "LD-001", job_title: "Industrial Generator", dispatcher_name: "Sara Lee", pilot_name: "Mark Anton", amount: 3000, ...fee(3000), status: "held", notes: "Awaiting delivery confirmation.", created_at: daysAgo(3) },
    { id: "E-1002", job_id: "LD-002", job_title: "Wind Turbine Blade", dispatcher_name: "Ben Ortiz", pilot_name: "John Carter", amount: 5400, ...fee(5400), status: "charged", notes: "Funds captured, hold pending.", created_at: daysAgo(2) },
    { id: "E-1003", job_id: "LD-004", job_title: "Modular Home Section", dispatcher_name: "Sara Lee", pilot_name: "Diana Lopez", amount: 2200, ...fee(2200), status: "paid_out", notes: "ACH payout completed.", created_at: daysAgo(9) },
    { id: "E-1004", job_id: "LD-005", job_title: "Steel Coils", dispatcher_name: "Sara Lee", pilot_name: "Mark Anton", amount: 4200, ...fee(4200), status: "released", notes: "Released, awaiting next payout window.", created_at: daysAgo(5) },
    { id: "E-1005", job_id: "LD-006", job_title: "Wide Trailer Escort", dispatcher_name: "Ben Ortiz", pilot_name: "Diana Lopez", amount: 1800, ...fee(1800), status: "refunded", notes: "Refunded — pilot withdrew.", created_at: daysAgo(6) },
  ];

  const disputes: AdminDispute[] = [
    {
      id: "D-12", trip_id: "EV-2017003", reason: "Late arrival",
      detail: "Pilot arrived 4h after scheduled pickup window. Dispatcher requests partial refund.",
      parties: "Sara Lee vs Mark Anton",
      pilot_id: "U-001", dispatcher_id: "U-002", amount: 3000,
      status: "open", opened_at: daysAgo(1), resolved_at: null, resolution: null,
      messages: [
        { by: "Sara Lee", role: "dispatcher", body: "Pilot was 4h late. Customer penalty applied.", at: daysAgo(1) },
        { by: "Mark Anton", role: "pilot", body: "Highway 35 closure caused the delay. I notified dispatch.", at: daysAgo(1) },
      ],
    },
    {
      id: "D-11", trip_id: "EV-2016998", reason: "Damaged equipment claim",
      detail: "Lead vehicle scratched permitted load during transport.",
      parties: "Ben Ortiz vs John Carter",
      pilot_id: "U-003", dispatcher_id: "U-005", amount: 5400,
      status: "investigating", opened_at: daysAgo(2), resolved_at: null, resolution: null,
      messages: [
        { by: "Ben Ortiz", role: "dispatcher", body: "Photos attached. Estimated repair $1,800.", at: daysAgo(2) },
        { by: "Admin", role: "admin", body: "Requesting insurance claim docs from both parties.", at: daysAgo(1) },
      ],
    },
    {
      id: "D-10", trip_id: "EV-2016993", reason: "Wrong route taken",
      detail: "Pilot deviated from approved permit route.",
      parties: "Sara Lee vs Diana Lopez",
      pilot_id: "U-004", dispatcher_id: "U-002", amount: 2200,
      status: "resolved", opened_at: daysAgo(8), resolved_at: daysAgo(5),
      resolution: "Confirmed permit route deviation. 10% credit issued to dispatcher; pilot received written warning.",
      messages: [
        { by: "Admin", role: "admin", body: "Resolved with 10% credit and warning.", at: daysAgo(5) },
      ],
    },
  ];

  const audit: AuditEntry[] = [
    { id: uid(), at: daysAgo(0.02), actor: "Admin", action: "Approved verification", target: "Mark Anton — Insurance Renewal" },
    { id: uid(), at: daysAgo(0.1), actor: "Admin", action: "Released escrow", target: "E-1004 / Steel Coils ($4,200)" },
    { id: uid(), at: daysAgo(0.5), actor: "Admin", action: "Opened dispute case", target: "D-11 / Damaged equipment claim" },
    { id: uid(), at: daysAgo(1), actor: "Admin", action: "Suspended user", target: "Ben Ortiz" },
  ];

  return {
    users,
    verifications,
    escrow,
    disputes,
    audit,
    settings: {
      platform_fee_pct: 12,
      payout_window_days: 2,
      kyc_provider: "Stripe Identity",
      support_email: "support@bwm.app",
      auto_approve_below: 500,
    },
  };
}

export function loadAdminState(): AdminState {
  if (typeof window === "undefined") return seedAdminState();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const seeded = seedAdminState();
      window.localStorage.setItem(KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw) as AdminState;
  } catch {
    return seedAdminState();
  }
}

export function saveAdminState(s: AdminState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function resetAdminState(): AdminState {
  const seeded = seedAdminState();
  saveAdminState(seeded);
  return seeded;
}

function logAudit(s: AdminState, action: string, target: string): AuditEntry {
  const entry: AuditEntry = { id: uid(), at: now(), actor: "Admin", action, target };
  s.audit = [entry, ...s.audit].slice(0, 100);
  return entry;
}

// Verification queue actions ------------------------------------------------
export function approveVerification(s: AdminState, id: string): AdminState {
  const v = s.verifications.find((x) => x.id === id);
  if (!v) return s;
  v.status = "approved";
  v.reviewed_by = "Admin";
  v.reviewed_at = now();
  v.rejection_reason = null;
  // Promote applicant to active if all their verifications are approved
  const applicantPending = s.verifications.some(
    (x) => x.applicant_id === v.applicant_id && x.status === "pending",
  );
  if (!applicantPending) {
    const u = s.users.find((u) => u.id === v.applicant_id);
    if (u && u.status === "pending") u.status = "active";
  }
  logAudit(s, "Approved verification", `${v.applicant_name} — ${v.doc_type}`);
  return { ...s };
}

export function rejectVerification(s: AdminState, id: string, reason: string): AdminState {
  const v = s.verifications.find((x) => x.id === id);
  if (!v) return s;
  v.status = "rejected";
  v.reviewed_by = "Admin";
  v.reviewed_at = now();
  v.rejection_reason = reason || "Documentation insufficient.";
  logAudit(s, "Rejected verification", `${v.applicant_name} — ${v.doc_type}`);
  return { ...s };
}

// User actions --------------------------------------------------------------
function pushActivity(u: AdminUser, kind: AdminUserActivity["kind"], label: string) {
  const entry: AdminUserActivity = { id: uid(), at: now(), kind, label };
  u.activity = [entry, ...(u.activity ?? [])].slice(0, 50);
}

export function setUserStatus(s: AdminState, id: string, status: UserStatus, note?: string): AdminState {
  const u = s.users.find((x) => x.id === id);
  if (!u) return s;
  const prev = u.status;
  u.status = status;
  const label =
    status === "suspended" ? "Suspended user" :
    status === "active" ? "Reactivated user" :
    status === "removed" ? "Removed user" :
    status === "flagged" ? "Flagged user" :
    "Marked pending";
  pushActivity(u, "admin", `${label}${note ? ` — ${note}` : ""}`);
  logAudit(s, label, `${u.name}${note ? ` — ${note}` : ""}${prev !== status ? ` (was ${prev})` : ""}`);
  return { ...s };
}

export function flagUser(s: AdminState, id: string, reason: FlagReason, note?: string): AdminState {
  const u = s.users.find((x) => x.id === id);
  if (!u) return s;
  u.status = "flagged";
  u.flag_reason = reason;
  u.flag_note = note ?? null;
  pushActivity(u, "admin", `Flagged — ${reason}${note ? `: ${note}` : ""}`);
  logAudit(s, "Flagged user", `${u.name} — ${reason}${note ? `: ${note}` : ""}`);
  return { ...s };
}

export function unflagUser(s: AdminState, id: string): AdminState {
  const u = s.users.find((x) => x.id === id);
  if (!u) return s;
  u.flag_reason = null;
  u.flag_note = null;
  if (u.status === "flagged") u.status = "active";
  pushActivity(u, "admin", "Flag cleared");
  logAudit(s, "Unflagged user", u.name);
  return { ...s };
}

export function removeUser(s: AdminState, id: string, note?: string): AdminState {
  return setUserStatus(s, id, "removed", note);
}

export function addAdminNote(s: AdminState, id: string, body: string): AdminState {
  const u = s.users.find((x) => x.id === id);
  if (!u || !body.trim()) return s;
  const note: AdminUserNote = { id: uid(), at: now(), by: "Admin", body: body.trim() };
  u.notes = [note, ...(u.notes ?? [])];
  pushActivity(u, "admin", `Note added: ${note.body.slice(0, 80)}`);
  logAudit(s, "Added admin note", `${u.name} — ${note.body.slice(0, 80)}`);
  return { ...s };
}

export type UserVerificationField = "kyc_verified" | "business_verified" | "license_verified";
const VERIF_LABEL: Record<UserVerificationField, string> = {
  kyc_verified: "Identity (KYC)",
  business_verified: "Business",
  license_verified: "Trade license",
};

export function setUserVerification(
  s: AdminState,
  id: string,
  field: UserVerificationField,
  status: "approved" | "rejected" | "pending",
  note?: string,
): AdminState {
  const u = s.users.find((x) => x.id === id);
  if (!u) return s;
  u[field] = status;
  const label = status === "approved" ? "Approved verification" : status === "rejected" ? "Rejected verification" : "Reset verification";
  pushActivity(u, "admin", `${label} — ${VERIF_LABEL[field]}${note ? `: ${note}` : ""}`);
  logAudit(s, label, `${u.name} — ${VERIF_LABEL[field]}${note ? `: ${note}` : ""}`);
  return { ...s };
}


// Escrow actions ------------------------------------------------------------
const escrowTransitions: Record<EscrowStatus, EscrowStatus[]> = {
  initiated: ["charged", "failed"],
  charged: ["held", "refunded"],
  held: ["released", "refunded"],
  released: ["paid_out"],
  paid_out: [],
  refunded: [],
  failed: [],
};

export function canTransition(from: EscrowStatus, to: EscrowStatus) {
  return escrowTransitions[from].includes(to);
}

export function transitionEscrow(s: AdminState, id: string, to: EscrowStatus, note?: string): AdminState {
  const e = s.escrow.find((x) => x.id === id);
  if (!e) return s;
  if (!canTransition(e.status, to)) return s;
  e.status = to;
  if (note) e.notes = note;
  logAudit(s, `Escrow → ${to}`, `${e.id} / ${e.job_title} ($${e.amount})`);
  return { ...s };
}

// Dispute actions -----------------------------------------------------------
export function addDisputeMessage(s: AdminState, id: string, body: string): AdminState {
  const d = s.disputes.find((x) => x.id === id);
  if (!d || !body.trim()) return s;
  d.messages = [...d.messages, { by: "Admin", role: "admin", body: body.trim(), at: now() }];
  if (d.status === "open") d.status = "investigating";
  logAudit(s, "Replied on dispute", `${d.id} / ${d.reason}`);
  return { ...s };
}

export function resolveDispute(
  s: AdminState,
  id: string,
  outcome: "release" | "refund" | "split",
  resolution: string,
): AdminState {
  const d = s.disputes.find((x) => x.id === id);
  if (!d) return s;
  d.status = outcome === "refund" ? "refunded" : "resolved";
  d.resolved_at = now();
  d.resolution = resolution || `Resolved (${outcome}).`;
  d.messages = [...d.messages, { by: "Admin", role: "admin", body: d.resolution, at: now() }];
  // Apply to escrow if matching
  const e = s.escrow.find((x) => x.job_id === d.trip_id || x.id === d.trip_id);
  if (e) {
    if (outcome === "refund" && canTransition(e.status, "refunded")) e.status = "refunded";
    if (outcome === "release" && canTransition(e.status, "released")) e.status = "released";
  }
  logAudit(s, `Resolved dispute (${outcome})`, `${d.id} / ${d.reason}`);
  return { ...s };
}

// KPIs ---------------------------------------------------------------------
export function adminKpis(s: AdminState) {
  const released = s.escrow.filter((e) => e.status === "released" || e.status === "paid_out");
  const inEscrow = s.escrow.filter((e) => e.status === "held" || e.status === "charged");
  const disputed = s.escrow.filter((e) => s.disputes.some((d) => d.trip_id === e.job_id && d.status !== "resolved"));
  const sum = (arr: AdminEscrowTxn[]) => arr.reduce((acc, e) => acc + e.amount, 0);
  return {
    totalUsers: s.users.length,
    pendingVerifications: s.verifications.filter((v) => v.status === "pending").length,
    openDisputes: s.disputes.filter((d) => d.status === "open" || d.status === "investigating").length,
    revenueThisMonth: +released.reduce((acc, e) => acc + e.platform_fee, 0).toFixed(2),
    releasedTotal: sum(released),
    inEscrowTotal: sum(inEscrow),
    disputedTotal: sum(disputed),
  };
}

// Demo-mode dispatcher data store. Persists to localStorage so refresh
// keeps seeded company profile, business docs, posted jobs, bids and the
// escrow ledger around. Mirrors Supabase tables (dispatcher_profiles,
// dispatcher_documents, jobs, escrow_transactions, bids).

const KEY = "bwm:demo:dispatcher:v1";

export type BusinessVerificationStatus =
  | "not_started"
  | "in_review"
  | "verified"
  | "rejected";
export type DocStatus = "pending" | "approved" | "rejected" | "expired";
export type JobStatus =
  | "draft"
  | "published"
  | "bidding"
  | "awarded"
  | "in_transit"
  | "completed"
  | "cancelled"
  | "disputed";
export type EscrowStatus =
  | "initiated"
  | "charged"
  | "held"
  | "released"
  | "paid_out"
  | "refunded"
  | "failed";
export type BidStatus =
  | "submitted"
  | "shortlisted"
  | "accepted"
  | "rejected"
  | "withdrawn";

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
  rating: number;
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

export interface DispatcherJob {
  id: string;
  title: string;
  description: string;
  cargo_type: string;
  dimensions: string;
  weight: string;
  pickup_location: string;
  dropoff_location: string;
  pickup_date: string | null;
  dropoff_date: string | null;
  distance_mi: number | null;
  budget: number;
  requirements: { lead?: boolean; chase?: boolean; height_pole?: boolean; police?: boolean; insurance_min?: number };
  permits: string[];
  status: JobStatus;
  awarded_pilot_id: string | null;
  awarded_bid_id: string | null;
  escrow_status: EscrowStatus | null;
  created_at: string;
}

export interface JobBid {
  id: string;
  job_id: string;
  pilot_id: string;
  pilot_name: string;
  pilot_rating: number;
  pilot_trips: number;
  amount: number;
  message: string | null;
  status: BidStatus;
  eta_pickup: string | null;
  eta_complete: string | null;
  created_at: string;
}

export interface EscrowTxn {
  id: string;
  job_id: string;
  pilot_id: string | null;
  amount: number;
  platform_fee: number;
  stripe_fee: number;
  net_to_pilot: number;
  status: EscrowStatus;
  notes: string | null;
  created_at: string;
}

export interface DispatcherState {
  profile: DispatcherProfile;
  documents: DispatcherDocument[];
  jobs: DispatcherJob[];
  bids: JobBid[];
  escrow: EscrowTxn[];
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const todayPlus = (d: number) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return x.toISOString();
};

const dateOnly = (d: number) => todayPlus(d).slice(0, 10);

const PLATFORM_FEE_PCT = 0.12;
const STRIPE_FEE_PCT = 0.029;
const STRIPE_FEE_FIXED = 0.3;

export function feeBreakdown(amount: number) {
  const platform_fee = +(amount * PLATFORM_FEE_PCT).toFixed(2);
  const stripe_fee = +(amount * STRIPE_FEE_PCT + STRIPE_FEE_FIXED).toFixed(2);
  const net_to_pilot = +(amount - platform_fee - stripe_fee).toFixed(2);
  return { platform_fee, stripe_fee, net_to_pilot };
}

export function seedDispatcherState(): DispatcherState {
  const j1: DispatcherJob = {
    id: "LD-001", title: "Industrial Generator", description: "Heavy equipment escort, lead + chase required.",
    cargo_type: "Heavy Equipment", dimensions: "45 ft × 12 ft × 14 ft", weight: "105,000 lbs",
    pickup_location: "Dallas, TX", dropoff_location: "Houston, TX",
    pickup_date: todayPlus(1), dropoff_date: todayPlus(3),
    distance_mi: 240, budget: 3000,
    requirements: { lead: true, chase: true, height_pole: true, insurance_min: 1000000 },
    permits: ["TX Oversize", "TX Overweight"],
    status: "in_transit", awarded_pilot_id: "demo-pilot", awarded_bid_id: "B-001",
    escrow_status: "held", created_at: todayPlus(-3),
  };
  const j2: DispatcherJob = {
    id: "LD-002", title: "Wind Turbine Blade", description: "Long-load route survey done. Police escort recommended.",
    cargo_type: "Wind Energy", dimensions: "180 ft × 10 ft × 12 ft", weight: "70,000 lbs",
    pickup_location: "Amarillo, TX", dropoff_location: "Oklahoma City, OK",
    pickup_date: todayPlus(2), dropoff_date: todayPlus(5),
    distance_mi: 260, budget: 5400,
    requirements: { lead: true, chase: true, height_pole: true, police: true, insurance_min: 2000000 },
    permits: ["TX Oversize", "OK Oversize", "Police Escort"],
    status: "bidding", awarded_pilot_id: null, awarded_bid_id: null, escrow_status: null,
    created_at: todayPlus(-1),
  };
  const j3: DispatcherJob = {
    id: "LD-003", title: "Steel Coils", description: "Standard lead + chase.",
    cargo_type: "Industrial", dimensions: "53 ft × 8.5 ft × 13.5 ft", weight: "48,000 lbs",
    pickup_location: "Houston, TX", dropoff_location: "Phoenix, AZ",
    pickup_date: todayPlus(4), dropoff_date: todayPlus(7),
    distance_mi: 1180, budget: 4200,
    requirements: { lead: true, chase: true, insurance_min: 1000000 },
    permits: ["TX Oversize", "NM Oversize", "AZ Oversize"],
    status: "published", awarded_pilot_id: null, awarded_bid_id: null, escrow_status: null,
    created_at: todayPlus(-1),
  };
  const j4: DispatcherJob = {
    id: "LD-004", title: "Modular Home Section", description: "Completed.",
    cargo_type: "Construction", dimensions: "60 ft × 16 ft × 13 ft", weight: "48,000 lbs",
    pickup_location: "Tulsa, OK", dropoff_location: "Wichita, KS",
    pickup_date: todayPlus(-7), dropoff_date: todayPlus(-5),
    distance_mi: 180, budget: 2200,
    requirements: { lead: true, chase: true },
    permits: ["OK Oversize", "KS Oversize"],
    status: "completed", awarded_pilot_id: "demo-pilot", awarded_bid_id: "B-002",
    escrow_status: "paid_out", created_at: todayPlus(-10),
  };

  const b1: JobBid = {
    id: "B-001", job_id: "LD-001", pilot_id: "demo-pilot", pilot_name: "Mark Anton",
    pilot_rating: 4.8, pilot_trips: 142, amount: 3000, message: "Available with full lead/chase.",
    status: "accepted", eta_pickup: todayPlus(1), eta_complete: todayPlus(3), created_at: todayPlus(-3),
  };
  const mkBid = (id: string, name: string, rating: number, trips: number, amount: number, msg: string | null = null, status: BidStatus = "submitted"): JobBid => ({
    id, job_id: "LD-002", pilot_id: id, pilot_name: name, pilot_rating: rating, pilot_trips: trips,
    amount, message: msg, status, eta_pickup: todayPlus(2), eta_complete: todayPlus(5), created_at: todayPlus(-1),
  });

  return {
    profile: {
      user_id: "demo-dispatcher",
      company_name: "Anton Heavy Logistics",
      legal_name: "Anton Heavy Logistics LLC",
      ein: "47-1932811",
      mc_number: "MC-882140",
      dot_number: "DOT-3221008",
      contact_name: "Mark Anton",
      contact_phone: "+1 (214) 555-0149",
      billing_address: "421 Magnolia Ave",
      city: "Dallas", state: "TX", postal_code: "75201", country: "US",
      website: "https://antonheavy.example",
      verification_status: "verified",
      completion_pct: 100,
      rating: 4.9,
    },
    documents: [
      { id: uid(), doc_type: "W-9", document_number: "W9-2025", issuing_authority: "IRS", expiry_date: null, file_url: "demo://w9.pdf", status: "approved", rejection_reason: null, created_at: todayPlus(-30) },
      { id: uid(), doc_type: "MC Authority", document_number: "MC-882140", issuing_authority: "FMCSA", expiry_date: dateOnly(540), file_url: "demo://mc.pdf", status: "approved", rejection_reason: null, created_at: todayPlus(-30) },
      { id: uid(), doc_type: "Certificate of Insurance", document_number: "COI-44-882", issuing_authority: "Travelers", expiry_date: dateOnly(120), file_url: "demo://coi.pdf", status: "approved", rejection_reason: null, created_at: todayPlus(-30) },
      { id: uid(), doc_type: "EIN Letter", document_number: "47-1932811", issuing_authority: "IRS", expiry_date: null, file_url: "demo://ein.pdf", status: "approved", rejection_reason: null, created_at: todayPlus(-30) },
    ],
    jobs: [j1, j2, j3, j4],
    bids: [
      b1,
      mkBid("P-201", "Diego Romero", 4.9, 220, 5200, "Two trucks ready, full strobes.", "shortlisted"),
      mkBid("P-202", "Sasha Lin", 4.7, 87, 4900, "Available, lead only — can subcontract chase.", "submitted"),
      mkBid("P-203", "Tom Becker", 4.6, 311, 5550, "Premium service with police coordination.", "submitted"),
      mkBid("P-204", "Rose Patel", 4.95, 64, 5100, null, "submitted"),
      { id: "B-002", job_id: "LD-004", pilot_id: "demo-pilot", pilot_name: "Mark Anton", pilot_rating: 4.8, pilot_trips: 142, amount: 2200, message: null, status: "accepted", eta_pickup: todayPlus(-7), eta_complete: todayPlus(-5), created_at: todayPlus(-10) },
    ],
    escrow: [
      { id: uid(), job_id: "LD-001", pilot_id: "demo-pilot", amount: 3000, ...feeBreakdown(3000), status: "held", notes: "Awaiting delivery confirmation.", created_at: todayPlus(-3) },
      { id: uid(), job_id: "LD-004", pilot_id: "demo-pilot", amount: 2200, ...feeBreakdown(2200), status: "paid_out", notes: "ACH payout completed.", created_at: todayPlus(-9) },
    ],
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
    !!p.company_name, !!p.legal_name, !!p.ein, !!p.mc_number, !!p.dot_number,
    !!p.contact_name && !!p.contact_phone,
    !!p.billing_address && !!p.city && !!p.state,
    s.documents.some((d) => d.doc_type === "W-9" && d.status !== "rejected"),
    s.documents.some((d) => d.doc_type === "MC Authority" && d.status !== "rejected"),
    s.documents.some((d) => d.doc_type === "Certificate of Insurance" && d.status !== "rejected"),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// Demo-mode pilot data store. Persists to localStorage so a refresh keeps
// the seeded profile, documents, bids and earnings around.
//
// Shape of each entity mirrors the Supabase tables (pilot_profiles,
// pilot_documents, pilot_vehicles, pilot_certifications, bids,
// pilot_earnings) so we can swap to real queries later without changing
// the UI.

const KEY = "bwm:demo:pilot:v1";

export type VerificationStatus =
  | "not_started"
  | "in_review"
  | "verified"
  | "rejected";
export type DocStatus = "pending" | "approved" | "rejected" | "expired";
export type BidStatus =
  | "submitted"
  | "shortlisted"
  | "accepted"
  | "rejected"
  | "withdrawn";
export type EarningStatus = "pending" | "released" | "paid" | "disputed";

export interface PilotProfile {
  user_id: string;
  full_name: string;
  date_of_birth: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  emergency_contact: string | null;
  years_experience: number | null;
  service_areas: string[];
  verification_status: VerificationStatus;
  completion_pct: number;
  rating: number;
}

export interface PilotDocument {
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

export interface PilotVehicle {
  id: string;
  vehicle_type: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  vin: string | null;
  insurance_expiry: string | null;
  equipment: Record<string, boolean>;
}

export interface PilotCertification {
  id: string;
  cert_type: string;
  cert_number: string | null;
  expiry_date: string | null;
  status: DocStatus;
}

export interface PilotBid {
  id: string;
  job_id: string;
  job_title: string;
  route: string;
  amount: number;
  message: string | null;
  status: BidStatus;
  eta_pickup: string | null;
  eta_complete: string | null;
  created_at: string;
}

export interface PilotEarning {
  id: string;
  job_id: string;
  description: string;
  gross: number;
  commission: number;
  net: number;
  status: EarningStatus;
  paid_at: string | null;
  created_at: string;
}

export interface PilotState {
  profile: PilotProfile;
  documents: PilotDocument[];
  vehicle: PilotVehicle | null;
  certifications: PilotCertification[];
  bids: PilotBid[];
  earnings: PilotEarning[];
}

const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

const todayPlus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const isoNow = () => new Date().toISOString();

export function seedPilotState(): PilotState {
  return {
    profile: {
      user_id: "demo-pilot",
      full_name: "Mark Anton",
      date_of_birth: "1989-05-12",
      address: "421 Magnolia Ave",
      city: "Dallas",
      state: "TX",
      postal_code: "75201",
      country: "US",
      emergency_contact: "Sarah Anton · +1 (214) 555-0182",
      years_experience: 7,
      service_areas: ["TX", "OK", "NM", "LA"],
      verification_status: "in_review",
      completion_pct: 82,
      rating: 4.8,
    },
    documents: [
      {
        id: uid(),
        doc_type: "Driver's License",
        document_number: "TX-DL-7741209",
        issuing_authority: "Texas DPS",
        expiry_date: todayPlus(420),
        file_url: "demo://license.jpg",
        status: "approved",
        rejection_reason: null,
        created_at: isoNow(),
      },
      {
        id: uid(),
        doc_type: "Commercial Insurance",
        document_number: "POL-99812",
        issuing_authority: "Progressive Commercial",
        expiry_date: todayPlus(45),
        file_url: "demo://insurance.pdf",
        status: "approved",
        rejection_reason: null,
        created_at: isoNow(),
      },
      {
        id: uid(),
        doc_type: "Medical Certificate",
        document_number: "MC-44021",
        issuing_authority: "DOT Approved Clinic",
        expiry_date: todayPlus(14),
        file_url: "demo://medcert.pdf",
        status: "pending",
        rejection_reason: null,
        created_at: isoNow(),
      },
    ],
    vehicle: {
      id: uid(),
      vehicle_type: "Pilot Car (Lead/Chase)",
      make: "Ford",
      model: "F-150",
      year: 2022,
      license_plate: "TX 7K9-LM2",
      vin: "1FTFW1E55NFA12345",
      insurance_expiry: todayPlus(45),
      equipment: {
        "Height pole": true,
        "Magnetic rooftop sign": true,
        "Amber strobes": true,
        "CB radio": true,
        "Flags & cones": true,
      },
    },
    certifications: [
      {
        id: uid(),
        cert_type: "TX Pilot/Escort Certification",
        cert_number: "TXPEC-22118",
        expiry_date: todayPlus(180),
        status: "approved",
      },
      {
        id: uid(),
        cert_type: "OSHA Flagger Training",
        cert_number: "OSHA-FL-7720",
        expiry_date: todayPlus(700),
        status: "approved",
      },
    ],
    bids: [
      {
        id: uid(),
        job_id: "OF-1002",
        job_title: "Wind Turbine Blade · Amarillo → OKC",
        route: "Amarillo, TX → Oklahoma City, OK",
        amount: 5200,
        message: "Available with full lead/chase team. Strobes ready.",
        status: "shortlisted",
        eta_pickup: todayPlus(2),
        eta_complete: todayPlus(5),
        created_at: isoNow(),
      },
      {
        id: uid(),
        job_id: "OF-1003",
        job_title: "Modular Home Section · Tulsa → Wichita",
        route: "Tulsa, OK → Wichita, KS",
        amount: 2150,
        message: null,
        status: "submitted",
        eta_pickup: todayPlus(3),
        eta_complete: todayPlus(5),
        created_at: isoNow(),
      },
      {
        id: uid(),
        job_id: "OF-0998",
        job_title: "Transformer · Houston → San Antonio",
        route: "Houston, TX → San Antonio, TX",
        amount: 1800,
        message: null,
        status: "rejected",
        eta_pickup: null,
        eta_complete: null,
        created_at: isoNow(),
      },
    ],
    earnings: [
      {
        id: uid(),
        job_id: "OF-0951",
        description: "Generator escort · Dallas → Houston",
        gross: 3000,
        commission: 360,
        net: 2640,
        status: "paid",
        paid_at: isoNow(),
        created_at: isoNow(),
      },
      {
        id: uid(),
        job_id: "OF-0962",
        description: "Modular home · Tulsa → Wichita",
        gross: 2200,
        commission: 264,
        net: 1936,
        status: "paid",
        paid_at: isoNow(),
        created_at: isoNow(),
      },
      {
        id: uid(),
        job_id: "OF-0978",
        description: "Steel coils · OKC → Phoenix",
        gross: 1820,
        commission: 218.4,
        net: 1601.6,
        status: "released",
        paid_at: null,
        created_at: isoNow(),
      },
      {
        id: uid(),
        job_id: "OF-1001",
        description: "Industrial generator · Dallas → Houston",
        gross: 3000,
        commission: 360,
        net: 2640,
        status: "pending",
        paid_at: null,
        created_at: isoNow(),
      },
    ],
  };
}

export function loadPilotState(): PilotState {
  if (typeof window === "undefined") return seedPilotState();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const seeded = seedPilotState();
      window.localStorage.setItem(KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw) as PilotState;
  } catch {
    return seedPilotState();
  }
}

export function savePilotState(s: PilotState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function resetPilotState(): PilotState {
  const fresh = seedPilotState();
  savePilotState(fresh);
  return fresh;
}

export function recomputeCompletion(s: PilotState): number {
  const checks = [
    !!s.profile.full_name,
    !!s.profile.date_of_birth,
    !!s.profile.address && !!s.profile.city && !!s.profile.state,
    !!s.profile.emergency_contact,
    s.documents.some((d) => d.doc_type === "Driver's License" && d.status === "approved"),
    s.documents.some((d) => d.doc_type === "Commercial Insurance" && d.status !== "rejected"),
    !!s.vehicle,
    s.certifications.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

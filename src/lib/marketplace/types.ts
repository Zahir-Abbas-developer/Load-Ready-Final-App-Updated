/**
 * Loads, and the escort work they need.
 *
 * Field names follow the plan's `loads`, `load_slots`, `load_contacts` and
 * `load_routes` tables so moving to Postgres is a copy rather than a redesign.
 */
import type { EquipmentId, ServiceId } from "@/lib/profile/catalog";

export type LoadStatus =
  "draft" | "open" | "partially_filled" | "filled" | "in_progress" | "completed" | "cancelled";

/** ADR-12: a fixed price the pilot accepts, or a range they bid inside. */
export type PricingMode = "fixed" | "bidding";

/** Flat fee for the job, or a rate per mile. */
export type RateBasis = "flat" | "per_mile";

export interface LoadPlace {
  /** Free text as the dispatcher typed it. */
  address: string;
  city: string;
  /** Region code from the catalogue. What matching actually uses. */
  region: string;
  postalCode: string | null;
  /**
   * Set only when a geocoder has been run. Null today: no maps key is
   * configured, and inventing coordinates would put a marker in the wrong
   * place with total confidence (BACKLOG F-47).
   */
  lng: number | null;
  lat: number | null;
}

/**
 * One escort position on a load.
 *
 * A load needing a lead car and a high pole is two slots, filled by two
 * different pilots and possibly at different prices.
 */
export interface EscortSlot {
  id: string;
  service: ServiceId;
  /** Equipment the pilot must carry for this position. */
  requiredEquipment: EquipmentId[];
  /** For a high-pole slot, the height it must clear. */
  poleHeightFt: number | null;
  pricingMode: PricingMode;
  rateBasis: RateBasis;
  /** Cents. The offer for a fixed slot; the floor for a bidding one. */
  amountCents: number;
  /** Cents. The ceiling for a bidding slot; null for fixed. */
  maxAmountCents: number | null;
  /** Set once a pilot is assigned. Phase H2 fills this in. */
  assignedPilotId: string | null;
}

/**
 * A person on the ground.
 *
 * Held from the moment the load is posted and shown to nobody until an
 * assignment exists (ADR-8, rule 9) — the whole point of collecting them early
 * is that they are ready the moment a pilot is hired, not that they are public.
 */
export interface LoadContact {
  id: string;
  name: string;
  role: string;
  phone: string;
}

/** The route the permit approves — not one we work out, the one on the paperwork. */
export interface LoadRoute {
  waypoints: string[];
  speedLimitMph: number | null;
  notes: string | null;
}

export interface Load {
  id: string;
  /** Human reference, LR-xxxxx. What people say on the phone. */
  reference: string;
  dispatcherId: string;
  status: LoadStatus;

  title: string;
  description: string | null;

  origin: LoadPlace;
  destination: LoadPlace;

  /** UTC. The local zone is the dispatcher's, stored on their profile. */
  pickupFrom: string;
  pickupTo: string;
  deliverBy: string | null;

  /** Canonical units: inches, pounds, miles. Displayed per the viewer (D7). */
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  weightLb: number | null;
  distanceMi: number | null;

  permitNumbers: string[];
  permitFileIds: string[];

  slots: EscortSlot[];
  contacts: LoadContact[];
  route: LoadRoute | null;
  constraints: string[];
  notes: string | null;

  /** Public, or only the pilots named in `invitedPilotIds`. */
  visibility: "public" | "invited";
  invitedPilotIds: string[];

  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

/**
 * What a pilot is shown about a load before they are on it.
 *
 * Built by naming what goes in, like the pilot's own public profile. Contacts,
 * permit files and the exact route are not here: they are revealed when an
 * assignment exists (ADR-8).
 */
export interface PublicLoad {
  id: string;
  reference: string;
  status: LoadStatus;
  title: string;
  description: string | null;
  origin: Omit<LoadPlace, "address" | "postalCode">;
  destination: Omit<LoadPlace, "address" | "postalCode">;
  pickupFrom: string;
  pickupTo: string;
  deliverBy: string | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  weightLb: number | null;
  distanceMi: number | null;
  slots: EscortSlot[];
  constraints: string[];
  notes: string | null;
  /** How many permits exist, not what they say. */
  permitCount: number;
  company: {
    name: string;
    city: string | null;
    region: string | null;
    usdotNumber: string | null;
  };
  createdAt: string;
  publishedAt: string | null;
}

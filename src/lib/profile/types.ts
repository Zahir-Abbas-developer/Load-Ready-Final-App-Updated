/**
 * Profile shapes, shared between the browser and the server.
 *
 * Field names mirror the plan's `pilot_profiles`, `pilot_documents`,
 * `pilot_certifications`, `pilot_vehicles` and `dispatcher_companies` tables so
 * that moving to Postgres is a copy rather than a redesign.
 *
 * Read `PublicPilotProfile` before adding anything here. ADR-8 says contact
 * details stay masked until an assignment exists between two parties, and the
 * only way that survives contact with new fields is if the public shape is a
 * separate type that has to be extended deliberately.
 */
import type { DocumentTypeId, EquipmentId, ServiceId } from "./catalog";

export type VerificationStatus = "not_started" | "in_review" | "approved" | "rejected";
export type DocumentStatus = "pending" | "approved" | "rejected" | "expired";

export interface PilotDocument {
  id: string;
  docType: DocumentTypeId;
  /** Licence or policy number. Held, never shown to another user. */
  documentNumber: string | null;
  issuingRegion: string | null;
  expiryDate: string | null;
  /** Id in the private file store, or null while the record has no file yet. */
  fileId: string | null;
  fileName: string | null;
  status: DocumentStatus;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface PilotCertification {
  id: string;
  /** Region code from the catalogue — certifications are per state/province. */
  region: string;
  certNumber: string | null;
  expiryDate: string | null;
  fileId: string | null;
  createdAt: string;
}

export interface PilotVehicle {
  id: string;
  vehicleType: string;
  make: string;
  model: string;
  year: number | null;
  licensePlate: string;
  equipment: EquipmentId[];
  photoFileIds: string[];
}

export interface PilotProfile {
  userId: string;
  legalName: string;
  businessName: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: "US" | "CA" | null;
  /** How far the pilot will travel from base, in miles. */
  serviceRadiusMi: number | null;
  workingRegions: string[];
  services: ServiceId[];
  yearsExperience: number | null;
  bio: string | null;
  ratePerMile: number | null;
  rateMinimum: number | null;
  available: boolean;
  verificationStatus: VerificationStatus;
  verificationNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  updatedAt: string;
}

export interface PilotRecord {
  profile: PilotProfile;
  documents: PilotDocument[];
  certifications: PilotCertification[];
  vehicles: PilotVehicle[];
}

/**
 * What another user may see about a pilot before an assignment exists.
 *
 * No phone, no email, no street address, no date of birth, no licence or policy
 * number, no plate, and no documents. A dispatcher choosing between pilots
 * needs to know they are verified, insured, where they work and what they can
 * do — not how to contact them directly, which is what turns a marketplace into
 * a directory people transact around (ADR-8).
 */
export interface PublicPilotProfile {
  userId: string;
  displayName: string;
  businessName: string | null;
  city: string | null;
  region: string | null;
  workingRegions: string[];
  services: ServiceId[];
  yearsExperience: number | null;
  bio: string | null;
  available: boolean;
  verified: boolean;
  badges: string[];
  equipment: EquipmentId[];
}

export interface DispatcherCompany {
  userId: string;
  companyName: string;
  usdotNumber: string | null;
  mcNumber: string | null;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: "US" | "CA" | null;
  phone: string | null;
  billingContact: string | null;
  logoFileId: string | null;
  preferredLanes: string[];
  updatedAt: string;
}

/** What a pilot sees about the company that posted a load. */
export interface PublicCompany {
  userId: string;
  companyName: string;
  city: string | null;
  region: string | null;
  usdotNumber: string | null;
  logoFileId: string | null;
}

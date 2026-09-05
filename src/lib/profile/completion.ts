/**
 * Profile completeness, badges, expiry, and the masked public view.
 *
 * Pure functions, deliberately: what a pilot must supply before review, what a
 * dispatcher is allowed to see about them, and when a document stops counting
 * are three rules that must not drift between a screen, an API and a report.
 */
import { documentLabel, type EquipmentId } from "./catalog";
import type { DocumentStatus, PilotDocument, PilotRecord, PublicPilotProfile } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reminders go out at these marks before a document lapses. */
export const EXPIRY_REMINDER_DAYS = [30, 7, 1];

/**
 * A document's status right now.
 *
 * Expiry is computed rather than stored, so a certificate that lapsed
 * overnight is already invalid the next time anyone asks — no scheduled job in
 * the path between a lapsed insurance policy and a pilot being sent to a job.
 */
export function documentStatusNow(doc: PilotDocument, now: number = Date.now()): DocumentStatus {
  if (doc.status === "rejected") return "rejected";
  if (doc.expiryDate) {
    const end = Date.parse(doc.expiryDate);
    if (Number.isFinite(end) && end < now) return "expired";
  }
  return doc.status;
}

export function daysUntilExpiry(doc: PilotDocument, now: number = Date.now()): number | null {
  if (!doc.expiryDate) return null;
  const end = Date.parse(doc.expiryDate);
  if (!Number.isFinite(end)) return null;
  return Math.ceil((end - now) / DAY_MS);
}

function hasValid(record: PilotRecord, docType: string, now: number): boolean {
  return record.documents.some(
    (d) => d.docType === docType && documentStatusNow(d, now) === "approved",
  );
}

function hasAny(record: PilotRecord, docType: string, now: number): boolean {
  return record.documents.some(
    (d) => d.docType === docType && documentStatusNow(d, now) !== "rejected",
  );
}

/**
 * What is still missing before the profile can be submitted for review.
 *
 * Returned as sentences rather than field names because it is shown to the
 * pilot. "profile.legalName is required" tells a driver nothing.
 */
export function missingForReview(record: PilotRecord, now: number = Date.now()): string[] {
  const p = record.profile;
  const missing: string[] = [];

  if (!p.legalName.trim()) missing.push("Your legal name");
  if (!p.phone?.trim()) missing.push("A contact phone number");
  if (!p.dateOfBirth) missing.push("Your date of birth");
  if (!p.city?.trim() || !p.region) missing.push("Where you are based");
  if (p.workingRegions.length === 0) missing.push("At least one state or province you work in");
  if (p.services.length === 0) missing.push("The escort services you offer");
  if (record.vehicles.length === 0) missing.push("At least one vehicle");
  if (!hasAny(record, "drivers-license", now)) missing.push("A photo of your driving licence");
  if (!hasAny(record, "insurance", now)) missing.push("Your certificate of insurance");
  if (record.certifications.length === 0) {
    missing.push("At least one state or province certification");
  }

  return missing;
}

export function canSubmitForReview(record: PilotRecord, now: number = Date.now()): boolean {
  return missingForReview(record, now).length === 0;
}

/** 0–100, so the wizard's progress bar reflects something real. */
export function profileCompletion(record: PilotRecord, now: number = Date.now()): number {
  const p = record.profile;
  const checks = [
    !!p.legalName.trim(),
    !!p.phone?.trim(),
    !!p.dateOfBirth,
    !!p.city?.trim() && !!p.region,
    p.workingRegions.length > 0,
    p.services.length > 0,
    record.vehicles.length > 0,
    hasAny(record, "drivers-license", now),
    hasAny(record, "insurance", now),
    record.certifications.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/**
 * Badges a dispatcher can see. Each one has to be earned by something checkable
 * — an unearned badge on a marketplace is a lie a customer acts on.
 */
export function badgesFor(record: PilotRecord, now: number = Date.now()): string[] {
  const badges: string[] = [];
  if (record.profile.verificationStatus === "approved") badges.push("Verified");
  if (hasValid(record, "insurance", now)) badges.push("Insured");

  const equipment = new Set(record.vehicles.flatMap((v) => v.equipment));
  if (equipment.has("high-pole")) badges.push("High pole");

  const years = record.profile.yearsExperience ?? 0;
  if (years >= 5) badges.push(`${years} years`);

  return badges;
}

/**
 * The masked view (ADR-8).
 *
 * Everything not listed here is withheld: phone, email, street address, date of
 * birth, licence and policy numbers, plates, and every document. Built by
 * naming what goes in rather than deleting what should not, so a field added to
 * the private profile is private by default.
 */
export function publicPilotProfile(
  record: PilotRecord,
  now: number = Date.now(),
): PublicPilotProfile {
  const p = record.profile;
  const equipment = [...new Set(record.vehicles.flatMap((v) => v.equipment))] as EquipmentId[];

  return {
    userId: p.userId,
    // A working name, not the legal one on the licence.
    displayName: p.businessName?.trim() || p.legalName,
    businessName: p.businessName,
    city: p.city,
    region: p.region,
    workingRegions: p.workingRegions,
    services: p.services,
    yearsExperience: p.yearsExperience,
    bio: p.bio,
    available: p.available,
    verified: p.verificationStatus === "approved",
    badges: badgesFor(record, now),
    equipment,
  };
}

/** Documents that need a reminder today, with how many days are left. */
export function documentsNeedingReminder(
  record: PilotRecord,
  now: number = Date.now(),
): Array<{ document: PilotDocument; daysLeft: number; label: string }> {
  return record.documents.flatMap((document) => {
    const daysLeft = daysUntilExpiry(document, now);
    if (daysLeft === null || !EXPIRY_REMINDER_DAYS.includes(daysLeft)) return [];
    if (documentStatusNow(document, now) === "rejected") return [];
    return [{ document, daysLeft, label: documentLabel(document.docType) }];
  });
}

/** The minimum age to escort a load. Not a preference — an insurance floor. */
export const MIN_AGE_YEARS = 18;

/**
 * Age in whole years on a given day, or null when the date is unusable.
 *
 * Done by calendar parts rather than dividing milliseconds: leap years and the
 * fact that a birthday later this month has not happened yet both matter when
 * the answer decides whether someone may legally take a job.
 */
export function ageInYears(dateOfBirth: string | null, now: number = Date.now()): number | null {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;

  const today = new Date(now);
  let age = today.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

export function isOldEnough(dateOfBirth: string | null, now: number = Date.now()): boolean {
  const age = ageInYears(dateOfBirth, now);
  return age !== null && age >= MIN_AGE_YEARS;
}

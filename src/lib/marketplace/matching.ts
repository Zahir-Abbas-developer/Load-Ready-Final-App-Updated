/**
 * Who can take a load, and — when they cannot — why.
 *
 * The "why" is the point. A pilot who opens a job and finds the button greyed
 * out with no explanation assumes the app is broken; one who reads "your Texas
 * certification expired on 3 August" goes and renews it. The reasons here are
 * written to be shown to a driver, not logged.
 *
 * Pure and exhaustive, so every rule can be tested against every state. Nothing
 * in here decides anything on its own: the server checks it again before an
 * offer is accepted, because a value that arrives from a browser is a claim.
 */
import { documentStatusNow } from "@/lib/profile/completion";
import { regionName, type EquipmentId, type ServiceId } from "@/lib/profile/catalog";
import type { PilotRecord } from "@/lib/profile/types";
import type { EscortSlot, Load, PublicLoad } from "./types";

export type IneligibilityCode =
  | "not-approved"
  | "not-entitled"
  | "unavailable"
  | "region-not-worked"
  | "region-not-certified"
  | "certification-expired"
  | "insurance-missing"
  | "insurance-expired"
  | "service-not-offered"
  | "equipment-missing"
  | "not-invited"
  | "slot-taken"
  | "load-not-open";

export interface Ineligibility {
  code: IneligibilityCode;
  /** Shown to the pilot, as a sentence. */
  reason: string;
  /**
   * Whether the pilot can do something about it right now.
   *
   * Drives the difference between "Renew to accept", which is a button, and
   * "this load needs a high pole", which is not.
   */
  fixable: boolean;
}

export interface EligibilityInput {
  record: PilotRecord;
  entitled: boolean;
  now?: number;
}

/** Every region the job passes through that we know about. */
export function regionsTouched(load: Pick<Load, "origin" | "destination">): string[] {
  return [...new Set([load.origin.region, load.destination.region].filter(Boolean))];
}

function hasValidInsurance(record: PilotRecord, now: number): "ok" | "missing" | "expired" {
  const insurance = record.documents.filter((d) => d.docType === "insurance");
  if (insurance.length === 0) return "missing";
  return insurance.some((d) => documentStatusNow(d, now) === "approved") ? "ok" : "expired";
}

/**
 * Certifications the pilot holds for a region, and whether any is still valid.
 *
 * An expired certification is told apart from a missing one on purpose: the
 * first is a renewal, the second is an application, and they are different
 * afternoons.
 */
function certificationFor(
  record: PilotRecord,
  region: string,
  now: number,
): "valid" | "expired" | "none" {
  const held = record.certifications.filter((c) => c.region === region);
  if (held.length === 0) return "none";

  const valid = held.some((c) => {
    if (!c.expiryDate) return true;
    const end = Date.parse(c.expiryDate);
    return Number.isNaN(end) || end >= now;
  });
  return valid ? "valid" : "expired";
}

const equipmentHeld = (record: PilotRecord): Set<EquipmentId> =>
  new Set(record.vehicles.flatMap((v) => v.equipment));

/**
 * Why this pilot cannot take this slot. Empty means they can.
 *
 * Everything is collected rather than returned on the first failure: a pilot
 * who fixes one thing and finds a second waiting has been sent away twice for
 * something we knew about the first time.
 */
export function ineligibilityFor(
  load: Pick<Load, "origin" | "destination" | "status" | "visibility" | "invitedPilotIds">,
  slot: EscortSlot,
  input: EligibilityInput,
): Ineligibility[] {
  const now = input.now ?? Date.now();
  const { record, entitled } = input;
  const reasons: Ineligibility[] = [];

  if (load.status !== "open" && load.status !== "partially_filled") {
    reasons.push({
      code: "load-not-open",
      reason: "This load is no longer taking offers.",
      fixable: false,
    });
  }

  if (slot.assignedPilotId) {
    reasons.push({
      code: "slot-taken",
      reason: "Another pilot took this position first.",
      fixable: false,
    });
  }

  if (load.visibility === "invited" && !load.invitedPilotIds.includes(record.profile.userId)) {
    reasons.push({
      code: "not-invited",
      reason: "This load was offered to specific pilots.",
      fixable: false,
    });
  }

  if (record.profile.verificationStatus !== "approved") {
    reasons.push({
      code: "not-approved",
      reason:
        record.profile.verificationStatus === "in_review"
          ? "Your profile is still being reviewed."
          : "Finish your profile and get verified before taking work.",
      fixable: true,
    });
  }

  if (!entitled) {
    reasons.push({
      code: "not-entitled",
      reason: "Your subscription is not active. Renew to accept work.",
      fixable: true,
    });
  }

  if (!record.profile.available) {
    reasons.push({
      code: "unavailable",
      reason: "You have marked yourself unavailable. Turn availability back on to take work.",
      fixable: true,
    });
  }

  // ── where the job goes ──────────────────────────────────────────────────
  const worked = new Set(record.profile.workingRegions);
  for (const region of regionsTouched(load)) {
    if (!worked.has(region)) {
      reasons.push({
        code: "region-not-worked",
        reason: `You have not listed ${regionName(region)} as a region you work in.`,
        fixable: true,
      });
      // No point also complaining about a certification for a region they have
      // not said they work in — one problem, one sentence.
      continue;
    }

    const certification = certificationFor(record, region, now);
    if (certification === "none") {
      reasons.push({
        code: "region-not-certified",
        reason: `You do not have a ${regionName(region)} certification on file.`,
        fixable: true,
      });
    } else if (certification === "expired") {
      reasons.push({
        code: "certification-expired",
        reason: `Your ${regionName(region)} certification has expired.`,
        fixable: true,
      });
    }
  }

  // ── insurance ───────────────────────────────────────────────────────────
  const insurance = hasValidInsurance(record, now);
  if (insurance === "missing") {
    reasons.push({
      code: "insurance-missing",
      reason: "Upload your certificate of insurance.",
      fixable: true,
    });
  } else if (insurance === "expired") {
    reasons.push({
      code: "insurance-expired",
      reason: "Your insurance certificate has expired or was not approved.",
      fixable: true,
    });
  }

  // ── the position itself ─────────────────────────────────────────────────
  if (!record.profile.services.includes(slot.service)) {
    reasons.push({
      code: "service-not-offered",
      reason: `This position is ${serviceLabel(slot.service)}, which you do not offer.`,
      fixable: true,
    });
  }

  const held = equipmentHeld(record);
  const missing = slot.requiredEquipment.filter((e) => !held.has(e));
  if (missing.length > 0) {
    reasons.push({
      code: "equipment-missing",
      reason: `This position needs ${missing.map(equipmentLabel).join(", ")}, which is not on your vehicle.`,
      fixable: true,
    });
  }

  return reasons;
}

export const isEligibleFor = (
  load: Parameters<typeof ineligibilityFor>[0],
  slot: EscortSlot,
  input: EligibilityInput,
): boolean => ineligibilityFor(load, slot, input).length === 0;

/** Eligible for at least one position on the load. */
export function eligibleSlots(
  load: Parameters<typeof ineligibilityFor>[0] & { slots: EscortSlot[] },
  input: EligibilityInput,
): EscortSlot[] {
  return load.slots.filter((slot) => isEligibleFor(load, slot, input));
}

// ── discovery ──────────────────────────────────────────────────────────────

/**
 * Whether this load should appear on this pilot's board at all.
 *
 * Deliberately looser than eligibility. A pilot whose insurance lapsed
 * yesterday should still *see* the work in their regions — with the reason
 * they cannot take it — because hiding it teaches them nothing and an empty
 * board looks like a broken product. What is hidden is what is genuinely not
 * theirs: another region entirely, or a load offered to named pilots.
 */
export function isDiscoverable(
  load: Pick<Load, "origin" | "destination" | "status" | "visibility" | "invitedPilotIds">,
  record: PilotRecord,
): boolean {
  if (load.status !== "open" && load.status !== "partially_filled") return false;

  if (load.visibility === "invited") {
    return load.invitedPilotIds.includes(record.profile.userId);
  }

  const worked = new Set(record.profile.workingRegions);
  return regionsTouched(load).some((region) => worked.has(region));
}

/**
 * Board order.
 *
 * Loads a pilot can take come first — a board whose top item is unavailable is
 * a board people stop opening. Then soonest pickup, because escort work is
 * scheduled around a permit window and a job next Tuesday is more use than one
 * in three weeks. Ties break on the reference so the order never jitters
 * between refreshes.
 */
export function rankForBoard<T extends { load: PublicLoad; eligible: boolean }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;

    const aTime = Date.parse(a.load.pickupFrom);
    const bTime = Date.parse(b.load.pickupFrom);
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
      return aTime - bTime;
    }
    return a.load.reference.localeCompare(b.load.reference);
  });
}

// ── labels ─────────────────────────────────────────────────────────────────

const SERVICE_LABELS: Record<ServiceId, string> = {
  lead: "lead car",
  chase: "chase car",
  "high-pole": "high pole",
  steer: "steer car",
  "route-survey": "route survey",
};

export const serviceLabel = (id: ServiceId) => SERVICE_LABELS[id] ?? id;

const EQUIPMENT_LABELS: Partial<Record<EquipmentId, string>> = {
  "high-pole": "a high pole",
  "amber-light-bar": "an amber light bar",
  "oversize-signs": "OVERSIZE LOAD signs",
  flags: "flags",
  "cb-radio": "a CB radio",
  "two-way-radios": "two-way radios",
  "stop-slow-paddles": "stop/slow paddles",
  "fire-extinguisher": "a fire extinguisher",
  "safety-vest": "a safety vest",
  "reflective-cones": "reflective cones",
  "warning-flashers": "warning flashers",
  "first-aid-kit": "a first-aid kit",
};

export const equipmentLabel = (id: EquipmentId) => EQUIPMENT_LABELS[id] ?? id;

/**
 * Pilot and dispatcher profiles, on the server.
 *
 * Before this, all of it lived in the pilot's own `localStorage`: their name,
 * their regions, their certifications, the documents they were asked to upload.
 * That meant an administrator reviewing a pilot could not see a single thing
 * they were reviewing, and clearing a browser destroyed the lot. The
 * verification queue was a screen with nothing behind it.
 *
 * Same JSON store as accounts and billing, same limits (BACKLOG F-01), same
 * shape as the plan's tables so Postgres is a copy rather than a redesign.
 *
 * Never import this from client code.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";
import { detachFile } from "./file-store.server";
import type {
  DispatcherCompany,
  PilotCertification,
  PilotDocument,
  PilotProfile,
  PilotRecord,
  PilotVehicle,
  VerificationStatus,
} from "@/lib/profile/types";
import { canSubmitForReview, documentStatusNow } from "@/lib/profile/completion";

const DATA_FILE = dataFile("profiles.json");

interface Db {
  pilots: PilotRecord[];
  companies: DispatcherCompany[];
}

let db: Db | null = null;

const newId = () => randomBytes(12).toString("hex");

function load(): Db {
  if (db) return db;
  if (!existsSync(DATA_FILE)) {
    db = { pilots: [], companies: [] };
    return db;
  }
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<Db>;
    db = {
      pilots: Array.isArray(raw.pilots) ? raw.pilots : [],
      companies: Array.isArray(raw.companies) ? raw.companies : [],
    };
  } catch (err) {
    console.warn("[profiles] could not read the store, starting empty", err);
    db = { pilots: [], companies: [] };
  }
  return db;
}

function save(next: Db) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, DATA_FILE);
  db = next;
}

function emptyProfile(userId: string, legalName: string): PilotProfile {
  return {
    userId,
    legalName,
    businessName: null,
    phone: null,
    dateOfBirth: null,
    addressLine: null,
    city: null,
    region: null,
    postalCode: null,
    country: null,
    serviceRadiusMi: null,
    workingRegions: [],
    services: [],
    yearsExperience: null,
    bio: null,
    ratePerMile: null,
    rateMinimum: null,
    available: false,
    verificationStatus: "not_started",
    verificationNote: null,
    submittedAt: null,
    reviewedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

function emptyRecord(userId: string, legalName: string): PilotRecord {
  return {
    profile: emptyProfile(userId, legalName),
    documents: [],
    certifications: [],
    vehicles: [],
  };
}

function writeRecord(record: PilotRecord) {
  const store = load();
  save({
    ...store,
    pilots: [...store.pilots.filter((p) => p.profile.userId !== record.profile.userId), record],
  });
}

/**
 * The pilot's record, creating a blank one on first read.
 *
 * `legalName` seeds it from the account so a brand-new pilot is not asked to
 * type their name twice. It is only ever used for a record that does not exist.
 */
export function pilotRecord(userId: string, legalName = ""): PilotRecord {
  const found = load().pilots.find((p) => p.profile.userId === userId);
  if (found) return found;
  return emptyRecord(userId, legalName);
}

/** Every pilot record, for the administrator's review queue. */
export function allPilotRecords(): PilotRecord[] {
  return load().pilots;
}

/**
 * Fields a pilot may change about themselves.
 *
 * The list is enforced at runtime by `EDITABLE_PROFILE_KEYS` below, not just by
 * this type. A type is a promise the compiler keeps; the thing on the other end
 * of this function is an HTTP request, and the compiler was never there.
 */
export const EDITABLE_PROFILE_KEYS = [
  "legalName",
  "businessName",
  "phone",
  "dateOfBirth",
  "addressLine",
  "city",
  "region",
  "postalCode",
  "country",
  "serviceRadiusMi",
  "workingRegions",
  "services",
  "yearsExperience",
  "bio",
  "ratePerMile",
  "rateMinimum",
  "available",
] as const;

export type EditableProfileFields = Partial<
  Pick<PilotProfile, (typeof EDITABLE_PROFILE_KEYS)[number]>
>;

/**
 * Copies across only the fields on that list.
 *
 * Spreading the patch instead would mean a caller who forgot to filter — a new
 * route, a future edit to an old one — could pass `verificationStatus:
 * "approved"` straight through and let a pilot approve themselves. Whether that
 * is currently reachable is not the point; it is one careless line away, and
 * this is the line that stops it.
 */
function pickEditable(patch: Record<string, unknown>): EditableProfileFields {
  const clean: Record<string, unknown> = {};
  for (const key of EDITABLE_PROFILE_KEYS) {
    if (key in patch) clean[key] = patch[key];
  }
  return clean as EditableProfileFields;
}

export function updatePilotProfile(
  userId: string,
  legalName: string,
  patch: EditableProfileFields,
): PilotRecord {
  const record = pilotRecord(userId, legalName);
  const next: PilotRecord = {
    ...record,
    profile: { ...record.profile, ...pickEditable(patch), updatedAt: new Date().toISOString() },
  };
  writeRecord(next);
  return next;
}

// ── documents ──────────────────────────────────────────────────────────────

export function addDocument(
  userId: string,
  legalName: string,
  input: {
    docType: PilotDocument["docType"];
    documentNumber?: string | null;
    issuingRegion?: string | null;
    expiryDate?: string | null;
    fileId: string;
    fileName: string;
  },
): { record: PilotRecord; document: PilotDocument } {
  const record = pilotRecord(userId, legalName);
  const document: PilotDocument = {
    id: newId(),
    docType: input.docType,
    documentNumber: input.documentNumber?.slice(0, 60) ?? null,
    issuingRegion: input.issuingRegion ?? null,
    expiryDate: input.expiryDate ?? null,
    fileId: input.fileId,
    fileName: input.fileName,
    status: "pending",
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date().toISOString(),
  };

  const next: PilotRecord = { ...record, documents: [document, ...record.documents] };
  writeRecord(next);
  return { record: next, document };
}

export function removeDocument(userId: string, documentId: string): PilotRecord {
  const record = pilotRecord(userId);
  const doc = record.documents.find((d) => d.id === documentId);

  // The record goes; the bytes are detached, not destroyed. A pilot deleting a
  // rejected licence must not erase why it was rejected.
  if (doc?.fileId) detachFile(doc.fileId);

  const next: PilotRecord = {
    ...record,
    documents: record.documents.filter((d) => d.id !== documentId),
  };
  writeRecord(next);
  return next;
}

// ── certifications and vehicles ────────────────────────────────────────────

export function addCertification(
  userId: string,
  legalName: string,
  input: {
    region: string;
    certNumber?: string | null;
    expiryDate?: string | null;
    fileId?: string | null;
  },
): PilotRecord {
  const record = pilotRecord(userId, legalName);
  const certification: PilotCertification = {
    id: newId(),
    region: input.region,
    certNumber: input.certNumber?.slice(0, 60) ?? null,
    expiryDate: input.expiryDate ?? null,
    fileId: input.fileId ?? null,
    createdAt: new Date().toISOString(),
  };
  const next: PilotRecord = {
    ...record,
    certifications: [certification, ...record.certifications],
  };
  writeRecord(next);
  return next;
}

export function removeCertification(userId: string, certificationId: string): PilotRecord {
  const record = pilotRecord(userId);
  const cert = record.certifications.find((c) => c.id === certificationId);
  if (cert?.fileId) detachFile(cert.fileId);

  const next: PilotRecord = {
    ...record,
    certifications: record.certifications.filter((c) => c.id !== certificationId),
  };
  writeRecord(next);
  return next;
}

export function saveVehicle(
  userId: string,
  legalName: string,
  input: Omit<PilotVehicle, "id"> & { id?: string },
): PilotRecord {
  const record = pilotRecord(userId, legalName);
  const vehicle: PilotVehicle = { ...input, id: input.id ?? newId() };
  const vehicles = input.id
    ? record.vehicles.map((v) => (v.id === input.id ? vehicle : v))
    : [...record.vehicles, vehicle];

  const next: PilotRecord = { ...record, vehicles };
  writeRecord(next);
  return next;
}

export function removeVehicle(userId: string, vehicleId: string): PilotRecord {
  const record = pilotRecord(userId);
  const next: PilotRecord = {
    ...record,
    vehicles: record.vehicles.filter((v) => v.id !== vehicleId),
  };
  writeRecord(next);
  return next;
}

// ── review ─────────────────────────────────────────────────────────────────

export function submitForReview(userId: string): { record: PilotRecord; error?: string } {
  const record = pilotRecord(userId);
  if (!canSubmitForReview(record)) {
    return { record, error: "Some required details are still missing." };
  }
  if (record.profile.verificationStatus === "approved") {
    return { record };
  }

  const next: PilotRecord = {
    ...record,
    profile: {
      ...record.profile,
      verificationStatus: "in_review",
      verificationNote: null,
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
  writeRecord(next);
  return { record: next };
}

/**
 * An administrator's decision on a whole profile, or on one document.
 *
 * A rejection always carries a reason. "Rejected" with no explanation sends a
 * driver back to a form with no idea what to change, and they either give up or
 * resubmit the same thing.
 */
export function decideProfile(args: {
  userId: string;
  status: Extract<VerificationStatus, "approved" | "rejected">;
  note: string;
  actorId: string;
}): { record: PilotRecord; error?: string } {
  const record = pilotRecord(args.userId);
  if (args.status === "rejected" && args.note.trim().length < 3) {
    return { record, error: "Give a reason for the rejection." };
  }

  const next: PilotRecord = {
    ...record,
    profile: {
      ...record.profile,
      verificationStatus: args.status,
      verificationNote: args.note.trim().slice(0, 500) || null,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
  writeRecord(next);
  return { record: next };
}

export function decideDocument(args: {
  userId: string;
  documentId: string;
  approve: boolean;
  reason: string;
  actorId: string;
}): { record: PilotRecord; error?: string } {
  const record = pilotRecord(args.userId);
  const doc = record.documents.find((d) => d.id === args.documentId);
  if (!doc) return { record, error: "No such document." };
  if (!args.approve && args.reason.trim().length < 3) {
    return { record, error: "Give a reason for the rejection." };
  }

  const next: PilotRecord = {
    ...record,
    documents: record.documents.map((d) =>
      d.id === args.documentId
        ? {
            ...d,
            status: args.approve ? "approved" : "rejected",
            rejectionReason: args.approve ? null : args.reason.trim().slice(0, 500),
            reviewedBy: args.actorId,
            reviewedAt: new Date().toISOString(),
          }
        : d,
    ),
  };
  writeRecord(next);
  return { record: next };
}

/** Does this pilot own this file? Used before any download is signed. */
export function ownsFile(userId: string, fileId: string): boolean {
  const record = pilotRecord(userId);
  if (record.documents.some((d) => d.fileId === fileId)) return true;
  if (record.certifications.some((c) => c.fileId === fileId)) return true;
  if (record.vehicles.some((v) => v.photoFileIds.includes(fileId))) return true;
  return load().companies.some((c) => c.userId === userId && c.logoFileId === fileId);
}

/** Documents whose expiry has already passed, with live status applied. */
export function withLiveStatus(record: PilotRecord, now = Date.now()): PilotRecord {
  return {
    ...record,
    documents: record.documents.map((d) => ({ ...d, status: documentStatusNow(d, now) })),
  };
}

// ── dispatcher companies ───────────────────────────────────────────────────

export function companyFor(userId: string, fallbackName = ""): DispatcherCompany {
  const found = load().companies.find((c) => c.userId === userId);
  if (found) return found;
  return {
    userId,
    companyName: fallbackName,
    usdotNumber: null,
    mcNumber: null,
    addressLine: null,
    city: null,
    region: null,
    postalCode: null,
    country: null,
    phone: null,
    billingContact: null,
    logoFileId: null,
    preferredLanes: [],
    updatedAt: new Date().toISOString(),
  };
}

export type EditableCompanyFields = Partial<Omit<DispatcherCompany, "userId" | "updatedAt">>;

export function updateCompany(
  userId: string,
  fallbackName: string,
  patch: EditableCompanyFields,
): DispatcherCompany {
  const current = companyFor(userId, fallbackName);
  const next: DispatcherCompany = { ...current, ...patch, updatedAt: new Date().toISOString() };
  const store = load();
  save({ ...store, companies: [...store.companies.filter((c) => c.userId !== userId), next] });
  return next;
}

/** Test seam. */
export function resetProfileStore() {
  db = { pilots: [], companies: [] };
}

/** Everything held about this account, for the data export. */
export function profileDataFor(userId: string): {
  pilot: PilotRecord | null;
  company: DispatcherCompany | null;
} {
  const store = load();
  return {
    pilot: store.pilots.find((p) => p.profile.userId === userId) ?? null,
    company: store.companies.find((c) => c.userId === userId) ?? null,
  };
}

/** Every file id this account has attached anywhere, so the bytes can go too. */
export function fileIdsFor(userId: string): string[] {
  const { pilot, company } = profileDataFor(userId);
  const ids = [
    ...(pilot?.documents.map((d) => d.fileId) ?? []),
    ...(pilot?.certifications.map((c) => c.fileId) ?? []),
    ...(pilot?.vehicles.flatMap((v) => v.photoFileIds) ?? []),
    company?.logoFileId ?? null,
  ];
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/** Removes the profile and the company outright. */
export function deleteProfileData(userId: string): { pilot: boolean; company: boolean } {
  const store = load();
  const pilot = store.pilots.some((p) => p.profile.userId === userId);
  const company = store.companies.some((c) => c.userId === userId);

  save({
    pilots: store.pilots.filter((p) => p.profile.userId !== userId),
    companies: store.companies.filter((c) => c.userId !== userId),
  });
  return { pilot, company };
}

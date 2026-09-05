/**
 * Client for the profile and file endpoints.
 *
 * Thin on purpose: no caching, no optimistic updates. Every write returns the
 * whole record the server now holds, and the caller renders that. When the
 * subject is "am I verified" and "did my licence upload", showing what the
 * server actually has beats showing what the browser hoped happened.
 */
import type { DispatcherCompany, PilotRecord } from "./types";

export interface ProfileResponse {
  record: PilotRecord;
  completion: number;
  missing: string[];
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "That did not save.");
  return data;
}

export async function loadProfile(): Promise<ProfileResponse> {
  const res = await fetch("/api/profile", { credentials: "include" });
  const data = (await res.json().catch(() => ({}))) as ProfileResponse & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Could not load your profile.");
  return data;
}

export const updateProfile = (patch: Record<string, unknown>) =>
  post<ProfileResponse>({ action: "update-profile", ...patch });

export const addDocument = (input: Record<string, unknown>) =>
  post<ProfileResponse>({ action: "add-document", ...input });

export const removeDocument = (documentId: string) =>
  post<ProfileResponse>({ action: "remove-document", documentId });

export const addCertification = (input: Record<string, unknown>) =>
  post<ProfileResponse>({ action: "add-certification", ...input });

export const removeCertification = (certificationId: string) =>
  post<ProfileResponse>({ action: "remove-certification", certificationId });

export const saveVehicle = (input: Record<string, unknown>) =>
  post<ProfileResponse>({ action: "save-vehicle", ...input });

export const removeVehicle = (vehicleId: string) =>
  post<ProfileResponse>({ action: "remove-vehicle", vehicleId });

export const submitForReview = () => post<ProfileResponse>({ action: "submit-for-review" });

export const updateCompany = (patch: Record<string, unknown>) =>
  post<{ company: DispatcherCompany }>({ action: "update-company", ...patch });

// ── admin ──────────────────────────────────────────────────────────────────

export interface QueueEntry {
  record: PilotRecord;
  completion: number;
}

export const reviewQueue = () => post<{ records: QueueEntry[] }>({ action: "review-queue" });

export const reviewDocument = (input: {
  userId: string;
  documentId: string;
  approve: boolean;
  reason?: string;
}) => post<{ record: PilotRecord }>({ action: "review-document", ...input });

export const reviewProfile = (input: { userId: string; approve: boolean; note?: string }) =>
  post<{ record: PilotRecord }>({ action: "review-profile", ...input });

// ── files ──────────────────────────────────────────────────────────────────

export interface UploadedFile {
  fileId: string;
  fileName: string;
  mime: string;
  bytes: number;
}

/**
 * Sends the file as the raw request body.
 *
 * Not base64 in JSON: that inflates a 10 MB photo to 13 MB and doubles the
 * memory needed on a phone that is already the slowest part of this.
 */
export async function uploadFile(file: File): Promise<UploadedFile> {
  const res = await fetch("/api/files", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-file-name": file.name.replace(/[^\w.\- ]+/g, "").slice(0, 120) || "document",
    },
    body: file,
  });
  const data = (await res.json().catch(() => ({}))) as UploadedFile & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "That upload failed.");
  return data;
}

/** A short-lived URL for a stored file. Expires in five minutes — fetch it when you need it. */
export async function signedFileUrl(fileId: string): Promise<string | null> {
  const res = await fetch("/api/files", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ fileId }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { url?: string };
  return data.url ?? null;
}

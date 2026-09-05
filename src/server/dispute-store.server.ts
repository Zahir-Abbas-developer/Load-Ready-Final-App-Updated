/**
 * Reports, and the disputes they become.
 *
 * The important thing here is not the queue — it is that opening a dispute is
 * what gives an administrator permission to read two people's conversation,
 * and **every one of those reads is written down**. Until J3 nobody could read
 * a job's messages at all (F-99, and that was the right default); this is the
 * door, and it has a log bolted to it.
 *
 * Never import this from client code.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";
import type { ReportReason } from "@/lib/settings/reports";

const DATA_FILE = dataFile("disputes.json");

export { REPORT_REASONS, type ReportReason } from "@/lib/settings/reports";

export interface Report {
  id: string;
  /** The job it happened on. Everything is scoped to an assignment. */
  assignmentId: string;
  /** The message being reported, when there is one. */
  messageId: string | null;
  reportedBy: string;
  /** Who it is about — the other party on the job. */
  about: string;
  reason: ReportReason;
  detail: string | null;
  createdAt: string;
  /** Set once an administrator has folded it into a dispute. */
  disputeId: string | null;
}

export type DisputeStatus = "open" | "resolved";

export interface Dispute {
  id: string;
  assignmentId: string;
  openedBy: string;
  /** Why it was opened, in the administrator's words. */
  summary: string;
  status: DisputeStatus;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

/**
 * One occasion on which an administrator read something private.
 *
 * Separate from the audit log on purpose: the audit log answers "what did an
 * administrator do", and this answers the narrower question somebody will
 * actually ask — "who has read my messages, and when".
 */
export interface EvidenceRead {
  id: string;
  disputeId: string;
  assignmentId: string;
  adminId: string;
  adminEmail: string;
  /** What they looked at. */
  kind: "messages" | "proof" | "trail";
  at: string;
}

interface Db {
  reports: Report[];
  disputes: Dispute[];
  reads: EvidenceRead[];
}

let db: Db | null = null;
const newId = () => randomBytes(12).toString("hex");

function load(): Db {
  if (db) return db;
  if (!existsSync(DATA_FILE)) {
    db = { reports: [], disputes: [], reads: [] };
    return db;
  }
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<Db>;
    db = {
      reports: Array.isArray(raw.reports) ? raw.reports : [],
      disputes: Array.isArray(raw.disputes) ? raw.disputes : [],
      reads: Array.isArray(raw.reads) ? raw.reads : [],
    };
  } catch (err) {
    console.error("[disputes] could not read the store, starting empty", err);
    db = { reports: [], disputes: [], reads: [] };
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

// ── reports ────────────────────────────────────────────────────────────────

export function recordReport(input: {
  assignmentId: string;
  messageId: string | null;
  reportedBy: string;
  about: string;
  reason: ReportReason;
  detail: string | null;
  now?: number;
}): Report {
  const store = load();
  const report: Report = {
    id: newId(),
    assignmentId: input.assignmentId,
    messageId: input.messageId,
    reportedBy: input.reportedBy,
    about: input.about,
    reason: input.reason,
    detail: (input.detail ?? "").trim().slice(0, 1000) || null,
    createdAt: new Date(input.now ?? Date.now()).toISOString(),
    disputeId: null,
  };
  save({ ...store, reports: [...store.reports, report] });
  return report;
}

export const openReports = (): Report[] =>
  load()
    .reports.filter((r) => !r.disputeId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

export const reportsBy = (userId: string): Report[] =>
  load().reports.filter((r) => r.reportedBy === userId);

export function deleteReportsBy(userId: string): number {
  const store = load();
  const reports = store.reports.filter((r) => r.reportedBy !== userId);
  const removed = store.reports.length - reports.length;
  save({ ...store, reports });
  return removed;
}

// ── disputes ───────────────────────────────────────────────────────────────

export function openDispute(input: {
  assignmentId: string;
  openedBy: string;
  summary: string;
  /** Folded in, so the queue empties as work is done. */
  reportIds?: string[];
  now?: number;
}): { dispute?: Dispute; error?: string } {
  const summary = input.summary.trim();
  if (summary.length < 3) {
    return { error: "Say what the dispute is about — it is the reason you may read the evidence." };
  }

  const store = load();
  const existing = store.disputes.find(
    (d) => d.assignmentId === input.assignmentId && d.status === "open",
  );
  if (existing) return { dispute: existing };

  const dispute: Dispute = {
    id: newId(),
    assignmentId: input.assignmentId,
    openedBy: input.openedBy,
    summary: summary.slice(0, 1000),
    status: "open",
    resolution: null,
    resolvedAt: null,
    createdAt: new Date(input.now ?? Date.now()).toISOString(),
  };

  const claimed = new Set(input.reportIds ?? []);
  save({
    ...store,
    disputes: [...store.disputes, dispute],
    reports: store.reports.map((r) =>
      claimed.has(r.id) || (r.assignmentId === input.assignmentId && !r.disputeId)
        ? { ...r, disputeId: dispute.id }
        : r,
    ),
  });
  return { dispute };
}

export const disputeById = (id: string): Dispute | null =>
  load().disputes.find((d) => d.id === id) ?? null;

export const allDisputes = (): Dispute[] =>
  [...load().disputes].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

export function resolveDispute(
  id: string,
  resolution: string,
  now = Date.now(),
): { dispute?: Dispute; error?: string } {
  const text = resolution.trim();
  if (text.length < 3) return { error: "Say what was decided." };

  const store = load();
  const dispute = store.disputes.find((d) => d.id === id);
  if (!dispute) return { error: "No such dispute." };

  const next: Dispute = {
    ...dispute,
    status: "resolved",
    resolution: text.slice(0, 1000),
    resolvedAt: new Date(now).toISOString(),
  };
  save({ ...store, disputes: store.disputes.map((d) => (d.id === id ? next : d)) });
  return { dispute: next };
}

// ── the log of what was read ───────────────────────────────────────────────

export function recordRead(input: {
  disputeId: string;
  assignmentId: string;
  adminId: string;
  adminEmail: string;
  kind: EvidenceRead["kind"];
  now?: number;
}): EvidenceRead {
  const store = load();
  const read: EvidenceRead = {
    id: newId(),
    disputeId: input.disputeId,
    assignmentId: input.assignmentId,
    adminId: input.adminId,
    adminEmail: input.adminEmail,
    kind: input.kind,
    at: new Date(input.now ?? Date.now()).toISOString(),
  };
  save({ ...store, reads: [...store.reads, read] });
  return read;
}

export const readsOn = (disputeId: string): EvidenceRead[] =>
  load()
    .reads.filter((r) => r.disputeId === disputeId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

/**
 * Every time somebody's private data was read on a job they were on.
 *
 * Goes into their data export. "Who has read my messages" is a question people
 * are entitled to an answer to, and one nobody can answer from a queue screen.
 */
export const readsAbout = (assignmentIds: string[]): EvidenceRead[] => {
  const wanted = new Set(assignmentIds);
  return load().reads.filter((r) => wanted.has(r.assignmentId));
};

/** Test seam. */
export function resetDisputeStore() {
  db = { reports: [], disputes: [], reads: [] };
}

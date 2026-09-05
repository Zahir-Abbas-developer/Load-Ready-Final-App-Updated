/**
 * The audit log.
 *
 * "Who granted this pilot free access, and when?" and "who approved this
 * driving licence?" have to have answers a year later, from someone who was not
 * there. Billing already kept its own list; this is the same idea for every
 * sensitive action, in one place.
 *
 * Append only. Nothing here has a delete, deliberately — an audit log a
 * privileged user can edit is a log that proves nothing about a privileged
 * user.
 *
 * Never import this from client code.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";

const DATA_FILE = dataFile("audit.json");

/**
 * Enough to answer a question months later without becoming a second copy of
 * the database. Rotation belongs with the move to Postgres (BACKLOG F-01).
 */
const MAX_ENTRIES = 5000;

export interface AuditEntry {
  at: string;
  actorId: string;
  actorEmail: string;
  /** Dotted, past tense: `document.approved`, `billing.granted`. */
  action: string;
  /** What it was done to — a user id, a document id, an endpoint name. */
  subject: string;
  /** One line of context. Never a password, a token, or a document's contents. */
  detail: string;
}

let entries: AuditEntry[] | null = null;

function load(): AuditEntry[] {
  if (entries) return entries;
  if (!existsSync(DATA_FILE)) {
    entries = [];
    return entries;
  }
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8"));
    entries = Array.isArray(raw) ? raw : [];
  } catch (err) {
    // Losing the log must not take the server down, but it must be noisy —
    // a silently empty audit log is worse than none, because it looks fine.
    console.error("[audit] could not read the log, starting empty", err);
    entries = [];
  }
  return entries;
}

function persist(next: AuditEntry[]) {
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
    renameSync(tmp, DATA_FILE);
    entries = next;
  } catch (err) {
    console.error("[audit] could not write the log", err);
  }
}

/**
 * Records an action. Never throws.
 *
 * A failure to write the log must not fail the operation being logged — an
 * administrator whose approval is refused because the audit file is read-only
 * will simply stop approving things. It is logged loudly to the console
 * instead, where a real log drain would pick it up.
 */
export function recordAudit(entry: Omit<AuditEntry, "at">) {
  const full: AuditEntry = {
    at: new Date().toISOString(),
    actorId: entry.actorId.slice(0, 64),
    actorEmail: entry.actorEmail.slice(0, 160),
    action: entry.action.slice(0, 64),
    subject: entry.subject.slice(0, 128),
    detail: entry.detail.slice(0, 500),
  };
  persist([...load(), full].slice(-MAX_ENTRIES));
}

/** Newest first. `subject` narrows it to one user or object. */
export function readAudit(options: { subject?: string; limit?: number } = {}): AuditEntry[] {
  const all = load();
  const filtered = options.subject ? all.filter((e) => e.subject === options.subject) : all;
  return [...filtered].reverse().slice(0, options.limit ?? 200);
}

/** Test seam. */
export function resetAuditLog() {
  entries = [];
}

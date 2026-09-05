/**
 * Versioned legal documents and who accepted which version.
 *
 * The point of versioning is the question "what exactly did this person agree
 * to, and when?" — which has to be answerable years later, from the record
 * rather than from memory. So a published version is **immutable**: correcting
 * a typo publishes v3, it does not edit v2, because somebody accepted v2 and
 * that acceptance has to keep pointing at the words they saw.
 *
 * Never import this from client code.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";
import {
  LEGAL_DOCUMENTS,
  isFinalisable,
  unresolvedPlaceholders,
  type LegalDocumentKind,
} from "@/lib/legal/documents";
import { DRAFTS } from "./legal-drafts.server";

const DATA_FILE = dataFile("legal.json");

export interface LegalVersion {
  kind: LegalDocumentKind;
  /** Monotonic per kind, starting at 1. */
  version: number;
  body: string;
  effectiveAt: string;
  /**
   * Whether people who accepted an earlier version have to accept again.
   *
   * A typo fix does not; a change to what you may do with someone's data does.
   * The publisher decides, because only a human knows which kind of change it
   * was.
   */
  requiresReacceptance: boolean;
  publishedBy: string;
  publishedAt: string;
  /** Placeholders still in the body when it was published. Empty means finished. */
  unresolved: string[];
}

export interface LegalAcceptance {
  userId: string;
  kind: LegalDocumentKind;
  version: number;
  at: string;
  /**
   * The address the acceptance came from.
   *
   * Kept because "did this person agree" is a question that gets asked in a
   * dispute, and an acceptance with no context is weak evidence. It is personal
   * data and belongs in the privacy policy's inventory, which is why
   * PRIVACY_DISCLOSURES.md lists it.
   */
  ip: string | null;
}

interface Db {
  versions: LegalVersion[];
  acceptances: LegalAcceptance[];
}

let db: Db | null = null;

function load(): Db {
  if (db) return db;

  if (existsSync(DATA_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<Db>;
      db = {
        versions: Array.isArray(raw.versions) ? raw.versions : [],
        acceptances: Array.isArray(raw.acceptances) ? raw.acceptances : [],
      };
    } catch (err) {
      console.error("[legal] could not read the store, starting empty", err);
      db = { versions: [], acceptances: [] };
    }
  } else {
    db = { versions: [], acceptances: [] };
  }

  seedDrafts();
  return db;
}

/**
 * Puts a draft in place for any document that has no version at all.
 *
 * Only ever adds. A kind that has been published is left alone, so the drafts
 * cannot overwrite real text on a restart.
 */
function seedDrafts() {
  if (!db) return;
  const missing = LEGAL_DOCUMENTS.filter((d) => !db!.versions.some((v) => v.kind === d.kind));
  if (missing.length === 0) return;

  const now = new Date().toISOString();
  for (const doc of missing) {
    const body = DRAFTS[doc.kind];
    db.versions.push({
      kind: doc.kind,
      version: 1,
      body,
      effectiveAt: now,
      requiresReacceptance: false,
      publishedBy: "system",
      publishedAt: now,
      unresolved: unresolvedPlaceholders(body),
    });
  }
  save(db);
}

function save(next: Db) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, DATA_FILE);
  db = next;
}

// ── reading ────────────────────────────────────────────────────────────────

/** The version in force for a kind — the newest whose effective date has passed. */
export function currentVersion(kind: LegalDocumentKind, now = Date.now()): LegalVersion | null {
  const live = load()
    .versions.filter((v) => v.kind === kind && Date.parse(v.effectiveAt) <= now)
    .sort((a, b) => b.version - a.version);
  return live[0] ?? null;
}

export function allCurrent(now = Date.now()): LegalVersion[] {
  return LEGAL_DOCUMENTS.map((d) => currentVersion(d.kind, now)).filter(
    (v): v is LegalVersion => v !== null,
  );
}

export function versionHistory(kind: LegalDocumentKind): LegalVersion[] {
  return load()
    .versions.filter((v) => v.kind === kind)
    .sort((a, b) => b.version - a.version);
}

/**
 * Whether the policy set could be launched behind.
 *
 * Not a formatting check: a document with an unfilled party name is not a
 * contract, and a signup that captures acceptance of one has captured an
 * agreement with nobody. This is what the admin console warns on and what the
 * launch checklist reads.
 */
export function launchReadiness(now = Date.now()): {
  ready: boolean;
  blocking: Array<{ kind: LegalDocumentKind; unresolved: string[]; isDraft: boolean }>;
} {
  const blocking = allCurrent(now)
    .map((v) => ({
      kind: v.kind,
      unresolved: unresolvedPlaceholders(v.body),
      isDraft: v.publishedBy === "system",
    }))
    .filter((v) => v.unresolved.length > 0 || v.isDraft);

  return { ready: blocking.length === 0, blocking };
}

// ── publishing ─────────────────────────────────────────────────────────────

export function publishVersion(args: {
  kind: LegalDocumentKind;
  body: string;
  requiresReacceptance: boolean;
  effectiveAt?: string;
  publishedBy: string;
}): { version?: LegalVersion; error?: string } {
  const body = args.body.trim();
  if (body.length < 200) {
    return { error: "That is too short to be a policy. Paste the whole document." };
  }

  const store = load();
  const latest = store.versions
    .filter((v) => v.kind === args.kind)
    .reduce((max, v) => Math.max(max, v.version), 0);

  const version: LegalVersion = {
    kind: args.kind,
    version: latest + 1,
    body,
    effectiveAt: args.effectiveAt ?? new Date().toISOString(),
    requiresReacceptance: args.requiresReacceptance,
    publishedBy: args.publishedBy,
    publishedAt: new Date().toISOString(),
    // Recorded at publish time so the warning survives even if the check
    // changes later — what mattered is what was true when it went out.
    unresolved: unresolvedPlaceholders(body),
  };

  save({ ...store, versions: [...store.versions, version] });
  return { version };
}

// ── acceptance ─────────────────────────────────────────────────────────────

export function recordAcceptance(args: {
  userId: string;
  kind: LegalDocumentKind;
  version: number;
  ip: string | null;
}): LegalAcceptance {
  const store = load();
  const acceptance: LegalAcceptance = {
    userId: args.userId,
    kind: args.kind,
    version: args.version,
    at: new Date().toISOString(),
    ip: args.ip,
  };
  // Append rather than replace: the history of what someone accepted is the
  // record, and overwriting it would lose exactly the thing it is for.
  save({ ...store, acceptances: [...store.acceptances, acceptance] });
  return acceptance;
}

export function acceptancesFor(userId: string): LegalAcceptance[] {
  return load()
    .acceptances.filter((a) => a.userId === userId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/**
 * Whether a version is worth asking anybody to accept.
 *
 * A seeded draft, or a published one that still has a blank where the company
 * name should be, is not an agreement — accepting it is agreeing with nobody.
 * Blocking the app to collect that signature would be worse than useless: it
 * stops people working and puts a meaningless row in the record.
 *
 * So drafts are readable and are marked as drafts, and nothing is gated behind
 * them. The moment real text is published the gate starts working, which is
 * exactly when it should.
 */
function isAgreeable(version: LegalVersion): boolean {
  return version.publishedBy !== "system" && unresolvedPlaceholders(version.body).length === 0;
}

/**
 * What this person still has to accept.
 *
 * A document is outstanding when they have never accepted it, or when the
 * version in force is newer than theirs **and** was published as needing
 * re-acceptance. A typo fix does not drag every user back through a dialog.
 *
 * Drafts are never outstanding — see `isAgreeable`.
 */
export function outstandingFor(
  userId: string,
  role: "pilot" | "dispatcher" | "admin",
  stage: "signup" | "onboarding" | "all" = "all",
  now = Date.now(),
): LegalVersion[] {
  // Administrators are staff, not counterparties. Making them accept an
  // operator agreement would put a meaningless record in the audit trail.
  if (role === "admin") return [];

  const mine = acceptancesFor(userId);

  return LEGAL_DOCUMENTS.filter((d) => d.appliesTo.includes(role))
    .filter((d) => stage === "all" || d.acceptedAt === stage)
    .flatMap((doc) => {
      const live = currentVersion(doc.kind, now);
      if (!live || !isAgreeable(live)) return [];

      const accepted = mine.filter((a) => a.kind === doc.kind).map((a) => a.version);
      if (accepted.length === 0) return [live];

      const highest = Math.max(...accepted);
      if (highest >= live.version) return [];

      // Newer version exists. Only chase them if it was published as a change
      // that matters.
      const needsAgain = versionHistory(doc.kind).some(
        (v) => v.version > highest && v.version <= live.version && v.requiresReacceptance,
      );
      return needsAgain ? [live] : [];
    });
}

export function hasAccepted(userId: string, kind: LegalDocumentKind): boolean {
  return acceptancesFor(userId).some((a) => a.kind === kind);
}

/** Test seam. Clears everything, including the seeded drafts. */
export function resetLegalStore() {
  db = { versions: [], acceptances: [] };
}

/** Test seam. Puts the drafts back without touching the filesystem first. */
export function seedForTests() {
  db = { versions: [], acceptances: [] };
  seedDrafts();
}

/** Checks a body without publishing it — used by the admin screen as you type. */
export { isFinalisable, unresolvedPlaceholders };

/**
 * Removes this account's acceptances.
 *
 * A judgement worth stating: the acceptances go with the account. Keeping "this
 * person agreed to v2" after they have asked to be forgotten would be keeping a
 * record about them for a dispute that, by then, almost certainly does not
 * exist. The deletion receipt records how many were removed, so the fact that
 * consent was given and then withdrawn is still evidenced without holding on to
 * who gave it. If a lawyer disagrees, this is the one function to change.
 */
export function deleteAcceptances(userId: string): number {
  const store = load();
  const mine = store.acceptances.filter((a) => a.userId === userId);
  if (mine.length > 0) {
    save({ ...store, acceptances: store.acceptances.filter((a) => a.userId !== userId) });
  }
  return mine.length;
}

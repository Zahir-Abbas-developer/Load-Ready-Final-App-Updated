/**
 * Server-side account store.
 *
 * Everything auth lives here: accounts, password hashes, and sessions, kept in
 * a JSON file next to the server process. No external service and no npm
 * dependency — hashing and token generation come from node:crypto.
 *
 * This module must never be imported from client code. It reads and writes the
 * filesystem, and the hashes it holds are the whole point of the lock.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";
import { promisify } from "node:util";

import { generateSecret, otpauthUri, verifyCode } from "./totp.server";

const scrypt = promisify(scryptCb);

export type Role = "admin" | "dispatcher" | "pilot";
export type Approval = "approved" | "pending" | "rejected";

export interface StoredUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  approval: Approval;
  rejectionReason: string | null;
  /** scrypt hash as "salt:derivedKey", both hex. */
  passwordHash: string;
  createdAt: string;
  /** Seeded team accounts cannot be rejected or deleted from the UI. */
  builtIn: boolean;
  /** Set once the account has enrolled a second factor. */
  mfa?: MfaState;
  /**
   * When the owner asked for the account to be deleted.
   *
   * Set means: signed out everywhere, nothing reachable but the screen offering
   * to change their mind, and the data goes for good after the grace period.
   */
  deletionRequestedAt?: string;
  /**
   * When an administrator suspended the account, and why.
   *
   * Different from `rejected`, which is a signup that was never let in. A
   * suspension stops somebody who was already working: they cannot sign in,
   * and every session they hold dies on its next request.
   */
  suspendedAt?: string;
  suspensionReason?: string;
}

/**
 * A second factor.
 *
 * The secret is stored as-is rather than hashed, because verifying a code
 * requires it. That is the nature of TOTP and it is why the store file matters:
 * anyone who can read it can generate codes. Encrypting it here would only move
 * the problem to wherever the key lived. The real answer is a database with
 * proper access control, which arrives with Supabase (BACKLOG F-01).
 */
export interface MfaState {
  secret: string;
  /** Null while enrolment is in progress and the first code has not been proved. */
  enabledAt: string | null;
  /** scrypt hashes. A recovery code is a password that is used once. */
  recoveryHashes: string[];
  /** The last step accepted, so a code cannot be replayed inside its window. */
  lastUsedStep: number | null;
}

interface Session {
  token: string;
  userId: string;
  expiresAt: number;
  /** Last request on this session, for the idle timeout. */
  lastSeenAt: number;
  /**
   * Set when an administrator is looking at somebody else's account.
   *
   * The session belongs to the person being viewed, so every screen renders
   * exactly what they see — but it can change nothing, and it dies in fifteen
   * minutes. See `startViewAs`.
   */
  impersonatedBy?: string;
}

/**
 * A sign-in that has passed the password and is waiting for the second factor.
 *
 * Deliberately not a session: it carries no access at all. If it were a session
 * with a flag, every code path that forgot to check the flag would be a way
 * past the second factor.
 */
interface MfaChallenge {
  token: string;
  userId: string;
  expiresAt: number;
  attemptsLeft: number;
}

/**
 * A signup that has been submitted but not yet confirmed by code.
 *
 * Nothing here is an account. The record only becomes a StoredUser once the
 * right code arrives, so an unverified address can never sign in — and the
 * code is stored hashed, exactly like a password.
 */
interface PendingSignup {
  email: string;
  fullName: string;
  role: "pilot" | "dispatcher";
  passwordHash: string;
  codeHash: string;
  expiresAt: number;
  attemptsLeft: number;
  lastSentAt: number;
  createdAt: string;
}

/**
 * A password reset in flight.
 *
 * The token is stored hashed, like a password, so a leaked store does not hand
 * anyone a set of working reset links. One per account: asking again replaces
 * the previous token rather than leaving several valid at once.
 */
interface PasswordReset {
  email: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: string;
}

interface Db {
  users: StoredUser[];
  sessions: Session[];
  pending: PendingSignup[];
  resets: PasswordReset[];
  mfaChallenges?: MfaChallenge[];
}

/** Public shape — never carries the password hash. */
export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  approval: Approval;
  rejectionReason: string | null;
  createdAt: string;
  builtIn: boolean;
  /** Whether a second factor is set up. Never the secret itself. */
  mfaEnabled: boolean;
  /** Set while the account is inside its deletion grace period. */
  deletionRequestedAt?: string;
  /** Set while an administrator has the account suspended. */
  suspendedAt?: string;
  suspensionReason?: string;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const SESSION_DAYS = 14;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

/**
 * How long a session survives with nothing happening on it.
 *
 * Fourteen days was the only limit: a laptop left open in a truck stop stayed
 * signed in for a fortnight. Eight hours is a working day — long enough that a
 * dispatcher is not signed out over lunch, short enough that an unattended
 * device is not a standing invitation.
 */
const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

/** Only write the liveness stamp when it has moved by this much. */
const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1000;

/** A challenge is for the moment between password and code, not for later. */
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MFA_CHALLENGE_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 8;
export const SESSION_COOKIE = "loadready_session";

const DATA_FILE = dataFile("users.json");

/**
 * The three internal accounts. They are created on first run already approved,
 * so they sign in with no verification and no waiting.
 *
 * Both address and password come from the environment when set, so the demo
 * credentials can be swapped for real ones without touching the code. The
 * defaults exist so a fresh checkout works out of the box.
 *
 * **In production the defaults are refused.** With LOADREADY_ENV=production,
 * an account whose password would come from this file is not created at all —
 * because that password is in CLAUDE.md, in every phase report and in the git
 * history, and an administrator can read any job, suspend anybody and view as
 * any account. A deployment missing the environment variables gets no seeded
 * accounts and a loud line in its log, rather than an administrator that
 * anybody who has read this repository can sign in as (Phase M).
 *
 * Seeding only ever *adds* a missing account. Changing LOADREADY_ADMIN_EMAIL after
 * the store exists creates the new account and leaves the old one in place —
 * remove it from the admin screen, or delete .data/users.json to start over.
 *
 * The default addresses still use `@bwm.test` even though the brand is now
 * LoadReady. That is deliberate: these are the credentials the founder's team
 * is actively signing in with, and because seeding only adds, renaming them
 * here would strand those accounts rather than move them. This whole store is
 * replaced by Supabase Auth in a later phase, which is where the team accounts
 * get real addresses (BACKLOG F-17).
 */
interface SeedAccount {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  /** True when the password is the published one rather than a configured one. */
  usingDefaultPassword: boolean;
}

/**
 * Reads the seed accounts from the environment, remembering which fell back.
 *
 * Read at call time rather than fixed at import, so a test can set the
 * environment and so the readiness check reflects the running configuration
 * rather than whatever was true when the module first loaded.
 */
function seedAccounts(): SeedAccount[] {
  const account = (
    prefix: "ADMIN" | "DISPATCHER" | "PILOT",
    fallbackEmail: string,
    fallbackPassword: string,
    fullName: string,
    role: Role,
  ): SeedAccount => {
    const password = process.env[`LOADREADY_${prefix}_PASSWORD`];
    return {
      email: process.env[`LOADREADY_${prefix}_EMAIL`] ?? fallbackEmail,
      password: password ?? fallbackPassword,
      fullName,
      role,
      usingDefaultPassword: !password,
    };
  };

  return [
    account("ADMIN", "admin@bwm.test", "LLtffpbr744*", "LoadReady Admin", "admin"),
    account(
      "DISPATCHER",
      "dispatcher@bwm.test",
      "GNmzwcji685!",
      "LoadReady Dispatcher",
      "dispatcher",
    ),
    account("PILOT", "pilot@bwm.test", "UBtrqrhp759&", "LoadReady Pilot", "pilot"),
  ];
}

/** `production` changes behaviour here, so it is read in one place. */
const inProduction = (): boolean =>
  process.env.LOADREADY_ENV?.trim().toLowerCase() === "production";

/**
 * Which seeded accounts would be created with a password out of this
 * repository. Empty is the only acceptable answer on a public deployment.
 *
 * Used by the readiness check and by the warning below. It returns addresses
 * and never passwords: this is read by an endpoint.
 */
export function usingDefaultSeedCredentials(): string[] {
  return seedAccounts()
    .filter((a) => a.usingDefaultPassword)
    .map((a) => a.email);
}

let db: Db | null = null;

function readDb(): Db {
  if (!existsSync(DATA_FILE)) return { users: [], sessions: [], pending: [], resets: [] };
  try {
    const parsed = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<Db>;
    return {
      users: parsed.users ?? [],
      sessions: parsed.sessions ?? [],
      pending: parsed.pending ?? [],
      resets: parsed.resets ?? [],
    };
  } catch (err) {
    console.error("[auth] users.json is unreadable, starting empty:", err);
    return { users: [], sessions: [], pending: [], resets: [] };
  }
}

/** Write to a sibling file first so a crash mid-write cannot truncate the store. */
function writeDb(next: Db) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, DATA_FILE);
  db = next;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const key = (await scrypt(password, Buffer.from(saltHex, "hex"), 64)) as Buffer;
  const expected = Buffer.from(keyHex, "hex");
  // Constant-time: a length mismatch alone must not short-circuit the compare.
  if (expected.length !== key.length) return false;
  return timingSafeEqual(key, expected);
}

export const normaliseEmail = (email: string) => email.trim().toLowerCase();

/** Loads the store, seeding the three internal accounts the first time. */
async function getDb(): Promise<Db> {
  if (db) return db;
  const loaded = readDb();
  let changed = false;

  for (const seed of seedAccounts()) {
    const email = normaliseEmail(seed.email);
    if (loaded.users.some((u) => u.email === email)) continue;

    /*
     * Never create an account with a password out of this repository on a
     * public deployment.
     *
     * Refusing to create it is deliberately better than creating it and
     * warning: a warning in a log is something somebody reads afterwards, and
     * an administrator account with a published password is a takeover of
     * every job, every message and every position on the platform.
     *
     * The result is a server with no way in until the environment is set,
     * which is a locked door rather than an open one.
     */
    if (inProduction() && seed.usingDefaultPassword) {
      console.error(
        `[auth] refusing to seed ${email}: LOADREADY_${seed.role.toUpperCase()}_PASSWORD is not set, and the fallback password is published in this repository. Set it and restart.`,
      );
      continue;
    }

    if (seed.usingDefaultPassword) {
      // Loud everywhere, because "it was only ever local" is how it ends up
      // not being only ever local.
      console.warn(
        `[auth] ${email} seeded with the password published in this repository. Development only.`,
      );
    }
    loaded.users.push({
      id: randomBytes(12).toString("hex"),
      email,
      fullName: seed.fullName,
      role: seed.role,
      approval: "approved",
      rejectionReason: null,
      passwordHash: await hashPassword(seed.password),
      createdAt: new Date().toISOString(),
      builtIn: true,
    });
    changed = true;
  }

  db = loaded;
  if (changed) writeDb(loaded);
  return loaded;
}

/**
 * Strips everything a browser must never see.
 *
 * Both secrets are pulled out by name rather than by spreading and hoping: this
 * function used to spread the whole record minus the password hash, so adding
 * an MFA secret to StoredUser would have published it to the client on the next
 * sign-in.
 */
export function toSafeUser(u: StoredUser): SafeUser {
  const { passwordHash: _password, mfa: _mfa, ...safe } = u;
  return { ...safe, mfaEnabled: Boolean(u.mfa?.enabledAt) };
}

// ── deletion ───────────────────────────────────────────────────────────────

/**
 * How long the owner has to change their mind.
 *
 * Seven days, because the account is deleted by exactly two kinds of person:
 * somebody who meant it, and somebody who was angry on a Tuesday. The first
 * loses nothing by waiting; the second gets their working life back.
 *
 * It is also the window in which a stolen session could delete somebody's
 * account and be undone.
 */
export const DELETION_GRACE_DAYS = 7;
const DELETION_GRACE_MS = DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;

export function deletionDueAt(requestedAt: string): number {
  return Date.parse(requestedAt) + DELETION_GRACE_MS;
}

/**
 * Starts a deletion.
 *
 * Every session is dropped, so a device left open somewhere cannot keep using
 * an account that is on its way out. Signing in again is still possible, and
 * lands on the screen offering to cancel — locking somebody out of the account
 * they are trying to recover would be a cruel way to enforce a grace period.
 */
export async function requestAccountDeletion(
  userId: string,
  password: string,
): Promise<{ dueAt?: number; error?: string }> {
  const store = await getDb();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return { error: "No such account." };

  // Re-authentication, because this is irreversible and a borrowed laptop
  // should not be enough to do it.
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { error: "Wrong password." };
  }

  if (user.role === "admin") {
    // Not a technical limit: an administrator holds the audit trail and the
    // approvals, and removing one is a decision somebody else should take.
    return { error: "Administrator accounts are closed by another administrator, not self-serve." };
  }

  const requestedAt = new Date().toISOString();
  user.deletionRequestedAt = requestedAt;
  store.sessions = store.sessions.filter((s) => s.userId !== userId);
  writeDb(store);

  return { dueAt: deletionDueAt(requestedAt) };
}

export async function cancelAccountDeletion(userId: string): Promise<{ error?: string }> {
  const store = await getDb();
  const user = store.users.find((u) => u.id === userId);
  if (!user?.deletionRequestedAt) return { error: "This account is not scheduled for deletion." };

  delete user.deletionRequestedAt;
  writeDb(store);
  return {};
}

/** Accounts whose grace period has run out. */
export async function accountsDueForDeletion(now = Date.now()): Promise<SafeUser[]> {
  const store = await getDb();
  return store.users
    .filter((u) => u.deletionRequestedAt && deletionDueAt(u.deletionRequestedAt) <= now)
    .map(toSafeUser);
}

/**
 * Removes the account row itself, and everything auth holds about it.
 *
 * Called only by the deletion job, after the other stores have been cleared —
 * losing the account row first would strand the rest with no id to find it by.
 */
export async function purgeAccount(userId: string): Promise<boolean> {
  const store = await getDb();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return false;

  writeDb({
    ...store,
    users: store.users.filter((u) => u.id !== userId),
    sessions: store.sessions.filter((s) => s.userId !== userId),
    pending: store.pending.filter((p) => p.email !== user.email),
    resets: store.resets.filter((r) => r.email !== user.email),
    mfaChallenges: (store.mfaChallenges ?? []).filter((c) => c.userId !== userId),
  });
  return true;
}

/** The raw record, for the data export. Includes nothing secret. */
export async function accountExport(userId: string): Promise<Record<string, unknown> | null> {
  const store = await getDb();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return null;

  const { passwordHash: _password, mfa, ...rest } = user;
  return {
    ...rest,
    // The hash is not included: it is not information about the person, it is
    // the lock on their door, and a copy of it in an emailed file is a copy
    // somebody can attack offline. Same for the second-factor secret.
    twoFactor: mfa?.enabledAt
      ? { enabled: true, enabledAt: mfa.enabledAt, recoveryCodesLeft: mfa.recoveryHashes.length }
      : { enabled: false },
    sessions: store.sessions
      .filter((s) => s.userId === userId)
      .map((s) => ({
        expiresAt: new Date(s.expiresAt).toISOString(),
        lastSeenAt: new Date(s.lastSeenAt ?? 0).toISOString(),
      })),
  };
}

/** Six digits, uniformly drawn — Math.random is not good enough for this. */
function newOtp(): string {
  let out = "";
  while (out.length < 6) {
    for (const byte of randomBytes(6)) {
      // Reject the tail of the byte range so every digit stays equally likely.
      if (byte >= 250) continue;
      out += String(byte % 10);
      if (out.length === 6) break;
    }
  }
  return out;
}

const dropExpired = (store: Db) => {
  const now = Date.now();
  store.pending = store.pending.filter((p) => p.expiresAt > now);
};

/**
 * Step one of signup: hold the details aside and issue a code.
 *
 * No account exists yet. Returns the plain code for the mailer to deliver; it
 * is never stored in the clear and never returned to the browser.
 */
export async function startSignup(input: {
  email: string;
  password: string;
  fullName: string;
  role: "pilot" | "dispatcher";
}): Promise<{ email?: string; code?: string; alreadyRegistered?: boolean; error?: string }> {
  const store = await getDb();
  dropExpired(store);
  const email = normaliseEmail(input.email);

  /*
   * Shape is validated by signUpSchema before this is called, so the checks
   * here are only the ones the schema cannot make — the ones that need the
   * store.
   *
   * When the address is already taken, saying so would let anyone test whether
   * a given person has an account, which CLAUDE.md rule 8 forbids. The caller
   * learns nothing and no pending signup is created; the route emails the real
   * owner that someone tried, so the person who matters finds out and the
   * person probing does not.
   */
  if (store.users.some((u) => u.email === email)) {
    return { email, alreadyRegistered: true };
  }

  const code = newOtp();
  const record: PendingSignup = {
    email,
    fullName: input.fullName.trim(),
    role: input.role,
    passwordHash: await hashPassword(input.password),
    codeHash: await hashPassword(code),
    expiresAt: Date.now() + OTP_TTL_MS,
    attemptsLeft: OTP_MAX_ATTEMPTS,
    lastSentAt: Date.now(),
    createdAt: new Date().toISOString(),
  };

  // Starting over replaces any earlier attempt for the same address.
  store.pending = store.pending.filter((p) => p.email !== email);
  store.pending.push(record);
  writeDb(store);

  return { email, code };
}

/** Step two: the right code turns the held details into a real account. */
export async function verifySignupCode(
  emailInput: string,
  code: string,
): Promise<{ user?: SafeUser; error?: string }> {
  const store = await getDb();
  dropExpired(store);
  const email = normaliseEmail(emailInput);

  const pendingRecord = store.pending.find((p) => p.email === email);
  if (!pendingRecord) {
    return { error: "That code has expired. Start the signup again." };
  }

  if (!(await verifyPassword(code.trim(), pendingRecord.codeHash))) {
    pendingRecord.attemptsLeft -= 1;
    if (pendingRecord.attemptsLeft <= 0) {
      store.pending = store.pending.filter((p) => p.email !== email);
      writeDb(store);
      return { error: "Too many wrong codes. Start the signup again." };
    }
    writeDb(store);
    return {
      error: `That code is not right. ${pendingRecord.attemptsLeft} attempt${
        pendingRecord.attemptsLeft === 1 ? "" : "s"
      } left.`,
    };
  }

  const user: StoredUser = {
    id: randomBytes(12).toString("hex"),
    email: pendingRecord.email,
    fullName: pendingRecord.fullName,
    role: pendingRecord.role,
    // Verified, but still not usable until an administrator says so.
    approval: "pending",
    rejectionReason: null,
    passwordHash: pendingRecord.passwordHash,
    createdAt: new Date().toISOString(),
    builtIn: false,
  };

  store.users.push(user);
  store.pending = store.pending.filter((p) => p.email !== email);
  writeDb(store);

  return { user: toSafeUser(user) };
}

/** Issues a fresh code for a signup already in progress. */
export async function resendSignupCode(
  emailInput: string,
): Promise<{ email?: string; code?: string; error?: string }> {
  const store = await getDb();
  dropExpired(store);
  const email = normaliseEmail(emailInput);

  const pendingRecord = store.pending.find((p) => p.email === email);
  if (!pendingRecord) {
    return { error: "That signup has expired. Start again." };
  }

  const waited = Date.now() - pendingRecord.lastSentAt;
  if (waited < OTP_RESEND_COOLDOWN_MS) {
    const secs = Math.ceil((OTP_RESEND_COOLDOWN_MS - waited) / 1000);
    return { error: `Please wait ${secs}s before asking for another code.` };
  }

  const code = newOtp();
  pendingRecord.codeHash = await hashPassword(code);
  pendingRecord.expiresAt = Date.now() + OTP_TTL_MS;
  pendingRecord.attemptsLeft = OTP_MAX_ATTEMPTS;
  pendingRecord.lastSentAt = Date.now();
  writeDb(store);

  return { email, code };
}

export async function authenticate(
  email: string,
  password: string,
): Promise<{
  user?: SafeUser;
  token?: string;
  error?: string;
  /** The password was right, and this account needs a code as well. */
  mfaRequired?: boolean;
  challenge?: string;
}> {
  const store = await getDb();
  const user = store.users.find((u) => u.email === normaliseEmail(email));

  // Same message either way, so this cannot be used to enumerate accounts.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Wrong email or password." };
  }

  const now = Date.now();

  /*
   * A suspended account is told so, rather than given the generic answer.
   *
   * The password was already right, so this leaks nothing an attacker did not
   * have — and somebody whose livelihood has just stopped working needs to
   * know it was a decision rather than a bug, so they can argue with it.
   */
  if (user.suspendedAt) {
    return {
      error: user.suspensionReason
        ? `This account is suspended: ${user.suspensionReason}`
        : "This account is suspended. Contact support.",
    };
  }

  /*
   * An account on its way out can still be signed in to. The session it gets
   * reaches nothing but the screen offering to cancel — see the gate in
   * src/routes/index.tsx. Refusing the sign-in outright would lock somebody out
   * of the account they are trying to save.
   */

  /*
   * The password was right, and for an account with a second factor that is
   * half of the answer. What comes back is a challenge, not a session: a
   * session with an "unverified" flag would be one forgotten check away from
   * being the whole answer.
   */
  if (user.mfa?.enabledAt) {
    const challenge = randomBytes(32).toString("hex");
    store.mfaChallenges = [
      ...(store.mfaChallenges ?? []).filter((c) => c.expiresAt > now),
      {
        token: challenge,
        userId: user.id,
        expiresAt: now + MFA_CHALLENGE_TTL_MS,
        attemptsLeft: MFA_CHALLENGE_ATTEMPTS,
      },
    ];
    writeDb(store);
    return { mfaRequired: true, challenge };
  }

  const token = newSession(store, user.id, now);
  writeDb(store);

  return { user: toSafeUser(user), token };
}

/** Issues a session and prunes the expired ones. Caller writes the store. */
function newSession(store: Db, userId: string, now: number): string {
  const token = randomBytes(32).toString("hex");
  store.sessions = store.sessions.filter((s) => s.expiresAt > now && !isIdle(s, now));
  store.sessions.push({ token, userId, expiresAt: now + SESSION_MS, lastSeenAt: now });
  return token;
}

function isIdle(session: Session, now: number): boolean {
  return now - lastSeen(session) > IDLE_TIMEOUT_MS;
}

/**
 * When this session was last used.
 *
 * Sessions written before the idle timeout existed have no stamp. Treating
 * that as zero would sign everybody out the moment this ships; treating it as
 * now would give a fortnight-old session a fresh eight hours. The session's own
 * start is the honest answer — it is expiry minus the fixed lifetime — so an
 * old session ages out on the same clock as a new one.
 */
function lastSeen(session: Session): number {
  return session.lastSeenAt ?? session.expiresAt - SESSION_MS;
}

export async function userForToken(token: string | null): Promise<SafeUser | null> {
  if (!token) return null;
  const store = await getDb();
  const session = store.sessions.find((s) => s.token === token);
  const now = Date.now();

  if (!session || session.expiresAt <= now) return null;

  // An unattended device must not stay signed in for a fortnight.
  if (isIdle(session, now)) {
    store.sessions = store.sessions.filter((s) => s.token !== token);
    writeDb(store);
    return null;
  }

  // Written back only every few minutes: every request touching the store
  // would turn a read into a disk write, at request rate.
  if (now - lastSeen(session) > LAST_SEEN_WRITE_INTERVAL_MS) {
    session.lastSeenAt = now;
    writeDb(store);
  }

  const user = store.users.find((u) => u.id === session.userId);
  if (!user) return null;

  /*
   * Suspension takes effect now, not at the next sign-in.
   *
   * An administrator suspending an account for abuse expects it to stop, and
   * a session that stayed alive for its remaining fortnight would make the
   * button a suggestion.
   */
  if (user.suspendedAt) {
    store.sessions = store.sessions.filter((s) => s.userId !== user.id);
    writeDb(store);
    return null;
  }

  return toSafeUser(user);
}

/**
 * Whether this session is an administrator looking rather than the owner using.
 *
 * Read by the authorization layer, which refuses every mutating action while
 * it is set — see `authorize`.
 */
export async function impersonationOf(token: string | null): Promise<string | null> {
  if (!token) return null;
  const store = await getDb();
  const session = store.sessions.find((s) => s.token === token);
  return session?.impersonatedBy ?? null;
}

// ── second factor ──────────────────────────────────────────────────────────

/**
 * Exchanges a challenge and a code for a session.
 *
 * A wrong code costs one of five attempts on that challenge; running out
 * destroys it, so the password has to be entered again. That bounds guessing at
 * five tries per sign-in rather than per code.
 */
export async function verifyMfaChallenge(
  challengeToken: string,
  code: string,
): Promise<{ user?: SafeUser; token?: string; error?: string }> {
  const store = await getDb();
  const now = Date.now();
  const challenge = (store.mfaChallenges ?? []).find((c) => c.token === challengeToken);

  if (!challenge || challenge.expiresAt <= now) {
    return { error: "That sign-in expired. Enter your password again." };
  }

  const user = store.users.find((u) => u.id === challenge.userId);
  if (!user?.mfa?.enabledAt) return { error: "That sign-in expired. Enter your password again." };

  const dropChallenge = () => {
    store.mfaChallenges = (store.mfaChallenges ?? []).filter((c) => c.token !== challengeToken);
  };

  // A recovery code is the way back in when the phone is gone. Each works once.
  const recovery = await consumeRecoveryCode(user, code);
  if (recovery) {
    dropChallenge();
    const token = newSession(store, user.id, now);
    writeDb(store);
    return { user: toSafeUser(user), token };
  }

  const result = verifyCode(user.mfa.secret, code, {
    now,
    lastUsedStep: user.mfa.lastUsedStep,
  });

  if (!result.ok) {
    challenge.attemptsLeft -= 1;
    if (challenge.attemptsLeft <= 0) dropChallenge();
    writeDb(store);
    if (challenge.attemptsLeft <= 0) {
      return { error: "Too many wrong codes. Enter your password again." };
    }
    return {
      error: result.reused
        ? "You have already used that code. Wait for your app to show the next one."
        : "That code is not right.",
    };
  }

  // Remembering the step is what stops the same code being used twice inside
  // its thirty-second window.
  user.mfa.lastUsedStep = result.step ?? null;
  dropChallenge();
  const token = newSession(store, user.id, now);
  writeDb(store);
  return { user: toSafeUser(user), token };
}

/** True when a recovery code matched and was spent. */
async function consumeRecoveryCode(user: StoredUser, candidate: string): Promise<boolean> {
  if (!user.mfa) return false;
  const cleaned = candidate.trim().toUpperCase().replace(/\s+/g, "");
  if (cleaned.length < 10) return false;

  for (const hash of user.mfa.recoveryHashes) {
    if (await verifyPassword(cleaned, hash)) {
      user.mfa.recoveryHashes = user.mfa.recoveryHashes.filter((h) => h !== hash);
      return true;
    }
  }
  return false;
}

/**
 * Starts enrolment: a secret and the URI an authenticator app scans.
 *
 * Nothing is switched on yet. `enabledAt` stays null until a code proves the
 * secret actually reached a working app — enabling first would lock the account
 * out on a mistyped scan.
 */
export async function beginMfaEnrolment(
  userId: string,
): Promise<{ secret?: string; uri?: string; error?: string }> {
  const store = await getDb();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return { error: "No such account." };
  if (user.mfa?.enabledAt) return { error: "Two-factor sign-in is already set up." };

  const secret = generateSecret();
  user.mfa = { secret, enabledAt: null, recoveryHashes: [], lastUsedStep: null };
  writeDb(store);

  return { secret, uri: otpauthUri(secret, user.email) };
}

/**
 * Finishes enrolment.
 *
 * The recovery codes are returned exactly once and stored only as hashes. If
 * they were retrievable later, they would be a second password sitting in the
 * database rather than a way back in.
 */
export async function confirmMfaEnrolment(
  userId: string,
  code: string,
): Promise<{ recoveryCodes?: string[]; error?: string }> {
  const store = await getDb();
  const user = store.users.find((u) => u.id === userId);
  if (!user?.mfa) return { error: "Start again — no enrolment is in progress." };
  if (user.mfa.enabledAt) return { error: "Two-factor sign-in is already set up." };

  const result = verifyCode(user.mfa.secret, code, { now: Date.now() });
  if (!result.ok) {
    /*
     * Both clocks, not just the phone's.
     *
     * A code is checked against a thirty-second window on either side, so it
     * fails when *either* machine is out — and the message used to name only
     * the phone. The founder lost an evening to that: their phone was right
     * and the server was five minutes slow, so every code they typed was
     * refused while the screen told them to look at the device that was
     * correct. A wrong clock on the server locks out every administrator at
     * once, which is worth pointing at.
     */
    return {
      error:
        "That code is not right. Codes are only valid for about a minute, so check the clock on your phone and on this server — if either is more than half a minute out, every code will be refused.",
    };
  }

  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    randomBytes(8).toString("hex").toUpperCase().slice(0, 12),
  );
  user.mfa.recoveryHashes = await Promise.all(codes.map((c) => hashPassword(c)));
  user.mfa.enabledAt = new Date().toISOString();
  user.mfa.lastUsedStep = result.step ?? null;
  writeDb(store);

  return { recoveryCodes: codes };
}

/**
 * Turns it off. Needs the password and a current code.
 *
 * Both, because either alone is a way to strip a second factor off an account
 * somebody else is already inside.
 */
export async function disableMfa(
  userId: string,
  password: string,
  code: string,
): Promise<{ error?: string }> {
  const store = await getDb();
  const user = store.users.find((u) => u.id === userId);
  if (!user?.mfa?.enabledAt) return { error: "Two-factor sign-in is not set up." };

  if (!(await verifyPassword(password, user.passwordHash))) {
    return { error: "Wrong password." };
  }

  const recovery = await consumeRecoveryCode(user, code);
  if (!recovery && !verifyCode(user.mfa.secret, code, { now: Date.now() }).ok) {
    return { error: "That code is not right." };
  }

  delete user.mfa;
  writeDb(store);
  return {};
}

/** Enrolment state, for the screen that asks for it. */
export async function mfaStatus(
  userId: string,
): Promise<{ enabled: boolean; enrolling: boolean; recoveryCodesLeft: number }> {
  const store = await getDb();
  const mfa = store.users.find((u) => u.id === userId)?.mfa;
  return {
    enabled: Boolean(mfa?.enabledAt),
    enrolling: Boolean(mfa && !mfa.enabledAt),
    recoveryCodesLeft: mfa?.recoveryHashes.length ?? 0,
  };
}

/**
 * Administrators must have a second factor (CLAUDE.md, roles).
 *
 * Read by the authorization gate: an administrator who has not enrolled can
 * sign in and reach the enrolment screen, and nothing else.
 */
export async function adminNeedsMfa(user: SafeUser | null): Promise<boolean> {
  return user?.role === "admin" && !user.mfaEnabled;
}

export async function endSession(token: string | null): Promise<void> {
  if (!token) return;
  const store = await getDb();
  store.sessions = store.sessions.filter((s) => s.token !== token);
  writeDb(store);
}

const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Step one of a password reset: issue a token for an address.
 *
 * Returns a token only when the account exists, and says nothing about which
 * case occurred — the caller must respond identically either way, or this
 * becomes the account-enumeration oracle that signup no longer is.
 */
export async function requestPasswordReset(
  emailInput: string,
): Promise<{ email: string; token?: string; fullName?: string }> {
  const store = await getDb();
  const email = normaliseEmail(emailInput);
  const now = Date.now();
  store.resets = store.resets.filter((r) => r.expiresAt > now);

  const user = store.users.find((u) => u.email === email);
  if (!user) {
    writeDb(store);
    return { email };
  }

  const token = randomBytes(32).toString("hex");
  // Replace rather than add: only the newest link should ever work.
  store.resets = store.resets.filter((r) => r.email !== email);
  store.resets.push({
    email,
    tokenHash: await hashPassword(token),
    expiresAt: now + RESET_TTL_MS,
    createdAt: new Date().toISOString(),
  });
  writeDb(store);

  return { email, token, fullName: user.fullName };
}

/**
 * Step two: spend the token and set the new password.
 *
 * Every existing session for that account is dropped. Someone resetting a
 * password is often doing it because they think somebody else has it, and
 * leaving the intruder signed in would defeat the exercise.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ email?: string; error?: string }> {
  const store = await getDb();
  const now = Date.now();
  store.resets = store.resets.filter((r) => r.expiresAt > now);

  // The token identifies nothing on its own, so every live reset is checked.
  let match: (typeof store.resets)[number] | undefined;
  for (const reset of store.resets) {
    if (await verifyPassword(token, reset.tokenHash)) {
      match = reset;
      break;
    }
  }
  if (!match) {
    return { error: "That reset link has expired or has already been used." };
  }

  const user = store.users.find((u) => u.email === match.email);
  if (!user) {
    store.resets = store.resets.filter((r) => r !== match);
    writeDb(store);
    return { error: "That reset link is no longer valid." };
  }

  user.passwordHash = await hashPassword(newPassword);
  store.resets = store.resets.filter((r) => r !== match);
  store.sessions = store.sessions.filter((s) => s.userId !== user.id);
  writeDb(store);

  return { email: user.email };
}

/**
 * One account by id, for anything that needs to reach the person behind it.
 *
 * Returns the safe shape, so a caller that only wanted an email address cannot
 * accidentally hold a password hash while doing it.
 */
export async function userById(userId: string): Promise<SafeUser | null> {
  const store = await getDb();
  const user = store.users.find((u) => u.id === userId);
  return user ? toSafeUser(user) : null;
}

export async function listAccounts(): Promise<SafeUser[]> {
  const store = await getDb();
  return [...store.users]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .map(toSafeUser);
}

/** Everything an administrator can do to somebody else's account. */
export interface AdminActionResult {
  user?: SafeUser;
  error?: string;
}

function requireReason(reason: string): string | null {
  const trimmed = reason.trim();
  // Every one of these is a mark on somebody's record or an interruption to
  // their work. A reason is what makes the audit entry worth having.
  return trimmed.length < 3 ? "Give a reason — it goes on the record." : null;
}

/**
 * Stops an account working, immediately.
 *
 * Sessions are dropped here as well as being refused on the next request:
 * belt and braces, because this is the button somebody reaches for when an
 * account is actively doing harm.
 */
export async function suspendAccount(userId: string, reason: string): Promise<AdminActionResult> {
  const problem = requireReason(reason);
  if (problem) return { error: problem };

  const store = await getDb();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return { error: "No such account." };
  if (user.builtIn) return { error: "Built-in team accounts cannot be suspended." };

  user.suspendedAt = new Date().toISOString();
  user.suspensionReason = reason.trim().slice(0, 500);
  store.sessions = store.sessions.filter((s) => s.userId !== userId);
  writeDb(store);

  return { user: toSafeUser(user) };
}

export async function reactivateAccount(userId: string): Promise<AdminActionResult> {
  const store = await getDb();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return { error: "No such account." };

  delete user.suspendedAt;
  delete user.suspensionReason;
  writeDb(store);

  return { user: toSafeUser(user) };
}

/**
 * Signs somebody out everywhere.
 *
 * Deliberately **not** a password reset the administrator can complete: an
 * administrator who could set somebody's password could then sign in as them
 * with nothing on the record. This drops the sessions; the owner recovers
 * through the ordinary forgot-password flow, which only their inbox can finish.
 */
export async function revokeSessions(userId: string): Promise<AdminActionResult> {
  const store = await getDb();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return { error: "No such account." };

  store.sessions = store.sessions.filter((s) => s.userId !== userId);
  writeDb(store);
  return { user: toSafeUser(user) };
}

/**
 * Removes somebody's second factor so they can enrol a new one.
 *
 * The lost-phone case. It lowers their security, which is why it needs a
 * reason and lands in the audit log — and why every session goes with it, so
 * a thief holding one cannot use the gap.
 */
export async function clearMfa(userId: string, reason: string): Promise<AdminActionResult> {
  const problem = requireReason(reason);
  if (problem) return { error: problem };

  const store = await getDb();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return { error: "No such account." };
  if (!user.mfa?.enabledAt) return { error: "That account has no second factor." };

  delete user.mfa;
  store.sessions = store.sessions.filter((s) => s.userId !== userId);
  writeDb(store);

  return { user: toSafeUser(user) };
}

// ── view-as ────────────────────────────────────────────────────────────────

/** Long enough to look at a support case, short enough not to be left open. */
export const VIEW_AS_MS = 15 * 60 * 1000;

/**
 * Issues a read-only session as somebody else.
 *
 * The most dangerous thing in this product, so it carries four controls at
 * once: a reason that goes in the audit log, a fifteen-minute life, a refusal
 * of every mutating action while it is in use, and — the one that actually
 * matters — **the person being viewed is told**. A power nobody can see used
 * is a power nobody can object to.
 *
 * Never for another administrator: one administrator quietly holding another's
 * console is the one case where none of the controls above help.
 */
export async function startViewAs(
  adminId: string,
  userId: string,
  reason: string,
): Promise<{ token?: string; user?: SafeUser; error?: string }> {
  const problem = requireReason(reason);
  if (problem) return { error: problem };
  if (adminId === userId) return { error: "You are already signed in as yourself." };

  const store = await getDb();
  const target = store.users.find((u) => u.id === userId);
  if (!target) return { error: "No such account." };
  if (target.role === "admin") {
    return { error: "You cannot view another administrator's account." };
  }
  if (target.suspendedAt) {
    return { error: "That account is suspended. Reactivate it first if you need to look." };
  }

  const now = Date.now();
  const token = randomBytes(32).toString("hex");
  store.sessions = store.sessions.filter((s) => s.expiresAt > now);
  store.sessions.push({
    token,
    userId,
    expiresAt: now + VIEW_AS_MS,
    lastSeenAt: now,
    impersonatedBy: adminId,
  });
  writeDb(store);

  return { token, user: toSafeUser(target) };
}

export async function decideAccount(
  userId: string,
  approve: boolean,
  reason?: string,
): Promise<{ user?: SafeUser; error?: string }> {
  const store = await getDb();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return { error: "No such account." };
  if (user.builtIn) return { error: "Built-in team accounts cannot be changed here." };

  user.approval = approve ? "approved" : "rejected";
  user.rejectionReason = approve ? null : reason?.trim() || "No reason given.";

  // A rejected user should not keep browsing on an old session.
  if (!approve) store.sessions = store.sessions.filter((s) => s.userId !== userId);

  writeDb(store);
  return { user: toSafeUser(user) };
}

/** Reads our session cookie out of a request's Cookie header. */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionCookie(token: string, secure: boolean): string {
  const bits = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_MS / 1000)}`,
  ];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

export function clearedCookie(secure: boolean): string {
  const bits = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

/** The tunnel and any real deployment are https; plain localhost is not. */
export const isSecureRequest = (request: Request) =>
  new URL(request.url).protocol === "https:" ||
  request.headers.get("x-forwarded-proto") === "https";

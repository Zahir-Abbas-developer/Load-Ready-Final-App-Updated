/**
 * Private file storage — the stand-in for a Supabase Storage bucket.
 *
 * A pilot's driving licence, insurance certificate and medical card are the
 * most sensitive things this product will ever hold. They are held here under
 * four rules:
 *
 * 1. **Nothing is served by path.** Files live in `.data/uploads` under random
 *    ids and are reachable only through `/api/files`, which checks the session
 *    every time. There is no static route to them and no URL to guess.
 * 2. **A token is not enough.** Downloads need a signed, short-lived token AND
 *    a session that owns the file or belongs to an administrator. Either alone
 *    fails, so a link pasted into a group chat is useless to the recipient.
 * 3. **The declared type is not believed.** Every upload is checked against its
 *    magic bytes; an HTML page labelled `image/png` is refused. What a browser
 *    would execute is what makes stored files dangerous.
 * 4. **Nothing is deleted quietly.** Removing a document detaches it and leaves
 *    the bytes for the retention window, because a pilot deleting a rejected
 *    licence must not erase the evidence of why it was rejected.
 *
 * Never import this from client code.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { dataFile } from "./data-dir";

const UPLOAD_DIR = dataFile("uploads");
const INDEX_FILE = join(UPLOAD_DIR, "index.json");
const SECRET_FILE = dataFile("file-signing-key");

/** 10 MB. A phone photo of a licence is ~3 MB; a scanned PDF rarely more. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Everything one account may hold, added up.
 *
 * The per-file and per-hour caps bound a burst; neither bounds a week. A pilot
 * needs a licence, insurance, a medical card, a registration and a handful of
 * certifications — call it fifteen documents. 100 MB is several times that and
 * still small enough that one account cannot fill a disk.
 */
export const MAX_BYTES_PER_ACCOUNT = 100 * 1024 * 1024;

/** How long a download link stays valid. Long enough to render, short enough to be useless if leaked. */
const TOKEN_TTL_MS = 5 * 60 * 1000;

export type AllowedMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

/**
 * Magic bytes, because `content-type` is whatever the uploader typed.
 * WebP is RIFF....WEBP, so it needs the check at offset 8 as well.
 */
const SIGNATURES: Array<{ mime: AllowedMime; test: (b: Buffer) => boolean }> = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png",
    test: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/webp",
    test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
  },
  { mime: "application/pdf", test: (b) => b.subarray(0, 5).toString() === "%PDF-" },
];

export interface StoredFile {
  id: string;
  ownerId: string;
  mime: AllowedMime;
  bytes: number;
  originalName: string;
  createdAt: string;
  /** Set when the document referencing it was removed; the bytes stay. */
  detachedAt: string | null;
}

let index: StoredFile[] | null = null;
let signingKey: Buffer | null = null;

function loadIndex(): StoredFile[] {
  if (index) return index;
  if (!existsSync(INDEX_FILE)) {
    index = [];
    return index;
  }
  try {
    index = JSON.parse(readFileSync(INDEX_FILE, "utf8")) as StoredFile[];
  } catch (err) {
    // A lost index means the bytes are unreachable, which is the safe failure.
    console.warn("[files] could not read the index, starting empty", err);
    index = [];
  }
  return index;
}

function saveIndex(next: StoredFile[]) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const tmp = `${INDEX_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, INDEX_FILE);
  index = next;
}

/**
 * The key that signs download tokens.
 *
 * From the environment in production, so it survives a restart and is shared
 * across instances. Generated and stored otherwise, which keeps a local
 * checkout working without inventing a weak default — a hardcoded fallback
 * secret is the same as no secret at all.
 */
function key(): Buffer {
  if (signingKey) return signingKey;

  const fromEnv = process.env.LOADREADY_FILE_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    signingKey = Buffer.from(fromEnv, "utf8");
    return signingKey;
  }

  mkdirSync(dirname(SECRET_FILE), { recursive: true });
  if (existsSync(SECRET_FILE)) {
    signingKey = Buffer.from(readFileSync(SECRET_FILE, "utf8").trim(), "hex");
    if (signingKey.length >= 32) return signingKey;
  }

  signingKey = randomBytes(48);
  writeFileSync(SECRET_FILE, signingKey.toString("hex"), "utf8");
  return signingKey;
}

function blobPath(id: string): string {
  return join(UPLOAD_DIR, `${id}.blob`);
}

/** Sniffs the real type. Returns null when it is not one we accept. */
export function detectMime(bytes: Buffer): AllowedMime | null {
  if (bytes.length < 12) return null;
  return SIGNATURES.find((s) => s.test(bytes))?.mime ?? null;
}

/**
 * The uploaded name, made safe to show and to put in a header.
 *
 * It is never used as a path — blobs are stored under a random id — but it is
 * echoed into `content-disposition` and rendered on screen, so separators,
 * quotes, control characters and markup all come out. Runs of dots collapse
 * too: not because `..` could escape anything here, but because
 * "......etcpasswd.png" is what a stripped traversal attempt looks like, and
 * nobody reading a filename should have to work that out.
 */
function safeName(raw: string): string {
  return (
    raw
      .replace(/[^\w.\- ]+/g, "")
      .replace(/\.{2,}/g, ".")
      .replace(/^[.\s]+/, "")
      .trim()
      .slice(0, 120) || "document"
  );
}

export type SaveResult = { file: StoredFile } | { error: string };

export function saveFile(args: {
  ownerId: string;
  bytes: Buffer;
  originalName: string;
}): SaveResult {
  if (args.bytes.length === 0) return { error: "That file is empty." };
  if (args.bytes.length > MAX_FILE_BYTES) {
    return {
      error: "That file is larger than 10 MB. Photograph the page rather than scanning it.",
    };
  }

  const mime = detectMime(args.bytes);
  if (!mime) {
    return { error: "Upload a JPEG, PNG, WebP or PDF. Other file types are not accepted." };
  }

  // Detached files still count: the bytes are still on the disk, and not
  // counting them would make "delete and re-upload" an unlimited loop.
  const held = bytesHeldBy(args.ownerId);
  if (held + args.bytes.length > MAX_BYTES_PER_ACCOUNT) {
    return {
      error: "You have reached the storage limit for your account. Remove a document first.",
    };
  }

  const file: StoredFile = {
    id: randomBytes(16).toString("hex"),
    ownerId: args.ownerId,
    mime,
    bytes: args.bytes.length,
    originalName: safeName(args.originalName),
    createdAt: new Date().toISOString(),
    detachedAt: null,
  };

  mkdirSync(UPLOAD_DIR, { recursive: true });
  writeFileSync(blobPath(file.id), args.bytes);
  saveIndex([...loadIndex(), file]);
  return { file };
}

/** Total bytes this account is holding, detached files included. */
export function bytesHeldBy(ownerId: string): number {
  return loadIndex()
    .filter((f) => f.ownerId === ownerId)
    .reduce((total, f) => total + f.bytes, 0);
}

export function fileMeta(id: string): StoredFile | null {
  return loadIndex().find((f) => f.id === id) ?? null;
}

export function readFileBytes(id: string): Buffer | null {
  const path = blobPath(id);
  return existsSync(path) ? readFileSync(path) : null;
}

/** Marks a file as no longer referenced. The bytes stay — see rule 4 above. */
export function detachFile(id: string) {
  const next = loadIndex().map((f) =>
    f.id === id && !f.detachedAt ? { ...f, detachedAt: new Date().toISOString() } : f,
  );
  saveIndex(next);
}

/** Really deletes. Only for the retention job and tests, never from a request. */
export function purgeFile(id: string) {
  const path = blobPath(id);
  if (existsSync(path)) unlinkSync(path);
  saveIndex(loadIndex().filter((f) => f.id !== id));
}

// ── signed access ──────────────────────────────────────────────────────────

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("hex");
}

/**
 * A token for one file, one viewer, for five minutes.
 *
 * Binding it to the viewer is what stops a signed link being forwarded: the
 * download also requires a session, and the two have to be the same person.
 */
export function signFileToken(fileId: string, viewerId: string, now = Date.now()): string {
  const expires = now + TOKEN_TTL_MS;
  const payload = `${fileId}.${viewerId}.${expires}`;
  return `${expires}.${sign(payload)}`;
}

export function verifyFileToken(
  token: string,
  fileId: string,
  viewerId: string,
  now = Date.now(),
): boolean {
  const [expiresRaw, mac] = token.split(".");
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || !mac) return false;
  if (expires < now) return false;

  const expected = sign(`${fileId}.${viewerId}.${expires}`);
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  // Comparing with === would leak the answer through timing, one byte at a time.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Test seam. */
export function resetFileStore() {
  index = [];
  signingKey = null;
}

/** Every file this account owns, attached or detached. */
export function filesOwnedBy(ownerId: string): StoredFile[] {
  return loadIndex().filter((f) => f.ownerId === ownerId);
}

/**
 * Deletes the bytes and the index rows for this account.
 *
 * The only place `purgeFile` is called from. Everywhere else detaches, because
 * a pilot removing a rejected licence must not erase why it was rejected — but
 * an account being deleted is exactly when the bytes should actually go.
 */
export function purgeFilesOwnedBy(ownerId: string): number {
  const mine = filesOwnedBy(ownerId);
  for (const file of mine) purgeFile(file.id);
  return mine.length;
}

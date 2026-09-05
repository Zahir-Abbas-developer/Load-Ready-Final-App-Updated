/**
 * The conversation on a job, and the proof attached to it.
 *
 * Replaces the trip channel from C2, which was keyed on a "trip id" the client
 * chose and guarded by "the first two accounts to touch it own it" — an
 * interim rule that said so in its own comment and has been BACKLOG F-30 ever
 * since. An assignment names exactly two people, so it is the key, and the
 * route checks membership against it before anything here is called.
 *
 * On disk rather than in memory: losing a conversation on deploy is visible
 * and annoying in a way that losing a GPS ping was not.
 *
 * Never import this from client code.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";
import type { Message, Proof } from "@/lib/messaging/types";

const DATA_FILE = dataFile("messages.json");

/** Enough to settle an argument about a job; not a permanent archive. */
export const MAX_PER_ASSIGNMENT = 500;

interface Db {
  messages: Message[];
  proofs: Proof[];
}

let db: Db | null = null;

const newId = () => randomBytes(12).toString("hex");

function load(): Db {
  if (db) return db;
  if (!existsSync(DATA_FILE)) {
    db = { messages: [], proofs: [] };
    return db;
  }
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<Db>;
    db = {
      messages: Array.isArray(raw.messages) ? raw.messages : [],
      proofs: Array.isArray(raw.proofs) ? raw.proofs : [],
    };
  } catch (err) {
    console.error("[messages] could not read the store, starting empty", err);
    db = { messages: [], proofs: [] };
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

// ── live fan-out ───────────────────────────────────────────────────────────

export type ChatEvent =
  { kind: "message"; message: Message } | { kind: "read"; by: string; at: string };

type Listener = (event: ChatEvent) => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribe(assignmentId: string, listener: Listener): () => void {
  const set = listeners.get(assignmentId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(assignmentId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(assignmentId);
  };
}

function emit(assignmentId: string, event: ChatEvent) {
  for (const listener of listeners.get(assignmentId) ?? []) {
    try {
      listener(event);
    } catch (err) {
      console.error("[messages] a listener threw", err);
    }
  }
}

// ── messages ───────────────────────────────────────────────────────────────

export function recordMessage(input: {
  assignmentId: string;
  senderId: string;
  senderRole: "pilot" | "dispatcher";
  senderName: string;
  body: string;
  attachmentIds?: string[];
  now?: number;
}): Message {
  const store = load();
  const message: Message = {
    id: newId(),
    assignmentId: input.assignmentId,
    senderId: input.senderId,
    senderRole: input.senderRole,
    senderName: input.senderName,
    body: input.body.trim(),
    attachmentIds: input.attachmentIds ?? [],
    createdAt: new Date(input.now ?? Date.now()).toISOString(),
    readAt: null,
  };

  // Trimmed per job, so a chatty job cannot age out a quiet one's history.
  const mine = [
    ...store.messages.filter((m) => m.assignmentId === input.assignmentId),
    message,
  ].slice(-MAX_PER_ASSIGNMENT);
  const others = store.messages.filter((m) => m.assignmentId !== input.assignmentId);

  save({ ...store, messages: [...others, ...mine] });
  emit(input.assignmentId, { kind: "message", message });
  return message;
}

export const messagesOn = (assignmentId: string): Message[] =>
  load()
    .messages.filter((m) => m.assignmentId === assignmentId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

/**
 * Marks the other side's messages read.
 *
 * Never your own: a read receipt that you set on your own message tells the
 * other person nothing, and would make the unread badge lie.
 */
export function markRead(assignmentId: string, readerId: string, now = Date.now()): number {
  const store = load();
  const at = new Date(now).toISOString();
  let changed = 0;

  const messages = store.messages.map((m) => {
    if (m.assignmentId !== assignmentId || m.senderId === readerId || m.readAt) return m;
    changed += 1;
    return { ...m, readAt: at };
  });

  if (changed > 0) {
    save({ ...store, messages });
    emit(assignmentId, { kind: "read", by: readerId, at });
  }
  return changed;
}

/** What this person has not read on this job. */
export const unreadOn = (assignmentId: string, readerId: string): number =>
  load().messages.filter(
    (m) => m.assignmentId === assignmentId && m.senderId !== readerId && !m.readAt,
  ).length;

// ── proof ──────────────────────────────────────────────────────────────────

export function recordProof(input: Omit<Proof, "id" | "createdAt"> & { now?: number }): Proof {
  const store = load();
  const proof: Proof = {
    id: newId(),
    assignmentId: input.assignmentId,
    kind: input.kind,
    fileId: input.fileId,
    note: input.note,
    position: input.position,
    createdBy: input.createdBy,
    createdAt: new Date(input.now ?? Date.now()).toISOString(),
  };
  save({ ...store, proofs: [...store.proofs, proof] });
  return proof;
}

export const proofsOn = (assignmentId: string): Proof[] =>
  load()
    .proofs.filter((p) => p.assignmentId === assignmentId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

/**
 * Removes a proof the caller added.
 *
 * Only their own, and only their own: proof somebody else attached is part of
 * the record they are relying on, not something to be tidied away by the other
 * party to the argument.
 */
export function removeProof(proofId: string, ownerId: string): boolean {
  const store = load();
  const proof = store.proofs.find((p) => p.id === proofId && p.createdBy === ownerId);
  if (!proof) return false;
  save({ ...store, proofs: store.proofs.filter((p) => p.id !== proofId) });
  return true;
}

// ── data rights ────────────────────────────────────────────────────────────

/**
 * Only this person's own words.
 *
 * A conversation has two sides and the other side's messages are theirs, not
 * this person's to take away — the same rule the export has followed since G2.
 */
export const messagesBy = (senderId: string): Message[] =>
  load().messages.filter((m) => m.senderId === senderId);

export const proofsBy = (userId: string): Proof[] =>
  load().proofs.filter((p) => p.createdBy === userId);

export function deleteMessagesBy(senderId: string): number {
  const store = load();
  const messages = store.messages.filter((m) => m.senderId !== senderId);
  const proofs = store.proofs.filter((p) => p.createdBy !== senderId);
  const removed = store.messages.length - messages.length + (store.proofs.length - proofs.length);
  save({ messages, proofs });
  return removed;
}

/** Test seam. */
export function resetMessageStore() {
  db = { messages: [], proofs: [] };
  listeners.clear();
}

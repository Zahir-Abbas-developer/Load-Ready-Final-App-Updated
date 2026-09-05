/**
 * Messages and proof, on a job.
 *
 * Both are scoped to an **assignment** rather than a load or a "trip id". That
 * is the whole point of this phase: the old channel let any signed-in account
 * read any trip id it could guess, and the interim guard was "the first two
 * accounts to touch it own it" (BACKLOG F-30, open since C2). An assignment
 * already names exactly two people, so it is the right key and always was —
 * there just were not any assignments yet.
 */

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_ATTACHMENTS = 4;

export interface Message {
  id: string;
  assignmentId: string;
  senderId: string;
  senderRole: "pilot" | "dispatcher";
  /** Denormalised so a message reads correctly after somebody's name changes. */
  senderName: string;
  body: string;
  /** Ids in the file store. Photos of a permit, a yard gate, a damaged load. */
  attachmentIds: string[];
  createdAt: string;
  /** When the other party read it. Null until they do. */
  readAt: string | null;
}

export type ProofKind = "photo" | "note";

/**
 * Evidence that the job happened as described.
 *
 * A photo of the load at the yard, a note about a two-hour wait. Geotagged
 * from the position the pilot's device last reported — not from a coordinate
 * the app supplies, because the point of proof is that it is not assertible.
 */
export interface Proof {
  id: string;
  assignmentId: string;
  kind: ProofKind;
  fileId: string | null;
  note: string | null;
  /** Where they were when they added it, if location was being shared. */
  position: { lng: number; lat: number; accuracy: number } | null;
  createdBy: string;
  createdAt: string;
}

export interface ProofCheck {
  ok: boolean;
  reason?: string;
}

export function checkProof(input: {
  kind: ProofKind;
  fileId?: string | null;
  note?: string | null;
}): ProofCheck {
  if (input.kind === "photo" && !input.fileId) {
    return { ok: false, reason: "Attach the photo first." };
  }
  if (input.kind === "note" && !(input.note ?? "").trim()) {
    return { ok: false, reason: "Write what happened." };
  }
  if ((input.note ?? "").length > 1000) {
    return { ok: false, reason: "Keep it under 1000 characters." };
  }
  return { ok: true };
}

export function checkMessage(body: string, attachmentIds: string[]): ProofCheck {
  const trimmed = body.trim();
  if (!trimmed && attachmentIds.length === 0) {
    return { ok: false, reason: "Nothing to send." };
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, reason: `Keep it under ${MAX_MESSAGE_LENGTH} characters.` };
  }
  if (attachmentIds.length > MAX_ATTACHMENTS) {
    return { ok: false, reason: `At most ${MAX_ATTACHMENTS} attachments.` };
  }
  return { ok: true };
}

// ── detention ──────────────────────────────────────────────────────────────

/**
 * How long the pilot waited at the pickup.
 *
 * Between arriving and the load moving. This is the number a detention
 * argument is actually about, and it comes from the two timestamps the pilot
 * set on the road rather than from anybody's recollection afterwards.
 *
 * Null when the job never reached one of those steps — an escort that was
 * cancelled at the yard has no detention figure, it has a cancellation.
 */
export function detentionMs(
  history: Array<{ status: string; at: string }>,
  now: number | null = null,
): number | null {
  const arrived = history.find((h) => h.status === "on_site");
  if (!arrived) return null;

  const rolling = history.find((h) => h.status === "escorting");
  const start = Date.parse(arrived.at);
  if (!Number.isFinite(start)) return null;

  // Still waiting: measured against the clock, so the timer runs on screen.
  const end = rolling ? Date.parse(rolling.at) : now;
  if (end === null || !Number.isFinite(end)) return null;

  return Math.max(0, end - start);
}

/** Total time on the job, from setting off to finishing. */
export function elapsedMs(history: Array<{ status: string; at: string }>): number | null {
  const started = history.find((h) => h.status === "en_route");
  const finished = history.find((h) => h.status === "completed");
  if (!started || !finished) return null;

  const from = Date.parse(started.at);
  const to = Date.parse(finished.at);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, to - from);
}

/** "2 h 15 min", the way a dispatcher writes it on an invoice. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

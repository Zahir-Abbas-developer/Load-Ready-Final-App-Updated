/**
 * Two-way ratings, and the blind window that makes them worth reading.
 *
 * A rating is written after a job and **hidden until the other side has
 * written theirs, or fourteen days have passed**. That one rule is the whole
 * design: if you can read what somebody said about you before you write about
 * them, ratings become negotiation — "change mine and I'll change yours" — and
 * a five-star average that means nothing.
 *
 * Fourteen days rather than never, because a pilot who does good work should
 * not be held hostage by a dispatcher who simply never rates anybody.
 *
 * Ratings are immutable once written, for the same reason: a score you can
 * revise after seeing the reply is a score somebody can be leaned on to change.
 */

export type RaterRole = "pilot" | "dispatcher";

export interface Rating {
  id: string;
  assignmentId: string;
  loadId: string;
  /** Who wrote it. */
  raterId: string;
  raterRole: RaterRole;
  /** Who it is about. */
  rateeId: string;
  /** 1–5. */
  score: number;
  comment: string | null;
  createdAt: string;
}

export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

/** How long a rating stays hidden when the other side never writes one. */
export const BLIND_DAYS = 14;
const BLIND_MS = BLIND_DAYS * 86_400_000;

export interface RatingCheck {
  ok: boolean;
  reason?: string;
}

export function checkRating(input: { score: number; comment?: string | null }): RatingCheck {
  if (!Number.isInteger(input.score) || input.score < MIN_SCORE || input.score > MAX_SCORE) {
    return { ok: false, reason: `Give a score from ${MIN_SCORE} to ${MAX_SCORE}.` };
  }
  if ((input.comment ?? "").length > 1000) {
    return { ok: false, reason: "Keep the comment under 1000 characters." };
  }
  return { ok: true };
}

/**
 * Whether a rating can be read yet.
 *
 * `counterpart` is the other side's rating on the same assignment, when it
 * exists. Both present means both are visible immediately; otherwise the clock
 * runs from when this one was written.
 */
export function isVisible(rating: Rating, counterpart: Rating | null, now = Date.now()): boolean {
  if (counterpart) return true;
  const written = Date.parse(rating.createdAt);
  if (!Number.isFinite(written)) return false;
  return now - written >= BLIND_MS;
}

/** When it becomes readable, for telling the writer "your rating shows on the 12th". */
export function visibleAt(rating: Rating, counterpart: Rating | null): string | null {
  if (counterpart) return null;
  const written = Date.parse(rating.createdAt);
  if (!Number.isFinite(written)) return null;
  return new Date(written + BLIND_MS).toISOString();
}

export interface Aggregate {
  /** Rounded to one decimal, or null when there is nothing to average. */
  average: number | null;
  count: number;
}

/**
 * Someone's score, from the ratings that are actually readable.
 *
 * Hidden ratings are excluded on purpose. An average that moves before anybody
 * can see why is worse than no average — and rule 7 says a number we cannot
 * stand behind does not go on a screen.
 */
export function aggregate(visible: Rating[]): Aggregate {
  if (visible.length === 0) return { average: null, count: 0 };
  const total = visible.reduce((sum, r) => sum + r.score, 0);
  return {
    average: Math.round((total / visible.length) * 10) / 10,
    count: visible.length,
  };
}

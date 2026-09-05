/**
 * When a message may go out, and what to do when it does not.
 *
 * Pure, so every rule here can be tested against a clock rather than waited on.
 */
import type { Channel, NotificationEvent } from "./catalog";

// ── quiet hours ────────────────────────────────────────────────────────────

export interface QuietHours {
  enabled: boolean;
  /** Local wall-clock, "HH:MM". May wrap midnight, and usually does. */
  from: string;
  to: string;
}

export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: true, from: "21:00", to: "07:00" };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isClockTime = (value: string): boolean => HHMM.test(value);

const minutes = (hhmm: string): number => {
  const m = HHMM.exec(hhmm);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
};

/**
 * The local wall-clock minute in someone's own zone.
 *
 * Via `Intl` rather than an offset table: a pilot in Phoenix and one in Denver
 * are in the same offset for half the year and not the other half, and getting
 * that wrong means messaging somebody at four in the morning.
 */
export function localMinutes(at: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(at));
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return (hour % 24) * 60 + minute;
  } catch {
    // An unknown zone should not silence somebody's notifications.
    return new Date(at).getUTCHours() * 60 + new Date(at).getUTCMinutes();
  }
}

export function inQuietHours(quiet: QuietHours, at: number, timeZone: string): boolean {
  if (!quiet.enabled) return false;
  if (!isClockTime(quiet.from) || !isClockTime(quiet.to)) return false;

  const now = localMinutes(at, timeZone);
  const from = minutes(quiet.from);
  const to = minutes(quiet.to);

  // 21:00 → 07:00 wraps midnight, which is the normal case rather than the
  // exception, so it is handled first.
  return from > to ? now >= from || now < to : now >= from && now < to;
}

/** The next moment quiet hours end, as a timestamp. */
export function quietHoursEnd(quiet: QuietHours, at: number, timeZone: string): number {
  const now = localMinutes(at, timeZone);
  const to = minutes(quiet.to);
  const minutesAway = to > now ? to - now : 24 * 60 - now + to;
  return at + minutesAway * 60_000;
}

// ── the decision ───────────────────────────────────────────────────────────

export interface SendDecision {
  /** `null` means send now. */
  holdUntil: number | null;
  /** Why it is held, for the delivery log and for the person asking. */
  reason?: string;
}

/**
 * Whether an outbound message goes now or waits.
 *
 * In-app is never held: it is a list in the app, not an interruption, and
 * holding it would mean the record of being hired arrives after the job.
 */
export function whenToSend(args: {
  channel: Channel;
  urgent: boolean;
  quiet: QuietHours;
  timeZone: string;
  now: number;
}): SendDecision {
  if (args.channel === "in_app") return { holdUntil: null };
  if (args.urgent) return { holdUntil: null };
  if (!inQuietHours(args.quiet, args.now, args.timeZone)) return { holdUntil: null };

  return {
    holdUntil: quietHoursEnd(args.quiet, args.now, args.timeZone),
    reason: "Held until quiet hours end.",
  };
}

// ── retries ────────────────────────────────────────────────────────────────

/**
 * How long to wait before trying again, per attempt already made.
 *
 * Long tail on purpose. A provider that is down is usually down for minutes,
 * not seconds, and retrying every ten seconds turns one outage into a
 * self-inflicted flood.
 */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 25 * 60_000, 2 * 3_600_000, 10 * 3_600_000];

export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** `null` once it has run out of attempts and belongs in the dead-letter list. */
export function nextAttemptAt(attempts: number, now: number): number | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return now + RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
}

// ── idempotency ────────────────────────────────────────────────────────────

/**
 * One key per (person, event, subject, channel).
 *
 * The same hiring emailed twice is a support call, and the fan-out runs from
 * places that can retry — a re-posted form, a double tap on a slow connection.
 */
export function deliveryKey(args: {
  userId: string;
  event: NotificationEvent;
  subject: string;
  channel: Channel;
}): string {
  return [args.userId, args.event, args.subject, args.channel].join("|");
}

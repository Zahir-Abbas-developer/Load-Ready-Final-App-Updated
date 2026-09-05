/**
 * When a pilot's location may be recorded, and how often.
 *
 * Location is the most sensitive thing this product touches. Somebody's
 * movements over a week say where they live, who they see and when they are
 * away from home — so the rules are narrow, they are here where they can be
 * tested, and they are enforced on the server rather than in the app that
 * sends the positions.
 *
 * The three that matter:
 *
 * - **Only during an active job.** Not while a job is merely assigned, not
 *   after it finishes, and never otherwise. A pilot who is online and waiting
 *   for work is not tracked (ADR-6).
 * - **Only enough to be useful.** A fix every thirty seconds, or every two
 *   hundred metres, whichever comes first. A phone can produce one a second;
 *   storing that is a battery bill for the pilot and a surveillance record for
 *   us, in exchange for nothing a dispatcher can use.
 * - **Not kept forever.** Ninety days, then it goes.
 */
import type { AssignmentStatus } from "@/lib/marketplace/offers";

/**
 * The statuses during which a pilot is actually escorting something.
 *
 * `assigned` is deliberately absent: the job may be three days away, and there
 * is no version of "we track you from the moment you are hired" that a driver
 * would agree to if it were spelled out.
 */
export const TRACKED_STATUSES: AssignmentStatus[] = ["en_route", "on_site", "escorting"];

export const isTrackable = (status: AssignmentStatus): boolean => TRACKED_STATUSES.includes(status);

/** Sampling floor, in milliseconds. */
export const MIN_INTERVAL_MS = 30_000;

/** Sampling floor, in metres. A yard manoeuvre is not a position update. */
export const MIN_DISTANCE_M = 200;

/** How long a position lives before the sweep removes it. */
export const RETENTION_DAYS = 90;
export const RETENTION_MS = RETENTION_DAYS * 86_400_000;

export interface Position {
  lng: number;
  lat: number;
  /** Metres. From the device; large numbers mean a poor fix. */
  accuracy: number;
  /** Degrees, 0 = north. Null when the device cannot tell. */
  heading: number | null;
  /** Miles per hour. Null when the device cannot tell. */
  speed: number | null;
  /** Milliseconds since the epoch, from the device. */
  at: number;
}

/**
 * A fix so poor it says nothing.
 *
 * Half a kilometre of uncertainty on an escort that is supposed to be beside a
 * truck is not a position, it is a guess — and drawing it on a dispatcher's map
 * as a truck is worse than drawing nothing.
 */
export const MAX_ACCURACY_M = 500;

export interface PositionCheck {
  ok: boolean;
  reason?: string;
}

export function checkPosition(p: Partial<Position>, now = Date.now()): PositionCheck {
  const { lng, lat } = p;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return { ok: false, reason: "That is not a position." };
  }
  if (lng! < -180 || lng! > 180 || lat! < -90 || lat! > 90) {
    return { ok: false, reason: "That is not a position." };
  }
  if (Number.isFinite(p.accuracy) && p.accuracy! > MAX_ACCURACY_M) {
    return { ok: false, reason: "The fix is too rough to be worth recording." };
  }
  /*
   * A timestamp from the future is a clock that is wrong, and one from last
   * month is a queue that should have been dropped. Neither belongs on a map
   * that somebody is using to decide whether an escort has arrived.
   */
  const at = Number(p.at);
  if (!Number.isFinite(at) || at > now + 5 * 60_000 || at < now - RETENTION_MS) {
    return { ok: false, reason: "That fix is not from now." };
  }
  return { ok: true };
}

/**
 * Great-circle distance in metres.
 *
 * Haversine rather than a flat approximation: an escort run can cross several
 * degrees of longitude, and the flat version is wrong by enough at those
 * distances to change whether a fix is recorded.
 */
export function haversineMeters(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Whether this fix is worth keeping, given the last one that was.
 *
 * The first fix of a job always is — otherwise a dispatcher watching a pilot
 * set off sees nothing for half a minute and assumes it is broken.
 */
export function shouldRecord(next: Position, last: Position | null): boolean {
  if (!last) return true;
  if (next.at - last.at >= MIN_INTERVAL_MS) return true;
  return haversineMeters(next, last) >= MIN_DISTANCE_M;
}

/** Whether a position is old enough for the retention sweep to remove it. */
export const isExpired = (p: { at: number }, now = Date.now()): boolean =>
  now - p.at > RETENTION_MS;

// ── what the dispatcher is told about staleness ───────────────────────────

/**
 * After this long with no fix, the map is showing history rather than a truck.
 *
 * Said out loud on the screen. A dispatcher looking at a marker that has not
 * moved for twenty minutes needs to know whether the escort has stopped or the
 * phone has — those are very different problems.
 */
export const STALE_AFTER_MS = 3 * MIN_INTERVAL_MS;

export function lastSeenLabel(at: number | null, now = Date.now()): string {
  if (at === null) return "No position yet";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(at).toLocaleString();
}

export const isStale = (at: number | null, now = Date.now()): boolean =>
  at === null || now - at > STALE_AFTER_MS;

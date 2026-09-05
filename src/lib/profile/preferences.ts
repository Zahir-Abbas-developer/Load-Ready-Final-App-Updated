/**
 * Per-user display and notification preferences.
 *
 * Shared between client and server. Separate from the pilot profile and the
 * dispatcher company on purpose: an administrator has preferences too, and
 * these belong to the person rather than to the role they trade in.
 */

import { DEFAULT_QUIET_HOURS, type QuietHours } from "@/lib/notifications/delivery";

export type { QuietHours };

/** D7: miles/mph in the US, km/km-h in Canada, with a per-user override. */
export type Units = "imperial" | "metric";

export interface NotificationPreferences {
  /** New loads matching this pilot's regions and equipment. */
  matchingLoads: boolean;
  /** Offers, bids and assignment changes. */
  assignments: boolean;
  /** Messages on an active trip. */
  messages: boolean;
  /** Certification or insurance about to lapse. Not switchable — see below. */
  documentExpiry: true;
  /** Approvals and document reviews. */
  account: boolean;
  /** Trial ending, payment problems. Pilots only — dispatchers never see billing (ADR-1). */
  billing: boolean;
  /** Product news. Off unless asked for. */
  marketing: boolean;
}

export interface Preferences {
  userId: string;
  units: Units;
  /** IANA zone, e.g. "America/Chicago". */
  timeZone: string;
  notify: NotificationPreferences;
  /**
   * When not to be emailed.
   *
   * Applies to the person's local wall clock, which is why the zone above is
   * not decoration. Urgent things — being hired for tomorrow, a certificate
   * lapsing tonight — go through anyway, because they change what somebody has
   * to do in the morning.
   */
  quietHours: QuietHours;
  updatedAt: string;
}

/**
 * Country decides the default, the user decides the rest.
 *
 * A Canadian pilot handed miles has to convert every permit width in their
 * head; an American handed kilometres has the same problem in reverse.
 */
export function defaultUnits(country: string | null | undefined): Units {
  return country === "CA" ? "metric" : "imperial";
}

export function defaultPreferences(userId: string, country?: string | null): Preferences {
  return {
    userId,
    units: defaultUnits(country),
    timeZone: "America/Chicago",
    quietHours: { ...DEFAULT_QUIET_HOURS },
    notify: {
      matchingLoads: true,
      assignments: true,
      messages: true,
      account: true,
      billing: true,
      // Deliberately not optional. A pilot who switches off the warning that
      // their insurance is about to lapse arrives at a job uninsured, and the
      // dispatcher who hired them carries that. Everything else can be muted.
      documentExpiry: true,
      marketing: false,
    },
    updatedAt: new Date(0).toISOString(),
  };
}

export const UNIT_LABELS: Record<Units, { distance: string; speed: string; label: string }> = {
  imperial: { distance: "mi", speed: "mph", label: "Miles and mph" },
  metric: { distance: "km", speed: "km/h", label: "Kilometres and km/h" },
};

/** Distance as the viewer prefers to read it. Stored canonically in miles. */
export function formatDistance(miles: number, units: Units): string {
  return units === "metric" ? `${Math.round(miles * 1.60934)} km` : `${Math.round(miles)} mi`;
}

export function formatSpeed(mph: number, units: Units): string {
  return units === "metric" ? `${Math.round(mph * 1.60934)} km/h` : `${Math.round(mph)} mph`;
}

/**
 * The zones we offer. Not the full IANA list — a driver picking their zone from
 * six hundred entries is worse served than one picking from the fifteen that
 * cover the US and Canada.
 */
export const TIME_ZONES = [
  { id: "America/St_Johns", label: "Newfoundland" },
  { id: "America/Halifax", label: "Atlantic" },
  { id: "America/Toronto", label: "Eastern" },
  { id: "America/Chicago", label: "Central" },
  { id: "America/Denver", label: "Mountain" },
  { id: "America/Phoenix", label: "Arizona (no DST)" },
  { id: "America/Los_Angeles", label: "Pacific" },
  { id: "America/Anchorage", label: "Alaska" },
  { id: "Pacific/Honolulu", label: "Hawaii" },
] as const;

const ZONE_IDS = new Set(TIME_ZONES.map((z) => z.id as string));
export const isTimeZone = (id: string) => ZONE_IDS.has(id);

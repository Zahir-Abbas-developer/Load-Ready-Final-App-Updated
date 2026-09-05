/**
 * Per-user preferences, on the server.
 *
 * Small enough to share a file with the profiles, but kept apart because these
 * belong to the person rather than the role: an administrator has a time zone
 * too, and they have no pilot profile to hang it on.
 *
 * Never import this from client code.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";
import {
  defaultPreferences,
  isTimeZone,
  type NotificationPreferences,
  type Preferences,
} from "@/lib/profile/preferences";
import { isClockTime } from "@/lib/notifications/delivery";

const DATA_FILE = dataFile("preferences.json");

let db: Preferences[] | null = null;

function load(): Preferences[] {
  if (db) return db;
  if (!existsSync(DATA_FILE)) {
    db = [];
    return db;
  }
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8"));
    db = Array.isArray(raw) ? raw : [];
  } catch (err) {
    console.warn("[preferences] could not read the store, starting empty", err);
    db = [];
  }
  return db;
}

function save(next: Preferences[]) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, DATA_FILE);
  db = next;
}

export function preferencesFor(userId: string, country?: string | null): Preferences {
  const found = load().find((p) => p.userId === userId);
  if (!found) return defaultPreferences(userId, country);

  // Merge over the defaults so a preference added later is present for
  // everyone who saved before it existed, rather than arriving as undefined.
  const base = defaultPreferences(userId, country);
  return {
    ...base,
    ...found,
    notify: { ...base.notify, ...found.notify },
    quietHours: { ...base.quietHours, ...found.quietHours },
  };
}

export interface PreferencePatch {
  units?: unknown;
  timeZone?: unknown;
  notify?: Record<string, unknown>;
  quietHours?: Record<string, unknown>;
}

/**
 * Applies a patch, validating every field.
 *
 * `documentExpiry` is deliberately not settable: a pilot who mutes the warning
 * that their insurance is about to lapse turns up to a job uninsured, and the
 * dispatcher who hired them carries that. Everything else can be switched off.
 */
export function updatePreferences(
  userId: string,
  patch: PreferencePatch,
  country?: string | null,
): Preferences {
  const current = preferencesFor(userId, country);

  const notify: NotificationPreferences = { ...current.notify };
  if (patch.notify && typeof patch.notify === "object") {
    for (const key of [
      "matchingLoads",
      "assignments",
      "messages",
      "account",
      "billing",
      "marketing",
    ] as const) {
      if (key in patch.notify) notify[key] = patch.notify[key] === true;
    }
  }

  /*
   * Quiet hours are validated rather than trusted. A "from" of "25:99" that
   * reached the store would silently mean "never quiet" — the person would
   * think they had set it and get emailed at four in the morning.
   */
  const quietHours = { ...current.quietHours };
  if (patch.quietHours && typeof patch.quietHours === "object") {
    if ("enabled" in patch.quietHours) quietHours.enabled = patch.quietHours.enabled === true;
    for (const key of ["from", "to"] as const) {
      const value = patch.quietHours[key];
      if (typeof value === "string" && isClockTime(value)) quietHours[key] = value;
    }
  }

  const next: Preferences = {
    ...current,
    quietHours,
    units:
      patch.units === "metric" ? "metric" : patch.units === "imperial" ? "imperial" : current.units,
    timeZone:
      typeof patch.timeZone === "string" && isTimeZone(patch.timeZone)
        ? patch.timeZone
        : current.timeZone,
    notify,
    updatedAt: new Date().toISOString(),
  };

  save([...load().filter((p) => p.userId !== userId), next]);
  return next;
}

/** Test seam. */
export function resetPreferencesStore() {
  db = [];
}

/** Removes this account's settings. */
export function deletePreferences(userId: string): boolean {
  const existing = load().some((p) => p.userId === userId);
  if (existing) save(load().filter((p) => p.userId !== userId));
  return existing;
}

/**
 * The switches, on the server.
 *
 * Read on every mutating request through `authorize`, so it is deliberately
 * tiny and cached in memory: a kill switch that costs a disk read per request
 * is one somebody will be tempted to check less often.
 *
 * Never import this from client code.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";
import {
  DEFAULT_SETTINGS,
  FLAG_IDS,
  MAX_ANNOUNCEMENT,
  isFlagId,
  type Settings,
} from "@/lib/settings/flags";

const DATA_FILE = dataFile("settings.json");

let cache: Settings | null = null;

export function settings(): Settings {
  if (cache) return cache;
  if (!existsSync(DATA_FILE)) {
    cache = { ...DEFAULT_SETTINGS, flags: { ...DEFAULT_SETTINGS.flags } };
    return cache;
  }
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<Settings>;
    cache = {
      ...DEFAULT_SETTINGS,
      ...raw,
      // Merged over the defaults so a flag added later is on for everybody
      // rather than arriving as undefined and reading as off.
      flags: { ...DEFAULT_SETTINGS.flags, ...(raw.flags ?? {}) },
    };
  } catch (err) {
    /*
     * A settings file we cannot read must not turn every feature off.
     *
     * The failure mode matters: falling back to "everything closed" would
     * mean one corrupt file takes the marketplace down, which is a worse
     * outcome than running with the defaults and shouting about it.
     */
    console.error("[settings] could not read the store, using defaults", err);
    cache = { ...DEFAULT_SETTINGS, flags: { ...DEFAULT_SETTINGS.flags } };
  }
  return cache;
}

function save(next: Settings) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, DATA_FILE);
  cache = next;
}

export interface SettingsPatch {
  flags?: Record<string, unknown>;
  announcement?: unknown;
}

/** Applies a patch, validating every field. Returns what is now in force. */
export function updateSettings(patch: SettingsPatch, actorEmail: string): Settings {
  const current = settings();
  const flags = { ...current.flags };

  if (patch.flags && typeof patch.flags === "object") {
    for (const [key, value] of Object.entries(patch.flags)) {
      // Only flags that exist, and only as booleans: an unknown key silently
      // stored would look set in the file and do nothing.
      if (isFlagId(key)) flags[key] = value === true;
    }
  }

  const announcement =
    typeof patch.announcement === "string"
      ? patch.announcement.trim().slice(0, MAX_ANNOUNCEMENT)
      : current.announcement;

  const next: Settings = {
    flags,
    announcement,
    updatedAt: new Date().toISOString(),
    updatedBy: actorEmail,
  };
  save(next);
  return next;
}

/** Which flags are currently off, for the audit entry and the dashboard. */
export const closedFlags = (): string[] => FLAG_IDS.filter((id) => settings().flags[id] === false);

/** Test seam. */
export function resetSettings() {
  cache = { ...DEFAULT_SETTINGS, flags: { ...DEFAULT_SETTINGS.flags } };
}

/**
 * Which devices to wake, on the web and in the native app.
 *
 * One row per browser or installed app that has agreed to be notified. Two
 * kinds, because the two arrive completely differently:
 *
 * - **web** — an opaque endpoint URL from the browser's own push service. It
 *   is the address of a mailbox at Google's or Apple's or Mozilla's, not an
 *   address of the device: it says nothing about where a phone is or whose it
 *   is. We send **no payload** to it (`vapid.server.ts`).
 * - **native** — a registration token from Firebase, which is how the shell
 *   receives notifications on both platforms. Also opaque, also revocable, and
 *   it too carries no message content.
 *
 * What is deliberately **not** stored for the web kind: the `p256dh` and
 * `auth` keys a browser also offers. They exist to encrypt a payload, we send
 * none, and a key kept for a use we do not have is a key that can leak.
 *
 * Never import this from client code.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { dataFile } from "./data-dir";
import type { NativePlatform } from "@/lib/mobile/native";

const DATA_FILE = dataFile("push-subscriptions.json");

interface DeviceBase {
  id: string;
  userId: string;
  /** "Chrome on Android", from the browser's own reading of itself. */
  label: string;
  createdAt: string;
  /** Updated whenever a push to it succeeds. */
  lastSeenAt: string;
}

export interface WebDevice extends DeviceBase {
  kind: "web";
  /** The push service's URL for this browser. Opaque, and treated as such. */
  endpoint: string;
}

export interface NativeDevice extends DeviceBase {
  kind: "native";
  platform: NativePlatform;
  /** The Firebase registration token for this installation. */
  token: string;
}

export type Device = WebDevice | NativeDevice;

/** Kept as the old name because it is what the rest of the app imports. */
export type PushSubscriptionRecord = Device;

/**
 * The one string that identifies a device, whichever kind it is.
 *
 * Used for the uniqueness rule below and for "forget this one", so both work
 * the same way for a browser and for an installed app.
 */
export const deviceKey = (device: Device): string =>
  device.kind === "web" ? device.endpoint : device.token;

let db: Device[] | null = null;

function load(): Device[] {
  if (db) return db;
  if (!existsSync(DATA_FILE)) {
    db = [];
    return db;
  }
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8"));
    // Rows written before the native kind existed have no `kind` and are web.
    db = Array.isArray(raw)
      ? (raw as Record<string, unknown>[]).map((r) =>
          r.kind ? (r as unknown as Device) : ({ ...r, kind: "web" } as unknown as Device),
        )
      : [];
  } catch (err) {
    console.warn("[push] could not read the store, starting empty", err);
    db = [];
  }
  return db;
}

function save(next: Device[]) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, DATA_FILE);
  db = next;
}

/** A device label short enough for a list and long enough to recognise. */
const cleanLabel = (value: unknown): string => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, 60) || "A browser";
};

/**
 * Puts a device on an account, taking it from whoever held it.
 *
 * **A device belongs to exactly one account.** A phone shared by two pilots, or
 * a demo laptop passed around an office, registers again under the second
 * person — and if the first row survived, the first person's account would keep
 * waking a device that now belongs to somebody else. On the web that is worse
 * still, because the service worker fetches the notification itself: it would
 * read the second person's notifications with the second person's cookie.
 */
function put(device: Device): Device {
  const key = deviceKey(device);
  save([...load().filter((d) => deviceKey(d) !== key), device]);
  return device;
}

const base = (userId: string, label: unknown, now?: number): DeviceBase => {
  const at = new Date(now ?? Date.now()).toISOString();
  return {
    id: randomBytes(12).toString("hex"),
    userId,
    label: cleanLabel(label),
    createdAt: at,
    lastSeenAt: at,
  };
};

/** Registers a browser for Web Push. */
export function registerDevice(input: {
  userId: string;
  endpoint: string;
  label?: unknown;
  now?: number;
}): Device {
  return put({
    ...base(input.userId, input.label, input.now),
    kind: "web",
    endpoint: input.endpoint,
  });
}

/** Registers an installation of the native app for Firebase push. */
export function registerNativeDevice(input: {
  userId: string;
  platform: NativePlatform;
  token: string;
  label?: unknown;
  now?: number;
}): Device {
  return put({
    ...base(
      input.userId,
      input.label ?? `LoadReady on ${input.platform === "ios" ? "iPhone" : "Android"}`,
      input.now,
    ),
    kind: "native",
    platform: input.platform,
    token: input.token,
  });
}

/**
 * Forgets one device.
 *
 * Scoped to the account so that knowing an endpoint or a token is not enough
 * to silence somebody else's phone.
 */
export function forgetDevice(userId: string, key: string): boolean {
  const before = load();
  const after = before.filter((d) => !(d.userId === userId && deviceKey(d) === key));
  if (after.length === before.length) return false;
  save(after);
  return true;
}

/** Drops a dead device, whoever it belonged to. Used by the senders. */
export function dropEndpoint(key: string): void {
  const before = load();
  const after = before.filter((d) => deviceKey(d) !== key);
  if (after.length !== before.length) save(after);
}

export function devicesFor(userId: string): Device[] {
  return load().filter((d) => d.userId === userId);
}

export function markSeen(key: string, now = Date.now()): void {
  const current = load();
  if (!current.some((d) => deviceKey(d) === key)) return;
  save(
    current.map((d) =>
      deviceKey(d) === key ? { ...d, lastSeenAt: new Date(now).toISOString() } : d,
    ),
  );
}

// ── data rights ────────────────────────────────────────────────────────────

/**
 * What goes in somebody's export.
 *
 * The endpoint and the token are left out on purpose: each is a live
 * credential for waking their phone, and an export is a file that ends up in
 * an inbox. The label and the dates answer the question somebody actually has,
 * which is "what is allowed to notify me".
 */
export function pushDataFor(userId: string) {
  return devicesFor(userId).map((d) => ({
    device: d.label,
    kind: d.kind === "native" ? "The LoadReady app" : "A browser",
    registered: d.createdAt,
    lastNotified: d.lastSeenAt,
  }));
}

export function deletePushData(userId: string): number {
  const before = load();
  const after = before.filter((d) => d.userId !== userId);
  const removed = before.length - after.length;
  if (removed) save(after);
  return removed;
}

/**
 * Test seam.
 *
 * Empties the store rather than dropping the cache. `db = null` would send the
 * next read back to the file, which still holds whatever the previous test
 * wrote — a reset that does not reset, and the kind that makes one test fail
 * because of another.
 */
export function resetPushStore() {
  db = [];
}

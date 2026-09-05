/**
 * Notifications, and the outbound queue behind them.
 *
 * Two things live here and they are deliberately separate:
 *
 * - **Notifications** are the list in the app. Written synchronously, read by
 *   the person they belong to, and never sent anywhere.
 * - **Deliveries** are attempts to reach somebody *outside* the app — email
 *   today. They are queued, retried with backoff, and end up either delivered
 *   or in the dead-letter list where somebody can see they failed.
 *
 * The split matters: a provider outage must not stop a pilot being told in the
 * app that they were hired, and a notification the app has shown must not be
 * re-sent because an email bounced.
 *
 * Never import this from client code.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";
import { deliveryKey, nextAttemptAt, MAX_ATTEMPTS } from "@/lib/notifications/delivery";
import type { Channel, NotificationEvent } from "@/lib/notifications/catalog";

const DATA_FILE = dataFile("notifications.json");

export interface Notification {
  id: string;
  userId: string;
  event: NotificationEvent;
  /** What it is about — a load id, a document id, an account id. */
  subject: string;
  title: string;
  body: string;
  /** Where tapping it should go, as an app-level hint rather than a URL. */
  target: { screen: "orders" | "loads" | "documents" | "billing" | "account"; id?: string } | null;
  readAt: string | null;
  createdAt: string;
}

export type DeliveryStatus = "queued" | "sent" | "failed" | "dead" | "skipped";

export interface Delivery {
  id: string;
  key: string;
  userId: string;
  event: NotificationEvent;
  subject: string;
  channel: Channel;
  to: string;
  subjectLine: string;
  body: string;
  status: DeliveryStatus;
  attempts: number;
  /** When the next attempt is due. Null once it is finished either way. */
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Db {
  notifications: Notification[];
  deliveries: Delivery[];
}

let db: Db | null = null;

const newId = () => randomBytes(12).toString("hex");

/**
 * How much history a person keeps.
 *
 * Old enough to answer "was I told?", small enough that the file stays a file.
 * The real answer is Postgres (BACKLOG F-01).
 */
export const MAX_PER_USER = 200;

function load(): Db {
  if (db) return db;
  if (!existsSync(DATA_FILE)) {
    db = { notifications: [], deliveries: [] };
    return db;
  }
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<Db>;
    db = {
      notifications: Array.isArray(raw.notifications) ? raw.notifications : [],
      deliveries: Array.isArray(raw.deliveries) ? raw.deliveries : [],
    };
  } catch (err) {
    console.error("[notifications] could not read the store, starting empty", err);
    db = { notifications: [], deliveries: [] };
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

// ── live delivery to an open app ───────────────────────────────────────────

type Listener = (notification: Notification) => void;
const listeners = new Map<string, Set<Listener>>();

/**
 * Pushes to an open tab.
 *
 * In memory, so it works for one server. A pilot whose app is shut still has
 * the notification waiting when they open it — this only decides whether they
 * see it now or on refresh.
 */
export function subscribe(userId: string, listener: Listener): () => void {
  const set = listeners.get(userId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(userId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(userId);
  };
}

function fanOutLive(notification: Notification) {
  for (const listener of listeners.get(notification.userId) ?? []) {
    try {
      listener(notification);
    } catch (err) {
      // One broken stream must not stop the others.
      console.error("[notifications] a listener threw", err);
    }
  }
}

// ── writing ────────────────────────────────────────────────────────────────

export function recordNotification(input: {
  userId: string;
  event: NotificationEvent;
  subject: string;
  title: string;
  body: string;
  target?: Notification["target"];
  now?: number;
}): Notification {
  const store = load();
  const at = new Date(input.now ?? Date.now()).toISOString();

  /*
   * The same thing is not said twice.
   *
   * The reminder sweep runs daily and the fan-out runs from places that can
   * retry, so without this a pilot opens the app to "your insurance expires in
   * 7 days" four times. The subject carries whatever makes one occurrence
   * different from the next — a day count, a status — so a genuinely new
   * message still gets through.
   */
  const already = store.notifications.find(
    (n) => n.userId === input.userId && n.event === input.event && n.subject === input.subject,
  );
  if (already) return already;

  const notification: Notification = {
    id: newId(),
    userId: input.userId,
    event: input.event,
    subject: input.subject,
    title: input.title,
    body: input.body,
    target: input.target ?? null,
    readAt: null,
    createdAt: at,
  };

  // Trimmed per person rather than globally, so a busy dispatcher cannot age
  // a quiet pilot's history out from under them.
  const mine = [notification, ...store.notifications.filter((n) => n.userId === input.userId)]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_PER_USER);
  const others = store.notifications.filter((n) => n.userId !== input.userId);

  save({ ...store, notifications: [...others, ...mine] });
  fanOutLive(notification);
  return notification;
}

/** Queues one outbound message, or returns the existing one if it is a repeat. */
export function queueDelivery(input: {
  userId: string;
  event: NotificationEvent;
  subject: string;
  channel: Channel;
  to: string;
  subjectLine: string;
  body: string;
  /** Set when quiet hours hold it back. */
  holdUntil?: number | null;
  now?: number;
}): { delivery: Delivery; duplicate: boolean } {
  const store = load();
  const key = deliveryKey({
    userId: input.userId,
    event: input.event,
    subject: input.subject,
    channel: input.channel,
  });

  const existing = store.deliveries.find((d) => d.key === key);
  // The same hiring emailed twice is a support call. The fan-out runs from
  // places that can retry, so this is the guard that makes it safe.
  if (existing) return { delivery: existing, duplicate: true };

  const now = input.now ?? Date.now();
  const at = new Date(now).toISOString();
  const delivery: Delivery = {
    id: newId(),
    key,
    userId: input.userId,
    event: input.event,
    subject: input.subject,
    channel: input.channel,
    to: input.to,
    subjectLine: input.subjectLine,
    body: input.body,
    status: "queued",
    attempts: 0,
    nextAttemptAt: new Date(input.holdUntil ?? now).toISOString(),
    lastError: null,
    createdAt: at,
    updatedAt: at,
  };

  save({ ...store, deliveries: [...store.deliveries, delivery] });
  return { delivery, duplicate: false };
}

/** Records that a channel was deliberately not used, so the log is complete. */
export function recordSkipped(input: {
  userId: string;
  event: NotificationEvent;
  subject: string;
  channel: Channel;
  reason: string;
  now?: number;
}): Delivery | null {
  const store = load();
  const key = deliveryKey(input);
  if (store.deliveries.some((d) => d.key === key)) return null;

  const at = new Date(input.now ?? Date.now()).toISOString();
  const delivery: Delivery = {
    id: newId(),
    key,
    userId: input.userId,
    event: input.event,
    subject: input.subject,
    channel: input.channel,
    to: "",
    subjectLine: "",
    body: "",
    status: "skipped",
    attempts: 0,
    nextAttemptAt: null,
    lastError: input.reason,
    createdAt: at,
    updatedAt: at,
  };
  save({ ...store, deliveries: [...store.deliveries, delivery] });
  return delivery;
}

function writeDelivery(next: Delivery) {
  const store = load();
  save({ ...store, deliveries: store.deliveries.map((d) => (d.id === next.id ? next : d)) });
}

export function markSent(id: string, now = Date.now()) {
  const delivery = load().deliveries.find((d) => d.id === id);
  if (!delivery) return;
  writeDelivery({
    ...delivery,
    status: "sent",
    attempts: delivery.attempts + 1,
    nextAttemptAt: null,
    lastError: null,
    updatedAt: new Date(now).toISOString(),
  });
}

/**
 * Records a failure and schedules the retry, or gives up.
 *
 * "Gives up" means `dead`, not deleted: a message that never reached somebody
 * is exactly the thing an administrator needs to be able to find.
 */
export function markFailed(id: string, error: string, now = Date.now()) {
  const delivery = load().deliveries.find((d) => d.id === id);
  if (!delivery) return;

  const attempts = delivery.attempts + 1;
  const next = nextAttemptAt(attempts, now);

  writeDelivery({
    ...delivery,
    status: next === null ? "dead" : "failed",
    attempts,
    nextAttemptAt: next === null ? null : new Date(next).toISOString(),
    lastError: error.slice(0, 500),
    updatedAt: new Date(now).toISOString(),
  });
}

// ── reading ────────────────────────────────────────────────────────────────

export function notificationsFor(userId: string, limit = 50): Notification[] {
  return load()
    .notifications.filter((n) => n.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

export const unreadCount = (userId: string): number =>
  load().notifications.filter((n) => n.userId === userId && !n.readAt).length;

export function markRead(userId: string, ids: string[] | "all", now = Date.now()): number {
  const store = load();
  const at = new Date(now).toISOString();
  let changed = 0;

  const notifications = store.notifications.map((n) => {
    if (n.userId !== userId || n.readAt) return n;
    if (ids !== "all" && !ids.includes(n.id)) return n;
    changed += 1;
    return { ...n, readAt: at };
  });

  if (changed > 0) save({ ...store, notifications });
  return changed;
}

/** Everything due for another attempt right now. */
export function dueDeliveries(now = Date.now()): Delivery[] {
  return load().deliveries.filter(
    (d) =>
      (d.status === "queued" || d.status === "failed") &&
      d.nextAttemptAt !== null &&
      Date.parse(d.nextAttemptAt) <= now,
  );
}

/** What never got through. For the administrator, and for the report. */
export const deadLetters = (): Delivery[] => load().deliveries.filter((d) => d.status === "dead");

export const deliveriesFor = (userId: string): Delivery[] =>
  load().deliveries.filter((d) => d.userId === userId);

export { MAX_ATTEMPTS };

// ── data rights ────────────────────────────────────────────────────────────

export function notificationDataFor(userId: string) {
  return {
    notifications: notificationsFor(userId, MAX_PER_USER),
    deliveries: deliveriesFor(userId),
  };
}

export function deleteNotificationData(userId: string): number {
  const store = load();
  const before = store.notifications.length + store.deliveries.length;
  save({
    notifications: store.notifications.filter((n) => n.userId !== userId),
    deliveries: store.deliveries.filter((d) => d.userId !== userId),
  });
  return before - (load().notifications.length + load().deliveries.length);
}

/** Test seam. */
export function resetNotificationStore() {
  db = { notifications: [], deliveries: [] };
  listeners.clear();
}

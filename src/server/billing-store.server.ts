/**
 * The subscription mirror.
 *
 * One row per pilot, holding what the payment provider says about them. ADR-3:
 * these rows are written by the server only — by a verified provider webhook,
 * or by an administrator making a deliberate, recorded decision. Nothing a
 * browser sends reaches this file, which is the whole reason a client cannot
 * grant itself a paid product.
 *
 * The shape mirrors the plan's `subscriptions` table field for field, so moving
 * to Postgres is a copy rather than a redesign.
 *
 * Never import this from client code.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";
import {
  emptySubscription,
  isEntitled,
  type Subscription,
  type SubscriptionOverride,
  type SubscriptionSource,
  type SubscriptionStatus,
} from "@/lib/billing/entitlement";

const DATA_FILE = dataFile("subscriptions.json");

/** An administrator's decision, kept so "why does this pilot have access?" has an answer. */
export interface BillingAuditEntry {
  at: string;
  actorId: string;
  actorEmail: string;
  userId: string;
  action: "grant" | "suspend" | "clear";
  reason: string;
}

interface Db {
  subscriptions: Subscription[];
  audit: BillingAuditEntry[];
}

/** Enough history to answer a question, not so much that the file grows forever. */
const MAX_AUDIT_ENTRIES = 1000;

let db: Db | null = null;

function load(): Db {
  if (db) return db;
  if (!existsSync(DATA_FILE)) {
    db = { subscriptions: [], audit: [] };
    return db;
  }
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<Db>;
    db = {
      subscriptions: Array.isArray(raw.subscriptions) ? raw.subscriptions : [],
      audit: Array.isArray(raw.audit) ? raw.audit : [],
    };
  } catch (err) {
    // Refusing to start would lock everyone out over a bad byte. Starting empty
    // errs the safe way: nobody is entitled until it is written again.
    console.warn("[billing] could not read subscriptions, starting empty", err);
    db = { subscriptions: [], audit: [] };
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

function upsert(sub: Subscription) {
  const store = load();
  const subscriptions = store.subscriptions.filter((s) => s.userId !== sub.userId);
  subscriptions.push(sub);
  save({ ...store, subscriptions });
}

/** The pilot's subscription, or a blank one. Never null, so callers cannot forget the case. */
/** Every subscription, for the console. Never reached by a dispatcher (ADR-1). */
export const allSubscriptions = (): Subscription[] => [...load().subscriptions];

export function subscriptionFor(userId: string): Subscription {
  return load().subscriptions.find((s) => s.userId === userId) ?? emptySubscription(userId);
}

/** The single question every gated action asks. */
export function isEntitledPilot(userId: string, now: number = Date.now()): boolean {
  return isEntitled(subscriptionFor(userId), now);
}

/**
 * Write what the payment provider told us.
 *
 * Only a caller that has already verified a provider signature may use this.
 * There is no path to it from a route handler today, and there must not be one
 * until the webhook verifies signatures.
 */
export function applyProviderState(
  userId: string,
  state: {
    source: SubscriptionSource;
    status: SubscriptionStatus;
    providerSubscriptionId?: string | null;
    priceId?: string | null;
    trialEnd?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: string | null;
  },
): Subscription {
  const current = subscriptionFor(userId);
  const next: Subscription = {
    ...current,
    source: state.source,
    status: state.status,
    providerSubscriptionId: state.providerSubscriptionId ?? current.providerSubscriptionId,
    priceId: state.priceId ?? current.priceId,
    trialEnd: state.trialEnd ?? current.trialEnd,
    currentPeriodEnd: state.currentPeriodEnd ?? current.currentPeriodEnd,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd ?? current.cancelAtPeriodEnd,
    canceledAt: state.canceledAt ?? current.canceledAt,
    // An override is ours, not the provider's, so a webhook never clears one.
    updatedAt: new Date().toISOString(),
  };
  upsert(next);
  return next;
}

/**
 * An administrator grants, suspends, or clears an override.
 *
 * `comped` is how a pilot gets access with no payment processor connected —
 * openly, attributed, and with a reason, rather than by a fake checkout. Every
 * call is written to the audit log whether or not anything changed.
 */
export function setOverride(args: {
  userId: string;
  override: SubscriptionOverride;
  reason: string;
  actorId: string;
  actorEmail: string;
}): { subscription: Subscription; error?: string } {
  const reason = args.reason.trim();
  if (args.override !== "none" && reason.length < 3) {
    return { subscription: subscriptionFor(args.userId), error: "Give a reason." };
  }

  const current = subscriptionFor(args.userId);
  const next: Subscription = {
    ...current,
    override: args.override,
    overrideReason: args.override === "none" ? null : reason.slice(0, 500),
    updatedAt: new Date().toISOString(),
  };
  upsert(next);

  const store = load();
  const entry: BillingAuditEntry = {
    at: new Date().toISOString(),
    actorId: args.actorId,
    actorEmail: args.actorEmail,
    userId: args.userId,
    action:
      args.override === "comped" ? "grant" : args.override === "suspended" ? "suspend" : "clear",
    reason: reason.slice(0, 500),
  };
  save({ ...store, audit: [...store.audit, entry].slice(-MAX_AUDIT_ENTRIES) });

  return { subscription: next };
}

export function auditFor(userId: string): BillingAuditEntry[] {
  return load()
    .audit.filter((e) => e.userId === userId)
    .reverse();
}

/** Test seam. */
export function resetBillingStore() {
  db = { subscriptions: [], audit: [] };
}

/**
 * Removes the subscription row.
 *
 * The audit entries **stay**, and that is deliberate. "Which administrator gave
 * a pilot free access, and why" is a record of what a privileged person did; it
 * is the same kind of thing as the main audit log and it survives for the same
 * reason. Once the account row is gone the user id in it no longer resolves to
 * anybody, so what is left is a note about an administrator's conduct rather
 * than about the person who left.
 */
export function deleteBillingData(userId: string): boolean {
  const store = load();
  const had = store.subscriptions.some((s) => s.userId === userId);
  save({ ...store, subscriptions: store.subscriptions.filter((s) => s.userId !== userId) });
  return had;
}

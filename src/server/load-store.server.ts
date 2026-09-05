/**
 * Loads, on the server.
 *
 * The marketplace's own store. Same JSON-file pattern as everything else and
 * the same limits (BACKLOG F-01), shaped like the plan's `loads`, `load_slots`,
 * `load_contacts` and `load_routes` tables.
 *
 * The one rule worth stating up front: `publicLoad` is built by **naming what
 * goes out**, not by deleting what should not. Contacts, permit files, exact
 * addresses and the approved route stay behind until an assignment exists
 * (ADR-8, rule 9) — and a field added to `Load` is therefore private by
 * default rather than published by accident.
 *
 * Never import this from client code.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataFile } from "./data-dir";
import { companyFor } from "./profile-store.server";
import type { EscortSlot, Load, LoadStatus, PublicLoad } from "@/lib/marketplace/types";

const DATA_FILE = dataFile("loads.json");

interface Db {
  loads: Load[];
  /** Next number for the human reference. */
  nextReference: number;
}

let db: Db | null = null;

const newId = () => randomBytes(12).toString("hex");

function load(): Db {
  if (db) return db;
  if (!existsSync(DATA_FILE)) {
    db = { loads: [], nextReference: 1 };
    return db;
  }
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<Db>;
    db = {
      loads: Array.isArray(raw.loads) ? raw.loads : [],
      nextReference: Number(raw.nextReference) || 1,
    };
  } catch (err) {
    console.error("[loads] could not read the store, starting empty", err);
    db = { loads: [], nextReference: 1 };
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

/**
 * The reference people say on the phone.
 *
 * Sequential rather than random, because "LR-00042" is repeatable over a bad
 * radio link and a hex id is not. It leaks how many loads exist, which is not
 * a secret worth protecting for a marketplace that wants to look busy.
 */
function nextReference(store: Db): string {
  const reference = `LR-${String(store.nextReference).padStart(5, "0")}`;
  store.nextReference += 1;
  return reference;
}

function upsert(next: Load) {
  const store = load();
  save({ ...store, loads: [...store.loads.filter((l) => l.id !== next.id), next] });
}

// ── reading ────────────────────────────────────────────────────────────────

export const loadById = (id: string): Load | null => load().loads.find((l) => l.id === id) ?? null;

/**
 * Every load, for the administrator's console.
 *
 * Deliberately not exported to any route a dispatcher or a pilot reaches: the
 * board goes through `publishedLoads` and the matching filter, and a
 * dispatcher's own list goes through `loadsFor`.
 */
export const allLoads = (): Load[] =>
  [...load().loads].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

export const loadsFor = (dispatcherId: string): Load[] =>
  load()
    .loads.filter((l) => l.dispatcherId === dispatcherId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

/** Every load a pilot could possibly be shown. Filtered further by matching. */
export const publishedLoads = (): Load[] =>
  load().loads.filter((l) => l.status === "open" || l.status === "partially_filled");

/**
 * What a pilot sees before they are assigned.
 *
 * Built by listing what goes out. Note what is missing: street addresses,
 * postcodes, the contacts, the permit files and the approved route.
 */
export function publicLoad(l: Load): PublicLoad {
  const company = companyFor(l.dispatcherId);
  return {
    id: l.id,
    reference: l.reference,
    status: l.status,
    title: l.title,
    description: l.description,
    origin: { city: l.origin.city, region: l.origin.region, lng: l.origin.lng, lat: l.origin.lat },
    destination: {
      city: l.destination.city,
      region: l.destination.region,
      lng: l.destination.lng,
      lat: l.destination.lat,
    },
    pickupFrom: l.pickupFrom,
    pickupTo: l.pickupTo,
    deliverBy: l.deliverBy,
    lengthIn: l.lengthIn,
    widthIn: l.widthIn,
    heightIn: l.heightIn,
    weightLb: l.weightLb,
    distanceMi: l.distanceMi,
    slots: l.slots,
    constraints: l.constraints,
    notes: l.notes,
    /*
     * How many permits, not what they say or what is in them.
     *
     * Counted from the numbers rather than the uploaded files: a number is
     * required before a load can be posted and a scan is not, so counting
     * files would tell a pilot "0 permits" on a load that has two. Either way
     * neither the numbers nor the documents go out until an assignment exists.
     */
    permitCount: l.permitNumbers.length,
    company: {
      name: company.companyName || "A dispatch company",
      city: company.city,
      region: company.region,
      usdotNumber: company.usdotNumber,
    },
    createdAt: l.createdAt,
    publishedAt: l.publishedAt,
  };
}

/**
 * Writes a load back verbatim.
 *
 * For the offer store, which fills a slot and derives the status in the same
 * pass as it creates the assignment. Deliberately not exported as a general
 * "update anything" — `updateLoad` is the one dispatchers reach, and it
 * refuses to touch a posted load.
 */
export function saveLoad(next: Load) {
  upsert(next);
}

// ── writing ────────────────────────────────────────────────────────────────

export type DraftLoad = Omit<
  Load,
  | "id"
  | "reference"
  | "dispatcherId"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "publishedAt"
  | "cancelledAt"
  | "cancellationReason"
>;

export function createLoad(dispatcherId: string, draft: DraftLoad): Load {
  const store = load();
  const now = new Date().toISOString();

  const created: Load = {
    ...draft,
    id: newId(),
    reference: nextReference(store),
    dispatcherId,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    slots: draft.slots.map((s) => ({ ...s, id: s.id || newId(), assignedPilotId: null })),
  };

  save({ ...store, loads: [...store.loads, created] });
  return created;
}

export function updateLoad(id: string, patch: Partial<DraftLoad>): { load?: Load; error?: string } {
  const current = loadById(id);
  if (!current) return { error: "No such load." };

  /*
   * A published load is not editable here. Pilots decide whether to take work
   * on the strength of what it says — dimensions, dates, price — and changing
   * those underneath an offer would be changing the deal after the handshake.
   * Cancel and repost is the honest route until Phase H2 defines amendments.
   */
  if (current.status !== "draft") {
    return { error: "This load has been posted. Cancel it and post a new one to change it." };
  }

  const next: Load = {
    ...current,
    ...patch,
    slots: (patch.slots ?? current.slots).map((s) => ({
      ...s,
      id: s.id || newId(),
      assignedPilotId: null,
    })),
    updatedAt: new Date().toISOString(),
  };
  upsert(next);
  return { load: next };
}

/** What a load must have before pilots can see it. */
export function whatIsMissing(l: Load): string[] {
  const missing: string[] = [];
  if (!l.title.trim()) missing.push("A title");
  if (!l.origin.city.trim() || !l.origin.region) missing.push("Where it is collected from");
  if (!l.destination.city.trim() || !l.destination.region) missing.push("Where it is going");
  if (!l.pickupFrom || !l.pickupTo) missing.push("A pickup window");
  if (l.slots.length === 0) missing.push("At least one escort position");
  if (l.slots.some((s) => s.amountCents <= 0)) missing.push("A price on every position");
  if (l.permitNumbers.length === 0) missing.push("At least one permit number");
  return missing;
}

export function publishLoad(id: string): { load?: Load; error?: string; missing?: string[] } {
  const current = loadById(id);
  if (!current) return { error: "No such load." };
  if (current.status !== "draft") return { error: "This load has already been posted." };

  const missing = whatIsMissing(current);
  if (missing.length > 0) return { error: "Some details are still missing.", missing };

  const now = new Date().toISOString();
  const next: Load = { ...current, status: "open", publishedAt: now, updatedAt: now };
  upsert(next);
  return { load: next };
}

export function cancelLoad(id: string, reason: string): { load?: Load; error?: string } {
  const current = loadById(id);
  if (!current) return { error: "No such load." };
  if (current.status === "cancelled") return { load: current };
  if (current.status === "completed") return { error: "This load is already finished." };
  if (reason.trim().length < 3) {
    // The pilots who offered on it are told why. "Cancelled" on its own tells
    // somebody who cleared their week nothing.
    return { error: "Give a reason so the pilots who offered can be told." };
  }

  const now = new Date().toISOString();
  const next: Load = {
    ...current,
    status: "cancelled",
    cancelledAt: now,
    cancellationReason: reason.trim().slice(0, 500),
    updatedAt: now,
  };
  upsert(next);
  return { load: next };
}

/** Recomputes the status from the slots. Used by Phase H2 when offers land. */
export function deriveStatus(l: Load): LoadStatus {
  if (l.status === "cancelled" || l.status === "completed" || l.status === "draft") return l.status;
  const filled = l.slots.filter((s: EscortSlot) => s.assignedPilotId).length;
  if (filled === 0) return "open";
  return filled === l.slots.length ? "filled" : "partially_filled";
}

/** Test seam. */
export function resetLoadStore() {
  db = { loads: [], nextReference: 1 };
}

/**
 * The whole load, for somebody working it.
 *
 * The other side of ADR-8. Until an assignment exists a pilot sees
 * `publicLoad` — city, state, dimensions, price. Once they are hired they get
 * what they actually need to do the job: the yard address, the site contact's
 * mobile, the permit numbers and the approved route.
 *
 * The caller must have checked that the assignment exists. This function does
 * not check, because a function that both decides and reveals is one edit away
 * from revealing without deciding.
 */
export function revealedLoad(l: Load): Load {
  return l;
}

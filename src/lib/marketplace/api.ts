/**
 * Client for the loads endpoint.
 *
 * Thin, like the profile client: every write returns what the server now holds
 * and that is what gets rendered. When the question is "is this load live", the
 * server's answer is the only one worth showing.
 */
import type { Ineligibility } from "./matching";
import type { Load, PublicLoad } from "./types";

export interface BoardRow {
  load: PublicLoad;
  eligible: boolean;
  eligibleSlotIds: string[];
  reasons: Ineligibility[];
}

export interface SlotEligibility {
  slotId: string;
  reasons: Ineligibility[];
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/loads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; missing?: string[] };
  if (!res.ok) {
    const error = new Error(data.error ?? "That did not save.") as Error & { missing?: string[] };
    error.missing = data.missing;
    throw error;
  }
  return data;
}

/** The dispatcher's own loads, in full. */
export async function myLoads(): Promise<{ loads: Load[]; missing: Record<string, string[]> }> {
  const res = await fetch("/api/loads", { credentials: "include" });
  if (!res.ok) throw new Error("Could not load your jobs.");
  return (await res.json()) as { loads: Load[]; missing: Record<string, string[]> };
}

/** The pilot's board: what they can see, ranked, with reasons. */
export interface Board {
  rows: BoardRow[];
  /**
   * The states this pilot works. Empty means nothing can ever match, which
   * is a different empty board from "nobody has posted anything".
   */
  workingRegions: string[];
}

export async function board(): Promise<Board> {
  const res = await fetch("/api/loads", { credentials: "include" });
  if (!res.ok) throw new Error("Could not load the board.");
  const data = (await res.json()) as { loads?: BoardRow[]; workingRegions?: string[] };
  return { rows: data.loads ?? [], workingRegions: data.workingRegions ?? [] };
}

export async function loadDetail(id: string): Promise<{
  load: Load | PublicLoad;
  mine: boolean;
  missing?: string[];
  slotEligibility?: SlotEligibility[];
}> {
  const res = await fetch(`/api/loads?id=${encodeURIComponent(id)}`, { credentials: "include" });
  const data = (await res.json().catch(() => ({}))) as {
    load?: Load | PublicLoad;
    mine?: boolean;
    missing?: string[];
    slotEligibility?: SlotEligibility[];
    error?: string;
  };
  if (!res.ok || !data.load) throw new Error(data.error ?? "Could not open that load.");
  return {
    load: data.load,
    mine: data.mine === true,
    missing: data.missing,
    slotEligibility: data.slotEligibility,
  };
}

export const createLoad = (draft: Record<string, unknown>) =>
  post<{ load: Load; missing: string[] }>({ action: "create", ...draft });

export const updateLoad = (id: string, draft: Record<string, unknown>) =>
  post<{ load: Load; missing: string[] }>({ action: "update", id, ...draft });

export const publishLoad = (id: string) => post<{ load: Load }>({ action: "publish", id });

export const cancelLoad = (id: string, reason: string) =>
  post<{ load: Load }>({ action: "cancel", id, reason });

// ── formatting ─────────────────────────────────────────────────────────────

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/**
 * Dimensions as a driver reads them.
 *
 * Stored in inches because a permit is written in feet and inches and storing
 * "12'6"" as a string makes it unsortable. Displayed the way it was written.
 */
export function formatFeetInches(inches: number | null): string | null {
  if (inches === null || !Number.isFinite(inches)) return null;
  const feet = Math.floor(inches / 12);
  const rest = Math.round(inches % 12);
  return rest === 0 ? `${feet}'` : `${feet}' ${rest}"`;
}

export function formatWeight(pounds: number | null): string | null {
  if (pounds === null || !Number.isFinite(pounds)) return null;
  return `${new Intl.NumberFormat("en-US").format(Math.round(pounds))} lb`;
}

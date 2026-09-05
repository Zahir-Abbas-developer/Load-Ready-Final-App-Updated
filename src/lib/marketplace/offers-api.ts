/**
 * Client for the offers endpoint.
 *
 * The one thing worth knowing: a fixed-price offer comes back with an
 * `assignment` and the *whole* load — yard address, site contacts, permit
 * numbers — because accepting one is being hired. A bid comes back with an
 * offer and nothing new, because nothing has been agreed yet.
 */
import type { ApplicantSummary, Assignment, Offer } from "./offers";
import type { Load, PublicLoad } from "./types";

export interface RevealedCompany {
  companyName: string;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  usdotNumber: string | null;
}

export interface RevealedPilot {
  userId: string;
  name: string;
  businessName: string | null;
  phone: string | null;
  vehicle: string | null;
}

export interface MyWork {
  offers: Array<{ offer: Offer; load: PublicLoad | null }>;
  assignments: Array<{
    assignment: Assignment;
    load: Load | null;
    company: RevealedCompany;
  }>;
}

export interface Applicants {
  applicants: ApplicantSummary[];
  assigned: Array<{ slotId: string; pilot: RevealedPilot }>;
  decided: Offer[];
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/offers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; reasons?: string[] };
  if (!res.ok) {
    const error = new Error(data.error ?? "That did not work.") as Error & { reasons?: string[] };
    error.reasons = data.reasons;
    throw error;
  }
  return data;
}

export async function myWork(): Promise<MyWork> {
  const res = await fetch("/api/offers", { credentials: "include" });
  if (!res.ok) throw new Error("Could not load your work.");
  return (await res.json()) as MyWork;
}

export async function applicantsFor(loadId: string): Promise<Applicants> {
  const res = await fetch(`/api/offers?loadId=${encodeURIComponent(loadId)}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Could not load the applicants.");
  return (await res.json()) as Applicants;
}

export const makeOffer = (input: {
  loadId: string;
  slotId: string;
  amountCents: number;
  pickupEstimate?: string;
  notes?: string;
}) =>
  post<{
    offer: Offer;
    assignment?: Assignment;
    load?: Load;
    company?: RevealedCompany;
  }>({ action: "offer", ...input });

export const withdrawOffer = (offerId: string) =>
  post<{ offer: Offer }>({ action: "withdraw", offerId });

export const acceptOffer = (offerId: string) =>
  post<{ assignment: Assignment; pilot: RevealedPilot; load: Load }>({
    action: "accept",
    offerId,
  });

export const declineOffer = (offerId: string, reason: string) =>
  post<{ offer: Offer }>({ action: "decline", offerId, reason });

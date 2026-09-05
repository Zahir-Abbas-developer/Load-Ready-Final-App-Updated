/**
 * Client for the assignments endpoint.
 *
 * A "job" here is one assignment with everything the viewer is allowed to see
 * about it: the whole load, both sides' contact details, the status trail, and
 * whichever ratings are readable yet.
 */
import type { Assignment, AssignmentStatus } from "./offers";
import type { Rating } from "./ratings";
import type { Load } from "./types";
import type { RevealedCompany, RevealedPilot } from "./offers-api";
import type { Proof } from "@/lib/messaging/types";

export interface Job {
  assignment: Assignment;
  load: Load | null;
  pilot: RevealedPilot;
  company: RevealedCompany;
  ratings: {
    /** What you wrote. */
    mine: Rating | null;
    /** What they wrote, once you may read it. */
    theirs: Rating | null;
    /** When theirs becomes readable, if it is not yet. */
    theirsVisibleAt: string | null;
  };
  youHaveRated: boolean;
  /** Photos and notes attached to the job, by either side. */
  proofs: Proof[];
  /** Messages on this job you have not read. */
  unreadMessages: number;
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/assignments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "That did not work.");
  return data;
}

export async function myJobs(): Promise<Job[]> {
  const res = await fetch("/api/assignments", { credentials: "include" });
  if (!res.ok) throw new Error("Could not load your jobs.");
  return ((await res.json()) as { jobs: Job[] }).jobs;
}

export const advance = (assignmentId: string, to: AssignmentStatus) =>
  post<{ job: Job }>({ action: "advance", assignmentId, to });

export const complete = (
  assignmentId: string,
  input: { notes?: string; milesDriven?: number | null },
) => post<{ job: Job }>({ action: "complete", assignmentId, ...input });

export const cancel = (assignmentId: string, reason: string) =>
  post<{ job: Job }>({ action: "cancel", assignmentId, reason });

export const noShow = (assignmentId: string, reason: string) =>
  post<{ job: Job }>({ action: "no-show", assignmentId, reason });

export const addProof = (
  assignmentId: string,
  input: { kind: "photo" | "note"; fileId?: string; note?: string },
) => post<{ job: Job }>({ action: "add-proof", assignmentId, ...input });

export const removeProof = (assignmentId: string, proofId: string) =>
  post<{ job: Job }>({ action: "remove-proof", assignmentId, proofId });

export const rate = (assignmentId: string, score: number, comment?: string) =>
  post<{ rating: Rating; visibleAt: string | null; job: Job }>({
    action: "rate",
    assignmentId,
    score,
    comment,
  });

/**
 * What the console shows, computed from the real stores.
 *
 * Everything on the administrator's dashboard used to come from a copy of the
 * app's own localStorage — numbers that changed when you cleared your browser
 * and meant nothing about the business. These are counted from the same files
 * the product writes to.
 *
 * The rule this file follows: **a number nobody can act on does not go on the
 * dashboard**, and a number we cannot compute honestly is `null` rather than a
 * zero. A fill rate of "0%" on a marketplace with no loads reads as a failure;
 * "no loads yet" reads as the truth.
 *
 * Never import this from client code.
 */
import { listAccounts } from "./auth-store.server";
import { allPilotRecords, withLiveStatus } from "./profile-store.server";
import { allLoads } from "./load-store.server";
import { allAssignments } from "./offer-store.server";
import { allSubscriptions } from "./billing-store.server";
import { deadLetters } from "./notification-store.server";
import { mailerConfigured } from "./mailer.server";
import { launchReadiness } from "./legal-store.server";
import { isTrackable } from "@/lib/tracking/rules";
import { isEntitled } from "@/lib/billing/entitlement";
import type { LoadStatus } from "@/lib/marketplace/types";
import type { PilotRecord } from "@/lib/profile/types";

export interface Overview {
  people: {
    total: number;
    pilots: number;
    dispatchers: number;
    /** Signed up and waiting for somebody to approve them. */
    awaitingApproval: number;
    /** Profiles submitted for review and not yet decided. */
    verificationBacklog: number;
    signedUpThisWeek: number;
  };
  work: {
    loads: Record<LoadStatus, number>;
    /** Escorts under way right now — the number an administrator opens this for. */
    activeEscorts: number;
    /** Filled or finished, over everything posted. Null with nothing posted. */
    fillRate: number | null;
    /** Median hours from posting to the first hire. Null until something fills. */
    medianHoursToFill: number | null;
    assignments: { total: number; completed: number; cancelled: number; noShows: number };
  };
  money: {
    /** Pilots who may currently take work, however they got there. */
    entitled: number;
    trialing: number;
    pastDue: number;
    comped: number;
    suspended: number;
  };
  health: {
    emailConfigured: boolean;
    /** Messages that never got through, after every retry. */
    deadLetters: number;
    /** Policies still in draft, or still carrying an unfilled placeholder. */
    legalNotReady: number;
  };
}

const EMPTY_LOADS: Record<LoadStatus, number> = {
  draft: 0,
  open: 0,
  partially_filled: 0,
  filled: 0,
  in_progress: 0,
  completed: 0,
  cancelled: 0,
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export async function buildOverview(now = Date.now()): Promise<Overview> {
  const accounts = await listAccounts();
  const records = allPilotRecords().map((r: PilotRecord) => withLiveStatus(r, now));
  const loads = allLoads();
  const assignments = allAssignments();
  const subscriptions = allSubscriptions();

  const loadCounts = { ...EMPTY_LOADS };
  for (const l of loads) loadCounts[l.status] = (loadCounts[l.status] ?? 0) + 1;

  /*
   * Time to fill is measured from publishing to the first hire, not from
   * creation: a load that sat in drafts for a week was not on the market, and
   * counting that time would make the marketplace look slower than it is.
   */
  const hoursToFill: number[] = [];
  for (const l of loads) {
    if (!l.publishedAt) continue;
    const first = assignments
      .filter((a) => a.loadId === l.id)
      .map((a) => Date.parse(a.createdAt))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0];
    if (first === undefined) continue;
    const published = Date.parse(l.publishedAt);
    if (Number.isFinite(published) && first >= published) {
      hoursToFill.push((first - published) / 3_600_000);
    }
  }

  const posted = loads.filter((l) => l.status !== "draft").length;
  const filled = loads.filter(
    (l) => l.status === "filled" || l.status === "in_progress" || l.status === "completed",
  ).length;

  const week = now - 7 * 86_400_000;

  return {
    people: {
      total: accounts.length,
      pilots: accounts.filter((a) => a.role === "pilot").length,
      dispatchers: accounts.filter((a) => a.role === "dispatcher").length,
      awaitingApproval: accounts.filter((a) => a.approval === "pending").length,
      verificationBacklog: records.filter((r) => r.profile.verificationStatus === "in_review")
        .length,
      signedUpThisWeek: accounts.filter((a) => Date.parse(a.createdAt) >= week).length,
    },
    work: {
      loads: loadCounts,
      activeEscorts: assignments.filter((a) => isTrackable(a.status)).length,
      // Null rather than 0% on an empty marketplace: a zero reads as a
      // failure, and "nothing posted yet" is not one.
      fillRate: posted === 0 ? null : Math.round((filled / posted) * 100),
      medianHoursToFill: median(hoursToFill),
      assignments: {
        total: assignments.length,
        completed: assignments.filter((a) => a.status === "completed").length,
        cancelled: assignments.filter((a) => a.status === "cancelled").length,
        noShows: assignments.filter((a) => a.noShow).length,
      },
    },
    money: {
      entitled: subscriptions.filter((s) => isEntitled(s, now)).length,
      trialing: subscriptions.filter((s) => s.status === "trialing").length,
      pastDue: subscriptions.filter((s) => s.status === "past_due").length,
      comped: subscriptions.filter((s) => s.override === "comped").length,
      suspended: subscriptions.filter((s) => s.override === "suspended").length,
    },
    health: {
      emailConfigured: mailerConfigured(),
      deadLetters: deadLetters().length,
      // Every policy still in draft, or still carrying an unfilled placeholder.
      legalNotReady: launchReadiness(now).blocking.length,
    },
  };
}

// ── the cross-account work list ────────────────────────────────────────────

/** A load as the console shows it: the market, without anybody's details. */
export interface AdminLoadRow {
  id: string;
  reference: string;
  title: string;
  /** City and state at each end. No street address — that is ADR-8's whole point. */
  route: string;
  status: string;
  /** Positions on the load, and how many have somebody in them. */
  positions: number;
  filled: number;
  pickupFrom: string;
  createdAt: string;
}

/**
 * Every load, whatever state it is in.
 *
 * The console had no view of this at all: the jobs screen listed assignments,
 * so a load nobody had taken yet was invisible to an administrator — which is
 * exactly the load somebody would be asking about ("I posted it, where is
 * it?"). The counts were on the dashboard; the rows were nowhere.
 *
 * Carries no names, no phone numbers and no street addresses, for the same
 * reason `adminJobs` does not (PH-60).
 */
export function adminLoads(limit = 200): AdminLoadRow[] {
  const assignments = allAssignments();

  return allLoads()
    .slice(0, limit)
    .map((l) => {
      const taken = assignments.filter((a) => a.loadId === l.id).length;
      return {
        id: l.id,
        reference: l.reference,
        title: l.title,
        route: `${l.origin.city}, ${l.origin.region} → ${l.destination.city}, ${l.destination.region}`,
        status: l.status,
        positions: l.slots.length,
        filled: taken,
        pickupFrom: l.pickupFrom,
        createdAt: l.createdAt,
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export interface AdminJobRow {
  assignmentId: string;
  loadId: string;
  reference: string;
  title: string;
  route: string;
  status: string;
  noShow: boolean;
  pilotId: string;
  dispatcherId: string;
  agreedAmountCents: number;
  createdAt: string;
}

/**
 * Every escort that is running, or has recently run.
 *
 * Deliberately does **not** carry names, phone numbers or positions. This is a
 * monitoring list — "which jobs are live" — and the moment it carries contact
 * details it becomes a way around ADR-8 that happens to be behind a login. An
 * administrator who needs to intervene on a job goes through the dispute tool,
 * with a reason and an audit entry (BACKLOG F-99).
 */
export function adminJobs(limit = 100): AdminJobRow[] {
  const loads = new Map(allLoads().map((l) => [l.id, l]));

  return allAssignments()
    .slice(0, limit)
    .map((a) => {
      const l = loads.get(a.loadId);
      return {
        assignmentId: a.id,
        loadId: a.loadId,
        reference: l?.reference ?? "—",
        title: l?.title ?? "—",
        route: l
          ? `${l.origin.city}, ${l.origin.region} → ${l.destination.city}, ${l.destination.region}`
          : "—",
        status: a.status,
        noShow: a.noShow,
        pilotId: a.pilotId,
        dispatcherId: a.dispatcherId,
        agreedAmountCents: a.agreedAmountCents,
        createdAt: a.createdAt,
      };
    });
}

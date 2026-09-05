/**
 * The two funnels, counted from the real stores.
 *
 * The console has told an administrator what the totals are since J1. This
 * tells them where people stop, which is the only version of that question a
 * founder can act on: eleven pilots signed up, nine were approved, and one
 * ever bid is a different week's work from eleven signed up and two approved.
 *
 * Counted rather than tracked. There is no analytics product here and no event
 * stream — these are the records the app already writes, read at the moment
 * somebody asks. That means no third party sees anybody's behaviour, and it
 * also means these are *current* states rather than a history: somebody who
 * bid last month and has since been suspended is counted where they are now,
 * not where they were.
 *
 * Never import this from client code.
 */
import { listAccounts } from "./auth-store.server";
import { allPilotRecords } from "./profile-store.server";
import { allSubscriptions } from "./billing-store.server";
import { allOffers, allAssignments } from "./offer-store.server";
import { allLoads } from "./load-store.server";
import { isEntitled } from "@/lib/billing/entitlement";
import { funnel, worstStage, type Stage } from "@/lib/growth/funnel";

export interface Funnels {
  pilots: Stage[];
  dispatchers: Stage[];
  /** The stage losing the most, when there is enough of a sample to say. */
  worst: { side: "pilots" | "dispatchers"; stage: Stage } | null;
}

export async function funnels(): Promise<Funnels> {
  const accounts = await listAccounts();
  const profiles = allPilotRecords();
  const subscriptions = allSubscriptions();
  const offers = allOffers();
  const assignments = allAssignments();
  const loads = allLoads();

  // ── pilots ───────────────────────────────────────────────────────────────

  const pilotAccounts = accounts.filter((a) => a.role === "pilot");
  const pilotIds = new Set(pilotAccounts.map((a) => a.id));

  const approved = pilotAccounts.filter((a) => a.approval === "approved");
  const approvedIds = new Set(approved.map((a) => a.id));

  /*
   * A profile that has been put in for review, whether or not it came back.
   * "Started" is not a stage: a half-filled form nobody submitted is not a
   * step somebody took, it is a step they abandoned — which shows up as the
   * drop into this one.
   */
  const submitted = profiles.filter(
    (p) => approvedIds.has(p.profile.userId) && p.profile.verificationStatus !== "not_started",
  );

  const verified = profiles.filter(
    (p) => approvedIds.has(p.profile.userId) && p.profile.verificationStatus === "approved",
  );

  const entitled = subscriptions.filter((s) => pilotIds.has(s.userId) && isEntitled(s));

  const bidders = new Set(offers.map((o) => o.pilotId).filter((id) => pilotIds.has(id)));
  const hired = new Set(assignments.map((a) => a.pilotId).filter((id) => pilotIds.has(id)));

  const pilots = funnel([
    { name: "Signed up", count: pilotAccounts.length },
    { name: "Approved to use it", count: approved.length },
    { name: "Sent a profile for review", count: submitted.length },
    { name: "Verified", count: verified.length },
    { name: "Able to take work", count: entitled.length },
    { name: "Bid on something", count: bidders.size },
    { name: "Hired at least once", count: hired.size },
  ]);

  // ── dispatchers ──────────────────────────────────────────────────────────

  const dispatcherAccounts = accounts.filter((a) => a.role === "dispatcher");
  const dispatcherIds = new Set(dispatcherAccounts.map((a) => a.id));
  const approvedDispatchers = dispatcherAccounts.filter((a) => a.approval === "approved");

  const mine = loads.filter((l) => dispatcherIds.has(l.dispatcherId));
  const posted = new Set(mine.map((l) => l.dispatcherId));
  const published = new Set(mine.filter((l) => l.status !== "draft").map((l) => l.dispatcherId));

  /*
   * Filled means somebody was actually hired on one of their loads — not that
   * the load reached a status. A dispatcher whose only load expired unfilled
   * has not had the experience this funnel is measuring.
   */
  const loadsById = new Map(mine.map((l) => [l.id, l]));
  const filled = new Set(
    assignments
      .map((a) => loadsById.get(a.loadId)?.dispatcherId)
      .filter((id): id is string => Boolean(id)),
  );

  const dispatchers = funnel([
    { name: "Signed up", count: dispatcherAccounts.length },
    { name: "Approved to use it", count: approvedDispatchers.length },
    { name: "Created a load", count: posted.size },
    { name: "Published one", count: published.size },
    { name: "Hired somebody", count: filled.size },
  ]);

  // ── where the week should go ─────────────────────────────────────────────

  const worstPilot = worstStage(pilots);
  const worstDispatcher = worstStage(dispatchers);

  let worst: Funnels["worst"] = null;
  if (worstPilot && worstDispatcher) {
    worst =
      worstPilot.rate! <= worstDispatcher.rate!
        ? { side: "pilots", stage: worstPilot }
        : { side: "dispatchers", stage: worstDispatcher };
  } else if (worstPilot) {
    worst = { side: "pilots", stage: worstPilot };
  } else if (worstDispatcher) {
    worst = { side: "dispatchers", stage: worstDispatcher };
  }

  return { pilots, dispatchers, worst };
}

import { createFileRoute } from "@tanstack/react-router";
import { authorize, isDenied } from "@/server/authz.server";
import { checkRateLimit } from "@/server/rate-limit.server";
import { recordAudit } from "@/server/audit-store.server";
import {
  advanceAssignment,
  assignmentById,
  assignmentsForDispatcher,
  assignmentsForPilot,
  cancelAssignment,
  completeAssignment,
  markNoShow,
} from "@/server/offer-store.server";
import { hasRated, ratingsOnAssignment, submitRating } from "@/server/ratings-store.server";
import { proofsOn, recordProof, removeProof, unreadOn } from "@/server/message-store.server";
import { lastPosition } from "@/server/tracking-store.server";
import { checkProof, type ProofKind } from "@/lib/messaging/types";
import { loadById, revealedLoad } from "@/server/load-store.server";
import { companyFor, ownsFile, pilotRecord, withLiveStatus } from "@/server/profile-store.server";
import type { Assignment, AssignmentStatus } from "@/lib/marketplace/offers";
import { statusLabel } from "@/lib/marketplace/lifecycle";
import { notify } from "@/server/notifier.server";

/**
 * The job, from being hired to being rated.
 *
 * Two rules run through this file:
 *
 * - **Only the pilot moves the job forward.** The state machine says so and it
 *   is enforced here, not in the screens: a dispatcher who could mark a job
 *   "at the pickup" would be recording something they cannot see.
 * - **Both sides see everything about a job they are on.** Contact details are
 *   already revealed by the assignment (ADR-8), so there is nothing left to
 *   mask here — except the other side's rating, which stays hidden until they
 *   have both written one.
 */

const ACTION_LIMIT = { limit: 120, windowMs: 60 * 60 * 1000 };

const str = (v: unknown, max = 500): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** The other side of the job, as the person on it may see them. */
function pilotSide(pilotId: string) {
  const record = withLiveStatus(pilotRecord(pilotId));
  const vehicle = record.vehicles[0];
  return {
    userId: record.profile.userId,
    name: record.profile.legalName,
    businessName: record.profile.businessName,
    phone: record.profile.phone,
    vehicle: vehicle
      ? `${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model}, ${vehicle.licensePlate}`.trim()
      : null,
  };
}

function companySide(dispatcherId: string) {
  const company = companyFor(dispatcherId);
  return {
    companyName: company.companyName,
    phone: company.phone,
    addressLine: company.addressLine,
    city: company.city,
    region: company.region,
    usdotNumber: company.usdotNumber,
  };
}

/** One job with everything the viewer is entitled to about it. */
function jobFor(assignment: Assignment, viewerId: string, now: number) {
  const l = loadById(assignment.loadId);
  return {
    assignment,
    load: l ? revealedLoad(l) : null,
    pilot: pilotSide(assignment.pilotId),
    company: companySide(assignment.dispatcherId),
    ratings: ratingsOnAssignment(assignment.id, viewerId, now),
    youHaveRated: hasRated(assignment.id, viewerId),
    /*
     * Both sides see all the proof, whoever attached it. That is the point of
     * it: a photo only one party can see settles nothing.
     */
    proofs: proofsOn(assignment.id),
    unreadMessages: unreadOn(assignment.id, viewerId),
  };
}

/** The pilot and the dispatcher on a job, and nobody else. */
function partyTo(assignmentId: string, callerId: string) {
  const assignment = assignmentById(assignmentId);
  if (!assignment) return null;
  if (assignment.pilotId !== callerId && assignment.dispatcherId !== callerId) return null;
  return assignment;
}

export const Route = createFileRoute("/api/assignments")({
  server: {
    handlers: {
      /** Every job this person is on — pilot or dispatcher, newest first. */
      GET: async ({ request }) => {
        const auth = await authorize(request, "assignments:GET");
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;
        const now = Date.now();

        const mine =
          caller.role === "pilot"
            ? assignmentsForPilot(caller.id)
            : assignmentsForDispatcher(caller.id);

        return Response.json({ jobs: mine.map((a) => jobFor(a, caller.id, now)) });
      },

      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Malformed request." }, { status: 400 });
        }

        const action = String(body.action ?? "");
        const auth = await authorize(request, `assignments:${action}`);
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        const gate = checkRateLimit(`assignments:${caller.id}`, ACTION_LIMIT);
        if (!gate.ok) {
          return Response.json(
            { error: "Too many requests. Try again shortly." },
            { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
          );
        }

        const assignmentId = str(body.assignmentId, 64);
        const now = Date.now();

        switch (action) {
          case "advance": {
            const result = advanceAssignment({
              assignmentId,
              actorId: caller.id,
              to: str(body.to, 32) as AssignmentStatus,
              now,
            });
            if (result.error) return Response.json({ error: result.error }, { status: 400 });

            // The dispatcher is the one who cannot see the truck.
            const moved = result.assignment!;
            await notify({
              event: "assignment.status",
              userId: moved.dispatcherId,
              subject: `${moved.id}:${moved.status}`,
              vars: {
                reference: loadById(moved.loadId)?.reference,
                personName: pilotSide(moved.pilotId).businessName ?? pilotSide(moved.pilotId).name,
                status: statusLabel(moved.status).toLowerCase(),
              },
              target: { screen: "loads", id: moved.loadId },
            });
            return Response.json({ job: jobFor(moved, caller.id, now) });
          }

          case "complete": {
            const miles = body.milesDriven;
            const result = completeAssignment({
              assignmentId,
              actorId: caller.id,
              notes: str(body.notes, 2000) || null,
              milesDriven:
                miles === null || miles === undefined || miles === "" ? null : Number(miles),
              now,
            });
            if (result.error) return Response.json({ error: result.error }, { status: 400 });

            const l = loadById(result.assignment!.loadId);
            recordAudit({
              actorId: caller.id,
              actorEmail: caller.email,
              action: "assignment.completed",
              subject: result.assignment!.loadId,
              detail: `${l?.reference}: the escort was finished.`,
            });

            await notify({
              event: "assignment.completed",
              userId: result.assignment!.dispatcherId,
              subject: result.assignment!.id,
              vars: {
                reference: l?.reference,
                personName: pilotSide(result.assignment!.pilotId).name,
              },
              target: { screen: "loads", id: result.assignment!.loadId },
            });
            return Response.json({ job: jobFor(result.assignment!, caller.id, now) });
          }

          case "cancel": {
            const result = cancelAssignment({
              assignmentId,
              actorId: caller.id,
              reason: str(body.reason, 500),
              now,
            });
            if (result.error) return Response.json({ error: result.error }, { status: 400 });

            const l = loadById(result.assignment!.loadId);
            recordAudit({
              actorId: caller.id,
              actorEmail: caller.email,
              action: "assignment.cancelled",
              subject: result.assignment!.loadId,
              // The notice given is on the record, because a pattern of late
              // cancellations is the thing either side needs to be able to show.
              detail: `${l?.reference}: cancelled with ${result.assignment!.cancellationNoticeHours ?? "unknown"} hours' notice.`,
            });

            // Whichever side did not do it.
            const cancelled = result.assignment!;
            const otherSide =
              cancelled.cancelledBy === "pilot" ? cancelled.dispatcherId : cancelled.pilotId;
            await notify({
              event: "assignment.cancelled",
              userId: otherSide,
              subject: cancelled.id,
              vars: {
                reference: l?.reference,
                personName:
                  cancelled.cancelledBy === "pilot"
                    ? pilotSide(cancelled.pilotId).name
                    : companySide(cancelled.dispatcherId).companyName,
                reason: cancelled.cancellationReason ?? undefined,
              },
              target: { screen: "orders", id: cancelled.loadId },
            });
            return Response.json({ job: jobFor(cancelled, caller.id, now) });
          }

          case "no-show": {
            const result = markNoShow({
              assignmentId,
              dispatcherId: caller.id,
              reason: str(body.reason, 500),
              now,
            });
            if (result.error) return Response.json({ error: result.error }, { status: 400 });

            const l = loadById(result.assignment!.loadId);
            recordAudit({
              actorId: caller.id,
              actorEmail: caller.email,
              action: "assignment.no-show",
              subject: result.assignment!.pilotId,
              detail: `${l?.reference}: the dispatcher recorded that the pilot did not arrive.`,
            });

            await notify({
              event: "assignment.no_show",
              userId: result.assignment!.pilotId,
              subject: result.assignment!.id,
              vars: {
                reference: l?.reference,
                companyName: companySide(result.assignment!.dispatcherId).companyName,
                reason: result.assignment!.cancellationReason ?? undefined,
              },
              target: { screen: "orders", id: result.assignment!.loadId },
            });
            return Response.json({ job: jobFor(result.assignment!, caller.id, now) });
          }

          case "add-proof": {
            const assignment = partyTo(assignmentId, caller.id);
            if (!assignment) return Response.json({ error: "No such job." }, { status: 404 });

            const kind = (str(body.kind, 16) as ProofKind) === "photo" ? "photo" : "note";
            const fileId = str(body.fileId, 64) || null;

            // Only a file you uploaded. Otherwise somebody else's document id
            // could be pinned into a job and read through it.
            if (fileId && !ownsFile(caller.id, fileId)) {
              return Response.json({ error: "That file is not yours." }, { status: 400 });
            }

            const check = checkProof({ kind, fileId, note: str(body.note, 1000) });
            if (!check.ok) return Response.json({ error: check.reason }, { status: 400 });

            /*
             * Geotagged from the last position the pilot's device reported,
             * not from a coordinate the request supplies.
             *
             * The whole value of proof is that it is not assertible. A photo
             * with a location the app typed in is a photo with a claim
             * attached, which is what it was already.
             */
            const fix = lastPosition(assignment.id);
            recordProof({
              assignmentId: assignment.id,
              kind,
              fileId,
              note: str(body.note, 1000) || null,
              position: fix ? { lng: fix.lng, lat: fix.lat, accuracy: fix.accuracy } : null,
              createdBy: caller.id,
            });

            return Response.json({ job: jobFor(assignment, caller.id, now) });
          }

          case "remove-proof": {
            const assignment = partyTo(assignmentId, caller.id);
            if (!assignment) return Response.json({ error: "No such job." }, { status: 404 });

            const removed = removeProof(str(body.proofId, 64), caller.id);
            if (!removed) {
              return Response.json({ error: "That is not yours to remove." }, { status: 400 });
            }
            return Response.json({ job: jobFor(assignment, caller.id, now) });
          }

          case "rate": {
            const result = submitRating({
              assignmentId,
              raterId: caller.id,
              score: Math.round(Number(body.score)),
              comment: str(body.comment, 1000) || null,
              now,
            });
            if (result.error) return Response.json({ error: result.error }, { status: 400 });

            const assignment = assignmentById(assignmentId)!;

            /*
             * The second rating opens the window for both of them, so both are
             * told — otherwise the first person to rate never learns that what
             * they wrote about is now readable.
             */
            const both = ratingsOnAssignment(assignmentId, caller.id, now);
            if (both.mine && both.theirs) {
              const reference = loadById(assignment.loadId)?.reference;
              for (const userId of [assignment.pilotId, assignment.dispatcherId]) {
                await notify({
                  event: "rating.visible",
                  userId,
                  subject: assignment.id,
                  vars: { reference },
                  target: { screen: "orders", id: assignment.loadId },
                });
              }
            }

            return Response.json({
              rating: result.rating,
              /*
               * Told plainly, because "why can't I see theirs" is the first
               * question anybody asks of a blind window.
               */
              visibleAt: result.visibleAt,
              job: jobFor(assignment, caller.id, now),
            });
          }

          default:
            return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
        }
      },
    },
  },
});

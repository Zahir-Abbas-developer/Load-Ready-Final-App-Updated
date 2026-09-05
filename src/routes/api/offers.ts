import { createFileRoute } from "@tanstack/react-router";
import { authorize, isDenied } from "@/server/authz.server";
import { checkRateLimit } from "@/server/rate-limit.server";
import { recordAudit } from "@/server/audit-store.server";
import {
  acceptOffer,
  assignmentFor,
  assignmentsForPilot,
  declineOffer,
  expireStaleOffers,
  makeOffer,
  offersByPilot,
  offersForLoad,
  withdrawOffer,
} from "@/server/offer-store.server";
import { loadById, publicLoad, revealedLoad } from "@/server/load-store.server";
import { companyFor, pilotRecord, withLiveStatus } from "@/server/profile-store.server";
import { publicPilotProfile } from "@/lib/profile/completion";
import { isLive, rankApplicants, type ApplicantSummary } from "@/lib/marketplace/offers";
import { notify } from "@/server/notifier.server";
import { formatMoney } from "@/lib/marketplace/api";

/**
 * Offers, and the assignments they become.
 *
 * The one thing to understand here is **when contact details appear**. Before
 * an assignment, a pilot sees the masked load and a dispatcher sees a masked
 * pilot: no phone, no address, no permit numbers. The moment one accepts the
 * other, both sides get what they need to do the job — and not a moment before
 * (ADR-8, rule 9).
 *
 * Eligibility and entitlement are checked in the store, at the moment of the
 * offer and again at the moment of acceptance. The board's version of the same
 * question is guidance rendered in a browser; this is the gate.
 */

const OFFER_LIMIT = { limit: 120, windowMs: 60 * 60 * 1000 };

const str = (v: unknown, max = 300): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** The pilot as a dispatcher sees them before hiring: no way to contact them. */
function applicantSummary(pilotId: string) {
  const record = withLiveStatus(pilotRecord(pilotId));
  const view = publicPilotProfile(record);
  return {
    userId: view.userId,
    displayName: view.displayName,
    yearsExperience: view.yearsExperience,
    badges: view.badges,
    city: view.city,
    region: view.region,
  };
}

/** Contact details, once there is an assignment to justify them. */
function revealedPilot(pilotId: string) {
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

function revealedCompany(dispatcherId: string) {
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

export const Route = createFileRoute("/api/offers")({
  server: {
    handlers: {
      /**
       * A pilot's own offers and assignments, or the applicants on a load.
       *
       * `?loadId=` is the dispatcher's applicant list. Without it, the caller's
       * own offers.
       */
      GET: async ({ request }) => {
        const auth = await authorize(request, "offers:GET");
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        // Cheap, and means a started load never shows an open offer.
        expireStaleOffers();

        const url = new URL(request.url);
        const loadId = url.searchParams.get("loadId");

        if (loadId) {
          const l = loadById(loadId);
          if (!l || l.dispatcherId !== caller.id) {
            return Response.json({ error: "No such load." }, { status: 404 });
          }

          const applicants: ApplicantSummary[] = offersForLoad(loadId)
            .filter(isLive)
            .map((offer) => ({ offer, pilot: applicantSummary(offer.pilotId) }));

          return Response.json({
            applicants: rankApplicants(applicants),
            // Whoever is hired: name, phone, vehicle. Nothing about anybody
            // who merely applied.
            assigned: l.slots
              .filter((s) => s.assignedPilotId)
              .map((s) => ({ slotId: s.id, pilot: revealedPilot(s.assignedPilotId!) })),
            decided: offersForLoad(loadId).filter((o) => !isLive(o)),
          });
        }

        if (caller.role !== "pilot") return Response.json({ offers: [], assignments: [] });

        const assignments = assignmentsForPilot(caller.id);
        return Response.json({
          offers: offersByPilot(caller.id).map((offer) => {
            const l = loadById(offer.loadId);
            return { offer, load: l ? publicLoad(l) : null };
          }),
          /*
           * On an assignment the pilot gets the whole load — yard address,
           * site contacts, permit numbers — and the company's phone. That is
           * the reveal, and it is keyed on the assignment existing.
           */
          assignments: assignments.map((assignment) => {
            const l = loadById(assignment.loadId);
            return {
              assignment,
              load: l ? revealedLoad(l) : null,
              company: revealedCompany(assignment.dispatcherId),
            };
          }),
        });
      },

      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Malformed request." }, { status: 400 });
        }

        const action = String(body.action ?? "");
        const auth = await authorize(request, `offers:${action}`);
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        const gate = checkRateLimit(`offers:${caller.id}`, OFFER_LIMIT);
        if (!gate.ok) {
          return Response.json(
            { error: "Too many requests. Try again shortly." },
            { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
          );
        }

        switch (action) {
          case "offer": {
            const result = makeOffer({
              loadId: str(body.loadId, 64),
              slotId: str(body.slotId, 64),
              pilotId: caller.id,
              pilotName: caller.fullName,
              amountCents: Math.round(Number(body.amountCents) || 0),
              pickupEstimate: str(body.pickupEstimate, 120) || null,
              notes: str(body.notes, 1000) || null,
            });
            if (result.error) {
              return Response.json(
                { error: result.error, reasons: result.reasons },
                { status: 400 },
              );
            }

            const offeredOn = loadById(str(body.loadId, 64));

            // A fixed-price offer is an assignment, so the reveal happens now.
            if (result.assignment) {
              const l = loadById(result.assignment.loadId);
              recordAudit({
                actorId: caller.id,
                actorEmail: caller.email,
                action: "assignment.created",
                subject: result.assignment.loadId,
                detail: `${l?.reference}: accepted a fixed-price position.`,
              });
              // The dispatcher did not do anything here, so they are the one
              // who would otherwise never find out.
              await notify({
                event: "position.filled",
                userId: result.assignment.dispatcherId,
                // The assignment, not the load: a load with a lead car and a
                // chase car filled by two pilots is two things to be told.
                subject: result.assignment.id,
                vars: {
                  reference: l?.reference,
                  personName: caller.fullName,
                  amount: formatMoney(result.assignment.agreedAmountCents),
                },
                target: { screen: "loads", id: result.assignment.loadId },
              });

              return Response.json({
                offer: result.offer,
                assignment: result.assignment,
                load: l ? revealedLoad(l) : null,
                company: revealedCompany(result.assignment.dispatcherId),
              });
            }

            if (offeredOn) {
              await notify({
                event: "offer.received",
                userId: offeredOn.dispatcherId,
                // The offer, not the load. Two pilots bidding is two messages.
                subject: result.offer!.id,
                vars: {
                  reference: offeredOn.reference,
                  personName: caller.fullName,
                  amount: formatMoney(result.offer!.amountCents),
                },
                target: { screen: "loads", id: offeredOn.id },
              });
            }

            return Response.json({ offer: result.offer });
          }

          case "withdraw": {
            const result = withdrawOffer(str(body.offerId, 64), caller.id);
            if (result.error) return Response.json({ error: result.error }, { status: 400 });
            return Response.json({ offer: result.offer });
          }

          case "accept": {
            const result = acceptOffer(str(body.offerId, 64), caller.id);
            if (result.error) {
              return Response.json(
                { error: result.error, reasons: result.reasons },
                { status: 400 },
              );
            }

            const assignment = result.assignment!;
            const l = loadById(assignment.loadId);
            recordAudit({
              actorId: caller.id,
              actorEmail: caller.email,
              action: "assignment.created",
              subject: assignment.loadId,
              detail: `${l?.reference}: hired a pilot for one position.`,
            });

            const company = revealedCompany(assignment.dispatcherId);
            await notify({
              event: "offer.accepted",
              userId: assignment.pilotId,
              subject: assignment.id,
              vars: {
                reference: l?.reference,
                companyName: company.companyName,
                amount: formatMoney(assignment.agreedAmountCents),
              },
              target: { screen: "orders", id: assignment.loadId },
            });

            /*
             * Everybody else on that position was declined by this hire.
             *
             * They are told now rather than left holding a day free for a job
             * they will never get — which is the same reason the store declines
             * them in the first write.
             */
            for (const other of offersForLoad(assignment.loadId)) {
              if (other.id === assignment.offerId) continue;
              if (other.slotId !== assignment.slotId) continue;
              if (other.status !== "declined") continue;
              await notify({
                event: "offer.declined",
                userId: other.pilotId,
                subject: other.id,
                vars: { reference: l?.reference, companyName: company.companyName },
                target: { screen: "loads", id: assignment.loadId },
              });
            }

            return Response.json({
              assignment,
              // The dispatcher's half of the reveal.
              pilot: revealedPilot(assignment.pilotId),
              load: l,
            });
          }

          case "decline": {
            const result = declineOffer(str(body.offerId, 64), caller.id, str(body.reason, 300));
            if (result.error) return Response.json({ error: result.error }, { status: 400 });

            const declinedOn = loadById(result.offer!.loadId);
            await notify({
              event: "offer.declined",
              userId: result.offer!.pilotId,
              subject: result.offer!.id,
              vars: {
                reference: declinedOn?.reference,
                companyName: revealedCompany(caller.id).companyName,
                reason: result.offer!.declineReason ?? undefined,
              },
              target: { screen: "loads", id: result.offer!.loadId },
            });
            return Response.json({ offer: result.offer });
          }

          case "assignment-status": {
            // The pilot's own view of one load, for the live-trip screens.
            const assignment = assignmentFor(str(body.loadId, 64), caller.id);
            if (!assignment) return Response.json({ assignment: null });
            const l = loadById(assignment.loadId);
            return Response.json({
              assignment,
              load: l ? revealedLoad(l) : null,
              company: revealedCompany(assignment.dispatcherId),
            });
          }

          default:
            return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
        }
      },
    },
  },
});

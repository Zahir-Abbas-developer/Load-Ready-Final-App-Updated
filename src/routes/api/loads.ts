import { createFileRoute } from "@tanstack/react-router";
import { estimateDistance } from "@/server/routing.server";
import { authorize, isDenied } from "@/server/authz.server";
import { checkRateLimit } from "@/server/rate-limit.server";
import { recordAudit } from "@/server/audit-store.server";
import { notifyEach } from "@/server/notifier.server";
import { offersForLoad } from "@/server/offer-store.server";
import { regionName } from "@/lib/profile/catalog";
import {
  cancelLoad,
  createLoad,
  loadById,
  loadsFor,
  publicLoad,
  publishLoad,
  publishedLoads,
  updateLoad,
  whatIsMissing,
  type DraftLoad,
} from "@/server/load-store.server";
import {
  allPilotRecords,
  companyFor,
  pilotRecord,
  withLiveStatus,
} from "@/server/profile-store.server";
import { isEntitledPilot } from "@/server/billing-store.server";
import {
  eligibleSlots,
  ineligibilityFor,
  isDiscoverable,
  isEligibleFor,
  rankForBoard,
} from "@/lib/marketplace/matching";
import { isEquipmentId, isRegionCode, isServiceId } from "@/lib/profile/catalog";
import type { EquipmentId, ServiceId } from "@/lib/profile/catalog";
import type { EscortSlot, LoadContact, LoadPlace } from "@/lib/marketplace/types";
import type { PilotRecord } from "@/lib/profile/types";

/**
 * Loads: posting them, and finding them.
 *
 * Dispatchers own their own loads and see everything on them. Pilots see the
 * masked view — no street address, no contacts, no permit files, no route —
 * until an assignment exists (ADR-8). That masking is done by `publicLoad`
 * building the response from a list of fields, so nothing added later leaks by
 * being forgotten.
 *
 * **Dispatchers are not checked for a subscription anywhere here.** Posting is
 * free and stays free (ADR-1).
 */

const WRITE_LIMIT = { limit: 120, windowMs: 60 * 60 * 1000 };

const str = (v: unknown, max = 200): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const isoOrNull = (v: unknown): string | null => {
  const s = str(v, 40);
  if (!s) return null;
  return Number.isNaN(Date.parse(s)) ? null : s;
};

function readPlace(raw: unknown): LoadPlace {
  const p = (raw ?? {}) as Record<string, unknown>;
  const region = str(p.region, 4);
  return {
    address: str(p.address),
    city: str(p.city, 80),
    region: isRegionCode(region) ? region : "",
    postalCode: str(p.postalCode, 16) || null,
    // Never taken from the client. Coordinates arrive from a geocoder or not
    // at all — a number typed into a form is a marker in the wrong place with
    // total confidence (BACKLOG F-47).
    lng: null,
    lat: null,
  };
}

function readSlots(raw: unknown): EscortSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((entry) => {
    const s = (entry ?? {}) as Record<string, unknown>;
    const service = str(s.service, 30);
    const mode = s.pricingMode === "bidding" ? "bidding" : "fixed";
    return {
      id: str(s.id, 64),
      service: (isServiceId(service) ? service : "lead") as ServiceId,
      requiredEquipment: (Array.isArray(s.requiredEquipment) ? s.requiredEquipment : [])
        .filter((e): e is string => typeof e === "string" && isEquipmentId(e))
        .slice(0, 12) as EquipmentId[],
      poleHeightFt: num(s.poleHeightFt),
      pricingMode: mode,
      rateBasis: s.rateBasis === "per_mile" ? "per_mile" : "flat",
      amountCents: Math.max(0, Math.round(num(s.amountCents) ?? 0)),
      maxAmountCents:
        mode === "bidding" ? Math.max(0, Math.round(num(s.maxAmountCents) ?? 0)) : null,
      assignedPilotId: null,
    };
  });
}

function readContacts(raw: unknown): LoadContact[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 6).map((entry, i) => {
    const c = (entry ?? {}) as Record<string, unknown>;
    return {
      id: str(c.id, 64) || `contact-${i}`,
      name: str(c.name, 120),
      role: str(c.role, 60),
      phone: str(c.phone, 40),
    };
  });
}

function readDraft(body: Record<string, unknown>): DraftLoad {
  const strings = (v: unknown, max = 12) =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(0, max) : [];

  return {
    title: str(body.title, 160),
    description: str(body.description, 2000) || null,
    origin: readPlace(body.origin),
    destination: readPlace(body.destination),
    pickupFrom: isoOrNull(body.pickupFrom) ?? "",
    pickupTo: isoOrNull(body.pickupTo) ?? "",
    deliverBy: isoOrNull(body.deliverBy),
    lengthIn: num(body.lengthIn),
    widthIn: num(body.widthIn),
    heightIn: num(body.heightIn),
    weightLb: num(body.weightLb),
    distanceMi: num(body.distanceMi),
    permitNumbers: strings(body.permitNumbers).map((s) => s.slice(0, 60)),
    permitFileIds: strings(body.permitFileIds),
    slots: readSlots(body.slots),
    contacts: readContacts(body.contacts),
    route: null,
    constraints: strings(body.constraints, 20).map((s) => s.slice(0, 200)),
    notes: str(body.notes, 2000) || null,
    visibility: body.visibility === "invited" ? "invited" : "public",
    invitedPilotIds: strings(body.invitedPilotIds, 50),
  };
}

/** Enough for a dispatcher filling in a form; not enough for a loop. */
const DISTANCE_LIMIT = { limit: 20, windowMs: 10 * 60 * 1000 };

export const Route = createFileRoute("/api/loads")({
  server: {
    handlers: {
      /**
       * A dispatcher's own loads, or a pilot's board.
       *
       * `?id=` returns one: the full record for the dispatcher who owns it, the
       * masked view with eligibility for everyone else.
       */
      GET: async ({ request }) => {
        const auth = await authorize(request, "loads:GET");
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        const url = new URL(request.url);
        const id = url.searchParams.get("id");

        if (id) {
          const found = loadById(id);
          if (!found) return Response.json({ error: "No such load." }, { status: 404 });

          if (found.dispatcherId === caller.id || caller.role === "admin") {
            return Response.json({ load: found, missing: whatIsMissing(found), mine: true });
          }

          if (caller.role !== "pilot") {
            return Response.json({ error: "No such load." }, { status: 404 });
          }

          const record = withLiveStatus(pilotRecord(caller.id, caller.fullName));
          if (!isDiscoverable(found, record)) {
            // The same answer a missing load gives, so a load offered to named
            // pilots cannot be found by trying ids.
            return Response.json({ error: "No such load." }, { status: 404 });
          }

          const entitled = isEntitledPilot(caller.id);
          return Response.json({
            load: publicLoad(found),
            mine: false,
            slotEligibility: found.slots.map((slot) => ({
              slotId: slot.id,
              reasons: ineligibilityFor(found, slot, { record, entitled }),
            })),
          });
        }

        if (caller.role === "dispatcher") {
          const mine = loadsFor(caller.id);
          return Response.json({
            loads: mine,
            missing: Object.fromEntries(mine.map((l) => [l.id, whatIsMissing(l)])),
          });
        }

        if (caller.role !== "pilot") return Response.json({ loads: [] });

        // ── the pilot's board ────────────────────────────────────────────
        const record = withLiveStatus(pilotRecord(caller.id, caller.fullName));
        const entitled = isEntitledPilot(caller.id);

        const rows = publishedLoads()
          .filter((l) => isDiscoverable(l, record))
          .map((l) => {
            const open = eligibleSlots(l, { record, entitled });
            return {
              load: publicLoad(l),
              eligible: open.length > 0,
              eligibleSlotIds: open.map((s) => s.id),
              // Why not, for the first position they cannot take. Shown on the
              // card so a pilot learns without opening every load.
              reasons: open.length > 0 ? [] : ineligibilityFor(l, l.slots[0], { record, entitled }),
            };
          });

        /*
         * The pilot's regions travel with the rows.
         *
         * An empty board has two completely different causes and the screen
         * could not tell them apart: nobody has posted work in this pilot's
         * states, or **the pilot has not said which states they work in** — in
         * which case nothing can ever match, and the board stays empty forever
         * with no hint why. The second is the state every new pilot is in.
         */
        return Response.json({
          loads: rankForBoard(rows),
          // `?? []` because a pilot who has never opened their profile has no
          // regions field at all, and an absent key is dropped by JSON — which
          // would leave the screen unable to tell the two empties apart again.
          workingRegions: record.profile.workingRegions ?? [],
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
        const auth = await authorize(request, `loads:${action}`);
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        const gate = checkRateLimit(`loads:${caller.id}`, WRITE_LIMIT);
        if (!gate.ok) {
          return Response.json(
            { error: "Too many changes. Try again shortly." },
            { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
          );
        }

        /** Every write below is on a load this dispatcher owns. */
        const owned = () => {
          const found = loadById(str(body.id, 64));
          if (!found || found.dispatcherId !== caller.id) return null;
          return found;
        };

        switch (action) {
          case "estimate-distance": {
            /*
             * Rate limited because it calls somebody else's service, and one
             * of the two is free on the condition that we stay under a
             * request a second. A dispatcher filling a form needs a handful;
             * anything past that is a loop.
             */
            const gate = checkRateLimit(`distance:${caller.id}`, DISTANCE_LIMIT);
            if (!gate.ok) {
              return Response.json(
                { error: "Give it a moment before working that out again." },
                { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
              );
            }

            /*
             * City and state only. The street address is on the same form and
             * is deliberately not sent: it is the thing this product hides
             * until somebody is hired (ADR-8).
             */
            const place = (v: unknown) => ({
              city:
                typeof (v as { city?: unknown })?.city === "string"
                  ? (v as { city: string }).city
                  : "",
              region:
                typeof (v as { region?: unknown })?.region === "string"
                  ? (v as { region: string }).region
                  : "",
            });

            const result = await estimateDistance(place(body.from), place(body.to));
            if (!result.ok) return Response.json({ error: result.reason }, { status: 422 });
            return Response.json({ estimate: result.estimate });
          }

          case "create": {
            const created = createLoad(caller.id, readDraft(body));
            return Response.json({ load: created, missing: whatIsMissing(created) });
          }

          case "update": {
            if (!owned()) return Response.json({ error: "No such load." }, { status: 404 });
            const { load: next, error } = updateLoad(str(body.id, 64), readDraft(body));
            if (error || !next) return Response.json({ error }, { status: 400 });
            return Response.json({ load: next, missing: whatIsMissing(next) });
          }

          case "publish": {
            if (!owned()) return Response.json({ error: "No such load." }, { status: 404 });
            const { load: next, error, missing } = publishLoad(str(body.id, 64));
            if (error || !next) return Response.json({ error, missing }, { status: 400 });

            recordAudit({
              actorId: caller.id,
              actorEmail: caller.email,
              action: "load.published",
              subject: next.id,
              detail: `${next.reference}: ${next.slots.length} position(s), ${next.origin.region} to ${next.destination.region}.`,
            });

            /*
             * The pilots this load is actually for.
             *
             * The same matching the board uses, run once at publish. A pilot
             * who could not take any position on it is not told about it —
             * a notification you cannot act on is noise, and noise is how
             * people learn to ignore the ones that matter.
             */
            const audience = allPilotRecords()
              .map((r: PilotRecord) => withLiveStatus(r))
              .filter((record: PilotRecord) => {
                if (!isDiscoverable(next, record)) return false;
                return next.slots.some((slot) =>
                  isEligibleFor(next, slot, {
                    record,
                    entitled: isEntitledPilot(record.profile.userId),
                  }),
                );
              })
              .map((r: PilotRecord) => r.profile.userId);

            await notifyEach(audience, {
              event: "load.matching",
              subject: next.id,
              vars: {
                reference: next.reference,
                loadTitle: next.title,
                route: `${next.origin.city}, ${regionName(next.origin.region)} → ${next.destination.city}, ${regionName(next.destination.region)}`,
              },
              target: { screen: "loads", id: next.id },
            });

            return Response.json({ load: next });
          }

          case "cancel": {
            if (!owned()) return Response.json({ error: "No such load." }, { status: 404 });
            const { load: next, error } = cancelLoad(str(body.id, 64), str(body.reason, 500));
            if (error || !next) return Response.json({ error }, { status: 400 });

            recordAudit({
              actorId: caller.id,
              actorEmail: caller.email,
              action: "load.cancelled",
              subject: next.id,
              detail: `${next.reference}: ${next.cancellationReason}`,
            });

            // Anybody who bid on it or was hired for it has cleared time for
            // this. They hear first, not by noticing it has vanished.
            const affected = offersForLoad(next.id)
              .filter((o) => o.status === "pending" || o.status === "accepted")
              .map((o) => o.pilotId);

            await notifyEach(affected, {
              event: "load.cancelled",
              subject: next.id,
              vars: {
                reference: next.reference,
                companyName: companyFor(caller.id).companyName,
                reason: next.cancellationReason ?? undefined,
              },
              target: { screen: "loads", id: next.id },
            });

            return Response.json({ load: next });
          }

          default:
            return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
        }
      },
    },
  },
});

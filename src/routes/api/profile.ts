import { createFileRoute } from "@tanstack/react-router";
import { authorize, isDenied } from "@/server/authz.server";
import { recordAudit } from "@/server/audit-store.server";
import { notify } from "@/server/notifier.server";
import { documentLabel } from "@/lib/profile/catalog";
import { checkRateLimit } from "@/server/rate-limit.server";
import {
  addCertification,
  addDocument,
  allPilotRecords,
  companyFor,
  decideDocument,
  decideProfile,
  pilotRecord,
  removeCertification,
  removeDocument,
  removeVehicle,
  saveVehicle,
  submitForReview,
  updateCompany,
  updatePilotProfile,
  withLiveStatus,
  type EditableCompanyFields,
  type EditableProfileFields,
} from "@/server/profile-store.server";
import {
  MIN_AGE_YEARS,
  isOldEnough,
  missingForReview,
  profileCompletion,
  publicPilotProfile,
} from "@/lib/profile/completion";
import { preferencesFor, updatePreferences } from "@/server/preferences-store.server";
import { isDocumentTypeId, isEquipmentId, isRegionCode, isServiceId } from "@/lib/profile/catalog";
import type { EquipmentId, ServiceId } from "@/lib/profile/catalog";

/**
 * Profiles, documents, certifications, vehicles and the verification queue.
 *
 * The rule that shapes this file: **a pilot may describe themselves, and only
 * an administrator may vouch for them.** Every write below names the fields it
 * accepts rather than spreading the request body, because spreading it would
 * let a pilot send `verificationStatus: "approved"` and approve themselves.
 */

const WRITE_LIMIT = { limit: 240, windowMs: 60 * 60 * 1000 };
const REVIEW_LIMIT = { limit: 300, windowMs: 60 * 60 * 1000 };

function str(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** An ISO date, or null. Anything unparseable is dropped rather than stored. */
function isoDate(v: unknown): string | null {
  const s = str(v, 40);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : s.slice(0, 10);
}

function codeList(v: unknown, valid: (c: string) => boolean, max = 80): string[] {
  if (!Array.isArray(v)) return [];
  // Everything the client sends is checked against the catalogue. A region or
  // an equipment id that is not in the list cannot be matched against a load,
  // so accepting it would silently make a pilot unmatchable.
  return [...new Set(v.filter((c): c is string => typeof c === "string" && valid(c)))].slice(
    0,
    max,
  );
}

/** Only the fields a pilot is allowed to change about themselves. */
function readProfilePatch(body: Record<string, unknown>): EditableProfileFields {
  const patch: EditableProfileFields = {};
  if ("legalName" in body) patch.legalName = str(body.legalName, 120) ?? "";
  if ("businessName" in body) patch.businessName = str(body.businessName, 120);
  if ("phone" in body) patch.phone = str(body.phone, 40);
  if ("dateOfBirth" in body) patch.dateOfBirth = isoDate(body.dateOfBirth);
  if ("addressLine" in body) patch.addressLine = str(body.addressLine, 200);
  if ("city" in body) patch.city = str(body.city, 80);
  if ("region" in body) {
    const region = str(body.region, 4);
    patch.region = region && isRegionCode(region) ? region : null;
  }
  if ("postalCode" in body) patch.postalCode = str(body.postalCode, 16);
  if ("country" in body) {
    const c = str(body.country, 2);
    patch.country = c === "US" || c === "CA" ? c : null;
  }
  if ("serviceRadiusMi" in body) patch.serviceRadiusMi = num(body.serviceRadiusMi);
  if ("workingRegions" in body) patch.workingRegions = codeList(body.workingRegions, isRegionCode);
  if ("services" in body) {
    patch.services = codeList(body.services, isServiceId) as ServiceId[];
  }
  if ("yearsExperience" in body) patch.yearsExperience = num(body.yearsExperience);
  if ("bio" in body) patch.bio = str(body.bio, 1000);
  if ("ratePerMile" in body) patch.ratePerMile = num(body.ratePerMile);
  if ("rateMinimum" in body) patch.rateMinimum = num(body.rateMinimum);
  if ("available" in body) patch.available = body.available === true;
  return patch;
}

function readCompanyPatch(body: Record<string, unknown>): EditableCompanyFields {
  const patch: EditableCompanyFields = {};
  if ("companyName" in body) patch.companyName = str(body.companyName, 160) ?? "";
  // Format only. A real FMCSA lookup is a later phase; validating the shape
  // catches a typo without pretending the number has been checked.
  if ("usdotNumber" in body) {
    const v = str(body.usdotNumber, 12);
    patch.usdotNumber = v && /^\d{1,8}$/.test(v) ? v : null;
  }
  if ("mcNumber" in body) {
    const v = str(body.mcNumber, 12);
    patch.mcNumber = v && /^(MC-?)?\d{1,8}$/i.test(v) ? v.toUpperCase() : null;
  }
  if ("addressLine" in body) patch.addressLine = str(body.addressLine, 200);
  if ("city" in body) patch.city = str(body.city, 80);
  if ("region" in body) {
    const region = str(body.region, 4);
    patch.region = region && isRegionCode(region) ? region : null;
  }
  if ("postalCode" in body) patch.postalCode = str(body.postalCode, 16);
  if ("country" in body) {
    const c = str(body.country, 2);
    patch.country = c === "US" || c === "CA" ? c : null;
  }
  if ("phone" in body) patch.phone = str(body.phone, 40);
  if ("billingContact" in body) patch.billingContact = str(body.billingContact, 160);
  return patch;
}

export const Route = createFileRoute("/api/profile")({
  server: {
    handlers: {
      /** Your own profile, with live document statuses and what is still missing. */
      GET: async ({ request }) => {
        const auth = await authorize(request, "profile:GET");
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        if (caller.role === "dispatcher") {
          const company = companyFor(caller.id, caller.fullName);
          return Response.json({
            role: "dispatcher",
            company,
            preferences: preferencesFor(caller.id, company.country),
          });
        }
        if (caller.role !== "pilot") {
          return Response.json({ role: caller.role, preferences: preferencesFor(caller.id) });
        }

        const record = withLiveStatus(pilotRecord(caller.id, caller.fullName));
        return Response.json({
          role: "pilot",
          record,
          completion: profileCompletion(record),
          missing: missingForReview(record),
          preferences: preferencesFor(caller.id, record.profile.country),
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

        // One gate for every action, from the matrix in authz.server.ts. The
        // per-case "Pilots only" / "Admins only" checks below it are gone: a
        // new case used to inherit no check at all.
        const auth = await authorize(request, `profile:${action}`);
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        const isReview = action.startsWith("review-");
        const gate = checkRateLimit(
          `profile-${isReview ? "review" : "write"}:${caller.id}`,
          isReview ? REVIEW_LIMIT : WRITE_LIMIT,
        );
        if (!gate.ok) {
          return Response.json(
            { error: "Too many changes. Try again shortly." },
            { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
          );
        }

        const ok = (record: ReturnType<typeof pilotRecord>) => {
          const live = withLiveStatus(record);
          return Response.json({
            record: live,
            completion: profileCompletion(live),
            missing: missingForReview(live),
          });
        };

        switch (action) {
          // ── the pilot's own record ──────────────────────────────────────
          case "update-profile": {
            const patch = readProfilePatch(body);

            // An escort driver under 18 cannot be insured for the work, so this
            // is a floor rather than a preference. Checked here because the
            // browser is not where a legal limit gets to live.
            if (patch.dateOfBirth && !isOldEnough(patch.dateOfBirth)) {
              return Response.json(
                { error: `You must be at least ${MIN_AGE_YEARS} to work as a pilot car operator.` },
                { status: 400 },
              );
            }
            return ok(updatePilotProfile(caller.id, caller.fullName, patch));
          }

          case "add-document": {
            const docType = String(body.docType ?? "");
            const fileId = str(body.fileId, 64);
            if (!isDocumentTypeId(docType)) {
              return Response.json({ error: "Unknown document type." }, { status: 400 });
            }
            if (!fileId) return Response.json({ error: "Attach a file." }, { status: 400 });

            const { record } = addDocument(caller.id, caller.fullName, {
              docType: docType as Parameters<typeof addDocument>[2]["docType"],
              documentNumber: str(body.documentNumber, 60),
              issuingRegion: (() => {
                const r = str(body.issuingRegion, 4);
                return r && isRegionCode(r) ? r : null;
              })(),
              expiryDate: isoDate(body.expiryDate),
              fileId,
              fileName: str(body.fileName, 120) ?? "document",
            });
            return ok(record);
          }

          case "remove-document": {
            return ok(removeDocument(caller.id, String(body.documentId ?? "")));
          }

          case "add-certification": {
            const region = str(body.region, 4);
            if (!region || !isRegionCode(region)) {
              return Response.json({ error: "Choose a state or province." }, { status: 400 });
            }
            return ok(
              addCertification(caller.id, caller.fullName, {
                region,
                certNumber: str(body.certNumber, 60),
                expiryDate: isoDate(body.expiryDate),
                fileId: str(body.fileId, 64),
              }),
            );
          }

          case "remove-certification": {
            return ok(removeCertification(caller.id, String(body.certificationId ?? "")));
          }

          case "save-vehicle": {
            return ok(
              saveVehicle(caller.id, caller.fullName, {
                id: str(body.id, 64) ?? undefined,
                vehicleType: str(body.vehicleType, 60) ?? "Pilot car",
                make: str(body.make, 60) ?? "",
                model: str(body.model, 60) ?? "",
                year: num(body.year),
                licensePlate: str(body.licensePlate, 20) ?? "",
                equipment: codeList(body.equipment, isEquipmentId) as EquipmentId[],
                photoFileIds: codeList(body.photoFileIds, () => true, 12),
              }),
            );
          }

          case "remove-vehicle": {
            return ok(removeVehicle(caller.id, String(body.vehicleId ?? "")));
          }

          case "submit-for-review": {
            const { record, error } = submitForReview(caller.id);
            if (error) {
              return Response.json(
                { error, missing: missingForReview(withLiveStatus(record)) },
                { status: 400 },
              );
            }
            return ok(record);
          }

          // ── the dispatcher's company ────────────────────────────────────
          case "update-company": {
            return Response.json({
              company: updateCompany(caller.id, caller.fullName, readCompanyPatch(body)),
            });
          }

          case "update-preferences": {
            return Response.json({
              preferences: updatePreferences(caller.id, {
                units: body.units,
                timeZone: body.timeZone,
                notify: (body.notify as Record<string, unknown>) ?? undefined,
                quietHours: (body.quietHours as Record<string, unknown>) ?? undefined,
              }),
            });
          }

          // ── the verification queue ──────────────────────────────────────
          case "review-queue": {
            const records = allPilotRecords().map((r) => withLiveStatus(r));
            return Response.json({
              records: records.map((r) => ({
                record: r,
                completion: profileCompletion(r),
                // The masked view too, so the console can show exactly what a
                // dispatcher would see of this pilot.
                publicProfile: publicPilotProfile(r),
              })),
            });
          }

          case "review-document": {
            // Captured before the decision, because a rejection detaches nothing
            // but an approval changes what the record says about it.
            const reviewedDocument = pilotRecord(String(body.userId ?? "")).documents.find(
              (d) => d.id === String(body.documentId ?? ""),
            );
            const { record, error } = decideDocument({
              userId: String(body.userId ?? ""),
              documentId: String(body.documentId ?? ""),
              approve: body.approve === true,
              reason: String(body.reason ?? ""),
              actorId: caller.id,
            });
            if (error) return Response.json({ error }, { status: 400 });
            recordAudit({
              actorId: caller.id,
              actorEmail: caller.email,
              action: body.approve === true ? "document.approved" : "document.rejected",
              subject: String(body.userId ?? ""),
              detail: String(body.reason ?? "").slice(0, 200),
            });

            await notify({
              event: body.approve === true ? "document.approved" : "document.rejected",
              userId: String(body.userId ?? ""),
              subject: `${String(body.documentId ?? "")}:${body.approve === true}`,
              vars: {
                documentLabel: reviewedDocument
                  ? documentLabel(reviewedDocument.docType)
                  : undefined,
                reason: String(body.reason ?? "") || undefined,
              },
              target: { screen: "documents" },
            });

            return Response.json({ record: withLiveStatus(record) });
          }

          case "review-profile": {
            const status = body.approve === true ? "approved" : "rejected";
            const { record, error } = decideProfile({
              userId: String(body.userId ?? ""),
              status,
              note: String(body.note ?? ""),
              actorId: caller.id,
            });
            if (error) return Response.json({ error }, { status: 400 });
            recordAudit({
              actorId: caller.id,
              actorEmail: caller.email,
              action: `pilot.${status}`,
              subject: String(body.userId ?? ""),
              detail: String(body.note ?? "").slice(0, 200),
            });
            return Response.json({ record: withLiveStatus(record) });
          }

          default:
            return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
        }
      },
    },
  },
});

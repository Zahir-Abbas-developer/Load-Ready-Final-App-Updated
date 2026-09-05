import { createFileRoute } from "@tanstack/react-router";
import { authorize, isDenied } from "@/server/authz.server";
import { recordAudit } from "@/server/audit-store.server";
import { callerKey } from "@/server/rate-limit.server";
import {
  acceptancesFor,
  allCurrent,
  currentVersion,
  launchReadiness,
  outstandingFor,
  publishVersion,
  recordAcceptance,
  versionHistory,
} from "@/server/legal-store.server";
import { LEGAL_DOCUMENTS, isLegalKind } from "@/lib/legal/documents";

/**
 * The policy set, its versions, and who has accepted what.
 *
 * The documents themselves are public — a carrier deciding whether to use
 * LoadReady reads the terms before creating an account, and a policy you have
 * to sign up to read is not a policy anybody trusts. Everything about *who
 * accepted what* needs a session, and publishing needs an administrator.
 */

/** The caller's address, for the acceptance record. Best effort — see callerKey. */
function callerIp(request: Request): string | null {
  const key = callerKey(request, "legal");
  const ip = key.slice("legal:".length);
  return ip === "unknown" ? null : ip;
}

export const Route = createFileRoute("/api/legal")({
  server: {
    handlers: {
      /**
       * The current version of every document, or one by `?kind=`.
       *
       * Public on purpose. A signed-in caller also gets what they still have to
       * accept, which is what drives the re-acceptance prompt.
       */
      GET: async ({ request }) => {
        const auth = await authorize(request, "legal:GET");
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller;

        const url = new URL(request.url);
        const kind = url.searchParams.get("kind");

        if (kind) {
          if (!isLegalKind(kind)) {
            return Response.json({ error: "No such document." }, { status: 404 });
          }
          const version = currentVersion(kind);
          if (!version) return Response.json({ error: "No such document." }, { status: 404 });
          return Response.json({ document: version, meta: LEGAL_DOCUMENTS });
        }

        return Response.json({
          documents: allCurrent(),
          meta: LEGAL_DOCUMENTS,
          outstanding:
            caller && caller.role !== "admin"
              ? outstandingFor(caller.id, caller.role).map((v) => ({
                  kind: v.kind,
                  version: v.version,
                }))
              : [],
          accepted: caller ? acceptancesFor(caller.id) : [],
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
        const auth = await authorize(request, `legal:${action}`);
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        switch (action) {
          case "accept": {
            const kind = String(body.kind ?? "");
            if (!isLegalKind(kind)) {
              return Response.json({ error: "No such document." }, { status: 400 });
            }

            const live = currentVersion(kind);
            if (!live) return Response.json({ error: "No such document." }, { status: 400 });

            /*
             * The version accepted is the one the server currently serves, not
             * one the client names. Otherwise somebody could accept v1 forever
             * and never see a change.
             */
            const acceptance = recordAcceptance({
              userId: caller.id,
              kind,
              version: live.version,
              ip: callerIp(request),
            });

            return Response.json({
              acceptance,
              outstanding:
                caller.role === "admin"
                  ? []
                  : outstandingFor(caller.id, caller.role).map((v) => ({
                      kind: v.kind,
                      version: v.version,
                    })),
            });
          }

          case "history": {
            const kind = String(body.kind ?? "");
            if (!isLegalKind(kind)) {
              return Response.json({ error: "No such document." }, { status: 400 });
            }
            return Response.json({ versions: versionHistory(kind) });
          }

          case "publish": {
            const kind = String(body.kind ?? "");
            if (!isLegalKind(kind)) {
              return Response.json({ error: "No such document." }, { status: 400 });
            }

            const { version, error } = publishVersion({
              kind,
              body: String(body.body ?? ""),
              requiresReacceptance: body.requiresReacceptance === true,
              effectiveAt: typeof body.effectiveAt === "string" ? body.effectiveAt : undefined,
              publishedBy: caller.email,
            });
            if (error || !version) return Response.json({ error }, { status: 400 });

            recordAudit({
              actorId: caller.id,
              actorEmail: caller.email,
              action: "legal.published",
              subject: kind,
              detail: `v${version.version}${version.requiresReacceptance ? ", re-acceptance required" : ""}${
                version.unresolved.length > 0
                  ? `, still has ${version.unresolved.length} placeholder(s)`
                  : ""
              }`,
            });

            return Response.json({ version, readiness: launchReadiness() });
          }

          case "readiness":
            return Response.json(launchReadiness());

          default:
            return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { authorize, isDenied } from "@/server/authz.server";
import { checkRateLimit } from "@/server/rate-limit.server";
import { recordAudit } from "@/server/audit-store.server";
import { liveAssignmentsFor } from "@/server/offer-store.server";
import {
  DELETION_GRACE_DAYS,
  cancelAccountDeletion,
  clearedCookie,
  deletionDueAt,
  isSecureRequest,
  requestAccountDeletion,
} from "@/server/auth-store.server";
import { exportUserData } from "@/server/data-rights.server";

/**
 * The two rights a privacy policy promises: a copy of your data, and its
 * removal.
 *
 * Both self-serve. Apple and Google require deletion to be startable inside the
 * app, and "email us" — which is what loadready.ai says today — satisfies
 * neither.
 */

/** Building an export reads every store; a handful an hour is plenty. */
const EXPORT_LIMIT = { limit: 6, windowMs: 60 * 60 * 1000 };
const DELETE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };

export const Route = createFileRoute("/api/account")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Malformed request." }, { status: 400 });
        }

        const action = String(body.action ?? "");
        const auth = await authorize(request, `account:${action}`);
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        switch (action) {
          case "export": {
            const gate = checkRateLimit(`export:${caller.id}`, EXPORT_LIMIT);
            if (!gate.ok) {
              return Response.json(
                { error: "Too many exports. Try again shortly." },
                { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
              );
            }

            const data = await exportUserData(caller.id);
            if (!data) return Response.json({ error: "No such account." }, { status: 404 });

            recordAudit({
              actorId: caller.id,
              actorEmail: caller.email,
              action: "account.exported",
              subject: caller.id,
              detail: "The account holder took a copy of their own data.",
            });

            // Sent as a download rather than rendered: it is a file somebody
            // keeps, and it must never sit in a shared cache.
            return new Response(JSON.stringify(data, null, 2), {
              headers: {
                "content-type": "application/json",
                "content-disposition": `attachment; filename="loadready-data-${caller.id}.json"`,
                "cache-control": "private, no-store",
              },
            });
          }

          case "request-deletion": {
            const gate = checkRateLimit(`delete:${caller.id}`, DELETE_LIMIT);
            if (!gate.ok) {
              return Response.json({ error: "Too many attempts." }, { status: 429 });
            }

            /*
             * Nobody disappears in the middle of a job.
             *
             * There is somebody at a yard at six tomorrow morning expecting
             * this person. Deleting the account would take the assignment, the
             * phone number and the job sheet with it and leave the other side
             * with a load and no escort. Finish it or cancel it first — both
             * take one tap, and cancelling at least tells them.
             */
            const live = liveAssignmentsFor(caller.id);
            if (live.length > 0) {
              return Response.json(
                {
                  error: `You are on ${live.length} job${live.length === 1 ? "" : "s"} that has not finished. Finish or cancel ${live.length === 1 ? "it" : "them"} first — somebody is expecting you.`,
                },
                { status: 400 },
              );
            }

            const { dueAt, error } = await requestAccountDeletion(
              caller.id,
              String(body.password ?? ""),
            );
            if (error || !dueAt) return Response.json({ error }, { status: 400 });

            recordAudit({
              actorId: caller.id,
              actorEmail: caller.email,
              action: "account.deletion_requested",
              subject: caller.id,
              detail: `Grace period ends ${new Date(dueAt).toISOString()}.`,
            });

            /*
             * Every session was dropped, so this cookie is already dead — but
             * clearing it means the browser stops sending it and the app shows
             * the signed-out state immediately rather than after a failed call.
             */
            return Response.json(
              { dueAt, graceDays: DELETION_GRACE_DAYS },
              { headers: { "set-cookie": clearedCookie(isSecureRequest(request)) } },
            );
          }

          case "cancel-deletion": {
            const { error } = await cancelAccountDeletion(caller.id);
            if (error) return Response.json({ error }, { status: 400 });

            recordAudit({
              actorId: caller.id,
              actorEmail: caller.email,
              action: "account.deletion_cancelled",
              subject: caller.id,
              detail: "The account holder changed their mind inside the grace period.",
            });

            return Response.json({ ok: true });
          }

          case "deletion-status": {
            return Response.json({
              deletionRequestedAt: caller.deletionRequestedAt ?? null,
              dueAt: caller.deletionRequestedAt ? deletionDueAt(caller.deletionRequestedAt) : null,
              graceDays: DELETION_GRACE_DAYS,
            });
          }

          default:
            return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { authorize, isDenied } from "@/server/authz.server";
import { funnels } from "@/server/growth.server";
import { adminJobs, adminLoads, buildOverview } from "@/server/admin-overview.server";
import { readAudit, recordAudit } from "@/server/audit-store.server";
import { deadLetters } from "@/server/notification-store.server";
import { mailerConfigured } from "@/server/mailer.server";
import { launchReadiness } from "@/server/legal-store.server";
import {
  clearMfa,
  isSecureRequest,
  listAccounts,
  reactivateAccount,
  revokeSessions,
  sessionCookie,
  startViewAs,
  suspendAccount,
  VIEW_AS_MS,
} from "@/server/auth-store.server";
import { subscriptionFor } from "@/server/billing-store.server";
import { closedFlags, settings, updateSettings } from "@/server/settings-store.server";
import {
  allDisputes,
  disputeById,
  openDispute,
  openReports,
  readsOn,
  recordRead,
  resolveDispute,
} from "@/server/dispute-store.server";
import { messagesOn, proofsOn } from "@/server/message-store.server";
import { assignmentById } from "@/server/offer-store.server";
import { trailFor } from "@/server/tracking-store.server";
import { pilotRecord, withLiveStatus } from "@/server/profile-store.server";
import { notify } from "@/server/notifier.server";
import { profileCompletion } from "@/lib/profile/completion";

/**
 * The console's own data.
 *
 * Administrators only, and — because every admin key outside the enrolment
 * handful is behind it — only with a second factor. That is enforced by
 * `authorize` rather than repeated here.
 *
 * What this endpoint deliberately does **not** carry: names, phone numbers,
 * addresses or positions. It answers "how is the marketplace doing" and "which
 * jobs are running", not "where is Alice". An administrator who needs to see
 * into a particular job goes through the dispute tool, with a reason and an
 * audit entry — which is the next sub-phase (BACKLOG F-99).
 */

export const Route = createFileRoute("/api/admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authorize(request, "admin:GET");
        if (isDenied(auth)) return auth.response;

        const url = new URL(request.url);
        const view = url.searchParams.get("view") ?? "overview";

        if (view === "growth") {
          /*
           * Where people stop, rather than how many there are. Counted from
           * the same records the product writes — there is no analytics
           * product here and no event stream, so nobody outside sees
           * anybody’s behaviour.
           */
          return Response.json({ funnels: await funnels() });
        }

        if (view === "jobs") {
          // Both halves of the same question: what is on the market, and what
          // is actually running.
          return Response.json({ jobs: adminJobs(), loads: adminLoads() });
        }

        if (view === "audit") {
          const subject = url.searchParams.get("subject") ?? undefined;
          const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500);
          return Response.json({ entries: readAudit({ subject, limit }) });
        }

        if (view === "people") {
          /*
           * The account list, with the state that decides whether somebody can
           * work: approved, suspended, entitled, second factor.
           *
           * Deliberately no phone numbers and no addresses. Whether somebody
           * can take work is an administrator's business; how to reach them is
           * the business of whoever hired them (ADR-8).
           */
          const term = (url.searchParams.get("q") ?? "").trim().toLowerCase();
          const accounts = await listAccounts();

          const rows = accounts
            .filter(
              (a) =>
                !term ||
                a.email.toLowerCase().includes(term) ||
                a.fullName.toLowerCase().includes(term),
            )
            .slice(0, 100)
            .map((a) => {
              const subscription = a.role === "pilot" ? subscriptionFor(a.id) : null;
              const record = a.role === "pilot" ? withLiveStatus(pilotRecord(a.id)) : null;
              return {
                id: a.id,
                email: a.email,
                fullName: a.fullName,
                role: a.role,
                approval: a.approval,
                builtIn: a.builtIn,
                mfaEnabled: a.mfaEnabled,
                createdAt: a.createdAt,
                suspendedAt: a.suspendedAt ?? null,
                suspensionReason: a.suspensionReason ?? null,
                deletionRequestedAt: a.deletionRequestedAt ?? null,
                verification: record?.profile.verificationStatus ?? null,
                profileComplete: record ? profileCompletion(record) : null,
                subscription: subscription
                  ? { status: subscription.status, override: subscription.override }
                  : null,
              };
            });

          return Response.json({ people: rows });
        }

        if (view === "settings") {
          return Response.json({ settings: settings() });
        }

        if (view === "disputes") {
          return Response.json({ reports: openReports(), disputes: allDisputes() });
        }

        if (view === "evidence") {
          /*
           * The one place an administrator can read two people's private
           * conversation — and only with an open dispute naming the job, which
           * is what supplies the reason.
           *
           * Every read is written down. Not for our benefit: "who has read my
           * messages" goes into the person's own data export.
           */
          const disputeId = (url.searchParams.get("disputeId") ?? "").slice(0, 64);
          const dispute = disputeById(disputeId);
          if (!dispute) return Response.json({ error: "No such dispute." }, { status: 404 });
          if (dispute.status !== "open") {
            return Response.json(
              { error: "That dispute is resolved. Reopen it if you need to look again." },
              { status: 403 },
            );
          }

          const assignment = assignmentById(dispute.assignmentId);
          for (const kind of ["messages", "proof", "trail"] as const) {
            recordRead({
              disputeId,
              assignmentId: dispute.assignmentId,
              adminId: auth.caller!.id,
              adminEmail: auth.caller!.email,
              kind,
            });
          }
          recordAudit({
            actorId: auth.caller!.id,
            actorEmail: auth.caller!.email,
            action: "dispute.evidence_read",
            subject: dispute.assignmentId,
            detail: dispute.summary,
          });

          return Response.json({
            dispute,
            assignment,
            messages: messagesOn(dispute.assignmentId),
            proofs: proofsOn(dispute.assignmentId),
            trail: trailFor(dispute.assignmentId).length,
            reads: readsOn(disputeId),
          });
        }

        if (view === "health") {
          return Response.json({
            email: {
              configured: mailerConfigured(),
              /*
               * The messages that never arrived, after every retry.
               *
               * This is the list that answers "we told them and they say we
               * did not" — which is why the queue marks them dead rather than
               * deleting them.
               */
              deadLetters: deadLetters().slice(-100),
            },
            legal: launchReadiness(),
          });
        }

        return Response.json({ overview: await buildOverview() });
      },

      /**
       * The things an administrator can actually do to an account.
       *
       * Every one of them needs a reason, writes an audit entry, and tells the
       * person it happened to. The last of those is the control that matters:
       * a power nobody can see used is a power nobody can object to.
       */
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Malformed request." }, { status: 400 });
        }

        const action = String(body.action ?? "");
        const auth = await authorize(request, `admin:${action}`);
        if (isDenied(auth)) return auth.response;
        const admin = auth.caller!;

        const userId = String(body.userId ?? "").slice(0, 64);
        const reason = String(body.reason ?? "")
          .trim()
          .slice(0, 500);

        const audit = (what: string, detail: string) =>
          recordAudit({
            actorId: admin.id,
            actorEmail: admin.email,
            action: what,
            subject: userId,
            detail,
          });

        switch (action) {
          case "settings": {
            const next = updateSettings(
              {
                flags: body.flags as Record<string, unknown> | undefined,
                announcement: body.announcement,
              },
              admin.email,
            );
            recordAudit({
              actorId: admin.id,
              actorEmail: admin.email,
              action: "settings.changed",
              subject: "settings",
              detail:
                closedFlags().length > 0
                  ? `Closed: ${closedFlags().join(", ")}.`
                  : "Everything open.",
            });
            return Response.json({ settings: next });
          }

          case "open-dispute": {
            const result = openDispute({
              assignmentId: String(body.assignmentId ?? "").slice(0, 64),
              openedBy: admin.id,
              summary: reason,
              reportIds: Array.isArray(body.reportIds)
                ? (body.reportIds as string[]).slice(0, 50)
                : [],
            });
            if (result.error) return Response.json({ error: result.error }, { status: 400 });

            recordAudit({
              actorId: admin.id,
              actorEmail: admin.email,
              action: "dispute.opened",
              subject: result.dispute!.assignmentId,
              detail: reason,
            });
            return Response.json({ dispute: result.dispute });
          }

          case "resolve-dispute": {
            const result = resolveDispute(String(body.disputeId ?? "").slice(0, 64), reason);
            if (result.error) return Response.json({ error: result.error }, { status: 400 });

            recordAudit({
              actorId: admin.id,
              actorEmail: admin.email,
              action: "dispute.resolved",
              subject: result.dispute!.assignmentId,
              detail: reason,
            });
            return Response.json({ dispute: result.dispute });
          }

          case "suspend": {
            const result = await suspendAccount(userId, reason);
            if (result.error) return Response.json({ error: result.error }, { status: 400 });

            audit("account.suspended", reason);
            await notify({
              event: "account.suspended",
              userId,
              subject: `suspend:${result.user!.suspendedAt}`,
              vars: { reason },
              target: { screen: "account" },
            });
            return Response.json({ user: result.user });
          }

          case "reactivate": {
            const result = await reactivateAccount(userId);
            if (result.error) return Response.json({ error: result.error }, { status: 400 });

            audit("account.reactivated", reason);
            await notify({
              event: "account.reactivated",
              userId,
              subject: `reactivate:${Date.now()}`,
              target: { screen: "account" },
            });
            return Response.json({ user: result.user });
          }

          case "revoke-sessions": {
            const result = await revokeSessions(userId);
            if (result.error) return Response.json({ error: result.error }, { status: 400 });

            audit("account.sessions_revoked", reason);
            return Response.json({ user: result.user });
          }

          case "clear-mfa": {
            const result = await clearMfa(userId, reason);
            if (result.error) return Response.json({ error: result.error }, { status: 400 });

            audit("account.mfa_cleared", reason);
            await notify({
              event: "account.mfa_cleared",
              userId,
              subject: `mfa-cleared:${Date.now()}`,
              vars: { reason },
              target: { screen: "account" },
            });
            return Response.json({ user: result.user });
          }

          case "view-as": {
            const result = await startViewAs(admin.id, userId, reason);
            if (result.error || !result.token) {
              return Response.json({ error: result.error }, { status: 400 });
            }

            audit("account.viewed_as", reason);
            /*
             * The person being viewed is told, always and immediately.
             *
             * Not a courtesy: it is what turns "an administrator can read your
             * account" from a secret capability into one somebody can object to.
             */
            await notify({
              event: "account.viewed",
              userId,
              subject: `viewed:${Date.now()}`,
              vars: { reason },
              target: { screen: "account" },
            });

            // The administrator's own session is replaced for the duration.
            return Response.json(
              { user: result.user, minutes: Math.round(VIEW_AS_MS / 60_000) },
              { headers: { "set-cookie": sessionCookie(result.token, isSecureRequest(request)) } },
            );
          }

          default:
            return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
        }
      },
    },
  },
});

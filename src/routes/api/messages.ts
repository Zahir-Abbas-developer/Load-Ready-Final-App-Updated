import { createFileRoute } from "@tanstack/react-router";
import { authorize, isDenied } from "@/server/authz.server";
import { checkRateLimit } from "@/server/rate-limit.server";
import { assignmentById } from "@/server/offer-store.server";
import { loadById } from "@/server/load-store.server";
import { ownsFile } from "@/server/profile-store.server";
import { notify } from "@/server/notifier.server";
import {
  markRead,
  messagesOn,
  recordMessage,
  subscribe,
  unreadOn,
  type ChatEvent,
} from "@/server/message-store.server";
import { checkMessage, MAX_ATTACHMENTS } from "@/lib/messaging/types";
import { recordReport, REPORT_REASONS, type ReportReason } from "@/server/dispute-store.server";

/**
 * The conversation on one job.
 *
 * **This is what closes F-30.** The old trip channel was keyed on an id the
 * client chose, and any signed-in account that guessed one could read it; the
 * interim guard was "the first two accounts to touch it own it". Every handler
 * here resolves the assignment first and checks that the caller is one of its
 * two people. There is no third case — not even an administrator, whose access
 * belongs behind the dispute tool with an audit entry (Phase J, BACKLOG F-99).
 */

const SEND_LIMIT = { limit: 120, windowMs: 60 * 60 * 1000 };
const HEARTBEAT_MS = 25_000;

/** Resolves the job and the caller's side of it, or nothing. */
function membership(assignmentId: string, callerId: string) {
  const assignment = assignmentById(assignmentId);
  if (!assignment) return null;
  if (assignment.pilotId === callerId) return { assignment, role: "pilot" as const };
  if (assignment.dispatcherId === callerId) return { assignment, role: "dispatcher" as const };
  return null;
}

function sseStream(assignmentId: string, signal: AbortSignal): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const push = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const unsubscribe = subscribe(assignmentId, (event: ChatEvent) => {
        push(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      const heartbeat = setInterval(() => push(": keep-alive\n\n"), HEARTBEAT_MS);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed by the runtime */
        }
      };

      signal.addEventListener("abort", close, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

export const Route = createFileRoute("/api/messages")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authorize(request, "messages:GET");
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        const url = new URL(request.url);
        const assignmentId = (url.searchParams.get("assignmentId") ?? "").slice(0, 64);
        const member = membership(assignmentId, caller.id);

        // "No such job" rather than "not allowed", so an id cannot be probed.
        if (!member) return Response.json({ error: "No such job." }, { status: 404 });

        if (url.searchParams.get("stream") === "1") {
          return sseStream(assignmentId, request.signal);
        }

        return Response.json({
          messages: messagesOn(assignmentId),
          unread: unreadOn(assignmentId, caller.id),
          you: caller.id,
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
        const auth = await authorize(request, `messages:${action}`);
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        const assignmentId = String(body.assignmentId ?? "").slice(0, 64);
        const member = membership(assignmentId, caller.id);
        if (!member) return Response.json({ error: "No such job." }, { status: 404 });

        if (action === "report") {
          /*
           * Reporting is scoped to the job, like everything else here: you can
           * only report the person you are actually working with, about a
           * conversation you are actually in.
           */
          const reason = String(body.reason ?? "");
          if (!(reason in REPORT_REASONS)) {
            return Response.json({ error: "Pick a reason." }, { status: 400 });
          }

          const other =
            member.role === "pilot" ? member.assignment.dispatcherId : member.assignment.pilotId;

          const report = recordReport({
            assignmentId,
            messageId: String(body.messageId ?? "").slice(0, 64) || null,
            reportedBy: caller.id,
            about: other,
            reason: reason as ReportReason,
            detail: String(body.detail ?? "").slice(0, 1000) || null,
          });

          /*
           * Deliberately no notification to the other party. Telling somebody
           * they have been reported, before anybody has looked, is how a
           * report becomes the thing being argued about.
           */
          return Response.json({ reported: true, id: report.id });
        }

        if (action === "read") {
          const changed = markRead(assignmentId, caller.id);
          return Response.json({ changed, unread: unreadOn(assignmentId, caller.id) });
        }

        if (action !== "send") {
          return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
        }

        const gate = checkRateLimit(`messages:${caller.id}`, SEND_LIMIT);
        if (!gate.ok) {
          return Response.json(
            { error: "Too many messages. Try again shortly." },
            { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
          );
        }

        const text = typeof body.body === "string" ? body.body : "";
        const attachmentIds = (Array.isArray(body.attachmentIds) ? body.attachmentIds : [])
          .filter((id): id is string => typeof id === "string")
          .slice(0, MAX_ATTACHMENTS)
          /*
           * You may only attach a file you uploaded.
           *
           * Without this, an id from somebody else's upload could be pinned
           * into a conversation and read through the assignment — a way to
           * borrow one reveal to make another.
           */
          .filter((id) => ownsFile(caller.id, id));

        const check = checkMessage(text, attachmentIds);
        if (!check.ok) return Response.json({ error: check.reason }, { status: 400 });

        const message = recordMessage({
          assignmentId,
          senderId: caller.id,
          senderRole: member.role,
          senderName: caller.fullName,
          body: text,
          attachmentIds,
        });

        const other =
          member.role === "pilot" ? member.assignment.dispatcherId : member.assignment.pilotId;
        const l = loadById(member.assignment.loadId);

        /*
         * One notification per message, keyed on the message id.
         *
         * Not batched: on a job that is running, "the yard gate is locked" is
         * the kind of thing that has to arrive now rather than in a digest.
         */
        await notify({
          event: "message.received",
          userId: other,
          subject: message.id,
          vars: {
            reference: l?.reference,
            personName: caller.fullName,
            reason: message.body.slice(0, 120) || "Sent an attachment.",
          },
          target: { screen: "orders", id: member.assignment.loadId },
        });

        return Response.json({ message });
      },
    },
  },
});

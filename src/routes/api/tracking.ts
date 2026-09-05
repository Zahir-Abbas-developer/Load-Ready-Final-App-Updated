import { createFileRoute } from "@tanstack/react-router";
import { authorize, isDenied } from "@/server/authz.server";
import { checkRateLimit } from "@/server/rate-limit.server";
import { assignmentById } from "@/server/offer-store.server";
import {
  hasConsented,
  lastPosition,
  recordPositions,
  setConsent,
  subscribe,
  trailFor,
  type TrackedPosition,
} from "@/server/tracking-store.server";
import { checkPosition, isTrackable, type Position } from "@/lib/tracking/rules";

/**
 * Where the escort is, while it is escorting.
 *
 * The rule that governs this whole file: **a position is only accepted while
 * the assignment is `en_route`, `on_site` or `escorting`** (ADR-6). Not while
 * a job is merely assigned, not after it finishes, and never otherwise. It is
 * checked here against the assignment's live status rather than trusted from
 * the app, because the app is on a device somebody else owns.
 *
 * Consent is checked in the same breath. A pilot who has not agreed, or who
 * has withdrawn, is refused — the refusal says which, so the app can ask
 * rather than silently stop working.
 */

// Generous: a pilot coming back from an hour with no signal offers a backlog.
const PING_LIMIT = { limit: 240, windowMs: 60 * 60 * 1000 };

const HEARTBEAT_MS = 25_000;

function parsePosition(raw: unknown, now: number): Position | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;

  const candidate: Position = {
    lng: Number(p.lng),
    lat: Number(p.lat),
    accuracy: Number.isFinite(Number(p.accuracy)) ? Number(p.accuracy) : 0,
    heading: Number.isFinite(Number(p.heading)) ? Number(p.heading) : null,
    speed: Number.isFinite(Number(p.speed)) ? Number(p.speed) : null,
    at: Number(p.at),
  };

  return checkPosition(candidate, now).ok ? candidate : null;
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

      // The last known position first, so a dispatcher opening the map sees
      // the truck immediately rather than an empty map for thirty seconds.
      const last = lastPosition(assignmentId);
      if (last) push(`event: position\ndata: ${JSON.stringify(last)}\n\n`);

      const unsubscribe = subscribe(assignmentId, (position: TrackedPosition) => {
        push(`event: position\ndata: ${JSON.stringify(position)}\n\n`);
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

export const Route = createFileRoute("/api/tracking")({
  server: {
    handlers: {
      /** The trail on one job, for the two people on it and nobody else. */
      GET: async ({ request }) => {
        const auth = await authorize(request, "tracking:GET");
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        const url = new URL(request.url);
        const assignmentId = (url.searchParams.get("assignmentId") ?? "").slice(0, 64);
        const assignment = assignmentById(assignmentId);

        /*
         * Both sides of the job, and only them. Answered as "no such job"
         * rather than "not allowed", so an id cannot be probed for existence.
         */
        if (
          !assignment ||
          (assignment.pilotId !== caller.id && assignment.dispatcherId !== caller.id)
        ) {
          return Response.json({ error: "No such job." }, { status: 404 });
        }

        if (url.searchParams.get("stream") === "1") {
          return sseStream(assignmentId, request.signal);
        }

        return Response.json({
          trail: trailFor(assignmentId),
          last: lastPosition(assignmentId),
          // The app stops sending on its own; this is what tells it to.
          tracking: isTrackable(assignment.status),
          consented: hasConsented(assignment.pilotId),
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
        const auth = await authorize(request, `tracking:${action}`);
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        if (action === "consent") {
          const agreed = body.agreed === true;
          setConsent(caller.id, agreed);
          return Response.json({ consented: agreed });
        }

        if (action !== "ping") {
          return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
        }

        const gate = checkRateLimit(`tracking:${caller.id}`, PING_LIMIT);
        if (!gate.ok) {
          return Response.json(
            { error: "Too many position updates." },
            { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
          );
        }

        const assignment = assignmentById(String(body.assignmentId ?? "").slice(0, 64));
        // Only the pilot on the job sends positions. A dispatcher posting a
        // location for somebody else would be fabricating a record.
        if (!assignment || assignment.pilotId !== caller.id) {
          return Response.json({ error: "No such job." }, { status: 404 });
        }

        if (!hasConsented(caller.id)) {
          return Response.json(
            { error: "Location sharing is off.", needsConsent: true },
            { status: 403 },
          );
        }

        /*
         * The check that matters, made here rather than in the app.
         *
         * A queued backlog offered after the job finished is refused with it —
         * "I was there an hour ago" is not a reason to write a movement record
         * for a job that is over.
         */
        if (!isTrackable(assignment.status)) {
          return Response.json(
            { error: "This job is not running.", tracking: false },
            { status: 409 },
          );
        }

        const now = Date.now();
        const offered = Array.isArray(body.positions) ? body.positions.slice(0, 200) : [];
        const positions = offered
          .map((raw) => parsePosition(raw, now))
          .filter((p): p is Position => p !== null);

        const result = recordPositions(assignment.id, positions);

        return Response.json({
          // Named separately so a client can tell "we dropped your rubbish"
          // from "we thinned your good fixes" — one is a bug, one is the rule.
          rejected: offered.length - positions.length,
          recorded: result.recorded,
          thinned: result.thinned,
          tracking: true,
        });
      },
    },
  },
});

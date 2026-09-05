import { createFileRoute } from "@tanstack/react-router";
import { authorize, isDenied } from "@/server/authz.server";
import { readiness } from "@/server/readiness.server";

/**
 * Is this server alive, and is it fit to be public.
 *
 * Two different questions with two different audiences, which is why they get
 * two different answers:
 *
 * - **Anyone** gets `{ status: "ok" }` and nothing else. A load balancer needs
 *   to know the process is answering; it does not need to know which of our
 *   integrations are unconfigured, and neither does anybody scanning the
 *   internet. A health endpoint that lists what is missing is a map for
 *   somebody deciding where to push.
 * - **An administrator** gets the whole checklist, because they are the person
 *   who can act on it.
 *
 * `GET /api/health` is deliberately cheap: it reads configuration, touches no
 * store and takes no lock, so a host can call it every few seconds forever.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);

        if (url.searchParams.get("detail") !== "1") {
          return Response.json(
            { status: "ok" },
            // Never cached: the point of asking is to find out now.
            { headers: { "cache-control": "no-store" } },
          );
        }

        const auth = await authorize(request, "health:detail");
        if (isDenied(auth)) return auth.response;

        const state = readiness();
        return Response.json(state, {
          /*
           * 503 when something blocking is outstanding, so a deployment
           * pipeline that checks this fails rather than reports success. The
           * body says what, either way.
           */
          status: state.ready ? 200 : 503,
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});

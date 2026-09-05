import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { withSecurityHeaders } from "./server/security-headers";
import { appLinkResponse } from "./server/app-links.server";
import { withCompression } from "./server/compression";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

/**
 * Everything that has to happen without anybody asking.
 *
 * Started here rather than from the routes that create the work: route modules
 * are loaded lazily on the first request to them, so a deletion would sit
 * waiting until somebody happened to open /api/account — which on a quiet
 * server could be never. Verified by watching it not happen.
 *
 * Each is imported dynamically and guarded on its own, because one background
 * job failing must not stop the others or stop the server answering requests.
 */
let sweepStarted = false;
function ensureBackgroundWork() {
  if (sweepStarted) return;
  sweepStarted = true;

  void import("./server/data-rights.server")
    .then((m) => m.startDeletionSweep())
    .catch((error) => console.error("[data-rights] could not start the deletion sweep", error));

  // Drains queued email. Nothing else retries it, so if this does not start,
  // a provider blip means a message is simply never sent.
  void import("./server/notifier.server")
    .then((m) => m.startNotificationWorker())
    .catch((error) => console.error("[notify] could not start the delivery worker", error));

  // The two reminders nobody triggers: a certificate about to lapse, and a
  // trial about to end.
  void import("./server/reminders.server")
    .then((m) => m.startReminderSweep())
    .catch((error) => console.error("[reminders] could not start the sweep", error));

  // Ninety days of location history, then it goes. A retention promise nothing
  // enforces is a sentence in a policy rather than a limit.
  void import("./server/tracking-store.server")
    .then((m) => m.startRetentionSweep())
    .catch((error) => console.error("[tracking] could not start the retention sweep", error));
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    ensureBackgroundWork();

    /*
     * The two app-association files, answered before the router sees them.
     *
     * Apple and Google fetch these and follow no redirect, so they cannot go
     * through routing that might normalise the path — and
     * `apple-app-site-association` has no extension for a file route to match
     * in the first place. Both are 404 until an app actually exists.
     */
    const appLinks = appLinkResponse(request);
    if (appLinks) return withCompression(withSecurityHeaders(appLinks, request), request);

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      /*
       * Every response **from the application** leaves through here, which
       * makes it the one place the headers cannot be forgotten on a new route.
       *
       * Static assets do not: Nitro serves `/assets/*` before this handler
       * runs, so they get neither these headers nor our compression. Found in
       * L3 (F-153). Their compression is handled by `nitro.config.ts`
       * instead; the headers that would matter on an asset are `nosniff`, and
       * that gap is logged rather than papered over.
       */
      return withCompression(
        withSecurityHeaders(await normalizeCatastrophicSsrResponse(response), request),
        request,
      );
    } catch (error) {
      console.error(error);
      return withCompression(withSecurityHeaders(brandedErrorResponse(), request), request);
    }
  },
};

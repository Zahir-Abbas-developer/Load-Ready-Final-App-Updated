import { createFileRoute } from "@tanstack/react-router";
import { authorize, isDenied } from "@/server/authz.server";
import {
  markRead,
  notificationsFor,
  subscribe,
  unreadCount,
  type Notification,
} from "@/server/notification-store.server";
import {
  deviceKey,
  devicesFor,
  forgetDevice,
  registerDevice,
  registerNativeDevice,
} from "@/server/push-store.server";
import { publicKey, pushConfigured } from "@/server/vapid.server";
import { nativePushConfigured } from "@/server/fcm.server";
import { deviceLabel, isPushEndpoint } from "@/lib/notifications/push";

/**
 * A person's own notifications.
 *
 * `GET` returns the list and the unread count. `GET ?stream=1` returns the same
 * as server-sent events, so an open app hears about a hiring without polling —
 * the same mechanism the live trip channel uses, and for the same reason: it
 * needs no Supabase, no websocket server and no third party.
 *
 * There is no way to read anybody else's. The stream is opened for the caller's
 * own id, taken from the session, and never from a parameter.
 */

/** Idle proxies drop a silent stream after about a minute. */
const HEARTBEAT_MS = 25_000;

function sseStream(userId: string, signal: AbortSignal): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const push = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client went away between the check and the write.
          closed = true;
        }
      };

      // The unread count first, so a tab that reconnects gets the badge right
      // before anything new arrives.
      push(`event: unread\ndata: ${JSON.stringify({ unread: unreadCount(userId) })}\n\n`);

      const unsubscribe = subscribe(userId, (notification: Notification) => {
        push(`event: notification\ndata: ${JSON.stringify(notification)}\n\n`);
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
          // Already closed by the runtime.
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

export const Route = createFileRoute("/api/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authorize(request, "notifications:GET");
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        const url = new URL(request.url);
        if (url.searchParams.get("stream") === "1") {
          return sseStream(caller.id, request.signal);
        }

        return Response.json({
          notifications: notificationsFor(caller.id),
          unread: unreadCount(caller.id),
          /*
           * The key a browser needs to subscribe, with the list of browsers
           * already subscribed. Returned here rather than from a route of its
           * own so the notification screen has everything in one request.
           *
           * The public key is public by design — it is the half a push
           * service uses to check our signature.
           */
          push: {
            configured: pushConfigured(),
            /** Whether the native app can be registered on this server. */
            nativeConfigured: nativePushConfigured(),
            publicKey: publicKey(),
            /*
             * The id is an opaque row identifier, not a credential — unlike the
             * endpoint or the token, which are the things that can actually
             * wake a phone and which never leave the server.
             */
            devices: devicesFor(caller.id).map((d) => ({
              id: d.id,
              label: d.label,
              kind: d.kind,
              since: d.createdAt,
            })),
          },
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
        const auth = await authorize(request, `notifications:${action}`);
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        if (action === "mark-read") {
          const ids = Array.isArray(body.ids)
            ? body.ids.filter((id): id is string => typeof id === "string").slice(0, 200)
            : "all";
          const changed = markRead(caller.id, ids);
          return Response.json({ changed, unread: unreadCount(caller.id) });
        }

        if (action === "push-subscribe") {
          if (!pushConfigured()) {
            return Response.json(
              { error: "Push is not set up on this server yet." },
              { status: 503 },
            );
          }
          /*
           * The endpoint is checked against the known push services before it
           * is stored, because this server will later POST to it — see
           * `isPushEndpoint`. An unchecked endpoint is a way to make us send
           * requests inside our own network.
           */
          if (!isPushEndpoint(body.endpoint)) {
            return Response.json({ error: "That is not a push endpoint." }, { status: 400 });
          }

          const device = registerDevice({
            userId: caller.id,
            endpoint: body.endpoint,
            label: deviceLabel(request.headers.get("user-agent")),
          });
          return Response.json({ device: { label: device.label, since: device.createdAt } });
        }

        if (action === "push-register-native") {
          if (!nativePushConfigured()) {
            return Response.json(
              { error: "Notifications for the app are not set up on this server yet." },
              { status: 503 },
            );
          }

          const platform =
            body.platform === "ios" || body.platform === "android" ? body.platform : null;
          const token = typeof body.token === "string" ? body.token.trim() : "";

          /*
           * A registration token is opaque, so there is no shape to validate
           * beyond "plausible" — unlike a web endpoint, it is never fetched by
           * this server, so it carries no request-forgery risk. The length cap
           * is only to stop somebody storing a novel.
           */
          if (!platform || token.length === 0 || token.length > 4096) {
            return Response.json({ error: "That is not a device token." }, { status: 400 });
          }

          const device = registerNativeDevice({ userId: caller.id, platform, token });
          return Response.json({
            device: { id: device.id, label: device.label, since: device.createdAt },
          });
        }

        if (action === "push-unsubscribe") {
          /*
           * Two ways to name the device, both scoped to the caller so that
           * knowing one is never a way to silence another person's phone:
           *
           * - the web endpoint, which the browser holds and the server matches
           *   directly;
           * - the row id, for the native app, whose token the server will not
           *   hand back for a client to quote at it.
           */
          if (typeof body.deviceId === "string") {
            const found = devicesFor(caller.id).find((d) => d.id === body.deviceId);
            const forgotten = found ? forgetDevice(caller.id, deviceKey(found)) : false;
            return Response.json({ forgotten });
          }

          const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
          const forgotten = forgetDevice(caller.id, endpoint);
          return Response.json({ forgotten });
        }

        return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
      },
    },
  },
});

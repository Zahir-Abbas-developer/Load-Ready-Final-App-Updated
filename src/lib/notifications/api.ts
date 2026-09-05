import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationEvent } from "./catalog";

/**
 * Notifications in the browser.
 *
 * One hook, used by the bell and by the list, so the badge and the sheet can
 * never disagree about how many are unread.
 *
 * The live half is server-sent events — the same mechanism the trip channel
 * uses. `EventSource` reconnects on its own, which matters more here than
 * anywhere: a pilot's phone drops off a cell for a minute several times a day,
 * and a notification stream that gives up on the first disconnect is worse
 * than one that never existed, because people trust it.
 */

export interface Notification {
  id: string;
  event: NotificationEvent;
  subject: string;
  title: string;
  body: string;
  target: { screen: string; id?: string } | null;
  readAt: string | null;
  createdAt: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load your notifications.");
      const data = (await res.json()) as { notifications: Notification[]; unread: number };
      setNotifications(data.notifications);
      setUnread(data.unread);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your notifications.");
    }
  }, []);

  useEffect(() => {
    void refresh();

    // Guarded: EventSource does not exist during server rendering.
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    const source = new EventSource("/api/notifications?stream=1", { withCredentials: true });
    sourceRef.current = source;

    source.addEventListener("notification", (event) => {
      try {
        const notification = JSON.parse((event as MessageEvent).data) as Notification;
        setNotifications((current) => [notification, ...(current ?? [])].slice(0, 50));
        setUnread((n) => n + 1);
      } catch {
        // A malformed frame is not worth breaking the stream over.
      }
    });

    source.addEventListener("unread", (event) => {
      try {
        setUnread(Number((JSON.parse((event as MessageEvent).data) as { unread: number }).unread));
      } catch {
        /* ignored */
      }
    });

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    // Optimistic: the badge going out is the whole point of tapping.
    setNotifications((current) =>
      (current ?? []).map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
    );
    setUnread(0);
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "mark-read" }),
      });
    } catch {
      // Rolled back by the next refresh rather than guessed at here.
      void refresh();
    }
  }, [refresh]);

  return { notifications, unread, error, refresh, markAllRead };
}

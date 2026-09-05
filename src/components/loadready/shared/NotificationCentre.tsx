import { Bell, X } from "lucide-react";
import { useNotifications, type Notification } from "@/lib/notifications/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";

/**
 * What the app has told this person, newest first.
 *
 * What was here was an empty array behind a bell that always wore a red dot —
 * a permanent "you have something" with nothing behind it. The dot now means
 * what it says, and disappears when the list is read.
 */

/** Rough, and deliberately so: "3 hours ago" is what a driver wants, not a timestamp. */
function ago(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(then).toLocaleDateString();
}

function Row({ notification }: { notification: Notification }) {
  const unread = !notification.readAt;
  return (
    <li
      className={`flex gap-3 rounded-xl border p-3 ${
        unread ? "border-primary/30 bg-accent/40" : "border-border bg-surface"
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
        <Bell className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{notification.title}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">{notification.body}</p>
        <div className="mt-1 text-[11px] text-muted-foreground">{ago(notification.createdAt)}</div>
      </div>
      {unread && (
        <span
          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary"
          aria-label="Unread"
          role="img"
        />
      )}
    </li>
  );
}

export function NotificationCentre({ onClose }: { onClose: () => void }) {
  const { notifications, unread, error, refresh, markAllRead } = useNotifications();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        className="flex max-h-[85vh] w-full max-w-[420px] flex-col rounded-t-3xl bg-background"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 pt-4 pb-3">
          <h3 className="font-bold">Notifications</h3>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="h-8 rounded-full bg-surface px-3 text-xs font-semibold"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error ? (
            <ErrorState message={error} onRetry={() => void refresh()} />
          ) : !notifications ? (
            <LoadingState message="Loading…" />
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Nothing yet"
              message="Offers, hiring, job updates and document reviews land here. You can choose which of them also email you in Preferences."
            />
          ) : (
            <ul className="space-y-2">
              {notifications.map((n) => (
                <Row key={n.id} notification={n} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The bell, with a count that is true.
 *
 * Shows a number rather than a dot: "you have something" is not as useful as
 * "you have four", and a dot with nothing behind it is what was here before.
 */
export function NotificationBell({ onOpen }: { onOpen: () => void }) {
  const { unread } = useNotifications();
  return (
    <button
      onClick={onOpen}
      /* 44px, rule 11 — the bell is one of the two things tapped most. */
      className="relative flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-surface transition-colors hover:bg-accent"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
    >
      <Bell className="h-4 w-4" aria-hidden />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

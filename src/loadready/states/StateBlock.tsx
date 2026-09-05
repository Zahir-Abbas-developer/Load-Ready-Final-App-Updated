import { AlertTriangle, Inbox, Loader2, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import type { IconComponent } from "@/components/loadready/AppShell";

/**
 * The four states every list and detail view has to answer for: loading,
 * empty, error and offline (CLAUDE.md rule 7).
 *
 * They share one block so they are recognisably the same thing, and each takes
 * real copy plus a next action — "no data" on its own tells a pilot nothing
 * about what to do. Copy is written per use site, never defaulted to something
 * vague, because the useful sentence is always specific to the screen.
 */

interface StateBlockProps {
  icon: IconComponent;
  title: string;
  /** What happened and what to do about it. One or two short sentences. */
  message: string;
  /** The next action. Omitted only when there genuinely is nothing to do. */
  action?: { label: string; onClick: () => void };
  tone?: "neutral" | "danger";
  /** Announce to assistive tech as it appears — used for error and offline. */
  live?: boolean;
  children?: ReactNode;
}

export function StateBlock({
  icon: Icon,
  title,
  message,
  action,
  tone = "neutral",
  live = false,
  children,
}: StateBlockProps) {
  return (
    <div
      className="flex flex-col items-center justify-center px-6 py-12 text-center"
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
    >
      <div
        className={[
          "mb-3 flex h-14 w-14 items-center justify-center rounded-full",
          tone === "danger" ? "bg-danger-tint" : "bg-surface",
        ].join(" ")}
      >
        <Icon
          className={[
            "h-6 w-6",
            tone === "danger" ? "text-destructive" : "text-muted-foreground",
          ].join(" ")}
        />
      </div>

      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{message}</p>

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold text-foreground transition-colors hover:bg-surface"
        >
          {action.label}
        </button>
      )}

      {children}
    </div>
  );
}

/**
 * Waiting on data. Deliberately not a spinner alone — say what is loading, so
 * a slow connection does not look like a broken screen.
 */
export function LoadingState({ message = "Loading…" }: { message?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
    >
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

/** Nothing here yet — which for a new account is the normal case, not a fault. */
export function EmptyState({
  icon = Inbox,
  title,
  message,
  action,
}: {
  icon?: IconComponent;
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return <StateBlock icon={icon} title={title} message={message} action={action} />;
}

/** Something failed. Always offers a way to try again. */
export function ErrorState({
  title = "That didn't load",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <StateBlock
      icon={AlertTriangle}
      tone="danger"
      live
      title={title}
      message={message}
      action={onRetry ? { label: "Try again", onClick: onRetry } : undefined}
    />
  );
}

/**
 * No connection. A pilot mid-escort loses signal routinely, so this says what
 * still works rather than treating it as a failure.
 */
export function OfflineState({
  message = "You're offline. What you've already loaded is still here, and anything you do will sync once you're back on a signal.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <StateBlock
      icon={WifiOff}
      live
      title="No connection"
      message={message}
      action={onRetry ? { label: "Retry", onClick: onRetry } : undefined}
    />
  );
}

/** A row-shaped placeholder for lists that are still loading. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-surface p-4">
          <div className="h-3 w-1/3 animate-pulse rounded bg-border" />
          <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-border" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-border" />
        </div>
      ))}
    </div>
  );
}

import { Bell, BellOff, Loader2, TriangleAlert } from "lucide-react";
import { usePushDevice } from "@/lib/notifications/push-api";
import { isNativeShell } from "@/lib/mobile/native";

/**
 * "Notify me on this device."
 *
 * Per browser rather than per account, because that is what is actually true:
 * push permission belongs to the browser in front of you. A pilot with it on
 * for their phone and off for the office laptop is the normal case, not an
 * edge one.
 *
 * Every refusal here says what to do about it. "Notifications unavailable" is
 * the kind of message that turns into a support email; "add it to your home
 * screen first" turns into a working notification.
 */
export function PushPanel() {
  const { state, enable, disable } = usePushDevice();

  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking this device…
      </p>
    );
  }

  /*
   * The server has no keys. Said plainly rather than shown as a switch that
   * fails: it is our problem, not something the person can fix by tapping.
   */
  if (state.status === "not-configured") {
    return (
      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="text-sm font-semibold">Not available yet</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Notifications to your phone are not switched on for this server yet. Email still works,
          and everything is in your notification list either way.
        </p>
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <BellOff className="h-4 w-4 text-muted-foreground" />
          Not available on this device
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">{state.reason}</p>
      </div>
    );
  }

  const on = state.status === "on";
  const busy = state.status === "working";

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start gap-3">
        {on ? (
          <Bell className="mt-0.5 h-5 w-5 text-[var(--primary)]" />
        ) : (
          <BellOff className="mt-0.5 h-5 w-5 text-muted-foreground" />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {on ? "This device will be notified" : "Notify me on this device"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {on
              ? "You will hear about a job being cancelled, a message, or being hired — with the app closed."
              : "Hear about a cancellation, a message or being hired without the app open. Quiet hours and the switches above still apply."}
          </p>

          {state.status === "error" && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-[var(--destructive)]">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              {state.message}
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void (on ? disable() : enable())}
          className="h-11 shrink-0 rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : on ? "Turn off" : "Turn on"}
        </button>
      </div>

      {/*
       * The honest footnote. What a push carries is a real question for
       * somebody whose phone is on a dashboard with a passenger beside it,
       * and the answer here is unusually good — so it is worth saying.
       *
       * True on both routes: the web push carries no payload, and the app is
       * woken by an empty message and fetches the rest itself.
       */}
      <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
        Nothing about your jobs is sent through Google or Apple. Their servers are told only that
        something happened; your {isNativeShell() ? "app" : "phone"} then asks us what it was.
      </p>
    </div>
  );
}

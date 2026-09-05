import { useEffect, useState } from "react";
import { PushPanel } from "@/components/loadready/shared/PushPanel";
import { Check, Loader2, Lock } from "lucide-react";
import {
  TIME_ZONES,
  UNIT_LABELS,
  type NotificationPreferences,
  type Preferences,
  type Units,
} from "@/lib/profile/preferences";
import { ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";
import { DataRightsPanel } from "./DataRightsScreens";

/**
 * Display and notification preferences, for any role.
 *
 * One switch is deliberately fixed on: the warning that a certification or
 * insurance policy is about to lapse. A pilot who mutes it turns up to a job
 * uninsured, and the dispatcher who hired them carries that. It is shown as
 * locked rather than hidden, so nobody wonders why it keeps arriving.
 */

const NOTIFY_ROWS: Array<{
  id: keyof NotificationPreferences;
  label: string;
  hint: string;
  locked?: boolean;
}> = [
  {
    id: "matchingLoads",
    label: "New loads that match you",
    hint: "In the regions you work, needing equipment you carry.",
  },
  {
    id: "assignments",
    label: "Offers and assignments",
    hint: "Bids accepted or declined, and changes to a job you are on.",
  },
  { id: "messages", label: "Messages", hint: "From the dispatcher on an active trip." },
  {
    id: "account",
    label: "Your account",
    hint: "Approvals, and the result of a document review.",
  },
  {
    id: "billing",
    label: "Subscription",
    hint: "Your trial ending, and payments that did not go through.",
  },
  {
    id: "documentExpiry",
    label: "A document is about to expire",
    hint: "Cannot be turned off — driving a job on lapsed insurance is not a risk you can opt into.",
    locked: true,
  },
  { id: "marketing", label: "Product news", hint: "Occasional. Off unless you ask for it." },
];

async function post(body: Record<string, unknown>): Promise<Preferences> {
  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "update-preferences", ...body }),
  });
  const data = (await res.json()) as { preferences?: Preferences; error?: string };
  if (!res.ok || !data.preferences) throw new Error(data.error ?? "That did not save.");
  return data.preferences;
}

export function SettingsPanel() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/profile", { credentials: "include" });
        const data = (await res.json()) as { preferences?: Preferences; error?: string };
        if (!res.ok || !data.preferences) {
          setLoadError(data.error ?? "Could not load your settings.");
          return;
        }
        setPrefs(data.preferences);
      } catch {
        setLoadError("Could not reach the server.");
      }
    })();
  }, []);

  const apply = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      setPrefs(await post(body));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.");
    }
    setBusy(false);
  };

  if (loadError) return <ErrorState message={loadError} />;
  if (!prefs) return <LoadingState message="Loading your settings…" />;

  return (
    <div className="space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <section>
        <h4 className="mb-2 text-sm font-semibold">Units</h4>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Distances, speeds and permit dimensions are shown this way throughout the app.
        </p>
        <div className="space-y-2">
          {(Object.keys(UNIT_LABELS) as Units[]).map((u) => (
            <button
              key={u}
              onClick={() => void apply({ units: u })}
              aria-pressed={prefs.units === u}
              className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm ${
                prefs.units === u ? "border-primary bg-accent" : "border-border bg-surface"
              }`}
            >
              <span>{UNIT_LABELS[u].label}</span>
              {prefs.units === u && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold">Time zone</h4>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Pickup and delivery times are shown in this zone, whatever zone the load is in.
        </p>
        <select
          aria-label="Time zone"
          value={prefs.timeZone}
          onChange={(e) => void apply({ timeZone: e.target.value })}
          className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
        >
          {TIME_ZONES.map((z) => (
            <option key={z.id} value={z.id}>
              {z.label}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold">Notifications</h4>
        <div className="space-y-2">
          {NOTIFY_ROWS.map((row) => {
            const on = prefs.notify[row.id] === true;
            return (
              <label
                key={row.id}
                className={`flex items-start gap-3 rounded-xl border border-border bg-surface p-3 ${
                  row.locked ? "opacity-90" : "cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 accent-[var(--primary)]"
                  checked={on}
                  disabled={row.locked || busy}
                  onChange={(e) => void apply({ notify: { [row.id]: e.target.checked } })}
                />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="flex items-center gap-1.5 font-semibold">
                    {row.label}
                    {row.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{row.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold">On this device</h4>
        <PushPanel />
      </section>

      <section>
        <h4 className="mb-1 text-sm font-semibold">Quiet hours</h4>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Email and notifications hold off during these hours, in your own time zone. Things that
          change what you have to do in the morning — being hired for tomorrow, a certificate
          lapsing tonight — go through anyway.
        </p>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 accent-[var(--primary)]"
            checked={prefs.quietHours.enabled}
            disabled={busy}
            onChange={(e) => void apply({ quietHours: { enabled: e.target.checked } })}
          />
          <span className="min-w-0 flex-1 text-sm font-semibold">Hold messages overnight</span>
        </label>

        {prefs.quietHours.enabled && (
          <div className="mt-2 flex gap-2">
            <label className="flex-1 text-[11px] text-muted-foreground">
              From
              <input
                type="time"
                value={prefs.quietHours.from}
                disabled={busy}
                onChange={(e) => void apply({ quietHours: { from: e.target.value } })}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
              />
            </label>
            <label className="flex-1 text-[11px] text-muted-foreground">
              Until
              <input
                type="time"
                value={prefs.quietHours.to}
                disabled={busy}
                onChange={(e) => void apply({ quietHours: { to: e.target.value } })}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
              />
            </label>
          </div>
        )}
      </section>

      <section className="border-t border-border pt-5">
        <h4 className="mb-2 text-sm font-semibold">Your data</h4>
        <DataRightsPanel />
      </section>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {busy ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </>
        ) : saved ? (
          <>
            <Check className="h-3 w-3 text-success" /> Saved
          </>
        ) : (
          "Changes save as you make them."
        )}
      </p>
    </div>
  );
}

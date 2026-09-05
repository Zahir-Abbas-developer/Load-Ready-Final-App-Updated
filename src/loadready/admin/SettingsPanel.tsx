import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Megaphone, Power } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";
import { FLAGS, FLAG_IDS, MAX_ANNOUNCEMENT, type Settings } from "@/lib/settings/flags";

/**
 * The switches, and only the ones that do something.
 *
 * The plan also asked for default trial days, a default search radius and
 * notification templates. None of those is read anywhere in the product, so a
 * screen offering them would be the fourth fake control this codebase has had
 * to remove. They arrive when something consumes them.
 *
 * Each switch says what stops working, in the words the person affected would
 * hear, and when you would ever throw it — because the moment to read a kill
 * switch is at three in the morning, not now.
 */
export function AdminSettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin?view=settings", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load the settings.");
      const data = (await res.json()) as { settings: Settings };
      setSettings(data.settings);
      setDraft(data.settings.announcement);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the settings.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const apply = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "settings", ...patch }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        settings?: Settings;
        error?: string;
      };
      if (!res.ok || !data.settings) throw new Error(data.error ?? "That did not save.");
      setSettings(data.settings);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.");
    }
    setBusy(false);
  };

  if (error && !settings) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!settings) return <LoadingState message="Loading…" />;

  const closed = FLAG_IDS.filter((id) => settings.flags[id] === false);

  return (
    <div className="space-y-5">
      {closed.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <div className="text-sm">
            <strong>
              {closed.length} thing{closed.length === 1 ? " is" : "s are"} switched off right now.
            </strong>{" "}
            Nothing turns back on by itself.
          </div>
        </div>
      )}

      <section>
        <h3 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Kill switches
        </h3>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Take effect immediately, for everybody, without a deploy. Each one is refused at the
          single gate every request passes through, so nothing can slip past one.
        </p>

        <div className="space-y-2">
          {FLAG_IDS.map((id) => {
            const flag = FLAGS[id];
            const on = settings.flags[id] !== false;
            return (
              <div
                key={id}
                className={`rounded-xl border p-3 ${
                  on ? "border-border bg-background" : "border-destructive/30 bg-destructive/5"
                }`}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 accent-[var(--primary)]"
                    checked={on}
                    disabled={busy}
                    onChange={(e) => void apply({ flags: { [id]: e.target.checked } })}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      {flag.label}
                      {!on && <Power className="h-3.5 w-3.5 text-destructive" aria-hidden />}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      Off: {flag.effect}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground italic">
                      When: {flag.when}
                    </span>
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          <Megaphone className="h-3.5 w-3.5" aria-hidden /> Announcement
        </h3>
        <p className="mb-2 text-[11px] text-muted-foreground">
          One line, shown to everybody on every screen. For &quot;we are down until nine&quot; and
          nothing else — an announcement that is always there is one nobody reads.
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_ANNOUNCEMENT))}
          rows={2}
          placeholder="Leave empty for no banner"
          className="w-full rounded-xl border border-border bg-background p-3 text-sm"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            disabled={busy || draft === settings.announcement}
            onClick={() => void apply({ announcement: draft })}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          {settings.announcement && (
            <button
              disabled={busy}
              onClick={() => {
                setDraft("");
                void apply({ announcement: "" });
              }}
              className="h-9 rounded-lg border border-border px-4 text-xs font-semibold"
            >
              Clear it
            </button>
          )}
          <span className="text-[11px] text-muted-foreground">
            {MAX_ANNOUNCEMENT - draft.length} left
          </span>
        </div>
      </section>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {saved && <Check className="h-3 w-3 text-success" aria-hidden />}
        {saved ? "Saved, and recorded in the audit log." : "Every change here is audited."}
        {settings.updatedBy ? ` Last changed by ${settings.updatedBy}.` : ""}
      </p>
    </div>
  );
}

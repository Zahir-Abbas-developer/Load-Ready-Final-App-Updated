import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { REGIONS } from "@/lib/profile/catalog";
import * as api from "@/lib/profile/api";
import type { DispatcherCompany } from "@/lib/profile/types";
import { ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";

/**
 * The dispatch company's own profile.
 *
 * This is what a pilot sees attached to a load, so it is the dispatcher's half
 * of the trust exchange: a pilot deciding whether to drive four hours to a
 * pickup wants to know who is asking. USDOT and MC numbers are the two things
 * that make a carrier checkable in public records.
 *
 * Nothing here is billing. Dispatchers post loads for free and are never shown
 * a price (ADR-1) — "billing contact" is who receives paperwork for the loads
 * they post, which is a different thing and is labelled as one.
 */

const field =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-primary ";

function Labelled({
  text,
  hint,
  children,
}: {
  text: string;
  hint?: string;
  children: React.ReactNode;
}) {
  // Wrapped, not adjacent — see the note on the same helper in the wizard.
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{text}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function CompanyProfilePanel() {
  const [company, setCompany] = useState<DispatcherCompany | null>(null);
  const [form, setForm] = useState<Partial<DispatcherCompany>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/profile", { credentials: "include" });
        const data = (await res.json()) as { company?: DispatcherCompany; error?: string };
        if (!res.ok || !data.company) {
          setLoadError(data.error ?? "Could not load your company profile.");
          return;
        }
        setCompany(data.company);
        setForm(data.company);
      } catch {
        setLoadError("Could not reach the server.");
      }
    })();
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { company: next } = await api.updateCompany({ ...form });
      setCompany(next);
      setForm(next);

      // The server drops a USDOT or MC number that is not the right shape
      // rather than storing a typo. Say so instead of silently blanking it.
      if (form.usdotNumber && !next.usdotNumber) {
        setError("That USDOT number does not look right — it is up to eight digits.");
      } else if (form.mcNumber && !next.mcNumber) {
        setError("That MC number does not look right — MC followed by up to eight digits.");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.");
    }
    setBusy(false);
  };

  if (loadError) return <ErrorState message={loadError} />;
  if (!company) return <LoadingState message="Loading your company profile…" />;

  const set = (patch: Partial<DispatcherCompany>) => setForm({ ...form, ...patch });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Pilots see this on every load you post. A company they can look up is a company they will
        drive for.
      </p>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <Labelled text="Company name">
        <input
          className={field}
          value={form.companyName ?? ""}
          onChange={(e) => set({ companyName: e.target.value })}
          placeholder="Gulf Coast Heavy Haul"
        />
      </Labelled>

      <div className="grid grid-cols-2 gap-2">
        <Labelled text="USDOT number" hint="Up to eight digits.">
          <input
            className={field}
            inputMode="numeric"
            value={form.usdotNumber ?? ""}
            onChange={(e) => set({ usdotNumber: e.target.value })}
            placeholder="1234567"
          />
        </Labelled>
        <Labelled text="MC number" hint="Optional.">
          <input
            className={field}
            value={form.mcNumber ?? ""}
            onChange={(e) => set({ mcNumber: e.target.value })}
            placeholder="MC-654321"
          />
        </Labelled>
      </div>

      <Labelled text="Address">
        <input
          className={field}
          value={form.addressLine ?? ""}
          onChange={(e) => set({ addressLine: e.target.value })}
          placeholder="Street address"
        />
      </Labelled>

      <div className="grid grid-cols-2 gap-2">
        <Labelled text="City">
          <input
            className={field}
            value={form.city ?? ""}
            onChange={(e) => set({ city: e.target.value })}
          />
        </Labelled>
        <Labelled text="State or province">
          <select
            className={field}
            value={form.region ?? ""}
            onChange={(e) => {
              const code = e.target.value;
              set({
                region: code,
                country: REGIONS.find((r) => r.code === code)?.country ?? null,
              });
            }}
          >
            <option value="">Choose…</option>
            <optgroup label="United States">
              {REGIONS.filter((r) => r.country === "US").map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Canada">
              {REGIONS.filter((r) => r.country === "CA").map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Labelled>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Labelled text="Postal code">
          <input
            className={field}
            value={form.postalCode ?? ""}
            onChange={(e) => set({ postalCode: e.target.value })}
          />
        </Labelled>
        <Labelled text="Phone" hint="Shown to a pilot once they are assigned.">
          <input
            className={field}
            type="tel"
            value={form.phone ?? ""}
            onChange={(e) => set({ phone: e.target.value })}
          />
        </Labelled>
      </div>

      <Labelled
        text="Paperwork contact"
        hint="Who at your company receives load paperwork. Not a payment method — LoadReady never charges dispatchers."
      >
        <input
          className={field}
          value={form.billingContact ?? ""}
          onChange={(e) => set({ billingContact: e.target.value })}
          placeholder="Name · email"
        />
      </Labelled>

      <button
        disabled={busy}
        onClick={() => void save()}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : saved ? (
          <Check className="h-4 w-4" />
        ) : null}
        {saved ? "Saved" : "Save company profile"}
      </button>
    </div>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Send, X } from "lucide-react";
import { DocumentsPanel } from "./DocumentsPanel";
import { useProfile } from "@/lib/profile/use-profile";
import * as api from "@/lib/profile/api";
import { EQUIPMENT, REGIONS, SERVICES } from "@/lib/profile/catalog";
import { MIN_AGE_YEARS, ageInYears } from "@/lib/profile/completion";
import type { EquipmentId, ServiceId } from "@/lib/profile/catalog";
import type { PilotVehicle } from "@/lib/profile/types";
import { ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";
import { OnboardingAgreements } from "@/components/loadready/screens/LegalScreens";

/**
 * The pilot's verification wizard.
 *
 * Rewritten in E2 to write to the server. Two things changed beyond that:
 *
 * The old **Payout** step is gone. It called itself a demo, promised that a
 * simulated payout account would be linked on approval, and described ACH
 * payments out of escrow — for a product where LoadReady never touches a job
 * payment at all. Dispatchers pay
 * pilots directly (D1); the only money we handle is the pilot's own
 * subscription. The design spec's Fix line says the same: no bank-details step
 * (ADR-14). Leaving it in would have been a promise to drivers we cannot keep.
 *
 * The steps also **save as you leave them** rather than only at the end. A
 * pilot filling this in on a phone, at a truck stop, on a bad connection, must
 * not lose twenty minutes because the browser closed on step five.
 */

const STEPS = ["About you", "Where you work", "Documents", "Vehicle", "Rates", "Review"] as const;

const field =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-primary ";
const label = "mb-1 block text-xs font-medium text-foreground";

/**
 * A field with its label.
 *
 * The control is wrapped by the <label> rather than sitting beside it: that
 * associates the two without ids to keep unique, so a screen reader announces
 * the field by name instead of "edit box".
 */
function Labelled({ children, text, hint }: { children: ReactNode; text: string; hint?: string }) {
  return (
    <label className="block">
      <span className={label}>{text}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** A chip list. Used for regions, services and equipment — all controlled catalogues. */
function ChipSelect<T extends string>({
  options,
  selected,
  onChange,
  columns = false,
}: {
  options: ReadonlyArray<{ id: T; label: string }>;
  selected: T[];
  onChange: (next: T[]) => void;
  columns?: boolean;
}) {
  const toggle = (id: T) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <div className={columns ? "grid grid-cols-2 gap-1.5" : "flex flex-wrap gap-1.5"}>
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o.id)}
            className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
              on
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-surface hover:border-primary/40"
            }`}
          >
            {on && <Check className="h-3 w-3 shrink-0" />}
            <span className="text-left">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function VerificationWizard({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  /**
   * Agreements that belong to this stage of the funnel rather than to signup —
   * the Pilot Operator Agreement. Empty while the documents are still drafts,
   * because nothing is asked of anybody until real text is published.
   */
  const [agreementsOutstanding, setAgreementsOutstanding] = useState(0);

  // Local drafts for the current step. Committed to the server on the way out
  // of the step, so a lost connection costs one screen rather than all of them.
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (profile.record) setDraft({});
  }, [profile.record]);

  if (profile.loading) return <LoadingState message="Loading your profile…" />;
  if (!profile.record) {
    return (
      <ErrorState
        message={profile.error ?? "Could not load your profile."}
        onRetry={() => void profile.reload()}
      />
    );
  }

  const p = profile.record.profile;
  const value = <K extends string>(key: K, fallback: unknown) =>
    key in draft ? draft[key] : fallback;
  const set = (key: string, v: unknown) => setDraft((d) => ({ ...d, [key]: v }));

  /** Writes the current draft, then moves. Nothing moves if the save is refused. */
  const commitAnd = async (move: () => void) => {
    setError(null);
    if (Object.keys(draft).length > 0) {
      const err = await profile.save(draft);
      if (err) {
        setError(err);
        return;
      }
      setDraft({});
    }
    move();
  };

  const submit = async () => {
    setError(null);
    if (Object.keys(draft).length > 0) {
      const saveErr = await profile.save(draft);
      if (saveErr) {
        setError(saveErr);
        return;
      }
      setDraft({});
    }
    const err = await profile.submit();
    if (err) {
      setError(err);
      return;
    }
    setSubmitted(true);
  };

  const age = ageInYears(String(value("dateOfBirth", p.dateOfBirth) ?? "") || null);

  if (submitted) {
    return (
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
          <Check className="h-8 w-8 text-primary" aria-hidden />
        </div>
        <h3 className="mt-4 text-xl font-bold">We are reviewing your account</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          An administrator will check your documents. You can browse loads in the meantime, but you
          cannot bid or accept until you are approved.
        </p>
        <button
          onClick={onClose}
          className="mt-6 h-11 w-full max-w-xs rounded-full bg-primary font-semibold text-primary-foreground"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Progress */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </div>
          <div className="text-xs font-semibold text-primary">{profile.completion}% complete</div>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${profile.completion}%` }}
          />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {/* ── 1. About you ─────────────────────────────────────────────── */}
        {step === 0 && (
          <>
            <Labelled text="Legal name" hint="As it appears on your driving licence.">
              <input
                className={field}
                value={String(value("legalName", p.legalName) ?? "")}
                onChange={(e) => set("legalName", e.target.value)}
                placeholder="Full name"
              />
            </Labelled>
            <Labelled
              text="Business name"
              hint="Optional. Shown to dispatchers instead of your own name."
            >
              <input
                className={field}
                value={String(value("businessName", p.businessName) ?? "")}
                onChange={(e) => set("businessName", e.target.value)}
                placeholder="Reyes Escort Services"
              />
            </Labelled>
            <Labelled text="Phone" hint="Kept private until you are assigned to a load.">
              <input
                className={field}
                type="tel"
                value={String(value("phone", p.phone) ?? "")}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+1 555 0147"
              />
            </Labelled>
            <Labelled
              text="Date of birth"
              hint={
                age !== null && age < MIN_AGE_YEARS
                  ? `You must be at least ${MIN_AGE_YEARS} to work as a pilot car operator.`
                  : "Never shown to anyone else."
              }
            >
              <input
                className={field}
                type="date"
                value={String(value("dateOfBirth", p.dateOfBirth) ?? "")}
                onChange={(e) => set("dateOfBirth", e.target.value)}
              />
            </Labelled>
            <Labelled text="Years of experience">
              <input
                className={field}
                type="number"
                min={0}
                value={String(value("yearsExperience", p.yearsExperience) ?? "")}
                onChange={(e) =>
                  set("yearsExperience", e.target.value ? Number(e.target.value) : null)
                }
              />
            </Labelled>
            <Labelled text="About you" hint="A few lines dispatchers will read when choosing.">
              <textarea
                className={`${field} h-24 resize-none py-2`}
                value={String(value("bio", p.bio) ?? "")}
                onChange={(e) => set("bio", e.target.value)}
                placeholder="Nine years running lead and high pole across the Gulf corridor."
              />
            </Labelled>
          </>
        )}

        {/* ── 2. Where you work ────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <Labelled text="Based in">
              <input
                className={field}
                value={String(value("city", p.city) ?? "")}
                onChange={(e) => set("city", e.target.value)}
                placeholder="City"
              />
            </Labelled>
            <Labelled text="State or province">
              <select
                className={field}
                value={String(value("region", p.region) ?? "")}
                onChange={(e) => {
                  const code = e.target.value;
                  set("region", code);
                  set("country", REGIONS.find((r) => r.code === code)?.country ?? null);
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
            <Labelled text="How far you will travel from base" hint="Miles from your base city.">
              <input
                className={field}
                type="number"
                min={0}
                value={String(value("serviceRadiusMi", p.serviceRadiusMi) ?? "")}
                onChange={(e) =>
                  set("serviceRadiusMi", e.target.value ? Number(e.target.value) : null)
                }
                placeholder="250"
              />
            </Labelled>

            <div>
              <div className={label}>States and provinces you work in</div>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Pick every region you will take work in. There is no limit — permits cross state
                lines, and so does the work.
              </p>
              <ChipSelect
                columns
                options={REGIONS.map((r) => ({ id: r.code, label: r.name }))}
                selected={(value("workingRegions", p.workingRegions) as string[]) ?? []}
                onChange={(next) => set("workingRegions", next)}
              />
            </div>

            <div>
              <div className={label}>Services you offer</div>
              <ChipSelect
                options={SERVICES.map((s) => ({ id: s.id, label: s.label }))}
                selected={(value("services", p.services) as ServiceId[]) ?? []}
                onChange={(next) => set("services", next)}
              />
            </div>
          </>
        )}

        {/* ── 3. Documents ─────────────────────────────────────────────── */}
        {step === 2 && <DocumentsPanel onChanged={profile.apply} />}

        {/* ── 4. Vehicle ───────────────────────────────────────────────── */}
        {step === 3 && <VehicleStep profile={profile} />}

        {/* ── 5. Rates and availability ────────────────────────────────── */}
        {step === 4 && (
          <>
            <p className="text-xs text-muted-foreground">
              Your rate card is a starting point for dispatchers, not a commitment — you set a price
              on every load you bid on.
            </p>
            <Labelled text="Rate per mile" hint="What you usually charge, in dollars.">
              <input
                className={field}
                type="number"
                step="0.01"
                min={0}
                value={String(value("ratePerMile", p.ratePerMile) ?? "")}
                onChange={(e) => set("ratePerMile", e.target.value ? Number(e.target.value) : null)}
                placeholder="1.85"
              />
            </Labelled>
            <Labelled text="Minimum charge" hint="The least you will take a job for.">
              <input
                className={field}
                type="number"
                step="1"
                min={0}
                value={String(value("rateMinimum", p.rateMinimum) ?? "")}
                onChange={(e) => set("rateMinimum", e.target.value ? Number(e.target.value) : null)}
                placeholder="250"
              />
            </Labelled>
            <label className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--primary)]"
                checked={Boolean(value("available", p.available))}
                onChange={(e) => set("available", e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-semibold">Available for work</span>
                <span className="block text-[11px] text-muted-foreground">
                  Turn this off when you are on holiday or already booked.
                </span>
              </span>
            </label>
          </>
        )}

        {/* ── 6. Review ────────────────────────────────────────────────── */}
        {step === 5 && (
          <>
            {profile.missing.length === 0 ? (
              <div className="rounded-2xl border border-success/30 bg-success/10 p-4">
                <div className="text-sm font-semibold">Ready to submit</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  An administrator will check your documents. You can browse loads while you wait,
                  but you cannot bid or accept until you are approved.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-primary/20 bg-accent p-4">
                <div className="text-sm font-semibold">Still needed</div>
                <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                  {profile.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            <OnboardingAgreements stage="onboarding" onChange={setAgreementsOutstanding} />

            <div className="rounded-2xl border border-border bg-surface p-4 text-xs">
              <div className="font-semibold">What we do with this</div>
              <p className="mt-1 text-muted-foreground">
                Your documents are visible only to you and LoadReady administrators. Dispatchers see
                your name, regions, services, equipment and badges — never your phone number,
                address or documents, until you are assigned to their load.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        {step > 0 && (
          <button
            onClick={() => void commitAnd(() => setStep((i) => i - 1))}
            className="flex h-11 items-center gap-1 rounded-full border border-border px-4 text-sm font-semibold"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            disabled={profile.saving}
            onClick={() => void commitAnd(() => setStep((i) => i + 1))}
            className="flex h-11 flex-1 items-center justify-center gap-1 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {profile.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            disabled={profile.saving || profile.missing.length > 0 || agreementsOutstanding > 0}
            onClick={() => void submit()}
            className="flex h-11 flex-1 items-center justify-center gap-1 rounded-full bg-foreground text-sm font-semibold text-background disabled:opacity-50"
          >
            {profile.saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Submit for review
          </button>
        )}
      </div>
    </div>
  );
}

/** One vehicle with its equipment. Most pilots run a single car. */
function VehicleStep({ profile }: { profile: ReturnType<typeof useProfile> }) {
  const existing: PilotVehicle | undefined = profile.record?.vehicles[0];
  const [form, setForm] = useState({
    vehicleType: existing?.vehicleType ?? "Pilot car",
    make: existing?.make ?? "",
    model: existing?.model ?? "",
    year: existing?.year ? String(existing.year) : "",
    licensePlate: existing?.licensePlate ?? "",
    equipment: (existing?.equipment ?? []) as EquipmentId[],
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      profile.apply(
        await api.saveVehicle({
          id: existing?.id,
          ...form,
          year: form.year ? Number(form.year) : null,
          photoFileIds: existing?.photoFileIds ?? [],
        }),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the vehicle.");
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Labelled text="Make">
          <input
            className={field}
            value={form.make}
            onChange={(e) => setForm({ ...form, make: e.target.value })}
            placeholder="Ford"
          />
        </Labelled>
        <Labelled text="Model">
          <input
            className={field}
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="F-150"
          />
        </Labelled>
        <Labelled text="Year">
          <input
            className={field}
            type="number"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value })}
            placeholder="2021"
          />
        </Labelled>
        <Labelled text="Licence plate">
          <input
            className={field}
            value={form.licensePlate}
            onChange={(e) => setForm({ ...form, licensePlate: e.target.value })}
            placeholder="ABC-1234"
          />
        </Labelled>
      </div>

      <div>
        <div className={label}>Equipment you carry</div>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Dispatchers filter on this. A load that needs a high pole will not be offered to a car
          without one.
        </p>
        <ChipSelect
          columns
          options={EQUIPMENT.map((e) => ({ id: e.id, label: e.label }))}
          selected={form.equipment}
          onChange={(equipment) => setForm({ ...form, equipment })}
        />
      </div>

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
        {saved ? "Saved" : existing ? "Update vehicle" : "Save vehicle"}
      </button>
    </div>
  );
}

/** The wizard in a bottom sheet, which is how the dashboard opens it. */
export function VerificationWizardSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-3xl bg-background"
        role="dialog"
        aria-modal="true"
        aria-label="Verify your account"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 pt-4 pb-3">
          <h3 className="font-bold">Verify your account</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden p-5">
          <VerificationWizard onClose={onClose} />
        </div>
      </div>
    </div>
  );
}

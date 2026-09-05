import { useState, type ReactNode } from "react";
import {
  canFillAutomatically,
  distanceNote,
  type DistanceEstimate,
} from "@/lib/marketplace/distance";
import { ChevronLeft, ChevronRight, Loader2, Plus, Send, Trash2, X } from "lucide-react";
import * as api from "@/lib/marketplace/api";
import { serviceLabel } from "@/lib/marketplace/matching";
import { EQUIPMENT, REGIONS, SERVICES } from "@/lib/profile/catalog";
import type { EquipmentId, ServiceId } from "@/lib/profile/catalog";

/**
 * Posting an escort job.
 *
 * A pilot decides whether to drive four hours on the strength of what this
 * form says, so it asks for the things that decide that: where, when, how big,
 * which positions, and what each pays. Everything else can wait.
 *
 * The draft is created on the server as soon as step one is done, and every
 * step after saves into it. A dispatcher entering a permit number from a
 * clipboard in a yard should not lose it because a page reloaded.
 */

const STEPS = ["The load", "Route and dates", "Positions", "Permits", "Review"] as const;

const field =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-primary ";

function Labelled({ text, hint, children }: { text: string; hint?: string; children: ReactNode }) {
  // Wrapped, not adjacent, so the control is announced by name.
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{text}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function RegionSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <Labelled text={label}>
      <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>
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
  );
}

interface SlotDraft {
  id: string;
  service: ServiceId;
  requiredEquipment: EquipmentId[];
  poleHeightFt: string;
  pricingMode: "fixed" | "bidding";
  rateBasis: "flat" | "per_mile";
  amount: string;
  maxAmount: string;
}

const emptySlot = (): SlotDraft => ({
  id: "",
  service: "lead",
  requiredEquipment: [],
  poleHeightFt: "",
  pricingMode: "fixed",
  rateBasis: "flat",
  amount: "",
  maxAmount: "",
});

/** Dollars in the form, cents on the wire. Floating-point money is a bug waiting. */
const toCents = (dollars: string) => Math.round((Number(dollars) || 0) * 100);

export function PostLoadWizard({
  onClose,
  onPosted,
}: {
  onClose: () => void;
  onPosted: () => void;
}) {
  const [step, setStep] = useState(0);
  const [loadId, setLoadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [posted, setPosted] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    originCity: "",
    originRegion: "",
    originAddress: "",
    destinationCity: "",
    destinationRegion: "",
    destinationAddress: "",
    pickupFrom: "",
    pickupTo: "",
    deliverBy: "",
    lengthFt: "",
    widthFt: "",
    heightFt: "",
    weightLb: "",
    distanceMi: "",
    permitNumbers: "",
    constraints: "",
    notes: "",
  });
  const [slots, setSlots] = useState<SlotDraft[]>([emptySlot()]);

  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const [distanceBusy, setDistanceBusy] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<DistanceEstimate | null>(null);

  /**
   * Works out how far the load is going, from the two cities.
   *
   * A real driving distance goes straight into the field — it is the number
   * the dispatcher would have typed. A straight line does not: it is offered,
   * with what it is written next to it, because it is always an underestimate
   * and the field it would land in sets a per-mile price.
   */
  const workOutDistance = async () => {
    setDistanceBusy(true);
    setDistanceError(null);
    setSuggestion(null);

    try {
      const res = await fetch("/api/loads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "estimate-distance",
          // City and state only — never the street address (ADR-8).
          from: { city: form.originCity, region: form.originRegion },
          to: { city: form.destinationCity, region: form.destinationRegion },
        }),
      });

      const data = (await res.json()) as { estimate?: DistanceEstimate; error?: string };
      if (!res.ok || !data.estimate) {
        setDistanceError(data.error ?? "Could not work that out.");
        return;
      }

      if (canFillAutomatically(data.estimate.kind)) {
        set({ distanceMi: String(data.estimate.miles) });
      } else {
        setSuggestion(data.estimate);
      }
    } catch {
      setDistanceError("Could not reach the server.");
    } finally {
      setDistanceBusy(false);
    }
  };

  /** The draft as the server wants it. Feet in the form, inches on the wire. */
  const draft = () => ({
    title: form.title,
    description: form.description,
    origin: {
      address: form.originAddress,
      city: form.originCity,
      region: form.originRegion,
    },
    destination: {
      address: form.destinationAddress,
      city: form.destinationCity,
      region: form.destinationRegion,
    },
    pickupFrom: form.pickupFrom ? new Date(form.pickupFrom).toISOString() : "",
    pickupTo: form.pickupTo ? new Date(form.pickupTo).toISOString() : "",
    deliverBy: form.deliverBy ? new Date(form.deliverBy).toISOString() : null,
    lengthIn: form.lengthFt ? Number(form.lengthFt) * 12 : null,
    widthIn: form.widthFt ? Number(form.widthFt) * 12 : null,
    heightIn: form.heightFt ? Number(form.heightFt) * 12 : null,
    weightLb: form.weightLb ? Number(form.weightLb) : null,
    distanceMi: form.distanceMi ? Number(form.distanceMi) : null,
    permitNumbers: form.permitNumbers
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean),
    permitFileIds: [],
    slots: slots.map((s) => ({
      id: s.id,
      service: s.service,
      requiredEquipment: s.requiredEquipment,
      poleHeightFt: s.poleHeightFt ? Number(s.poleHeightFt) : null,
      pricingMode: s.pricingMode,
      rateBasis: s.rateBasis,
      amountCents: toCents(s.amount),
      maxAmountCents: s.pricingMode === "bidding" ? toCents(s.maxAmount) : null,
    })),
    contacts: [],
    constraints: form.constraints
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    notes: form.notes,
    visibility: "public" as const,
    invitedPilotIds: [],
  });

  /** Saves the draft, then moves. Nothing moves if the save is refused. */
  const commitAnd = async (move: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const result = loadId ? await api.updateLoad(loadId, draft()) : await api.createLoad(draft());
      setLoadId(result.load.id);
      setMissing(result.missing ?? []);
      move();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.");
    }
    setBusy(false);
  };

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = loadId ? await api.updateLoad(loadId, draft()) : await api.createLoad(draft());
      setLoadId(saved.load.id);
      const { load } = await api.publishLoad(saved.load.id);
      setPosted(load.reference);
    } catch (e) {
      const err = e as Error & { missing?: string[] };
      setError(err.message);
      if (err.missing) setMissing(err.missing);
    }
    setBusy(false);
  };

  if (posted) {
    return (
      <Shell title="Load posted" onClose={onPosted}>
        <div className="flex flex-col items-center py-8 text-center">
          <h3 className="text-xl font-bold text-primary">{posted}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            It is now on the board for every verified pilot who works those regions and carries what
            the positions need.
          </p>
          <button
            onClick={onPosted}
            className="mt-6 h-11 w-full max-w-xs rounded-full bg-primary font-semibold text-primary-foreground"
          >
            Done
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Post a load" onClose={onClose}>
      <div className="mb-4">
        <div className="mb-2 text-xs text-muted-foreground">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
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

        {step === 0 && (
          <>
            <Labelled text="What is it?" hint="What a pilot sees first. Be specific.">
              <input
                className={field}
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Transformer, 16 ft wide"
              />
            </Labelled>
            <Labelled text="Anything else they should know?">
              <textarea
                className={`${field} h-24 resize-none py-2`}
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Labelled>
            <div className="grid grid-cols-3 gap-2">
              <Labelled text="Length (ft)">
                <input
                  className={field}
                  type="number"
                  value={form.lengthFt}
                  onChange={(e) => set({ lengthFt: e.target.value })}
                />
              </Labelled>
              <Labelled text="Width (ft)">
                <input
                  className={field}
                  type="number"
                  value={form.widthFt}
                  onChange={(e) => set({ widthFt: e.target.value })}
                />
              </Labelled>
              <Labelled text="Height (ft)">
                <input
                  className={field}
                  type="number"
                  value={form.heightFt}
                  onChange={(e) => set({ heightFt: e.target.value })}
                />
              </Labelled>
            </div>
            <Labelled text="Weight (lb)">
              <input
                className={field}
                type="number"
                value={form.weightLb}
                onChange={(e) => set({ weightLb: e.target.value })}
              />
            </Labelled>
          </>
        )}

        {step === 1 && (
          <>
            <Labelled
              text="Collected from"
              hint="The street address is shared only once a pilot is assigned."
            >
              <input
                className={field}
                value={form.originAddress}
                onChange={(e) => set({ originAddress: e.target.value })}
                placeholder="Street address"
              />
            </Labelled>
            <div className="grid grid-cols-2 gap-2">
              <Labelled text="City">
                <input
                  className={field}
                  value={form.originCity}
                  onChange={(e) => set({ originCity: e.target.value })}
                />
              </Labelled>
              <RegionSelect
                label="State or province"
                value={form.originRegion}
                onChange={(v) => set({ originRegion: v })}
              />
            </div>

            <Labelled text="Going to">
              <input
                className={field}
                value={form.destinationAddress}
                onChange={(e) => set({ destinationAddress: e.target.value })}
                placeholder="Street address"
              />
            </Labelled>
            <div className="grid grid-cols-2 gap-2">
              <Labelled text="City">
                <input
                  className={field}
                  value={form.destinationCity}
                  onChange={(e) => set({ destinationCity: e.target.value })}
                />
              </Labelled>
              <RegionSelect
                label="State or province"
                value={form.destinationRegion}
                onChange={(v) => set({ destinationRegion: v })}
              />
            </div>

            <Labelled text="Distance (miles)" hint="Used for per-mile rates.">
              <div className="flex gap-2">
                <input
                  className={field}
                  type="number"
                  value={form.distanceMi}
                  onChange={(e) => set({ distanceMi: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => void workOutDistance()}
                  disabled={distanceBusy || !form.originCity || !form.destinationCity}
                  className="h-11 shrink-0 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50"
                >
                  {distanceBusy ? "Working…" : "Work it out"}
                </button>
              </div>

              {distanceError && (
                <p role="alert" className="mt-1 text-[11px] text-destructive">
                  {distanceError}
                </p>
              )}

              {/*
               * A suggestion rather than a filled field, when the number is
               * only a straight line. Accepting it is the moment the
               * dispatcher sees what kind of number it is — and a straight
               * line dropped in silently is how somebody prices a
               * thousand-mile run short and finds out at the end of it.
               */}
              {suggestion && (
                <div className="mt-1.5 rounded-xl border border-border bg-surface p-2.5">
                  <p className="text-[11px] text-muted-foreground">{distanceNote(suggestion)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      set({ distanceMi: String(suggestion.miles) });
                      setSuggestion(null);
                    }}
                    className="mt-1.5 h-9 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"
                  >
                    Use {suggestion.miles} mi
                  </button>
                </div>
              )}
            </Labelled>

            <div className="grid grid-cols-2 gap-2">
              <Labelled text="Pickup from">
                <input
                  className={field}
                  type="datetime-local"
                  value={form.pickupFrom}
                  onChange={(e) => set({ pickupFrom: e.target.value })}
                />
              </Labelled>
              <Labelled text="Pickup by">
                <input
                  className={field}
                  type="datetime-local"
                  value={form.pickupTo}
                  onChange={(e) => set({ pickupTo: e.target.value })}
                />
              </Labelled>
            </div>
            <Labelled text="Deliver by" hint="Optional.">
              <input
                className={field}
                type="datetime-local"
                value={form.deliverBy}
                onChange={(e) => set({ deliverBy: e.target.value })}
              />
            </Labelled>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-xs text-muted-foreground">
              One position per escort vehicle you need. A pilot only sees a position they are
              certified and equipped for.
            </p>

            {slots.map((slotDraft, index) => (
              <div
                key={index}
                className="space-y-2 rounded-2xl border border-border bg-surface p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Position {index + 1}</span>
                  {slots.length > 1 && (
                    <button
                      onClick={() => setSlots(slots.filter((_, i) => i !== index))}
                      aria-label={`Remove position ${index + 1}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <Labelled text="Type">
                  <select
                    className={field}
                    value={slotDraft.service}
                    onChange={(e) =>
                      setSlots(
                        slots.map((s, i) =>
                          i === index ? { ...s, service: e.target.value as ServiceId } : s,
                        ),
                      )
                    }
                  >
                    {SERVICES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Labelled>

                <div className="grid grid-cols-2 gap-2">
                  <Labelled text="Price ($)">
                    <input
                      className={field}
                      type="number"
                      value={slotDraft.amount}
                      onChange={(e) =>
                        setSlots(
                          slots.map((s, i) => (i === index ? { ...s, amount: e.target.value } : s)),
                        )
                      }
                      placeholder="450"
                    />
                  </Labelled>
                  <Labelled text="How">
                    <select
                      className={field}
                      value={slotDraft.pricingMode}
                      onChange={(e) =>
                        setSlots(
                          slots.map((s, i) =>
                            i === index
                              ? { ...s, pricingMode: e.target.value as "fixed" | "bidding" }
                              : s,
                          ),
                        )
                      }
                    >
                      <option value="fixed">Fixed price</option>
                      <option value="bidding">Open to bids</option>
                    </select>
                  </Labelled>
                </div>

                {slotDraft.pricingMode === "bidding" && (
                  <Labelled text="Most you will pay ($)" hint="Pilots bid between the two.">
                    <input
                      className={field}
                      type="number"
                      value={slotDraft.maxAmount}
                      onChange={(e) =>
                        setSlots(
                          slots.map((s, i) =>
                            i === index ? { ...s, maxAmount: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </Labelled>
                )}

                <div>
                  <span className="mb-1 block text-xs font-medium">Equipment required</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {EQUIPMENT.map((eq) => {
                      const on = slotDraft.requiredEquipment.includes(eq.id);
                      return (
                        <button
                          key={eq.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setSlots(
                              slots.map((s, i) =>
                                i === index
                                  ? {
                                      ...s,
                                      requiredEquipment: on
                                        ? s.requiredEquipment.filter((x) => x !== eq.id)
                                        : [...s.requiredEquipment, eq.id],
                                    }
                                  : s,
                              ),
                            )
                          }
                          className={`min-h-9 rounded-full px-3 text-xs font-semibold ${
                            on
                              ? "bg-primary text-primary-foreground"
                              : "border border-border bg-background"
                          }`}
                        >
                          {eq.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={() => setSlots([...slots, emptySlot()])}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary text-sm font-semibold text-primary"
            >
              <Plus className="h-4 w-4" /> Add another position
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <Labelled
              text="Permit numbers"
              hint="One per line. A pilot needs to know the permits exist before they commit."
            >
              <textarea
                className={`${field} h-24 resize-none py-2`}
                value={form.permitNumbers}
                onChange={(e) => set({ permitNumbers: e.target.value })}
                placeholder={"TX-OS-2310\nLA-OS-8871"}
              />
            </Labelled>
            <Labelled
              text="Constraints"
              hint="One per line. Curfews, bridges, escorts required by law."
            >
              <textarea
                className={`${field} h-24 resize-none py-2`}
                value={form.constraints}
                onChange={(e) => set({ constraints: e.target.value })}
                placeholder={"No travel after dark\nAvoid I-10 bridge"}
              />
            </Labelled>
            <Labelled text="Notes">
              <textarea
                className={`${field} h-20 resize-none py-2`}
                value={form.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </Labelled>
          </>
        )}

        {step === 4 && (
          <>
            {missing.length > 0 ? (
              <div className="rounded-2xl border border-primary/20 bg-accent p-4">
                <div className="text-sm font-semibold">Still needed</div>
                <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                  {missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm">
                Ready to post.
              </div>
            )}

            <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
              <div className="font-semibold">{form.title || "Untitled load"}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {form.originCity || "?"} → {form.destinationCity || "?"}
              </div>
              <div className="mt-2 space-y-1 text-xs">
                {slots.map((s, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="capitalize">{serviceLabel(s.service)}</span>
                    <span className="font-semibold">
                      ${s.amount || "0"}
                      {s.pricingMode === "bidding" ? `–$${s.maxAmount || "?"}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Posting is free. LoadReady never charges dispatchers, and never handles the payment
              between you and the pilot.
            </p>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex h-11 items-center gap-1 rounded-full border border-border px-4 text-sm font-semibold"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            disabled={busy}
            onClick={() => void commitAnd(() => setStep(step + 1))}
            className="flex h-11 flex-1 items-center justify-center gap-1 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={() => void publish()}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Post this load
          </button>
        )}
      </div>
    </Shell>
  );
}

function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-3xl bg-background"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 pt-4 pb-3">
          <h3 className="font-bold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden p-5">{children}</div>
      </div>
    </div>
  );
}

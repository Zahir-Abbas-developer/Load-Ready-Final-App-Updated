import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, MapPin, Phone, X } from "lucide-react";
import * as offersApi from "@/lib/marketplace/offers-api";
import { formatMoney } from "@/lib/marketplace/api";
import { serviceLabel } from "@/lib/marketplace/matching";
import { regionName } from "@/lib/profile/catalog";
import type { EscortSlot, Load, PublicLoad } from "@/lib/marketplace/types";

/**
 * Taking a position, or bidding for one.
 *
 * Two different things behind one button. On a fixed-price position there is
 * nothing to decide — tapping Accept hires you, and the yard address and the
 * site foreman's number appear immediately, because you are now expected there.
 * On a bidding position you name a price inside the dispatcher's range and wait.
 *
 * The screen says which it is before you tap, because "Accept" and "Submit a
 * bid" commit you to very different things.
 */

const field =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-primary ";

/** Shown the moment a fixed-price position is accepted. */
function Hired({
  load,
  company,
  onClose,
}: {
  load: Load;
  company: offersApi.RevealedCompany;
  onClose: () => void;
}) {
  const contacts = load.contacts ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center py-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-7 w-7 text-success" aria-hidden />
        </div>
        <h3 className="mt-3 text-xl font-bold">The job is yours</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {load.reference} ·{" "}
          {formatMoney(load.slots.find((s) => s.assignedPilotId)?.amountCents ?? 0)}
        </p>
      </div>

      {/*
        Everything below was hidden until this moment (ADR-8). It is here now
        because a pilot who is expected at a yard at 07:00 needs the yard.
      */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Where to go
        </h4>
        <div className="mt-2 flex gap-2 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div>
            <div>{load.origin.address}</div>
            <div className="text-muted-foreground">
              {load.origin.city}, {regionName(load.origin.region)} {load.origin.postalCode ?? ""}
            </div>
          </div>
        </div>
      </div>

      {contacts.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            On site
          </h4>
          {contacts.map((c) => (
            <a
              key={c.id}
              href={`tel:${c.phone}`}
              className="mt-2 flex items-center gap-2 text-sm text-primary"
            >
              <Phone className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                {c.name} · {c.role} · {c.phone}
              </span>
            </a>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface p-4">
        <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Who hired you
        </h4>
        <div className="mt-2 text-sm">{company.companyName}</div>
        {company.phone && (
          <a href={`tel:${company.phone}`} className="text-sm text-primary">
            {company.phone}
          </a>
        )}
      </div>

      {load.permitNumbers.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Permits
          </h4>
          <div className="mt-1 font-mono text-sm">{load.permitNumbers.join(", ")}</div>
        </div>
      )}

      <button
        onClick={onClose}
        className="h-11 w-full rounded-full bg-primary font-semibold text-primary-foreground"
      >
        Done
      </button>
    </div>
  );
}

export function OfferSheet({
  load,
  slot,
  onClose,
  onDone,
}: {
  load: PublicLoad;
  slot: EscortSlot;
  onClose: () => void;
  onDone: () => void;
}) {
  const fixed = slot.pricingMode === "fixed";
  const [amount, setAmount] = useState(String((fixed ? slot.amountCents : slot.amountCents) / 100));
  const [pickupEstimate, setPickupEstimate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [bidPlaced, setBidPlaced] = useState(false);
  const [hired, setHired] = useState<{ load: Load; company: offersApi.RevealedCompany } | null>(
    null,
  );

  const submit = async () => {
    setBusy(true);
    setError(null);
    setReasons([]);
    try {
      const result = await offersApi.makeOffer({
        loadId: load.id,
        slotId: slot.id,
        amountCents: Math.round(Number(amount) * 100),
        pickupEstimate: pickupEstimate || undefined,
        notes: notes || undefined,
      });

      if (result.assignment && result.load && result.company) {
        setHired({ load: result.load, company: result.company });
      } else {
        setBidPlaced(true);
      }
    } catch (e) {
      const err = e as Error & { reasons?: string[] };
      setError(err.message);
      setReasons(err.reasons ?? []);
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={fixed ? "Accept this position" : "Bid on this position"}
        className="flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-3xl bg-background"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 pt-4 pb-3">
          <h3 className="font-bold">
            {hired ? "Assigned" : fixed ? "Accept this position" : "Bid on this position"}
          </h3>
          <button
            onClick={hired ? onDone : onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {hired ? (
            <Hired load={hired.load} company={hired.company} onClose={onDone} />
          ) : bidPlaced ? (
            <div className="flex flex-col items-center py-8 text-center">
              <h3 className="text-lg font-bold">Bid sent</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {load.reference} · {formatMoney(Math.round(Number(amount) * 100))}. The dispatcher
                will pick one. You can change or withdraw it from My bids until they do.
              </p>
              <button
                onClick={onDone}
                className="mt-6 h-11 w-full max-w-xs rounded-full bg-primary font-semibold text-primary-foreground"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
                <div className="font-semibold">{load.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {load.reference} · {serviceLabel(slot.service)} · {load.origin.city} →{" "}
                  {load.destination.city}
                </div>
              </div>

              {fixed ? (
                <div className="rounded-2xl border border-success/30 bg-success/10 p-4">
                  <div className="text-2xl font-bold text-success">
                    {formatMoney(slot.amountCents)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A fixed price. Accepting hires you straight away — the pickup address and the
                    site contact appear as soon as you do.
                  </p>
                </div>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium">What you want to be paid</span>
                  <input
                    className={field}
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    Between {formatMoney(slot.amountCents)} and{" "}
                    {formatMoney(slot.maxAmountCents ?? slot.amountCents)}.
                  </span>
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-xs font-medium">
                  When you can be at the pickup
                </span>
                <input
                  className={field}
                  value={pickupEstimate}
                  onChange={(e) => setPickupEstimate(e.target.value)}
                  placeholder="07:00, or the day before"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium">Anything to add</span>
                <textarea
                  className={`${field} h-20 resize-none py-2`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertCircle className="h-4 w-4" aria-hidden />
                    {error}
                  </div>
                  {reasons.length > 1 && (
                    <ul className="mt-1 list-inside list-disc text-[11px] text-muted-foreground">
                      {reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {!hired && !bidPlaced && (
          <div className="border-t border-border p-5">
            <button
              disabled={busy}
              onClick={() => void submit()}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {fixed ? `Accept ${formatMoney(slot.amountCents)}` : "Send my bid"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

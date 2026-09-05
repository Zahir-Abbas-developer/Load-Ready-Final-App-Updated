import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Calendar, MapPin, Package, RefreshCw, Ruler, Weight, X } from "lucide-react";
import * as api from "@/lib/marketplace/api";
import { serviceLabel } from "@/lib/marketplace/matching";
import { regionName } from "@/lib/profile/catalog";
import type { EscortSlot, PublicLoad } from "@/lib/marketplace/types";
import { OfferSheet } from "./OfferSheet";
import { EmptyState, ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";

/**
 * The pilot's load board.
 *
 * The thing that makes this worth using is the "why not". A pilot who opens a
 * job and finds it unavailable with no explanation assumes the app is broken.
 * One who reads "your Texas certification expired" goes and renews it — so a
 * load they cannot take is still shown, with the reason, rather than hidden.
 *
 * Nothing here is a permission check. The server decides; this explains.
 */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      {children}
    </span>
  );
}

function Reasons({ reasons }: { reasons: api.BoardRow["reasons"] }) {
  if (reasons.length === 0) return null;
  return (
    <div className="mt-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-destructive">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
        You cannot take this yet
      </div>
      <ul className="mt-1 space-y-0.5">
        {reasons.map((r) => (
          <li key={r.code} className="text-[11px] text-muted-foreground">
            {r.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Window({ load }: { load: PublicLoad }) {
  const from = new Date(load.pickupFrom);
  const to = new Date(load.pickupTo);
  const sameDay = from.toDateString() === to.toDateString();
  return (
    <span>
      {from.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      {sameDay
        ? ` ${from.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${to.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
        : ` – ${to.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
    </span>
  );
}

function LoadCard({ row, onOpen }: { row: api.BoardRow; onOpen: () => void }) {
  const { load, eligible } = row;
  const prices = load.slots.map((s) => s.amountCents);
  const low = Math.min(...prices);
  const high = Math.max(...prices);

  return (
    <button
      onClick={onOpen}
      className={`w-full rounded-2xl border bg-surface p-4 text-left transition-colors ${
        eligible ? "border-border hover:border-primary/40" : "border-border/60 opacity-90"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-muted-foreground">{load.reference}</div>
          <div className="truncate text-sm font-semibold">{load.title}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold text-success">
            {low === high ? api.formatMoney(low) : `${api.formatMoney(low)}+`}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {load.slots.length} position{load.slots.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">
          {load.origin.city}, {regionName(load.origin.region)} → {load.destination.city},{" "}
          {regionName(load.destination.region)}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <Window load={load} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {load.slots.map((s) => (
          <Chip key={s.id}>{serviceLabel(s.service)}</Chip>
        ))}
        {load.company.usdotNumber && <Chip>USDOT {load.company.usdotNumber}</Chip>}
      </div>

      <Reasons reasons={row.reasons} />
    </button>
  );
}

function LoadSheet({
  load,
  eligibleSlotIds,
  onClose,
  onOffered,
}: {
  load: PublicLoad;
  eligibleSlotIds: string[];
  onClose: () => void;
  onOffered: () => void;
}) {
  const [offering, setOffering] = useState<EscortSlot | null>(null);
  const length = api.formatFeetInches(load.lengthIn);
  const width = api.formatFeetInches(load.widthIn);
  const height = api.formatFeetInches(load.heightIn);
  const weight = api.formatWeight(load.weightLb);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Load ${load.reference}`}
        className="flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-3xl bg-background"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 pt-4 pb-3">
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground">{load.reference}</div>
            <h3 className="font-bold">{load.title}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <div className="font-semibold">{load.company.name}</div>
            <div className="text-[11px] text-muted-foreground">
              {load.company.city && load.company.region
                ? `${load.company.city}, ${regionName(load.company.region)}`
                : "Location not given"}
              {load.company.usdotNumber ? ` · USDOT ${load.company.usdotNumber}` : ""}
            </div>
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <div>
                <div>
                  {load.origin.city}, {regionName(load.origin.region)}
                </div>
                <div className="text-muted-foreground">
                  to {load.destination.city}, {regionName(load.destination.region)}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  The exact addresses are shared once you are assigned.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <Window load={load} />
            </div>
            {(length || width || height) && (
              <div className="flex gap-2">
                <Ruler className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>{[length, width, height].filter(Boolean).join(" × ")}</span>
              </div>
            )}
            {weight && (
              <div className="flex gap-2">
                <Weight className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>{weight}</span>
              </div>
            )}
            {load.permitCount > 0 && (
              <div className="flex gap-2">
                <Package className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>
                  {load.permitCount} permit{load.permitCount === 1 ? "" : "s"} on file — shared once
                  you are assigned
                </span>
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Positions needed
            </h4>
            <div className="space-y-2">
              {load.slots.map((s) => {
                const canTake = eligibleSlotIds.includes(s.id);
                return (
                  <div key={s.id} className="rounded-xl border border-border bg-surface p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold capitalize">
                        {serviceLabel(s.service)}
                      </span>
                      <span className="text-sm font-bold text-success">
                        {s.pricingMode === "bidding" && s.maxAmountCents
                          ? `${api.formatMoney(s.amountCents)}–${api.formatMoney(s.maxAmountCents)}`
                          : api.formatMoney(s.amountCents)}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {s.pricingMode === "bidding" ? "Open to bids" : "Fixed price"}
                      {s.rateBasis === "per_mile" ? ", per mile" : ""}
                      {s.poleHeightFt ? ` · must clear ${s.poleHeightFt} ft` : ""}
                      {s.assignedPilotId ? " · filled" : ""}
                    </div>

                    {canTake && (
                      <button
                        onClick={() => setOffering(s)}
                        className="mt-2 h-10 w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                      >
                        {s.pricingMode === "fixed"
                          ? `Accept ${api.formatMoney(s.amountCents)}`
                          : "Bid on this position"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {load.constraints.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Constraints
              </h4>
              <ul className="list-inside list-disc text-sm">
                {load.constraints.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {load.notes && <p className="text-sm text-muted-foreground">{load.notes}</p>}

          {/*
            Bidding and accepting arrive in H2. Saying so beats a button that
            does nothing, and beats leaving a pilot wondering how to respond.
          */}
          <div className="rounded-2xl border border-primary/20 bg-accent p-4 text-xs">
            Bidding and accepting open in the next release. Everything you need to decide is here in
            the meantime.
          </div>
        </div>
      </div>

      {offering && (
        <OfferSheet
          load={load}
          slot={offering}
          onClose={() => setOffering(null)}
          onDone={() => {
            setOffering(null);
            onOffered();
          }}
        />
      )}
    </div>
  );
}

export function LoadBoard({ onOpenProfile }: { onOpenProfile?: () => void } = {}) {
  const [rows, setRows] = useState<api.BoardRow[] | null>(null);
  const [workingRegions, setWorkingRegions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<api.BoardRow | null>(null);
  const [onlyEligible, setOnlyEligible] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const board = await api.board();
      setRows(board.rows);
      setWorkingRegions(board.workingRegions);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the board.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error && !rows) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!rows) return <LoadingState message="Finding work in your regions…" />;

  const shown = onlyEligible ? rows.filter((r) => r.eligible) : rows;
  const eligibleCount = rows.filter((r) => r.eligible).length;

  if (rows.length === 0) {
    /*
     * Two different empties, and telling a pilot the wrong one wastes their
     * week. With no regions set nothing can ever appear here — the old copy
     * said "no loads in your regions yet", which reads as "nobody is posting"
     * when the truth is "you have not told us where you work".
     */
    if (workingRegions.length === 0) {
      return (
        <EmptyState
          icon={MapPin}
          title="Tell us where you work"
          message="Escort jobs are matched to the states and provinces you cover, and you have not set any yet — so nothing can appear here. It takes a minute on your profile."
          action={onOpenProfile ? { label: "Set my regions", onClick: onOpenProfile } : undefined}
        />
      );
    }

    return (
      <EmptyState
        icon={Package}
        title="No loads in your regions yet"
        message="Escort jobs appear here when a dispatcher posts one in a state or province you work in. Adding more regions to your profile widens what you see."
        action={onOpenProfile ? { label: "Add more regions", onClick: onOpenProfile } : undefined}
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          onClick={() => setOnlyEligible((v) => !v)}
          aria-pressed={onlyEligible}
          className={`h-9 rounded-lg px-3 text-xs font-semibold ${
            onlyEligible ? "bg-primary text-primary-foreground" : "bg-surface"
          }`}
        >
          Only what I can take ({eligibleCount})
        </button>
        <button
          onClick={() => void refresh()}
          aria-label="Refresh"
          className="flex h-9 items-center gap-1.5 rounded-lg bg-surface px-3 text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nothing you can take right now"
          message="There is work in your regions, but something on your profile is stopping you taking it. Turn the filter off to see what and why."
          action={{ label: "Show everything", onClick: () => setOnlyEligible(false) }}
        />
      ) : (
        <div className="space-y-2">
          {shown.map((row) => (
            <LoadCard key={row.load.id} row={row} onOpen={() => setOpen(row)} />
          ))}
        </div>
      )}

      {open && (
        <LoadSheet
          load={open.load}
          eligibleSlotIds={open.eligibleSlotIds}
          onClose={() => setOpen(null)}
          onOffered={() => {
            setOpen(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

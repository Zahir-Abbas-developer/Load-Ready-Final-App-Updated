import { useCallback, useEffect, useState } from "react";
import { Gavel, Loader2, MapPin, X } from "lucide-react";
import * as api from "@/lib/marketplace/api";
import * as offersApi from "@/lib/marketplace/offers-api";
import { serviceLabel } from "@/lib/marketplace/matching";
import { regionName } from "@/lib/profile/catalog";
import { EmptyState, LoadingState } from "@/components/loadready/states/StateBlock";
import type { Offer } from "@/lib/marketplace/offers";
import type { PublicLoad } from "@/lib/marketplace/types";

/**
 * Every bid this pilot has out, and what became of it.
 *
 * Replaces a list held in the browser's own storage that had never been near a
 * dispatcher. These are the real offers, with the real outcome — including the
 * dispatcher's reason when they gave one, because a pilot who is told why bids
 * better next time.
 */

const OUTCOME: Record<Offer["status"], { label: string; tone: string }> = {
  pending: { label: "Waiting on the dispatcher", tone: "bg-accent text-primary" },
  accepted: { label: "You got it", tone: "bg-success/10 text-success" },
  declined: { label: "Not this time", tone: "bg-surface text-muted-foreground" },
  withdrawn: { label: "You pulled out", tone: "bg-surface text-muted-foreground" },
  expired: { label: "The load started", tone: "bg-surface text-muted-foreground" },
};

export function MyBids({ onClose, onBrowse }: { onClose: () => void; onBrowse?: () => void }) {
  const [rows, setRows] = useState<Array<{ offer: Offer; load: PublicLoad | null }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows((await offersApi.myWork()).offers);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your bids.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const withdraw = async (offerId: string) => {
    setBusy(offerId);
    try {
      await offersApi.withdrawOffer(offerId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not withdraw that bid.");
    }
    setBusy(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="My bids"
        className="flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-3xl bg-background"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 pt-4 pb-3">
          <h3 className="font-bold">My bids</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div
              role="alert"
              className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {!rows ? (
            <LoadingState message="Loading your bids…" />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Gavel}
              title="No bids yet"
              message="Bids you place on bidding positions appear here until the dispatcher decides."
              action={onBrowse ? { label: "Browse available loads", onClick: onBrowse } : undefined}
            />
          ) : (
            <div className="space-y-2">
              {rows.map(({ offer, load: l }) => {
                const slot = l?.slots.find((s) => s.id === offer.slotId);
                const outcome = OUTCOME[offer.status];
                return (
                  <div key={offer.id} className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-muted-foreground">
                          {l?.reference} · {slot ? serviceLabel(slot.service) : ""}
                        </div>
                        <div className="truncate text-sm font-semibold">
                          {l?.title ?? "This load is no longer listed"}
                        </div>
                        {l && (
                          <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0 text-primary" aria-hidden />
                            {l.origin.city}, {regionName(l.origin.region)} → {l.destination.city},{" "}
                            {regionName(l.destination.region)}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-bold text-success">
                          {api.formatMoney(offer.amountCents)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${outcome.tone}`}
                      >
                        {outcome.label}
                      </span>
                      {offer.pickupEstimate && (
                        <span className="text-[11px] text-muted-foreground">
                          At the pickup: {offer.pickupEstimate}
                        </span>
                      )}
                    </div>

                    {offer.declineReason && (
                      <p className="mt-2 rounded-xl bg-background p-2.5 text-[11px]">
                        They said: {offer.declineReason}
                      </p>
                    )}

                    {offer.status === "pending" && (
                      <button
                        disabled={busy === offer.id}
                        onClick={() => void withdraw(offer.id)}
                        className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-full border border-border bg-background text-xs font-semibold disabled:opacity-50"
                      >
                        {busy === offer.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Withdraw this bid
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

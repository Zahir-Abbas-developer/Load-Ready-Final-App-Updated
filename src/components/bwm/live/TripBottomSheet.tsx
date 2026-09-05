import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { TripPhase, TripDescriptor } from "@/lib/live-trip/types";
import { MessageCircle, Phone, ChevronUp, Truck, FileText, Shield, Ruler, Weight, Clock } from "lucide-react";

const SNAPS = [140, 360, 640]; // collapsed, half, expanded (px from bottom)

export function TripBottomSheet({
  trip,
  phase,
  elapsedSec,
  onSwipeAction,
  swipeLabel,
  swipeArmed,
  isPilot,
  onOpenChat,
  onOpenCall,
  onEmergency,
  unreadMessages = 0,
}: {
  trip: TripDescriptor;
  phase: TripPhase;
  elapsedSec: number;
  onSwipeAction: () => void;
  swipeLabel: string;
  swipeArmed: boolean;
  isPilot: boolean;
  onOpenChat?: () => void;
  onOpenCall?: () => void;
  onEmergency?: () => void;
  unreadMessages?: number;
}) {
  const [snap, setSnap] = useState(0);
  const startY = useRef(0);
  const startSnap = useRef(0);
  const [dragY, setDragY] = useState<number | null>(null);

  const phaseLabel: Record<TripPhase, string> = {
    assigned: "Assigned",
    "to-pickup": "Picking up",
    "at-pickup": "Waiting for load",
    delivering: "Delivering",
    approaching: "Approaching",
    "at-destination": "At destination",
    completed: "Trip completed",
  };

  const targetCity = phase === "to-pickup" || phase === "assigned" || phase === "at-pickup"
    ? trip.pickup.city
    : trip.destination.city;

  const heightPx = dragY ?? SNAPS[snap];

  return (
    <div
      className="absolute left-0 right-0 bottom-0 z-30 bg-background rounded-t-3xl shadow-[0_-12px_28px_rgba(0,0,0,0.12)] flex flex-col touch-none"
      style={{ height: heightPx, transition: dragY === null ? "height 280ms cubic-bezier(0.2,0.8,0.2,1)" : "none" }}
    >
      <div
        className="py-2 flex justify-center cursor-grab"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          startY.current = e.clientY;
          startSnap.current = SNAPS[snap];
          setDragY(SNAPS[snap]);
        }}
        onPointerMove={(e) => {
          if (dragY === null) return;
          const dy = startY.current - e.clientY;
          const next = Math.max(80, Math.min(SNAPS[2] + 40, startSnap.current + dy));
          setDragY(next);
        }}
        onPointerUp={() => {
          if (dragY === null) return;
          const closest = SNAPS.reduce((best, v, i) => (Math.abs(v - dragY) < Math.abs(SNAPS[best] - dragY) ? i : best), 0);
          setSnap(closest);
          setDragY(null);
        }}
      >
        <div className="h-1.5 w-12 rounded-full bg-border" />
      </div>

      <div className="px-5 overflow-y-auto flex-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-primary">{phaseLabel[phase]}</span>
          {phase === "at-pickup" && (
            <span className="text-xs font-mono bg-surface border border-border rounded-full px-2 py-0.5">
              ⏱ {fmtTime(elapsedSec)}
            </span>
          )}
        </div>
        <div className="font-bold text-base mt-1">Heading to: {targetCity}</div>
        <div className="text-xs text-muted-foreground">{phase === "to-pickup" || phase === "assigned" ? trip.pickup.address : trip.destination.address}</div>
        <div className="text-xs text-muted-foreground mt-1">Arriving by : {trip.etaText}</div>

        {snap > 0 && (
          <div className="mt-4 rounded-2xl bg-surface border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Shipment</div>
                <div className="font-mono text-sm font-semibold">{trip.shipment}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center"><Truck className="h-4 w-4 text-primary" /></div>
                <div className="text-xs">
                  <div className="font-semibold">{trip.loadName}</div>
                  <div className="text-muted-foreground">{trip.distanceMi} mi</div>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                  {trip.counterpart.name[0]}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{trip.counterpart.role}</div>
                  <div className="text-sm font-semibold">{trip.counterpart.name}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onOpenChat}
                  aria-label="Chat"
                  className="h-9 w-9 rounded-full bg-background border border-border flex items-center justify-center relative active:scale-95 transition-transform"
                >
                  <MessageCircle className="h-4 w-4" />
                  {unreadMessages > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                      {unreadMessages}
                    </span>
                  )}
                </button>
                <button
                  onClick={onOpenCall}
                  aria-label="Call"
                  className="h-9 w-9 rounded-full bg-background border border-border flex items-center justify-center active:scale-95 transition-transform"
                >
                  <Phone className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {snap === 2 && (
          <div className="mt-3 space-y-2 pb-32">
            <SectionHeader>Shipment details</SectionHeader>
            <DetailRow icon={Ruler} label="Dimensions" value={trip.dimensions} />
            <DetailRow icon={Weight} label="Weight" value={trip.weight} />
            <DetailRow icon={Clock} label="Elapsed" value={fmtTime(elapsedSec)} />
            <SectionHeader>Documents</SectionHeader>
            <button
              onClick={() => toast("Permit TX-OS-2310", { description: "Demo: document preview not available in this build." })}
              className="w-full text-left"
            >
              <DetailRow icon={FileText} label="Permit #TX-OS-2310" value="View" />
            </button>
            <button
              onClick={() => toast("Insurance certificate", { description: "Demo: document preview not available in this build." })}
              className="w-full text-left"
            >
              <DetailRow icon={Shield} label="Insurance" value="View" />
            </button>
            <button
              onClick={onEmergency ?? (() => toast.error("Emergency contact triggered", { description: "Dispatcher and 911 would be notified in production." }))}
              className="w-full h-11 rounded-full bg-destructive/10 text-destructive font-semibold mt-3 active:scale-[0.99] transition-transform"
            >
              Emergency contact
            </button>
          </div>
        )}

        {snap < 2 && (
          <button
            onClick={() => setSnap((s) => Math.min(2, s + 1))}
            className="mt-3 w-full text-xs text-muted-foreground flex items-center justify-center gap-1"
          >
            More <ChevronUp className="h-3 w-3" />
          </button>
        )}
      </div>

      {isPilot && (
        <div className="px-4 pt-2 pb-4 border-t border-border bg-background">
          <button
            onClick={onSwipeAction}
            disabled={!swipeArmed}
            className={`w-full h-13 rounded-full font-bold flex items-center justify-center gap-2 py-3.5 transition ${
              swipeArmed
                ? "bg-gradient-to-r from-[#C9A227] to-[#E0B83A] text-white shadow-lg active:scale-[0.99]"
                : "bg-muted text-muted-foreground"
            }`}
          >
            ▶▶ {swipeLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mt-3">{children}</div>;
}
function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface border border-border px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm">{label}</span>
      </div>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
function fmtTime(s: number) {
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Phone, MessageCircle, Radio, History } from "lucide-react";
import { MapView, type MapStyle } from "./MapView";
import { MapControls } from "./MapControls";
import { TripBottomSheet } from "./TripBottomSheet";
import { BannerStack } from "./BannerStack";
import { TokenPrompt } from "./TokenPrompt";
import { ChatSheet } from "./ChatSheet";
import { CallScreen } from "./CallScreen";
import { CommsHistory } from "./CommsHistory";
import { getMapboxToken } from "@/lib/live-trip/mapbox-token";
import { getSim, DEMO_TRIP } from "@/lib/live-trip/simulator";
import { subscribePings } from "@/lib/live-trip/realtime";
import { subscribePhase as subscribePhaseStatus, isActivePhase } from "@/lib/live-trip/job-status";
import type { BannerData, GpsPing, TripPhase } from "@/lib/live-trip/types";

export function DispatcherLiveTrip({ onClose }: { onClose: () => void }) {
  const [hasToken, setHasToken] = useState(!!getMapboxToken());
  const sim = useMemo(() => getSim(), []);
  const [phase, setPhase] = useState<TripPhase>(sim.phase);
  const [vehicle, setVehicle] = useState<GpsPing | null>(null);
  const [traveled, setTraveled] = useState<[number, number][]>([]);
  const [follow, setFollow] = useState(true);
  const [style, setStyle] = useState<MapStyle>("default");
  const [showTraffic, setShowTraffic] = useState(false);
  const [banners, setBanners] = useState<BannerData[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);

  // Cross-device phase sync via Supabase Realtime broadcast.
  useEffect(() => {
    const unsub = subscribePhaseStatus(DEMO_TRIP.id, (e) => {
      sim.setPhase(e.phase);
      setPhase(e.phase);
    });
    return () => { unsub(); };
  }, [sim]);

  // Subscribe to Supabase Realtime GPS stream (no in-memory simulator).
  useEffect(() => {
    if (!hasToken) return;
    const unsub = subscribePings(DEMO_TRIP.id, (p) => {
      setVehicle(p);
      setLastPingAt(Date.now());
      setTraveled((t) => {
        const last = t[t.length - 1];
        if (last && Math.abs(last[0] - p.lng) < 1e-5 && Math.abs(last[1] - p.lat) < 1e-5) return t;
        return [...t, [p.lng, p.lat]];
      });
    });
    // Phase still comes from local sim (in a real backend, would be a trip status row + Realtime).
    const u2 = sim.subscribePhase((p) => {
      setPhase(p);
      if (p === "to-pickup") push({ id: "trip-started", kind: "route-updated", title: "Trip started", body: "Pilot is heading to the pickup location." });
      if (p === "at-pickup") push({ id: "at-pickup", kind: "follow-route", title: "Pilot arrived at pickup", body: "Awaiting load handover." });
      if (p === "delivering") push({ id: "delivering", kind: "route-updated", title: "Delivery in progress", body: "Pilot is now en route to destination." });
    });
    return () => { unsub(); u2(); };
  }, [sim, hasToken]);

  // Stale-feed warning if no ping arrives for 15s.
  const stale = lastPingAt !== null && Date.now() - lastPingAt > 15_000;
  useEffect(() => {
    const i = setInterval(() => setLastPingAt((t) => t), 5_000);
    return () => clearInterval(i);
  }, []);

  function push(b: BannerData) { setBanners((p) => (p.find((x) => x.id === b.id) ? p : [...p, b])); }
  function dismiss(id: string) { setBanners((p) => p.filter((b) => b.id !== id)); }

  if (!hasToken) {
    return (
      <div className="absolute inset-0 z-50 bg-background flex flex-col">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
          <button onClick={onClose} className="h-10 w-10 rounded-full bg-surface flex items-center justify-center">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="font-bold">Track trip</h2>
        </div>
        <TokenPrompt onReady={() => setHasToken(true)} />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 bg-background flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        <MapView
          pickup={DEMO_TRIP.pickup}
          destination={DEMO_TRIP.destination}
          plannedRoute={sim.geometry}
          traveledRoute={traveled}
          vehicle={vehicle}
          follow={follow}
          navMode={false}
          style={style}
          showTraffic={showTraffic}
          onUserPan={() => setFollow(false)}
        />

        <div className="absolute left-3 right-3 top-3 z-30 flex items-center gap-2">
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-white shadow-md flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className={`h-10 px-3 rounded-full shadow-md flex items-center gap-1.5 text-xs font-semibold ${stale ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-white"}`}>
            <Radio className={`h-3.5 w-3.5 ${stale ? "text-amber-600" : "text-emerald-500 animate-pulse"}`} />
            {stale ? "Feed stale" : `Live · ${phase.replace("-", " ")}`}
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setHistoryOpen(true)}
              className="h-10 w-10 rounded-full bg-white shadow-md flex items-center justify-center"
              aria-label="Comms history"
            >
              <History className="h-4 w-4" />
            </button>
            {isActivePhase(phase) && (
              <button
                onClick={() => setChatOpen(true)}
                className="h-10 w-10 rounded-full bg-white shadow-md flex items-center justify-center animate-in fade-in zoom-in-50 duration-200"
                aria-label="Chat with pilot"
                title="Chat (active jobs only)"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setCallOpen(true)}
              className="h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center active:scale-95 transition-transform"
              aria-label="Call pilot"
            >
              <Phone className="h-4 w-4" />
            </button>
          </div>
        </div>

        <BannerStack banners={banners} onDismiss={dismiss} />

        <MapControls
          follow={follow}
          navMode={false}
          onRecenter={() => setFollow(true)}
          onZoom={() => {}}
          style={style}
          setStyle={setStyle}
          showTraffic={showTraffic}
          setShowTraffic={setShowTraffic}
          onReport={(kind) => push({ id: `rep-${Date.now()}`, kind: "route-updated", title: "Incident logged", body: `${kind} reported.` })}
        />

        <TripBottomSheet
          trip={DEMO_TRIP}
          phase={phase}
          elapsedSec={0}
          isPilot={false}
          swipeLabel=""
          swipeArmed={false}
          onSwipeAction={() => {}}
          onOpenChat={() => setChatOpen(true)}
          onOpenCall={() => setCallOpen(true)}
        />
      </div>

      <ChatSheet
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        tripId={DEMO_TRIP.id}
        myRole="dispatcher"
        myName="Mark Anton"
        counterpartName="Pilot Driver"
        counterpartPhone="+15558675310"
      />
      <CallScreen
        open={callOpen}
        onClose={() => setCallOpen(false)}
        counterpartName="Pilot Driver"
        counterpartRole="Pilot"
        counterpartPhone="+15558675310"
        tripId={DEMO_TRIP.id}
        onSwitchToSms={() => setChatOpen(true)}
      />
      <CommsHistory open={historyOpen} onClose={() => setHistoryOpen(false)} tripId={DEMO_TRIP.id} />
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, WifiOff, MessageCircle, Phone, History } from "lucide-react";
import { ChatSheet } from "./ChatSheet";
import { CallScreen } from "./CallScreen";
import { CommsHistory } from "./CommsHistory";
import { MapView, type MapStyle } from "./MapView";
import { TurnByTurnBanner } from "./TurnByTurnBanner";
import { MapControls } from "./MapControls";
import { TripBottomSheet } from "./TripBottomSheet";
import { BannerStack } from "./BannerStack";
import { TokenPrompt } from "./TokenPrompt";
import { getMapboxToken } from "@/lib/live-trip/mapbox-token";
import { getSim, DEMO_TRIP } from "@/lib/live-trip/simulator";
import { broadcastPhase, isActivePhase } from "@/lib/live-trip/job-status";
import type { BannerData, GpsPing, TripPhase } from "@/lib/live-trip/types";

const PHASE_NEXT: Record<TripPhase, { label: string; next: TripPhase }> = {
  assigned: { label: "Start trip to pickup", next: "to-pickup" },
  "to-pickup": { label: "Arrived to pickup", next: "at-pickup" },
  "at-pickup": { label: "Start trip to destination", next: "delivering" },
  delivering: { label: "Arrived to delivery", next: "at-destination" },
  approaching: { label: "Arrived to delivery", next: "at-destination" },
  "at-destination": { label: "Finish trip", next: "completed" },
  completed: { label: "View receipt", next: "completed" },
};

export function PilotLiveTrip({ onClose }: { onClose: () => void }) {
  const [hasToken, setHasToken] = useState(!!getMapboxToken());
  const sim = useMemo(() => getSim(), []);
  const [phase, setPhase] = useState<TripPhase>(sim.phase);
  const [vehicle, setVehicle] = useState<GpsPing | null>(sim.current());
  const [traveled, setTraveled] = useState<[number, number][]>([]);
  const [follow, setFollow] = useState(true);
  const [style, setStyle] = useState<MapStyle>("default");
  const [showTraffic, setShowTraffic] = useState(false);
  const [banners, setBanners] = useState<BannerData[]>([]);
  const [online, setOnline] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const lastPanRef = useRef(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Broadcast phase updates so dispatcher + admin views stay in sync.
  useEffect(() => {
    broadcastPhase(DEMO_TRIP.id, phase);
  }, [phase]);

  // Enable Supabase Realtime broadcast of pilot's GPS pings.
  useEffect(() => {
    sim.enablePublishing(DEMO_TRIP.id);
    return () => sim.disablePublishing();
  }, [sim]);

  // Subscribe to sim
  useEffect(() => {
    if (!hasToken) return;
    const u1 = sim.subscribe((p) => {
      setVehicle(p);
      setTraveled((t) => {
        const last = t[t.length - 1];
        if (last && Math.abs(last[0] - p.lng) < 1e-5 && Math.abs(last[1] - p.lat) < 1e-5) return t;
        return [...t, [p.lng, p.lat]];
      });
    });
    const u2 = sim.subscribePhase(setPhase);
    return () => { u1(); u2(); };
  }, [sim, hasToken]);

  // At-pickup elapsed timer
  useEffect(() => {
    if (phase !== "at-pickup") return;
    const i = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => clearInterval(i);
  }, [phase]);

  // Online/offline detection — verify with a network probe before alarming
  // the user, since navigator.onLine is unreliable in preview iframes.
  useEffect(() => {
    let probeTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const verifyOffline = async () => {
      try {
        await fetch(`${window.location.origin}/favicon.ico?ts=${Date.now()}`, {
          method: "GET", cache: "no-store", mode: "no-cors",
        });
        if (!cancelled) {
          setOnline(true);
        }
      } catch {
        if (!cancelled) {
          setOnline(false);
          pushBanner({ id: "offline", kind: "offline", title: "Connection lost", body: "You can keep driving — your trip and location will sync the moment you're back online." });
        }
      }
    };

    const on = () => {
      if (probeTimer) clearTimeout(probeTimer);
      setOnline(true);
      pushBanner({ id: "online", kind: "online", title: "Back online", body: "Your location and trip data have been synced. Continue following your assigned route." });
    };
    const off = () => {
      if (probeTimer) clearTimeout(probeTimer);
      probeTimer = setTimeout(verifyOffline, 600);
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      cancelled = true;
      if (probeTimer) clearTimeout(probeTimer);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Initial advisory banner
  useEffect(() => {
    if (!hasToken) return;
    pushBanner({
      id: "follow-route",
      kind: "follow-route",
      title: "Follow the assigned route",
      body: "Other roads may not be permitted, even if they seem faster.",
      action: "I understand",
    });
  }, [hasToken]);

  function pushBanner(b: BannerData) {
    setBanners((prev) => prev.find((x) => x.id === b.id) ? prev : [...prev, b]);
  }
  function dismiss(id: string) { setBanners((p) => p.filter((b) => b.id !== id)); }

  const navMode = phase === "to-pickup" || phase === "delivering" || phase === "approaching";
  const swipeArmed = phase !== "completed";
  const onSwipe = () => {
    const next = PHASE_NEXT[phase].next;
    if (phase === "delivering" || phase === "approaching") {
      pushBanner({ id: "eta", kind: "eta-updated", title: "Delivery Time Updated", body: "Weather or road conditions are affecting travel time. The expected delivery time has been updated.", etaText: "July 20, 2025 - 3:30 PM" });
    }
    sim.setPhase(next);
  };

  const onUserPan = () => {
    const now = Date.now();
    if (now - lastPanRef.current < 200) return;
    lastPanRef.current = now;
    setFollow(false);
  };

  if (!hasToken) {
    return (
      <div className="absolute inset-0 z-50 bg-background flex flex-col">
        <Header onBack={onClose} title="Live trip" />
        <TokenPrompt onReady={() => setHasToken(true)} />
      </div>
    );
  }

  const distLabel = `${(sim.nextTurn().distanceM / 1000).toFixed(1)} km`;

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
          navMode={navMode}
          style={style}
          showTraffic={showTraffic}
          onUserPan={onUserPan}
        />

        {/* Top header */}
        <div className="absolute left-3 right-3 top-3 z-30 flex items-center gap-2">
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-white shadow-md flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {!online && (
            <div className="h-10 px-3 rounded-full bg-rose-50 border border-rose-200 flex items-center gap-1.5 text-rose-600 text-xs font-semibold shadow-md">
              <WifiOff className="h-3.5 w-3.5" /> Offline
            </div>
          )}
          <div className="ml-auto h-10 px-3 rounded-full bg-white shadow-md flex items-center text-xs font-semibold">
            ETA {DEMO_TRIP.etaText}
          </div>
          <button
            onClick={() => setCallOpen(true)}
            className="h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Call dispatcher"
          >
            <Phone className="h-4 w-4" />
          </button>
          {isActivePhase(phase) && (
            <button
              onClick={() => setChatOpen(true)}
              className="h-10 w-10 rounded-full bg-white shadow-md flex items-center justify-center animate-in fade-in zoom-in-50 duration-200"
              aria-label="Chat with dispatcher"
              title="Chat (active jobs only)"
            >
              <MessageCircle className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setHistoryOpen(true)}
            className="h-10 w-10 rounded-full bg-white shadow-md flex items-center justify-center"
            aria-label="Comms history"
          >
            <History className="h-4 w-4" />
          </button>
        </div>

        {navMode && <TurnByTurnBanner instr={sim.nextTurn()} speedMph={vehicle?.speed ?? 0} distanceLabel={distLabel} />}

        <BannerStack
          banners={banners}
          onDismiss={dismiss}
          onAction={(b) => {
            if (b.kind === "deviation") {
              // simulate confirm + clear
            }
          }}
        />

        <MapControls
          follow={follow}
          navMode={navMode}
          onRecenter={() => setFollow(true)}
          onZoom={() => { /* mapbox handles via scroll; could expose ref */ }}
          style={style}
          setStyle={setStyle}
          showTraffic={showTraffic}
          setShowTraffic={setShowTraffic}
          onReport={(kind) => pushBanner({
            id: `rep-${Date.now()}`, kind: "route-updated",
            title: "Incident reported", body: `${kind} reported on your route. Dispatcher has been notified.`,
          })}
        />

        <TripBottomSheet
          trip={DEMO_TRIP}
          phase={phase}
          elapsedSec={elapsed}
          isPilot
          swipeLabel={PHASE_NEXT[phase].label}
          swipeArmed={swipeArmed}
          onSwipeAction={onSwipe}
          onOpenChat={() => setChatOpen(true)}
          onOpenCall={() => setCallOpen(true)}
        />
      </div>

      <ChatSheet
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        tripId={DEMO_TRIP.id}
        myRole="pilot"
        myName="Pilot Driver"
        counterpartName={DEMO_TRIP.counterpart.name}
        counterpartPhone="+15558675310"
      />
      <CallScreen
        open={callOpen}
        onClose={() => setCallOpen(false)}
        counterpartName={DEMO_TRIP.counterpart.name}
        counterpartRole="Dispatcher"
        counterpartPhone="+15558675310"
        tripId={DEMO_TRIP.id}
        onSwitchToSms={() => setChatOpen(true)}
      />
      <CommsHistory open={historyOpen} onClose={() => setHistoryOpen(false)} tripId={DEMO_TRIP.id} />
    </div>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
      <button onClick={onBack} className="h-10 w-10 rounded-full bg-surface flex items-center justify-center">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h2 className="font-bold">{title}</h2>
    </div>
  );
}

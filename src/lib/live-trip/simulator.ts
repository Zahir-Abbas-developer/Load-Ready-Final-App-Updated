import type { GpsPing, TripDescriptor, TripPhase, TurnInstruction } from "./types";

/**
 * Lightweight in-memory trip simulator.
 *
 * - Holds the planned route geometry (array of [lng,lat]).
 * - Walks an "agent" along that geometry at a configurable speed.
 * - Emits GPS pings on a tick interval.
 * - Both pilot screen and dispatcher screen subscribe to the same singleton,
 *   so the dispatcher sees the pilot's position in real-time.
 */

type Listener = (ping: GpsPing) => void;
type PhaseListener = (phase: TripPhase) => void;

// Dallas → Houston-ish demo route (hard-coded waypoints to keep it offline-safe).
// Coords are approximate; real geometry comes from Mapbox Directions when token is present.
const FALLBACK_GEOMETRY: [number, number][] = [
  [-96.797, 32.7767], // Dallas
  [-96.65, 32.65],
  [-96.4, 32.45],
  [-96.05, 32.05],
  [-95.7, 31.55],
  [-95.45, 31.0],
  [-95.35, 30.55],
  [-95.3, 30.1],
  [-95.37, 29.76], // Houston
];

const TURN_SCRIPT: TurnInstruction[] = [
  { text: "Head south on I-45", next: "Continue 240 mi", distanceM: 800, modifier: "straight", speedLimitMph: 60 },
  { text: "Slight right onto US-75", next: "Then merge onto I-45 S", distanceM: 1200, modifier: "slight-right", speedLimitMph: 60 },
  { text: "Continue on I-45 S", next: "Stay in right lane", distanceM: 1800, modifier: "straight", speedLimitMph: 65 },
  { text: "Take exit 117 toward Buffalo", next: "Then turn left on US-79", distanceM: 600, modifier: "right", speedLimitMph: 55 },
  { text: "Turn left onto US-79 S", next: "Continue 14 mi", distanceM: 350, modifier: "left", speedLimitMph: 55 },
  { text: "Continue toward Houston", next: "Arriving in 1 hr 12 min", distanceM: 2500, modifier: "straight", speedLimitMph: 65 },
  { text: "Exit toward Downtown Houston", next: "Destination on right", distanceM: 400, modifier: "right", speedLimitMph: 45 },
];

export const DEMO_TRIP: TripDescriptor = {
  id: "EV-2017003323",
  shipment: "EV-2017003323",
  loadName: "Industrial Generator",
  counterpart: { name: "Mark Anton", role: "Fleet Dispatcher" },
  pickup: { lng: -96.797, lat: 32.7767, address: "1200 Main St", city: "Dallas, TX" },
  destination: { lng: -95.37, lat: 29.76, address: "800 Bagby St", city: "Houston, TX" },
  dimensions: "45 ft × 12 ft × 14 ft",
  weight: "105,000 lbs",
  distanceMi: 240,
  etaText: "12:00 pm",
};

function bearing(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const λ1 = toRad(a[0]);
  const λ2 = toRad(b[0]);
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

class TripSim {
  geometry: [number, number][] = FALLBACK_GEOMETRY;
  segIdx = 0;
  segT = 0; // 0..1 along current segment
  speedMph = 55;
  paused = false;
  phase: TripPhase = "assigned";
  turnIdx = 0;
  private listeners = new Set<Listener>();
  private phaseListeners = new Set<PhaseListener>();
  private timer: ReturnType<typeof setInterval> | null = null;

  current(): GpsPing {
    const a = this.geometry[Math.min(this.segIdx, this.geometry.length - 1)];
    const b = this.geometry[Math.min(this.segIdx + 1, this.geometry.length - 1)];
    const lng = a[0] + (b[0] - a[0]) * this.segT;
    const lat = a[1] + (b[1] - a[1]) * this.segT;
    return {
      lng,
      lat,
      heading: bearing(a, b),
      speed: this.paused ? 0 : this.speedMph,
      accuracy: 8,
      timestamp: Date.now(),
    };
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  reset() {
    this.stop();
    this.segIdx = 0;
    this.segT = 0;
    this.turnIdx = 0;
    this.paused = false;
    this.setPhase("assigned");
    this.emit();
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.emit();
  }

  setSpeed(mph: number) {
    this.speedMph = Math.max(0, mph);
  }

  setGeometry(g: [number, number][]) {
    if (g.length >= 2) {
      this.geometry = g;
      this.segIdx = 0;
      this.segT = 0;
      this.emit();
    }
  }

  private tick() {
    if (this.paused) return;
    if (this.phase === "assigned" || this.phase === "at-pickup" || this.phase === "completed") return;
    // Advance based on speed; treat each segment as ~30 mi for demo timing.
    const inc = (this.speedMph / 60 / 60) * (1 / 30); // fraction per second
    this.segT += inc * 8; // accelerate sim ~8x for demo
    while (this.segT >= 1) {
      this.segT -= 1;
      this.segIdx += 1;
      this.turnIdx = Math.min(this.turnIdx + 1, TURN_SCRIPT.length - 1);
      if (this.segIdx >= this.geometry.length - 1) {
        this.segIdx = this.geometry.length - 2;
        this.segT = 1;
        this.setPhase(this.phase === "delivering" || this.phase === "approaching" ? "at-destination" : this.phase);
        this.stop();
        break;
      }
    }
    // Auto phase: approaching when on last segment
    if (this.phase === "delivering" && this.segIdx >= this.geometry.length - 2 && this.segT > 0.6) {
      this.setPhase("approaching");
    }
    this.emit();
  }

  setPhase(p: TripPhase) {
    if (p === this.phase) return;
    this.phase = p;
    this.phaseListeners.forEach((l) => l(p));
    if (p === "to-pickup" || p === "delivering" || p === "approaching") {
      this.start();
    }
    if (p === "at-pickup" || p === "at-destination" || p === "completed") {
      // halt motion but keep position
    }
  }

  nextTurn(): TurnInstruction {
    return TURN_SCRIPT[Math.min(this.turnIdx, TURN_SCRIPT.length - 1)];
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.current());
    return () => this.listeners.delete(l);
  }
  subscribePhase(l: PhaseListener) {
    this.phaseListeners.add(l);
    l(this.phase);
    return () => this.phaseListeners.delete(l);
  }
  private emit() {
    const p = this.current();
    this.listeners.forEach((l) => l(p));
    if (this.publishing) {
      import("./realtime").then(({ publishPing }) => {
        publishPing(this.tripId, p);
      });
    }
  }

  publishing = false;
  tripId = DEMO_TRIP.id;
  enablePublishing(tripId: string) {
    this.tripId = tripId;
    this.publishing = true;
  }
  disablePublishing() {
    this.publishing = false;
  }
}

let _sim: TripSim | null = null;
export function getSim(): TripSim {
  if (!_sim) _sim = new TripSim();
  return _sim;
}

export { FALLBACK_GEOMETRY };

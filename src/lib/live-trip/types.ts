export type TripPhase =
  | "assigned"
  | "to-pickup"
  | "at-pickup"
  | "delivering"
  | "approaching"
  | "at-destination"
  | "completed";

export interface LngLat {
  lng: number;
  lat: number;
}

export interface GpsPing {
  lng: number;
  lat: number;
  heading: number; // degrees, 0 = north
  speed: number; // mph
  accuracy: number; // m
  timestamp: number;
}

export interface TurnInstruction {
  text: string;
  next?: string;
  distanceM: number; // meters until this maneuver
  modifier: "left" | "right" | "straight" | "uturn" | "slight-left" | "slight-right";
  speedLimitMph: number;
}

export interface BannerData {
  id: string;
  kind:
    | "online"
    | "offline"
    | "deviation"
    | "follow-route"
    | "additional-cost"
    | "route-updated"
    | "trip-paused"
    | "eta-updated"
    | "restricted-roads";
  title: string;
  body: string;
  action?: string;
  etaText?: string;
  dismissible?: boolean;
}

export interface TripDescriptor {
  id: string;
  shipment: string;
  loadName: string;
  counterpart: { name: string; role: string };
  pickup: LngLat & { address: string; city: string };
  destination: LngLat & { address: string; city: string };
  dimensions: string;
  weight: string;
  distanceMi: number;
  etaText: string;
}

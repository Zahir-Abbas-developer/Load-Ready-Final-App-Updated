/**
 * Map provider abstraction.
 *
 * Today the app ships with the `mock` provider — Leaflet + OpenStreetMap tiles
 * + the in-memory TripSim — so the demo works end-to-end with zero API keys.
 *
 * To swap in a real provider later (Google Maps, Mapbox), implement the same
 * interface in a new file (e.g. `googleMapProvider.ts`) and change the default
 * export below. UI components only import from this module, so nothing else
 * has to change.
 */
import type { LngLat } from "@/lib/live-trip/types";

export type MapMode = "demo" | "production";
export type MapProviderName = "mock" | "google" | "mapbox";

export interface RouteResult {
  geometry: [number, number][]; // [lng, lat]
  distanceMi: number;
  etaMinutes: number;
}

export interface MapProvider {
  name: MapProviderName;
  mode: MapMode;
  geocode(address: string): Promise<LngLat | null>;
  reverseGeocode(p: LngLat): Promise<string | null>;
  getRoute(pickup: LngLat, dropoff: LngLat): Promise<RouteResult>;
}

const MOCK_ROUTE_DENSITY = 24;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export const mockMapProvider: MapProvider = {
  name: "mock",
  mode: "demo",
  async geocode() {
    return null;
  },
  async reverseGeocode() {
    return null;
  },
  async getRoute(pickup, dropoff) {
    const geometry: [number, number][] = [];
    for (let i = 0; i <= MOCK_ROUTE_DENSITY; i++) {
      const t = i / MOCK_ROUTE_DENSITY;
      // simple curved interpolation so the line doesn't look like a ruler
      const wobble = Math.sin(t * Math.PI) * 0.08;
      geometry.push([
        lerp(pickup.lng, dropoff.lng, t) + wobble * (dropoff.lat - pickup.lat),
        lerp(pickup.lat, dropoff.lat, t) - wobble * (dropoff.lng - pickup.lng),
      ]);
    }
    const dx = (dropoff.lng - pickup.lng) * 54.6;
    const dy = (dropoff.lat - pickup.lat) * 69;
    const distanceMi = Math.round(Math.sqrt(dx * dx + dy * dy) * 1.15);
    return { geometry, distanceMi, etaMinutes: Math.round(distanceMi * 1.05) };
  },
};

export const mapProvider: MapProvider = mockMapProvider;

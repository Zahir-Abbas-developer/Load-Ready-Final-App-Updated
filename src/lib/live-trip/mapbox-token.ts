/**
 * Legacy Mapbox token store. The live map now uses Leaflet + OpenStreetMap and
 * needs no API key. We keep this module for backward compatibility — callers
 * that ask `getMapboxToken()` get a sentinel value so token gates always pass.
 *
 * To upgrade to real Mapbox tiles later, set VITE_MAPBOX_TOKEN and switch the
 * map provider in `src/services/maps/mapProvider.ts`.
 */
const KEY = "bwm.mapbox.token";
const DEMO_SENTINEL = "demo";

export function getMapboxToken(): string {
  const env = (import.meta as any).env?.VITE_MAPBOX_TOKEN as string | undefined;
  if (env && env.startsWith("pk.")) return env;
  if (typeof window !== "undefined") {
    const ls = window.localStorage.getItem(KEY);
    if (ls && ls.startsWith("pk.")) return ls;
  }
  return DEMO_SENTINEL;
}

export function hasRealMapboxToken(): boolean {
  const t = getMapboxToken();
  return t !== DEMO_SENTINEL;
}

export function setMapboxToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, token.trim());
}

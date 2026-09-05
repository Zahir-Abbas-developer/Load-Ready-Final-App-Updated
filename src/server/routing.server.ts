/**
 * Working out how far a load is going.
 *
 * Two providers behind one port, the same arrangement as the backend and the
 * billing:
 *
 * | provider | what it gives | needs |
 * | -------- | ------------- | ----- |
 * | `mapbox` | a real driving distance | a token (F-47) |
 * | `osm` | a straight line between the two cities | nothing |
 *
 * The default is `osm`, because it works today and costs nothing. What it
 * gives back is honestly labelled a straight line, and the screen refuses to
 * fill the field with it — see `canFillAutomatically`.
 *
 * **Only the city and the state are ever sent.** The street address is on the
 * same form and is deliberately left out: it is the thing the whole product
 * hides until somebody is hired (ADR-8), and there is no version of "we told a
 * geocoder where the load is loading" that a dispatcher would agree to if it
 * were spelled out. City and state are enough to measure a route between.
 *
 * Never import this from client code.
 */
import {
  roundMiles,
  straightLineMiles,
  type DistanceEstimate,
  type Point,
} from "@/lib/marketplace/distance";

export interface Place {
  city: string;
  region: string;
}

const clean = (place: Place) => `${place.city.trim()}, ${place.region.trim()}`;

/**
 * Nominatim asks callers to identify themselves and to stay under a request a
 * second. Both are conditions of it being free, and ignoring them is how a
 * project gets the whole service blocked for everybody.
 */
const OSM_AGENT = "LoadReady/1.0 (pilot-car marketplace; support@loadready.ai)";

const mapboxToken = () =>
  process.env.LOADREADY_MAPBOX_TOKEN?.trim() || process.env.VITE_MAPBOX_TOKEN?.trim() || "";

export const routingProvider = (): "mapbox" | "osm" => (mapboxToken() ? "mapbox" : "osm");

// ── geocoding ──────────────────────────────────────────────────────────────

async function geocodeOsm(place: Place): Promise<Point | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", clean(place));
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  // The two countries this product operates in. Anything else is a typo.
  url.searchParams.set("countrycodes", "us,ca");

  try {
    const res = await fetch(url, {
      headers: { "user-agent": OSM_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;

    const found = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(found) || found.length === 0) return null;

    const lat = Number(found[0].lat);
    const lng = Number(found[0].lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

async function geocodeMapbox(place: Place, token: string): Promise<Point | null> {
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(clean(place))}.json`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "us,ca");
  url.searchParams.set("types", "place");
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: Array<{ center: [number, number] }> };
    const centre = data.features?.[0]?.center;
    return centre ? { lng: centre[0], lat: centre[1] } : null;
  } catch {
    return null;
  }
}

// ── the answer ─────────────────────────────────────────────────────────────

export type RouteResult = { ok: true; estimate: DistanceEstimate } | { ok: false; reason: string };

/**
 * Driving distance from Mapbox, when there is a token.
 *
 * `driving` rather than `driving-traffic`: this is a permitted oversize move
 * planned days ahead, and a distance that changes with this afternoon's
 * traffic is a distance that will not match tomorrow's.
 */
async function drivingMiles(from: Point, to: Point, token: string): Promise<number | null> {
  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("overview", "false");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { routes?: Array<{ distance: number }> };
    const metres = data.routes?.[0]?.distance;
    return typeof metres === "number" ? metres / 1609.344 : null;
  } catch {
    return null;
  }
}

/**
 * How far it is between two towns.
 *
 * Never throws and never guesses: a place it cannot find comes back as a
 * refusal naming which end failed, because "could not work it out" leaves a
 * dispatcher retyping a city that was correct.
 */
export async function estimateDistance(from: Place, to: Place): Promise<RouteResult> {
  if (!from.city.trim() || !from.region.trim()) {
    return { ok: false, reason: "Fill in the city and state it is collected from." };
  }
  if (!to.city.trim() || !to.region.trim()) {
    return { ok: false, reason: "Fill in the city and state it is going to." };
  }

  const token = mapboxToken();

  if (token) {
    const [a, b] = await Promise.all([geocodeMapbox(from, token), geocodeMapbox(to, token)]);
    if (a && b) {
      const miles = await drivingMiles(a, b, token);
      if (miles !== null) {
        return {
          ok: true,
          estimate: { miles: roundMiles(miles), kind: "driving", provider: "Mapbox" },
        };
      }
      // Geocoding worked and routing did not: still better than nothing, and
      // it is labelled for what it is.
      return {
        ok: true,
        estimate: {
          miles: roundMiles(straightLineMiles(a, b)),
          kind: "straight-line",
          provider: "Mapbox",
        },
      };
    }
    // Fall through to the free geocoder rather than fail on a bad token.
  }

  const [a, b] = await Promise.all([geocodeOsm(from), geocodeOsm(to)]);
  if (!a) return { ok: false, reason: `Could not find ${clean(from)}.` };
  if (!b) return { ok: false, reason: `Could not find ${clean(to)}.` };

  return {
    ok: true,
    estimate: {
      miles: roundMiles(straightLineMiles(a, b)),
      kind: "straight-line",
      provider: "OpenStreetMap",
    },
  };
}

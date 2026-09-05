import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GpsPing, LngLat } from "@/lib/live-trip/types";

export type MapStyle = "default" | "satellite" | "hybrid";

/**
 * Free, keyless tile sources. Leaflet + OpenStreetMap means the map renders
 * out of the box in demo mode — no Mapbox/Google API key required.
 */
const TILES: Record<MapStyle, { url: string; attribution: string; subdomains?: string }> = {
  default: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    subdomains: "abc",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri",
  },
  hybrid: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri",
  },
};

interface MapViewProps {
  pickup: LngLat;
  destination: LngLat;
  plannedRoute: [number, number][]; // [lng,lat]
  traveledRoute: [number, number][]; // [lng,lat]
  vehicle: GpsPing | null;
  follow: boolean;
  navMode: boolean;
  style?: MapStyle;
  showTraffic?: boolean;
  onUserPan?: () => void;
}

const toLatLng = (c: [number, number]): [number, number] => [c[1], c[0]];

function pinIcon(color: string, label: string) {
  const html = `
    <div style="position:relative;width:32px;height:42px;transform:translate(-50%,-100%)">
      <svg viewBox="0 0 32 42" width="32" height="42" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
        <path d="M16 0C7.2 0 0 7 0 15.6 0 27 16 42 16 42s16-15 16-26.4C32 7 24.8 0 16 0z" fill="${color}"/>
        <circle cx="16" cy="15" r="6" fill="#fff"/>
      </svg>
      <div style="position:absolute;top:9px;left:0;right:0;text-align:center;font:700 10px system-ui;color:${color}">${label}</div>
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [32, 42], iconAnchor: [16, 42] });
}

function vehicleIcon(heading: number) {
  const html = `
    <div style="width:44px;height:44px;transform:translate(-50%,-50%)">
      <div style="position:absolute;inset:0;border-radius:9999px;background:rgba(15,23,42,.18);filter:blur(4px)"></div>
      <div style="position:absolute;inset:2px;transform:rotate(${heading}deg);transition:transform .4s linear">
        <svg viewBox="0 0 40 40" width="40" height="40">
          <circle cx="20" cy="20" r="18" fill="#0F172A"/>
          <circle cx="20" cy="20" r="14" fill="#C9A227"/>
          <path d="M20 7 L28 22 L20 18 L12 22 Z" fill="#0F172A"/>
        </svg>
      </div>
    </div>`;
  return L.divIcon({ html, className: "", iconSize: [44, 44], iconAnchor: [22, 22] });
}

export function MapView({
  pickup,
  destination,
  plannedRoute,
  traveledRoute,
  vehicle,
  follow,
  navMode,
  style = "default",
  onUserPan,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const plannedRef = useRef<L.Polyline | null>(null);
  const traveledRef = useRef<L.Polyline | null>(null);
  const vehicleRef = useRef<L.Marker | null>(null);
  const animRef = useRef<{ raf: number | null; from: [number, number]; to: [number, number]; t0: number; dur: number; fromHeading: number; toHeading: number }>({
    raf: null, from: [pickup.lat, pickup.lng], to: [pickup.lat, pickup.lng], t0: 0, dur: 0, fromHeading: 0, toHeading: 0,
  });
  const [ready, setReady] = useState(false);

  const plannedLatLngs = useMemo(() => plannedRoute.map(toLatLng), [plannedRoute]);
  const traveledLatLngs = useMemo(() => traveledRoute.map(toLatLng), [traveledRoute]);

  // Init once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const tile = TILES[style];
    const map = L.map(containerRef.current, {
      center: [pickup.lat, pickup.lng],
      zoom: 7,
      zoomControl: false,
      attributionControl: false,
    });
    mapRef.current = map;
    tileRef.current = L.tileLayer(tile.url, { attribution: tile.attribution, subdomains: tile.subdomains as any, maxZoom: 19 }).addTo(map);
    L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

    // Pickup + destination
    L.marker([pickup.lat, pickup.lng], { icon: pinIcon("#16A34A", "P") }).addTo(map);
    L.marker([destination.lat, destination.lng], { icon: pinIcon("#EF4444", "D") }).addTo(map);

    // Geofence circles (200m)
    L.circle([pickup.lat, pickup.lng], { radius: 200, color: "#16A34A", weight: 1.5, dashArray: "4,4", fillOpacity: 0.08 }).addTo(map);
    L.circle([destination.lat, destination.lng], { radius: 200, color: "#EF4444", weight: 1.5, dashArray: "4,4", fillOpacity: 0.08 }).addTo(map);

    // Planned route (remaining) — gold
    plannedRef.current = L.polyline(plannedLatLngs, {
      color: "#C9A227", weight: 6, opacity: 0.95, lineCap: "round", lineJoin: "round",
    }).addTo(map);
    // Traveled — slate
    traveledRef.current = L.polyline(traveledLatLngs, {
      color: "#475569", weight: 6, opacity: 0.85, lineCap: "round", lineJoin: "round",
    }).addTo(map);

    // Vehicle marker
    vehicleRef.current = L.marker([pickup.lat, pickup.lng], { icon: vehicleIcon(0), zIndexOffset: 1000 }).addTo(map);

    // Fit to whole route
    if (plannedLatLngs.length > 1) {
      map.fitBounds(L.latLngBounds(plannedLatLngs as any), { padding: [60, 60] });
    }

    map.on("dragstart", () => onUserPan?.());
    map.on("zoomstart", (e: any) => { if (e.originalEvent) onUserPan?.(); });

    setReady(true);
    return () => {
      if (animRef.current.raf) cancelAnimationFrame(animRef.current.raf);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tile style swap
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    const tile = TILES[style];
    tileRef.current = L.tileLayer(tile.url, { attribution: tile.attribution, subdomains: tile.subdomains as any, maxZoom: 19 }).addTo(map);
  }, [style, ready]);

  // Update polylines
  useEffect(() => { plannedRef.current?.setLatLngs(plannedLatLngs as any); }, [plannedLatLngs]);
  useEffect(() => { traveledRef.current?.setLatLngs(traveledLatLngs as any); }, [traveledLatLngs]);

  // Apply / clear nav-mode rotation on the map pane (heading-up camera).
  // Leaflet has no native bearing, so we rotate the mapPane via CSS and
  // counter-rotate the vehicle marker so the chevron stays pointing up.
  const applyBearing = (bearing: number) => {
    const map = mapRef.current;
    if (!map) return;
    const pane = map.getPanes().mapPane as HTMLElement | undefined;
    if (!pane) return;
    if (navMode) {
      pane.style.transition = "transform 600ms cubic-bezier(.22,.61,.36,1)";
      pane.style.transformOrigin = "50% 65%"; // pivot near the vehicle anchor
      pane.style.transform = `rotate(${-bearing}deg)`;
    } else {
      pane.style.transition = "transform 300ms ease-out";
      pane.style.transform = "";
    }
  };

  // Camera offset so the vehicle sits in the lower third of the screen
  // (Uber-style "road ahead" framing) when nav mode is on.
  const navPanTo = (lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (!navMode) {
      map.panTo([lat, lng], { animate: true, duration: 0.5 });
      return;
    }
    map.panTo([lat, lng], { animate: true, duration: 0.5 });
    // Push the centerpoint so vehicle appears ~30% up from the bottom.
    const size = map.getSize();
    map.panBy([0, -size.y * 0.18], { animate: true, duration: 0.5 });
  };

  // Animate vehicle ping → ping
  useEffect(() => {
    if (!vehicleRef.current || !vehicle || !mapRef.current) return;
    const st = animRef.current;
    if (st.raf) cancelAnimationFrame(st.raf);
    st.from = st.to;
    st.to = [vehicle.lat, vehicle.lng];
    st.fromHeading = st.toHeading;
    let delta = vehicle.heading - st.fromHeading;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    st.toHeading = st.fromHeading + delta;
    st.t0 = performance.now();
    st.dur = 900;

    const step = (now: number) => {
      const t = Math.min(1, (now - st.t0) / st.dur);
      const lat = st.from[0] + (st.to[0] - st.from[0]) * t;
      const lng = st.from[1] + (st.to[1] - st.from[1]) * t;
      const heading = st.fromHeading + (st.toHeading - st.fromHeading) * t;
      vehicleRef.current!.setLatLng([lat, lng]);
      // In nav mode the whole map pane is rotated by -heading, so the
      // vehicle's icon needs to be redrawn at heading 0 (up) to stay
      // visually pointing forward; otherwise rotate normally.
      vehicleRef.current!.setIcon(vehicleIcon(navMode ? 0 : heading));
      applyBearing(heading);
      if (follow && mapRef.current) navPanTo(lat, lng);
      if (t < 1) st.raf = requestAnimationFrame(step);
      else st.raf = null;
    };
    st.raf = requestAnimationFrame(step);
  }, [vehicle, follow, navMode]);

  // Recenter on follow / navMode toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    // Disable user gesture rotation conflicts when nav mode is on.
    if (navMode) {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoom.disable();
    } else {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoom.enable();
      // Clear any pane rotation when leaving nav mode.
      applyBearing(0);
      vehicleRef.current?.setIcon(vehicleIcon(animRef.current.toHeading));
    }
    if (vehicle && follow) {
      map.setZoom(navMode ? 16 : 12, { animate: true });
      navPanTo(vehicle.lat, vehicle.lng);
    }
  }, [follow, navMode, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="absolute inset-0 z-0 overflow-hidden" />;
}


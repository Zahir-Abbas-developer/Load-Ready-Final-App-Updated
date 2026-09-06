import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TrackedPosition } from "@/lib/tracking/api";

/**
 * Where the escort actually is, and where it has been.
 *
 * OpenStreetMap through Leaflet, which needs no key and no account. What is
 * drawn is only what is true: the positions the pilot's device reported, joined
 * in the order they arrived.
 *
 * There is deliberately **no planned route and no pickup or destination pin**.
 * Loads carry addresses but no coordinates — no geocoder is configured
 * (BACKLOG F-47) — and the previous version of this screen filled that gap
 * with a hard-coded Dallas-to-Houston line and two invented pins. A dispatcher
 * cannot tell a drawn guess from a measured position, which makes the guess
 * worse than the blank space.
 */

const AMBER = "#C9A227";
const INK = "#0F172A";

function vehicleIcon(heading: number | null) {
  const rotation = heading === null ? 0 : heading;
  const arrow =
    heading === null
      ? `<circle cx="20" cy="20" r="5" fill="${INK}"/>`
      : `<path d="M20 7 L28 22 L20 18 L12 22 Z" fill="${INK}"/>`;
  return L.divIcon({
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html: `<div style="width:40px;height:40px;transform:rotate(${rotation}deg);transition:transform .4s linear">
      <svg viewBox="0 0 40 40" width="40" height="40">
        <circle cx="20" cy="20" r="18" fill="${INK}" opacity="0.15"/>
        <circle cx="20" cy="20" r="13" fill="${AMBER}"/>
        ${arrow}
      </svg>
    </div>`,
  });
}

export function TrailMap({
  trail,
  last,
  stale,
  className,
}: {
  trail: TrackedPosition[];
  last: TrackedPosition | null;
  /** Draws the marker faded, so a marker that has stopped moving reads as one. */
  stale: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const followRef = useRef(true);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [39.5, -98.35],
      zoom: 4,
      zoomControl: false,
      attributionControl: false,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      subdomains: "abc",
      maxZoom: 19,
    }).addTo(map);
    L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

    // A dispatcher who pans away to look at something is not asking to be
    // dragged back every thirty seconds.
    map.on("dragstart", () => {
      followRef.current = false;
    });

    return () => {
      map.remove();
      mapRef.current = null;
      lineRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const points = trail.map((p) => [p.lat, p.lng] as [number, number]);

    if (points.length > 1) {
      if (lineRef.current) lineRef.current.setLatLngs(points);
      else
        lineRef.current = L.polyline(points, { color: AMBER, weight: 4, opacity: 0.9 }).addTo(map);
    }

    if (last) {
      const at: [number, number] = [last.lat, last.lng];
      if (markerRef.current) {
        markerRef.current.setLatLng(at);
        markerRef.current.setIcon(vehicleIcon(last.heading));
        markerRef.current.setOpacity(stale ? 0.45 : 1);
      } else {
        markerRef.current = L.marker(at, {
          icon: vehicleIcon(last.heading),
          opacity: stale ? 0.45 : 1,
        }).addTo(map);
        map.setView(at, 12);
      }
      if (followRef.current) map.panTo(at, { animate: true });
    }
  }, [trail, last, stale]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-full w-full"}
      role="img"
      aria-label={
        last
          ? "Map showing the escort's last reported position"
          : "Map with no reported position yet"
      }
    />
  );
}

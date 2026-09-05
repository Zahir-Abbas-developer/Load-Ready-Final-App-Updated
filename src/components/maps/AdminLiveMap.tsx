import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface AdminJobMarker {
  id: string;
  title: string;
  status: string;
  pickup: { lat: number; lng: number; label: string };
  dropoff: { lat: number; lng: number; label: string };
  current: { lat: number; lng: number };
}

const STATUS_COLOR: Record<string, string> = {
  active: "#16A34A",
  delayed: "#F59E0B",
  issue: "#EF4444",
  completed: "#6B7280",
  pending: "#3B82F6",
};

/**
 * AdminLiveMap — read-only overview of every active job for the admin
 * monitoring view. Renders one vehicle pin per job with a small popup.
 */
export function AdminLiveMap({ jobs, height = 380 }: { jobs: AdminJobMarker[]; height?: number | string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, { zoomControl: false, attributionControl: false }).setView([39.5, -98.35], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      subdomains: "abc", attribution: "© OpenStreetMap contributors", maxZoom: 18,
    }).addTo(map);
    L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    if (jobs.length === 0) return;

    jobs.forEach((j) => {
      const color = STATUS_COLOR[j.status] ?? STATUS_COLOR.active;
      const html = `
        <div style="position:relative;width:36px;height:36px;transform:translate(-50%,-50%)">
          <div style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:.25;animation:bwm-pulse 1.6s ease-out infinite"></div>
          <div style="position:absolute;inset:8px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>
        </div>
        <style>@keyframes bwm-pulse{0%{transform:scale(.6);opacity:.6}100%{transform:scale(1.6);opacity:0}}</style>`;
      const icon = L.divIcon({ html, className: "", iconSize: [36, 36], iconAnchor: [18, 18] });
      L.marker([j.current.lat, j.current.lng], { icon })
        .bindPopup(`<div style="font:600 12px system-ui">${j.title}</div>
          <div style="font:11px system-ui;color:#475569">${j.pickup.label} → ${j.dropoff.label}</div>
          <div style="font:600 11px system-ui;color:${color};margin-top:4px;text-transform:capitalize">${j.status}</div>`)
        .addTo(layer);
    });

    const bounds = L.latLngBounds(jobs.map((j) => [j.current.lat, j.current.lng]) as any);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 7 });
  }, [jobs]);

  return <div ref={ref} style={{ height, width: "100%", borderRadius: 12, overflow: "hidden", background: "#E5E7EB" }} />;
}

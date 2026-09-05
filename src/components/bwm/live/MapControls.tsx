import { useState } from "react";
import { Layers, Navigation, AlertTriangle, Plus, Minus, X } from "lucide-react";
import type { MapStyle } from "./MapView";

export function MapControls({
  follow,
  navMode,
  onRecenter,
  onZoom,
  style,
  setStyle,
  showTraffic,
  setShowTraffic,
  onReport,
}: {
  follow: boolean;
  navMode: boolean;
  onRecenter: () => void;
  onZoom: (delta: number) => void;
  style: MapStyle;
  setStyle: (s: MapStyle) => void;
  showTraffic: boolean;
  setShowTraffic: (b: boolean) => void;
  onReport: (kind: string) => void;
}) {
  const [layers, setLayers] = useState(false);
  const [report, setReport] = useState(false);

  return (
    <>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-20">
        <CtrlBtn onClick={() => setLayers(true)} aria-label="Layers"><Layers className="h-5 w-5" /></CtrlBtn>
        <CtrlBtn onClick={onRecenter} aria-label="Recenter" active={follow}>
          <Navigation className={`h-5 w-5 ${follow ? "text-primary" : ""}`} />
        </CtrlBtn>
        <CtrlBtn onClick={() => onZoom(1)} aria-label="Zoom in"><Plus className="h-5 w-5" /></CtrlBtn>
        <CtrlBtn onClick={() => onZoom(-1)} aria-label="Zoom out"><Minus className="h-5 w-5" /></CtrlBtn>
        <CtrlBtn onClick={() => setReport(true)} aria-label="Report" warn>
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </CtrlBtn>
      </div>

      {layers && (
        <Sheet onClose={() => setLayers(false)} title="Map layers">
          <div className="space-y-2">
            {(["default", "satellite", "hybrid"] as MapStyle[]).map((s) => (
              <button
                key={s}
                onClick={() => { setStyle(s); setLayers(false); }}
                className={`w-full text-left px-4 py-3 rounded-xl border ${style === s ? "border-primary bg-accent" : "border-border bg-surface"}`}
              >
                <div className="font-semibold capitalize">{s}</div>
                <div className="text-xs text-muted-foreground">
                  {s === "default" ? "Clean street map" : s === "satellite" ? "Satellite imagery" : "Satellite + labels"}
                </div>
              </button>
            ))}
            <ToggleRow label="Live traffic" value={showTraffic} onChange={setShowTraffic} />
          </div>
        </Sheet>
      )}

      {report && (
        <Sheet onClose={() => setReport(false)} title="Report incident">
          <div className="grid grid-cols-2 gap-2">
            {["Accident", "Heavy traffic", "Construction", "Road hazard", "Weather issue", "Police/checkpoint"].map((k) => (
              <button
                key={k}
                onClick={() => { onReport(k); setReport(false); }}
                className="px-3 py-4 rounded-xl border border-border bg-surface text-sm font-medium text-left"
              >
                {k}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

function CtrlBtn({ children, onClick, active, warn, ...rest }: any) {
  return (
    <button
      onClick={onClick}
      {...rest}
      className={`h-11 w-11 rounded-full bg-white shadow-md flex items-center justify-center border ${
        active ? "border-primary" : warn ? "border-destructive/30" : "border-black/5"
      } active:scale-95 transition`}
    >
      {children}
    </button>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-surface">
      <span className="text-sm font-medium">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`h-6 w-11 rounded-full ${value ? "bg-primary" : "bg-border"} relative transition`}
      >
        <span className={`absolute top-0.5 ${value ? "right-0.5" : "left-0.5"} h-5 w-5 rounded-full bg-white shadow`} />
      </button>
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-0 right-0 bottom-0 bg-background rounded-t-3xl p-5 max-h-[70%] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-surface flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

import type { BannerData } from "@/lib/live-trip/types";
import {
  Wifi, WifiOff, AlertTriangle, Info, DollarSign, RouteOff, Pause, Clock, ShieldAlert, X,
} from "lucide-react";

const STYLES: Record<BannerData["kind"], { bg: string; icon: React.ComponentType<{ className?: string }>; iconColor: string }> = {
  online: { bg: "bg-green-50 border-green-200", icon: Wifi, iconColor: "text-green-600" },
  offline: { bg: "bg-rose-50 border-rose-200", icon: WifiOff, iconColor: "text-rose-600" },
  deviation: { bg: "bg-rose-50 border-rose-200", icon: AlertTriangle, iconColor: "text-rose-600" },
  "follow-route": { bg: "bg-white border-border", icon: Info, iconColor: "text-primary" },
  "additional-cost": { bg: "bg-white border-border", icon: DollarSign, iconColor: "text-primary" },
  "route-updated": { bg: "bg-white border-border", icon: RouteOff, iconColor: "text-primary" },
  "trip-paused": { bg: "bg-rose-50 border-rose-200", icon: Pause, iconColor: "text-rose-600" },
  "eta-updated": { bg: "bg-white border-border", icon: Clock, iconColor: "text-primary" },
  "restricted-roads": { bg: "bg-white border-border", icon: ShieldAlert, iconColor: "text-primary" },
};

export function BannerStack({
  banners,
  onDismiss,
  onAction,
}: {
  banners: BannerData[];
  onDismiss: (id: string) => void;
  onAction?: (b: BannerData) => void;
}) {
  return (
    <div className="absolute left-3 right-3 z-30 space-y-2 pointer-events-none" style={{ top: 110 }}>
      {banners.map((b) => {
        const s = STYLES[b.kind];
        const Icon = s.icon;
        return (
          <div
            key={b.id}
            className={`pointer-events-auto rounded-2xl border ${s.bg} shadow-md p-3 flex gap-3 animate-in slide-in-from-top-2 fade-in duration-300`}
          >
            <div className={`h-9 w-9 rounded-xl bg-white flex items-center justify-center shrink-0 ${s.iconColor}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm leading-tight">{b.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{b.body}</div>
              {b.etaText && <div className="text-xs font-semibold mt-1">ETA: {b.etaText}</div>}
              {b.action && (
                <button
                  onClick={() => { onAction?.(b); onDismiss(b.id); }}
                  className="text-xs font-bold text-primary mt-1.5"
                >
                  {b.action} →
                </button>
              )}
            </div>
            {b.dismissible !== false && (
              <button onClick={() => onDismiss(b.id)} className="h-6 w-6 -m-1 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

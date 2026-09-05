import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Global offline pill. Only shows when we've actually confirmed loss of
 * connectivity (navigator.onLine alone is unreliable inside preview iframes,
 * so we double-check with a tiny network probe before alarming the user).
 */
export function OfflineIndicator() {
  const [confirmedOffline, setConfirmedOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let probeTimer: ReturnType<typeof setTimeout> | null = null;

    const probe = async () => {
      try {
        // Tiny no-cors HEAD-style ping. If it resolves, we have a network.
        await fetch(`${window.location.origin}/favicon.ico?ts=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
          mode: "no-cors",
        });
        if (!cancelled) setConfirmedOffline(false);
      } catch {
        if (!cancelled) setConfirmedOffline(true);
      }
    };

    const handleOffline = () => {
      // Don't trust the event blindly — verify with a probe.
      if (probeTimer) clearTimeout(probeTimer);
      probeTimer = setTimeout(probe, 600);
    };
    const handleOnline = () => {
      if (probeTimer) clearTimeout(probeTimer);
      setConfirmedOffline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check only if browser claims offline
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      handleOffline();
    }

    return () => {
      cancelled = true;
      if (probeTimer) clearTimeout(probeTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!confirmedOffline) return null;
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] pointer-events-none animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-foreground/90 text-xs font-medium shadow-md border border-border">
        <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
        Reconnecting… your work is saved and will sync automatically
      </div>
    </div>
  );
}

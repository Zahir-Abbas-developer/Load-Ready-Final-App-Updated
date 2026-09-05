import { useEffect, useState } from "react";
import { getMapboxToken, setMapboxToken } from "@/lib/live-trip/mapbox-token";
import { MapPin } from "lucide-react";

export function TokenPrompt({ onReady }: { onReady: () => void }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (getMapboxToken()) onReady();
  }, [onReady]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 bg-background">
      <div className="h-14 w-14 rounded-2xl bg-accent flex items-center justify-center mb-4">
        <MapPin className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-lg font-bold mb-1">Connect Mapbox</h2>
      <p className="text-sm text-muted-foreground text-center mb-5 max-w-xs">
        Paste your Mapbox public token to enable live navigation. It's stored only in this browser.
      </p>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="pk.eyJ1Ijoi…"
        className="w-full max-w-sm h-11 rounded-xl border border-border px-3 text-sm font-mono"
      />
      {err && <p className="text-xs text-destructive mt-2">{err}</p>}
      <button
        onClick={() => {
          if (!val.trim().startsWith("pk.")) {
            setErr("Token must start with pk.");
            return;
          }
          setMapboxToken(val.trim());
          onReady();
        }}
        className="mt-4 h-11 px-6 rounded-full bg-primary text-primary-foreground font-semibold"
      >
        Continue
      </button>
      <a
        href="https://account.mapbox.com/access-tokens/"
        target="_blank"
        rel="noreferrer"
        className="mt-3 text-xs text-muted-foreground underline"
      >
        Where do I find my token?
      </a>
    </div>
  );
}

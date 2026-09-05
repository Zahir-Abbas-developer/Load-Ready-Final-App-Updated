import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Pause, Play, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { addCall, updateCall } from "@/lib/live-trip/comms-log";

type CallState = "ringing" | "connected" | "ended" | "failed";

interface Props {
  open: boolean;
  onClose: () => void;
  counterpartName: string;
  counterpartRole: "Pilot" | "Dispatcher";
  counterpartPhone?: string;
  tripId: string;
  onSwitchToSms?: () => void;
}

/**
 * Full-screen voice call UI. Posts to /api/calls (Twilio gateway) in the
 * background so a real call dials when Twilio is connected; otherwise the
 * stub response is silently accepted and the demo keeps running so testers
 * can walk the entire ringing → connected → ended flow.
 */
export function CallScreen({
  open, onClose, counterpartName, counterpartRole, counterpartPhone, tripId, onSwitchToSms,
}: Props) {
  const [state, setState] = useState<CallState>("ringing");
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [held, setHeld] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const dialedRef = useRef(false);

  const callIdRef = useRef<string | null>(null);

  // Reset every time the screen opens
  useEffect(() => {
    if (!open) return;
    setState("ringing");
    setMuted(false);
    setSpeaker(false);
    setHeld(false);
    setSeconds(0);
    dialedRef.current = false;
    callIdRef.current = null;
  }, [open]);

  // Fire the Twilio dial once on open. Stub responses are treated as success.
  useEffect(() => {
    if (!open || dialedRef.current) return;
    dialedRef.current = true;
    if (!counterpartPhone) return;
    const entry = addCall({
      tripId, to: counterpartPhone, from: "BWM",
      direction: "outbound", status: "ringing",
    });
    callIdRef.current = entry.id;
    fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: counterpartPhone, tripId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.stub && callIdRef.current) updateCall(callIdRef.current, { stub: true });
        if (d?.stub) toast.info("Demo call — connect Twilio to ring real numbers.");
      })
      .catch(() => {
        if (callIdRef.current) updateCall(callIdRef.current, { status: "failed", endedAt: Date.now() });
      });
  }, [open, counterpartPhone, tripId]);

  // Ring → connected after ~3s
  useEffect(() => {
    if (!open || state !== "ringing") return;
    const t = setTimeout(() => {
      setState("connected");
      if (callIdRef.current) updateCall(callIdRef.current, { status: "connected" });
    }, 3000);
    return () => clearTimeout(t);
  }, [open, state]);

  // Duration timer
  useEffect(() => {
    if (state !== "connected" || held) return;
    const i = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [state, held]);

  // Auto-close shortly after end so the trip view comes back
  useEffect(() => {
    if (state !== "ended" && state !== "failed") return;
    if (callIdRef.current) {
      updateCall(callIdRef.current, {
        status: state, endedAt: Date.now(), durationSec: seconds,
      });
      callIdRef.current = null;
    }
    const t = setTimeout(onClose, 1500);
    return () => clearTimeout(t);
  }, [state, onClose, seconds]);

  if (!open) return null;

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const status =
    state === "ringing" ? "Ringing…" :
    state === "connected" ? (held ? `On hold · ${mmss}` : mmss) :
    state === "ended" ? "Call ended" : "Call failed";

  return (
    <div className="absolute inset-0 z-[80] bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col animate-in fade-in duration-200">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-xs uppercase tracking-widest text-white/50 mb-2">{counterpartRole} · Trip {tripId}</div>
        <div className="relative mb-6">
          <div className={`absolute inset-0 rounded-full ${state === "ringing" ? "animate-ping bg-primary/40" : ""}`} />
          <div className="relative h-32 w-32 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-5xl font-bold shadow-2xl">
            {counterpartName.charAt(0)}
          </div>
        </div>
        <div className="text-2xl font-bold">{counterpartName}</div>
        {counterpartPhone && <div className="text-sm text-white/60 mt-1">{counterpartPhone}</div>}
        <div className="mt-3 text-sm font-medium text-white/80">{status}</div>
      </div>

      <div className="px-6 pb-10 pt-4 bg-black/20 backdrop-blur">
        {state === "connected" && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Pad icon={muted ? MicOff : Mic} label={muted ? "Muted" : "Mute"} active={muted} onClick={() => setMuted(!muted)} />
            <Pad icon={speaker ? Volume2 : VolumeX} label={speaker ? "Speaker" : "Earpiece"} active={speaker} onClick={() => setSpeaker(!speaker)} />
            <Pad icon={held ? Play : Pause} label={held ? "Resume" : "Hold"} active={held} onClick={() => setHeld(!held)} />
            <Pad icon={MessageSquare} label="Message" onClick={() => { onSwitchToSms?.(); onClose(); }} />
            <div />
            <div />
          </div>
        )}
        <div className="flex justify-center">
          {state === "ended" || state === "failed" ? (
            <button onClick={onClose} className="h-16 w-16 rounded-full bg-white/20 flex items-center justify-center">
              <Phone className="h-6 w-6" />
            </button>
          ) : (
            <button
              onClick={() => setState("ended")}
              className="h-16 w-16 rounded-full bg-destructive text-white flex items-center justify-center shadow-2xl active:scale-95 transition-transform"
              aria-label="End call"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Pad({ icon: Icon, label, active, onClick }: { icon: any; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 group">
      <div className={`h-14 w-14 rounded-full flex items-center justify-center transition-colors ${active ? "bg-white text-slate-900" : "bg-white/15 text-white group-hover:bg-white/25"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-[11px] text-white/80">{label}</div>
    </button>
  );
}

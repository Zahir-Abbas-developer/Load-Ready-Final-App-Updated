import { useEffect, useState } from "react";
import { X, Phone, MessageSquare, CheckCircle2, AlertCircle, Clock, PhoneMissed } from "lucide-react";
import { listComms, subscribeComms, type CommsEntry } from "@/lib/live-trip/comms-log";

interface Props {
  open: boolean;
  onClose: () => void;
  tripId: string;
}

export function CommsHistory({ open, onClose, tripId }: Props) {
  const [items, setItems] = useState<CommsEntry[]>(() => listComms(tripId));

  useEffect(() => {
    if (!open) return;
    setItems(listComms(tripId));
    const unsub = subscribeComms(() => setItems(listComms(tripId)));
    return () => { unsub(); };
  }, [open, tripId]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[70] bg-black/40 flex items-end animate-in fade-in duration-150" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-background rounded-t-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Clock className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">Communications log</div>
            <div className="text-xs text-muted-foreground">Trip {tripId} · {items.length} entr{items.length === 1 ? "y" : "ies"}</div>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-surface flex items-center justify-center" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            items.map((e) => <Row key={e.id} entry={e} />)
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center animate-in fade-in duration-300">
      <div className="h-14 w-14 rounded-full bg-surface flex items-center justify-center mb-3">
        <MessageSquare className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-sm font-semibold">No calls or SMS yet</div>
      <div className="text-xs text-muted-foreground mt-1 max-w-xs">
        Outbound attempts and their delivery status will appear here as they happen.
      </div>
    </div>
  );
}

function Row({ entry }: { entry: CommsEntry }) {
  const isSms = entry.kind === "sms";
  const Icon = isSms ? MessageSquare : entry.status === "missed" ? PhoneMissed : Phone;
  return (
    <div className="rounded-xl border border-border bg-background p-3 flex gap-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
        isSms ? "bg-primary/10 text-primary" : "bg-success/10 text-success"
      }`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold capitalize">{entry.kind === "sms" ? "SMS" : "Call"} · {entry.direction}</span>
          <StatusBadge entry={entry} />
          {entry.stub && <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-semibold">demo</span>}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">
          {entry.direction === "outbound" ? "→" : "←"} {entry.to || entry.from}
        </div>
        {entry.kind === "sms" ? (
          <div className="text-xs mt-1.5 line-clamp-2">{entry.body}</div>
        ) : (
          <div className="text-xs mt-1.5 text-muted-foreground">
            {entry.durationSec != null ? `Duration ${formatDuration(entry.durationSec)}` : "—"}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground mt-1">{relTime(entry.createdAt)}</div>
      </div>
    </div>
  );
}

function StatusBadge({ entry }: { entry: CommsEntry }) {
  const tone =
    entry.status === "delivered" || entry.status === "connected" || entry.status === "ended" || entry.status === "sent"
      ? "bg-success/15 text-success"
      : entry.status === "failed" || entry.status === "missed"
        ? "bg-destructive/15 text-destructive"
        : "bg-warning/15 text-warning";
  const Icon =
    entry.status === "failed" || entry.status === "missed" ? AlertCircle :
    entry.status === "delivered" || entry.status === "connected" || entry.status === "ended" || entry.status === "sent" ? CheckCircle2 :
    Clock;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold capitalize inline-flex items-center gap-1 ${tone}`}>
      <Icon className="h-3 w-3" /> {entry.status}
    </span>
  );
}

function relTime(ms: number) {
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return new Date(ms).toLocaleString();
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

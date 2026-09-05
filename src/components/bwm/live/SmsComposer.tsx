import { useState } from "react";
import { X, Send, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { addSms, updateSms } from "@/lib/live-trip/comms-log";

interface Props {
  open: boolean;
  onClose: () => void;
  counterpartName: string;
  counterpartPhone?: string;
  tripId: string;
  /** Templates surfaced as quick-reply chips so dispatchers/pilots can fire common updates. */
  templates?: string[];
}

const DEFAULT_TEMPLATES = [
  "I'm 5 minutes out from pickup.",
  "Running late due to traffic — ETA updated.",
  "Arrived at pickup, loading now.",
  "Permit issue at scale, please advise.",
  "Delivered safely. Awaiting POD.",
];

const MAX = 320;

export function SmsComposer({ open, onClose, counterpartName, counterpartPhone, tripId, templates = DEFAULT_TEMPLATES }: Props) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const send = async () => {
    if (!body.trim() || sending) return;
    if (!counterpartPhone) { toast.info("No phone number on file."); return; }
    setSending(true);
    const entry = addSms({
      tripId, to: counterpartPhone, from: "BWM", body: body.trim(),
      direction: "outbound", status: "queued",
    });
    try {
      const res = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: counterpartPhone, body: body.trim(), tripId }),
      });
      const data = await res.json();
      if (res.ok) {
        updateSms(entry.id, { status: data.stub ? "sent" : "delivered", stub: !!data.stub });
        toast.success(data.stub ? "Demo SMS queued (Twilio not connected)" : "SMS sent");
        setBody("");
        onClose();
      } else {
        updateSms(entry.id, { status: "failed" });
        toast.error(data.message ?? "SMS failed");
      }
    } catch {
      updateSms(entry.id, { status: "failed" });
      toast.error("SMS failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[70] bg-black/40 flex items-end animate-in fade-in duration-150" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-background rounded-t-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">SMS to {counterpartName}</div>
            <div className="text-xs text-muted-foreground truncate">{counterpartPhone || "No number on file"} · Trip {tripId}</div>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-surface flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-4 pt-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Quick messages</div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {templates.map((t) => (
              <button key={t} onClick={() => setBody(t)} className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-surface border border-border hover:border-primary">
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 pt-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX))}
            placeholder={`Type your SMS to ${counterpartName}…`}
            className="w-full min-h-32 p-3 rounded-xl bg-surface border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
          />
          <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
            <span>{body.length}/{MAX}</span>
            <span>Standard SMS rates apply.</span>
          </div>
          <button
            onClick={send}
            disabled={!body.trim() || sending || !counterpartPhone}
            className="mt-3 h-12 w-full rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[.98] transition-transform"
          >
            <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send SMS"}
          </button>
        </div>
      </div>
    </div>
  );
}

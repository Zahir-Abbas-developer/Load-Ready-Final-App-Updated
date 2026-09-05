import { useEffect, useRef, useState } from "react";
import { X, Send, Phone, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import {
  loadMessages,
  sendMessage,
  subscribeMessages,
  type ChatMessage,
} from "@/lib/live-trip/realtime";
import { CallScreen } from "./CallScreen";
import { SmsComposer } from "./SmsComposer";

interface Props {
  open: boolean;
  onClose: () => void;
  tripId: string;
  myRole: "pilot" | "dispatcher";
  myName: string;
  counterpartName: string;
  counterpartPhone?: string;
}

export function ChatSheet({
  open,
  onClose,
  tripId,
  myRole,
  myName,
  counterpartName,
  counterpartPhone,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let unsub: (() => void) | null = null;
    loadMessages(tripId).then(setMessages).catch(() => {});
    unsub = subscribeMessages(tripId, (m) => {
      setMessages((prev) =>
        prev.find((x) => x.id === m.id) ? prev : [...prev, m],
      );
    });
    return () => {
      unsub?.();
    };
  }, [open, tripId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendMessage(tripId, myRole, myName, text);
      setDraft("");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't send message");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  const counterpartRole: "Pilot" | "Dispatcher" = myRole === "pilot" ? "Dispatcher" : "Pilot";

  return (
    <div className="absolute inset-0 z-[60] bg-black/40 flex items-end animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="w-full bg-background rounded-t-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
            {counterpartName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{counterpartName}</div>
            <div className="text-xs text-muted-foreground">Trip {tripId}</div>
          </div>
          <button
            onClick={() => setSmsOpen(true)}
            className="h-9 w-9 rounded-full bg-surface flex items-center justify-center hover:bg-accent transition-colors"
            aria-label="SMS"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCallOpen(true)}
            className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Call"
          >
            <Phone className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-surface flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[280px]">
          {messages.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-10">
              Start the conversation. Messages sync in real time.
            </div>
          )}
          {messages.map((m) => {
            const mine = m.senderRole === myRole;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                    mine
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-surface rounded-bl-sm"
                  }`}
                >
                  {!mine && (
                    <div className="text-[10px] opacity-60 font-semibold mb-0.5">
                      {m.senderName}
                    </div>
                  )}
                  {m.body}
                  <div
                    className={`text-[10px] mt-0.5 ${mine ? "opacity-70" : "text-muted-foreground"}`}
                  >
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-border flex items-center gap-2 bg-background">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="Type a message…"
            className="flex-1 h-11 rounded-full bg-surface px-4 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            className="h-11 w-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      <SmsComposer
        open={smsOpen}
        onClose={() => setSmsOpen(false)}
        counterpartName={counterpartName}
        counterpartPhone={counterpartPhone}
        tripId={tripId}
      />
      <CallScreen
        open={callOpen}
        onClose={() => setCallOpen(false)}
        counterpartName={counterpartName}
        counterpartRole={counterpartRole}
        counterpartPhone={counterpartPhone}
        tripId={tripId}
        onSwitchToSms={() => setSmsOpen(true)}
      />
    </div>
  );
}

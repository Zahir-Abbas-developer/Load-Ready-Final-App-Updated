import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Flag, Loader2, MessageCircle, Send, X } from "lucide-react";
import { useConversation } from "@/lib/messaging/api";
import { MAX_MESSAGE_LENGTH } from "@/lib/messaging/types";
import { REPORT_REASONS, REPORT_REASON_IDS, type ReportReason } from "@/lib/settings/reports";
import { EmptyState, ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";

/**
 * Talking to the other side of a job.
 *
 * Scoped to the assignment, which names exactly two people — the fix for a
 * channel that used to be readable by any signed-in account that guessed an
 * id (F-30, open since C2).
 *
 * There are no quick-reply chips and no typing indicator. Both were in the
 * design; neither is worth the screen space to somebody driving, and a typing
 * indicator on a connection that drops every few minutes mostly lies.
 */

function timeOf(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ""
    : at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function JobChat({
  assignmentId,
  counterpartName,
  onClose,
}: {
  assignmentId: string;
  counterpartName: string;
  onClose: () => void;
}) {
  const { messages, you, error, sending, send, markRead, refresh } = useConversation(assignmentId);
  const [draft, setDraft] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason>("abusive");
  const [detail, setDetail] = useState("");
  const [reported, setReported] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const report = async () => {
    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "report", assignmentId, reason, detail }),
      });
      setReported(true);
      setReporting(false);
      setDetail("");
    } catch {
      // The sheet stays open so they can try again; nothing else changes.
    }
  };

  // Opening the conversation is reading it.
  useEffect(() => {
    if (messages && messages.length > 0) void markRead();
  }, [messages, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    await send(body);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Messages with ${counterpartName}`}
        className="flex h-[85vh] w-full max-w-[420px] flex-col rounded-t-3xl bg-background"
      >
        <div className="flex items-center justify-between border-b border-border px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h3 className="truncate font-bold">{counterpartName}</h3>
            <p className="text-[11px] text-muted-foreground">On this job only</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setReporting((r) => !r)}
              aria-label="Report this person"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
            >
              <Flag className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {reported && (
          <div role="status" className="border-b border-border bg-surface px-5 py-2 text-[11px]">
            Reported. Somebody will look at this — you will not hear back unless we need something
            from you, and they have not been told.
          </div>
        )}

        {reporting && (
          <div className="border-b border-border bg-surface p-4">
            <h4 className="text-xs font-semibold">Report {counterpartName}</h4>
            <p className="mt-0.5 mb-2 text-[11px] text-muted-foreground">
              An administrator may read this conversation to look into it, and you will be able to
              see in your own data export exactly when they did.
            </p>
            <div className="space-y-1">
              {REPORT_REASON_IDS.map((id) => (
                <label key={id} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="report-reason"
                    checked={reason === id}
                    onChange={() => setReason(id)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  {REPORT_REASONS[id]}
                </label>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                aria-label="Anything else"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Anything else (optional)"
                className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs"
              />
              <button
                onClick={() => void report()}
                className="h-9 rounded-lg bg-destructive px-3 text-[11px] font-semibold text-destructive-foreground"
              >
                Report
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {error ? (
            <ErrorState message={error} onRetry={() => void refresh()} />
          ) : !messages ? (
            <LoadingState message="Loading…" />
          ) : messages.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="No messages yet"
              message="Anything said here stays with this job, and both of you can see it afterwards."
            />
          ) : (
            messages.map((m) => {
              const mine = m.senderId === you;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                      mine
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-surface"
                    }`}
                  >
                    {!mine && (
                      <div className="text-[10px] font-semibold opacity-70">{m.senderName}</div>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                    <div
                      className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${
                        mine ? "opacity-80" : "text-muted-foreground"
                      }`}
                    >
                      {timeOf(m.createdAt)}
                      {/* Only on your own: a tick on what they sent you would
                          be telling them what you already know. */}
                      {mine &&
                        (m.readAt ? (
                          <CheckCheck className="h-3 w-3" aria-label="Read" />
                        ) : (
                          <Check className="h-3 w-3" aria-label="Sent" />
                        ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="sr-only">Message</span>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                rows={1}
                placeholder="Message"
                className="max-h-28 w-full resize-none rounded-2xl border border-border bg-surface px-3 py-2.5 text-sm"
              />
            </label>
            <button
              disabled={sending || !draft.trim()}
              onClick={() => void submit()}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Keep it to the job. Both of you can read this afterwards, and it is part of the record
            if anything is disputed.
          </p>
        </div>
      </div>
    </div>
  );
}

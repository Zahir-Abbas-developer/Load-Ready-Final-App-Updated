import { useCallback, useEffect, useState } from "react";
import type { Message } from "./types";

/**
 * The conversation on a job, in the browser.
 *
 * Live over server-sent events, the same way notifications and tracking are.
 * `EventSource` reconnects on its own, which is what a driver on a bad
 * connection needs from a chat far more than a typing indicator.
 */
export function useConversation(assignmentId: string | null) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [you, setYou] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    if (!assignmentId) return;
    try {
      const res = await fetch(`/api/messages?assignmentId=${encodeURIComponent(assignmentId)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Could not load the conversation.");
      const data = (await res.json()) as { messages: Message[]; you: string };
      setMessages(data.messages);
      setYou(data.you);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the conversation.");
    }
  }, [assignmentId]);

  useEffect(() => {
    void refresh();
    if (!assignmentId || typeof EventSource === "undefined") return;

    const source = new EventSource(
      `/api/messages?assignmentId=${encodeURIComponent(assignmentId)}&stream=1`,
      { withCredentials: true },
    );

    source.addEventListener("message", (event) => {
      try {
        const { message } = JSON.parse((event as MessageEvent).data) as { message: Message };
        // Guarded against the echo of your own send, which arrives twice:
        // once from the POST and once from the stream.
        setMessages((current) =>
          (current ?? []).some((m) => m.id === message.id)
            ? current
            : [...(current ?? []), message],
        );
      } catch {
        /* a malformed frame is not worth breaking the stream over */
      }
    });

    source.addEventListener("read", () => {
      setMessages((current) =>
        (current ?? []).map((m) => (m.readAt ? m : { ...m, readAt: new Date().toISOString() })),
      );
    });

    return () => source.close();
  }, [assignmentId, refresh]);

  const send = useCallback(
    async (body: string, attachmentIds: string[] = []) => {
      if (!assignmentId) return;
      setSending(true);
      setError(null);
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "send", assignmentId, body, attachmentIds }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: Message;
          error?: string;
        };
        if (!res.ok || !data.message) throw new Error(data.error ?? "That did not send.");
        setMessages((current) =>
          (current ?? []).some((m) => m.id === data.message!.id)
            ? current
            : [...(current ?? []), data.message!],
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "That did not send.");
      }
      setSending(false);
    },
    [assignmentId],
  );

  const markRead = useCallback(async () => {
    if (!assignmentId) return;
    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "read", assignmentId }),
      });
    } catch {
      // Not worth telling anybody about; the next open marks them again.
    }
  }, [assignmentId]);

  return { messages, you, error, sending, send, markRead, refresh };
}

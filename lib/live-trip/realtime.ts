import { supabase } from "@/integrations/supabase/client";
import type { GpsPing } from "./types";

/**
 * Publish a GPS ping to Supabase. Realtime listeners on trip_locations
 * receive it within ~1s. Throttled by caller (simulator emits at 1Hz).
 */
export async function publishPing(tripId: string, p: GpsPing) {
  try {
    await supabase.from("trip_locations").insert({
      trip_id: tripId,
      lng: p.lng,
      lat: p.lat,
      heading: p.heading,
      speed: p.speed,
      accuracy: p.accuracy,
    });
  } catch (err) {
    console.warn("[realtime] publishPing failed", err);
  }
}

export type RemotePing = GpsPing;

/**
 * Subscribe to live GPS pings for a trip via Supabase Realtime.
 * Returns an unsubscribe function.
 */
export function subscribePings(tripId: string, cb: (p: RemotePing) => void) {
  const channel = supabase
    .channel(`trip-loc-${tripId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "trip_locations",
        filter: `trip_id=eq.${tripId}`,
      },
      (payload) => {
        const r = payload.new as {
          lng: number; lat: number; heading: number | null;
          speed: number | null; accuracy: number | null; ts: string;
        };
        cb({
          lng: r.lng,
          lat: r.lat,
          heading: r.heading ?? 0,
          speed: r.speed ?? 0,
          accuracy: r.accuracy ?? 0,
          timestamp: new Date(r.ts).getTime(),
        });
      },
    )
    .subscribe();

  // Also pull the latest ping immediately (avoid waiting for next insert)
  supabase
    .from("trip_locations")
    .select("lng,lat,heading,speed,accuracy,ts")
    .eq("trip_id", tripId)
    .order("ts", { ascending: false })
    .limit(1)
    .then(({ data }) => {
      const r = data?.[0];
      if (r) {
        cb({
          lng: r.lng,
          lat: r.lat,
          heading: r.heading ?? 0,
          speed: r.speed ?? 0,
          accuracy: r.accuracy ?? 0,
          timestamp: new Date(r.ts).getTime(),
        });
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

export type ChatMessage = {
  id: number;
  tripId: string;
  senderRole: string;
  senderName: string;
  body: string;
  createdAt: number;
};

export async function sendMessage(
  tripId: string,
  senderRole: string,
  senderName: string,
  body: string,
) {
  const { error } = await supabase.from("trip_messages").insert({
    trip_id: tripId,
    sender_role: senderRole,
    sender_name: senderName,
    body,
  });
  if (error) throw error;
}

export async function loadMessages(tripId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("trip_messages")
    .select("id,trip_id,sender_role,sender_name,body,created_at")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as number,
    tripId: r.trip_id as string,
    senderRole: r.sender_role as string,
    senderName: r.sender_name as string,
    body: r.body as string,
    createdAt: new Date(r.created_at as string).getTime(),
  }));
}

export function subscribeMessages(tripId: string, cb: (m: ChatMessage) => void) {
  const channel = supabase
    .channel(`trip-msg-${tripId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "trip_messages",
        filter: `trip_id=eq.${tripId}`,
      },
      (payload) => {
        const r = payload.new as {
          id: number; trip_id: string; sender_role: string;
          sender_name: string; body: string; created_at: string;
        };
        cb({
          id: r.id,
          tripId: r.trip_id,
          senderRole: r.sender_role,
          senderName: r.sender_name,
          body: r.body,
          createdAt: new Date(r.created_at).getTime(),
        });
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

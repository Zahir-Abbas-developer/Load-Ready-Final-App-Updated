import { supabase } from "@/integrations/supabase/client";
import type { TripPhase } from "./types";

export type JobStatus = "pending" | "active" | "completed";

const ACTIVE_PHASES: TripPhase[] = [
  "to-pickup",
  "at-pickup",
  "delivering",
  "approaching",
  "at-destination",
];

export function phaseToStatus(phase: TripPhase): JobStatus {
  if (phase === "completed") return "completed";
  if (ACTIVE_PHASES.includes(phase)) return "active";
  return "pending";
}

export function isActivePhase(phase: TripPhase): boolean {
  return ACTIVE_PHASES.includes(phase);
}

export interface JobStatusEvent {
  tripId: string;
  phase: TripPhase;
  status: JobStatus;
  at: number;
}

const channelName = (tripId: string) => `trip-status-${tripId}`;

export async function broadcastPhase(tripId: string, phase: TripPhase) {
  try {
    const evt: JobStatusEvent = {
      tripId,
      phase,
      status: phaseToStatus(phase),
      at: Date.now(),
    };
    const ch = supabase.channel(channelName(tripId));
    ch.subscribe();
    await ch.send({ type: "broadcast", event: "phase", payload: evt });
    setTimeout(() => supabase.removeChannel(ch), 250);
  } catch (err) {
    console.warn("[job-status] broadcast failed", err);
  }
}

export function subscribePhase(tripId: string, cb: (e: JobStatusEvent) => void) {
  const ch = supabase
    .channel(channelName(tripId))
    .on("broadcast", { event: "phase" }, ({ payload }) => cb(payload as JobStatusEvent))
    .subscribe();
  return () => {
    supabase.removeChannel(ch);
  };
}

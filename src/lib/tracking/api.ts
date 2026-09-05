import { useCallback, useEffect, useRef, useState } from "react";
import { isTrackable, shouldRecord, type Position } from "./rules";
import type { Assignment } from "@/lib/marketplace/offers";

/**
 * Location in the browser: sending it, and watching it.
 *
 * The pilot half is the one with the hard problems. A phone in a cab loses
 * signal in every cutting, the browser hands out fixes far faster than anybody
 * needs them, and the battery has to last the whole run. So:
 *
 * - **Fixes are thinned before they are sent**, by the same rule the server
 *   applies — one every thirty seconds or two hundred metres. The server
 *   thins again because it cannot trust a client, but doing it here is what
 *   keeps the radio quiet.
 * - **What cannot be sent is queued**, in `localStorage`, and offered when the
 *   phone comes back. A drive through a canyon should not leave a hole in the
 *   record.
 * - **It stops by itself.** Watching ends the moment the job leaves an active
 *   status, so nothing keeps running because a screen was left open.
 */

export interface TrackedPosition extends Position {
  assignmentId: string;
}

const queueKey = (assignmentId: string) => `loadready:tracking:queue:${assignmentId}`;

function readQueue(assignmentId: string): Position[] {
  try {
    const raw = localStorage.getItem(queueKey(assignmentId));
    const parsed = raw ? (JSON.parse(raw) as Position[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-200) : [];
  } catch {
    return [];
  }
}

function writeQueue(assignmentId: string, positions: Position[]) {
  try {
    localStorage.setItem(queueKey(assignmentId), JSON.stringify(positions.slice(-200)));
  } catch {
    // A full or disabled storage is not a reason to stop escorting.
  }
}

async function postPositions(assignmentId: string, positions: Position[]) {
  const res = await fetch("/api/tracking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "ping", assignmentId, positions }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    needsConsent?: boolean;
    tracking?: boolean;
  };
  if (!res.ok) {
    const error = new Error(data.error ?? "Could not send your position.") as Error & {
      needsConsent?: boolean;
      tracking?: boolean;
    };
    error.needsConsent = data.needsConsent;
    error.tracking = data.tracking;
    throw error;
  }
  return data;
}

export async function setConsent(agreed: boolean): Promise<boolean> {
  const res = await fetch("/api/tracking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action: "consent", agreed }),
  });
  if (!res.ok) throw new Error("Could not save that.");
  return ((await res.json()) as { consented: boolean }).consented;
}

export interface BroadcastState {
  /** Whether the browser is currently watching the device. */
  watching: boolean;
  /** The last fix we took, whether or not it has been sent. */
  last: Position | null;
  /** Fixes waiting for signal. */
  queued: number;
  /**
   * Whether the browser has agreed to keep the screen on.
   *
   * Not cosmetic: the browser stops a hidden page, so a locked phone stops
   * reporting. The screen lock is the only thing a web app can do about that,
   * and the pilot has to be told whether it worked.
   */
  screenHeld: boolean;
  /** Set when the pilot has not agreed, so the screen can ask. */
  needsConsent: boolean;
  /** Set when the device or the browser refuses. */
  error: string | null;
}

/**
 * Sends this pilot's position while the job is running.
 *
 * `enabled` is the consent flag; the assignment's status decides the rest.
 * Nothing starts until both say so, and everything stops when either changes.
 */
export function useLocationBroadcast(
  assignment: Assignment | null,
  enabled: boolean,
): BroadcastState {
  const [state, setState] = useState<BroadcastState>({
    watching: false,
    last: null,
    queued: 0,
    screenHeld: false,
    needsConsent: false,
    error: null,
  });

  const lastSentRef = useRef<Position | null>(null);
  const assignmentId = assignment?.id ?? null;
  const active = Boolean(assignment && isTrackable(assignment.status));

  /** Sends whatever is waiting, oldest first, and keeps it if the send fails. */
  const flush = useCallback(async (id: string, incoming: Position[]) => {
    const pending = [...readQueue(id), ...incoming];
    if (pending.length === 0) return;

    try {
      await postPositions(id, pending);
      writeQueue(id, []);
      setState((s) => ({ ...s, queued: 0, error: null, needsConsent: false }));
    } catch (err) {
      const e = err as Error & { needsConsent?: boolean; tracking?: boolean };
      // A job that is over will never accept these. Holding them forever
      // would mean carrying somebody's movements around indefinitely.
      if (e.tracking === false) {
        writeQueue(id, []);
        setState((s) => ({ ...s, queued: 0 }));
        return;
      }
      writeQueue(id, pending);
      setState((s) => ({
        ...s,
        queued: pending.length,
        needsConsent: e.needsConsent === true,
        error: e.needsConsent ? null : e.message,
      }));
    }
  }, []);

  useEffect(() => {
    if (!assignmentId || !active || !enabled) {
      setState((s) => ({ ...s, watching: false }));
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((s) => ({
        ...s,
        watching: false,
        error: "This device cannot report its position.",
      }));
      return;
    }

    setState((s) => ({ ...s, watching: true, error: null }));

    const watchId = navigator.geolocation.watchPosition(
      (fix) => {
        const position: Position = {
          lng: fix.coords.longitude,
          lat: fix.coords.latitude,
          accuracy: fix.coords.accuracy ?? 0,
          heading: Number.isFinite(fix.coords.heading) ? fix.coords.heading : null,
          // The browser reports metres per second; the product speaks mph.
          speed: Number.isFinite(fix.coords.speed) ? (fix.coords.speed as number) * 2.23694 : null,
          at: fix.timestamp,
        };

        setState((s) => ({ ...s, last: position }));

        // Thinned here as well as on the server: this is what keeps the radio
        // quiet, and the radio is most of the battery.
        if (!shouldRecord(position, lastSentRef.current)) return;
        lastSentRef.current = position;
        void flush(assignmentId, [position]);
      },
      (err) => {
        setState((s) => ({
          ...s,
          watching: false,
          error:
            err.code === err.PERMISSION_DENIED
              ? "Location is blocked for this site in your browser settings."
              : "Could not get a position fix.",
        }));
      },
      {
        // Worth the battery: a lead car's position is the whole point.
        enableHighAccuracy: true,
        // Older than this and it is history, not a position.
        maximumAge: 15_000,
        timeout: 30_000,
      },
    );

    // Anything stranded by a previous run goes now that we are back.
    void flush(assignmentId, []);
    const onOnline = () => void flush(assignmentId, []);
    window.addEventListener("online", onOnline);

    /*
     * Coming back to the tab is the other moment worth flushing.
     *
     * A backgrounded page is frozen, not merely quiet: the "online" event can
     * fire while nothing is listening, and the next fix may be minutes away.
     * Returning to the screen is when the pilot expects to see the queue gone.
     */
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush(assignmentId, []);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      lastSentRef.current = null;
      setState((s) => ({ ...s, watching: false }));
    };
  }, [assignmentId, active, enabled, flush]);

  /*
   * Keeps the screen awake while the job is running.
   *
   * The honest limit of a web app: a browser suspends a page whose screen has
   * gone off, and a suspended page reports nothing. A screen wake lock is the
   * only lever the platform gives us, and it is a real one — a phone in a
   * windscreen mount for a six-hour escort keeps reporting instead of going
   * dark at the first timeout.
   *
   * It is not background location. That needs the native app (Phase K3), and
   * the screen here is told so rather than left to look like it is working.
   */
  useEffect(() => {
    if (!active || !enabled) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
        setState((s) => ({ ...s, screenHeld: true }));
        sentinel.addEventListener("release", () => {
          setState((s) => ({ ...s, screenHeld: false }));
        });
      } catch {
        // Refused — a low battery, or a browser that does not allow it here.
        // Not an error worth showing: the job carries on either way.
        setState((s) => ({ ...s, screenHeld: false }));
      }
    };

    // The browser drops the lock whenever the page is hidden, and does not
    // give it back on its own.
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
      setState((s) => ({ ...s, screenHeld: false }));
    };
  }, [active, enabled]);

  useEffect(() => {
    if (assignmentId) setState((s) => ({ ...s, queued: readQueue(assignmentId).length }));
  }, [assignmentId]);

  return state;
}

// ── watching, from either side ─────────────────────────────────────────────

export interface TrailState {
  trail: TrackedPosition[];
  last: TrackedPosition | null;
  tracking: boolean;
  consented: boolean;
  error: string | null;
}

/**
 * The trail on one job, live.
 *
 * Used by the dispatcher to watch, and by the pilot to see what is actually
 * being recorded about them — which is not a courtesy, it is the point.
 */
export function useTrail(assignmentId: string | null): TrailState {
  const [state, setState] = useState<TrailState>({
    trail: [],
    last: null,
    tracking: false,
    consented: false,
    error: null,
  });

  useEffect(() => {
    if (!assignmentId) return;
    let cancelled = false;

    void fetch(`/api/tracking?assignmentId=${encodeURIComponent(assignmentId)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load the trail.");
        return (await res.json()) as Omit<TrailState, "error">;
      })
      .then((data) => {
        if (!cancelled) setState({ ...data, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Could not load the trail.",
          }));
        }
      });

    if (typeof EventSource === "undefined")
      return () => {
        cancelled = true;
      };

    const source = new EventSource(
      `/api/tracking?assignmentId=${encodeURIComponent(assignmentId)}&stream=1`,
      { withCredentials: true },
    );
    source.addEventListener("position", (event) => {
      try {
        const position = JSON.parse((event as MessageEvent).data) as TrackedPosition;
        setState((s) => {
          const already = s.trail.some((p) => p.at === position.at);
          return already ? s : { ...s, last: position, trail: [...s.trail, position].slice(-2500) };
        });
      } catch {
        /* a malformed frame is not worth breaking the stream over */
      }
    });

    return () => {
      cancelled = true;
      source.close();
    };
  }, [assignmentId]);

  return state;
}

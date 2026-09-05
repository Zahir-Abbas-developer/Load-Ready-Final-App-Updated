// Per-trip SMS + call attempt log, persisted to localStorage and surfaced
// to a tiny pub/sub so panels live-refresh without polling.

export type SmsStatus = "queued" | "sent" | "delivered" | "failed";
export type CallStatus = "ringing" | "connected" | "missed" | "ended" | "failed";
export type CommsDirection = "outbound" | "inbound";

export interface SmsEntry {
  id: string;
  kind: "sms";
  tripId: string;
  to: string;
  from: string;
  body: string;
  direction: CommsDirection;
  status: SmsStatus;
  createdAt: number;
  updatedAt: number;
  stub?: boolean;
}

export interface CallEntry {
  id: string;
  kind: "call";
  tripId: string;
  to: string;
  from: string;
  direction: CommsDirection;
  status: CallStatus;
  createdAt: number;
  endedAt?: number;
  durationSec?: number;
  stub?: boolean;
}

export type CommsEntry = SmsEntry | CallEntry;

const KEY = "bwm:comms-log:v1";
type Listener = () => void;
const listeners = new Set<Listener>();

function read(): CommsEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CommsEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: CommsEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(-500)));
  } catch {
    /* quota — best-effort */
  }
  listeners.forEach((l) => l());
}

export function subscribeComms(cb: Listener) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function listComms(tripId?: string): CommsEntry[] {
  const all = read().sort((a, b) => b.createdAt - a.createdAt);
  return tripId ? all.filter((e) => e.tripId === tripId) : all;
}

export function addSms(entry: Omit<SmsEntry, "id" | "kind" | "createdAt" | "updatedAt">): SmsEntry {
  const now = Date.now();
  const sms: SmsEntry = {
    ...entry,
    id: `sms-${now}-${Math.random().toString(36).slice(2, 7)}`,
    kind: "sms",
    createdAt: now,
    updatedAt: now,
  };
  write([...read(), sms]);
  return sms;
}

export function updateSms(id: string, patch: Partial<SmsEntry>) {
  const all = read().map((e) =>
    e.kind === "sms" && e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e,
  );
  write(all);
}

export function addCall(entry: Omit<CallEntry, "id" | "kind" | "createdAt">): CallEntry {
  const now = Date.now();
  const call: CallEntry = {
    ...entry,
    id: `call-${now}-${Math.random().toString(36).slice(2, 7)}`,
    kind: "call",
    createdAt: now,
  };
  write([...read(), call]);
  return call;
}

export function updateCall(id: string, patch: Partial<CallEntry>) {
  const all = read().map((e) => {
    if (e.kind !== "call" || e.id !== id) return e;
    const next: CallEntry = { ...e, ...patch };
    if (patch.endedAt && !patch.durationSec) {
      next.durationSec = Math.round((patch.endedAt - e.createdAt) / 1000);
    }
    return next;
  });
  write(all);
}

export function commsCounts(tripId: string) {
  const items = listComms(tripId);
  return {
    sms: items.filter((e) => e.kind === "sms").length,
    calls: items.filter((e) => e.kind === "call").length,
    total: items.length,
  };
}

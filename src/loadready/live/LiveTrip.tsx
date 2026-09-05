import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowLeft,
  Gauge,
  Loader2,
  MapPin,
  Phone,
  Satellite,
  WifiOff,
  Smartphone,
} from "lucide-react";
import * as tracking from "@/lib/tracking/api";
import { isStale, isTrackable, lastSeenLabel, STALE_AFTER_MS } from "@/lib/tracking/rules";
import { statusLabel } from "@/lib/marketplace/lifecycle";
import { regionName } from "@/lib/profile/catalog";
import { formatSpeed } from "@/lib/profile/preferences";
import type { Job } from "@/lib/marketplace/assignments-api";

/**
 * The live trip, for whichever side is looking at it.
 *
 * What was here ran on a simulator: a hard-coded Dallas-to-Houston route, a
 * scripted set of turn instructions, and a vehicle walked along the line at a
 * fixed speed. It looked convincing and reported nothing. This shows the
 * positions the pilot's device actually sent, and nothing else.
 *
 * The pilot's copy also *sends* — but only while the job is running, only with
 * their consent, and the server checks both again before it writes anything.
 */

// Leaflet touches `window` at module load, which breaks server rendering.
const TrailMap = lazy(() => import("./TrailMap").then((m) => ({ default: m.TrailMap })));

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <div className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

/** Asked once, before anything is recorded, and withdrawable from the same place. */
function ConsentPanel({ onAgree }: { onAgree: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agree = async () => {
    setBusy(true);
    setError(null);
    try {
      await tracking.setConsent(true);
      onAgree();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
      setBusy(false);
    }
  };

  return (
    <div className="m-4 rounded-2xl border border-primary/30 bg-accent p-4">
      <div className="flex items-center gap-2">
        <Satellite className="h-4 w-4 text-primary" aria-hidden />
        <h3 className="text-sm font-bold">Share your location while you are working?</h3>
      </div>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {/* Said plainly, because a consent nobody reads is not one. */}
        <li>
          • Only while a job is running — from “I’m on my way” until you finish it. Never before,
          never after, never between jobs.
        </li>
        <li>• Only the dispatcher on that job can see it.</li>
        <li>• A position roughly every 30 seconds, kept for 90 days, then deleted.</li>
        <li>• You can turn it off at any time, on this screen.</li>
      </ul>
      {error && (
        <div role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <button
        disabled={busy}
        onClick={() => void agree()}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Share my location while working
      </button>
    </div>
  );
}

export function LiveTrip({
  job,
  role,
  onClose,
}: {
  job: Job;
  role: "pilot" | "dispatcher";
  onClose: () => void;
}) {
  const { assignment, load, pilot, company } = job;
  const trail = tracking.useTrail(assignment.id);
  const [consented, setConsented] = useState<boolean | null>(null);
  const [now, setNow] = useState(Date.now());

  // Consent comes back with the trail, and is what the pilot's switch reflects.
  useEffect(() => {
    setConsented(trail.consented);
  }, [trail.consented]);

  // "3 min ago" has to keep counting, or a dead phone looks live.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const broadcast = tracking.useLocationBroadcast(
    role === "pilot" ? assignment : null,
    consented === true,
  );

  const running = isTrackable(assignment.status);
  const stale = isStale(trail.last?.at ?? null, now);

  const stopSharing = async () => {
    await tracking.setConsent(false);
    setConsented(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          onClick={onClose}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{load?.title ?? "Live trip"}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {load?.reference} · {statusLabel(assignment.status)}
          </div>
        </div>
        {(role === "pilot" ? company.phone : pilot.phone) && (
          <a
            href={`tel:${role === "pilot" ? company.phone : pilot.phone}`}
            aria-label={role === "pilot" ? "Call the dispatcher" : "Call the pilot"}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <Phone className="h-4 w-4" />
          </a>
        )}
      </header>

      {role === "pilot" && consented === false && (
        <ConsentPanel onAgree={() => setConsented(true)} />
      )}

      <div className="relative min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Loading the map…
            </div>
          }
        >
          <TrailMap trail={trail.trail} last={trail.last} stale={stale} />
        </Suspense>

        {trail.trail.length === 0 && (
          <div className="pointer-events-none absolute inset-x-4 top-4 rounded-2xl bg-background/95 p-4 text-center shadow">
            <p className="text-sm font-semibold">
              {running ? "No position yet" : "This job is not running"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {running
                ? role === "pilot"
                  ? "Your first fix appears here once your phone has one."
                  : "The pilot's position appears here once their phone reports one."
                : `Positions are only recorded between “${statusLabel("en_route")}” and finishing.`}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Last seen" value={lastSeenLabel(trail.last?.at ?? null, now)} />
          <Stat
            label="Speed"
            value={
              trail.last?.speed === null || trail.last?.speed === undefined
                ? "—"
                : formatSpeed(trail.last.speed, "imperial")
            }
          />
          <Stat label="Fixes" value={String(trail.trail.length)} />
        </div>

        {/* Said out loud: a marker that has stopped moving could be a truck at
            a light or a phone that is dead, and those are different problems. */}
        {stale && trail.last && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <WifiOff className="h-3 w-3" aria-hidden />
            No new position for over {Math.round(STALE_AFTER_MS / 60_000)} minutes — this is where
            they were, not where they are.
          </p>
        )}

        {role === "pilot" && (
          <div className="mt-3 space-y-2">
            {broadcast.watching && (
              <p className="flex items-center gap-1.5 text-[11px] text-success">
                <Gauge className="h-3 w-3" aria-hidden /> Sharing your position while this job runs.
              </p>
            )}
            {broadcast.queued > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <WifiOff className="h-3 w-3" aria-hidden /> {broadcast.queued} position
                {broadcast.queued === 1 ? "" : "s"} waiting for signal. They send themselves when
                you are back.
              </p>
            )}
            {/*
             * The one thing a pilot has to know before putting the phone
             * down. A browser stops a page whose screen is off, so a locked
             * phone stops reporting — and finding that out from a dispatcher
             * six hours later is the worst way to learn it.
             */}
            {broadcast.watching &&
              (broadcast.screenHeld ? (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Smartphone className="h-3 w-3" aria-hidden /> Keeping the screen on so this keeps
                  reporting. Leave the app open.
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Smartphone className="h-3 w-3" aria-hidden /> Keep this screen open — if the
                  phone locks, your position stops updating until you come back.
                </p>
              ))}
            {broadcast.error && (
              <p role="alert" className="text-[11px] text-destructive">
                {broadcast.error}
              </p>
            )}
            {consented && (
              <button
                onClick={() => void stopSharing()}
                className="h-9 w-full rounded-full border border-border text-[11px] font-semibold text-muted-foreground"
              >
                Stop sharing my location
              </button>
            )}
          </div>
        )}

        {load && (
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden />
            {load.origin.city}, {regionName(load.origin.region)} → {load.destination.city},{" "}
            {regionName(load.destination.region)}
          </p>
        )}
      </div>
    </div>
  );
}

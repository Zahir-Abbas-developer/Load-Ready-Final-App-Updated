import { useCallback, useEffect, useState } from "react";
import { lazy, Suspense } from "react";
import {
  ClipboardList,
  FileText,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Satellite,
  Star,
  X,
} from "lucide-react";
import * as api from "@/lib/marketplace/api";
import * as jobsApi from "@/lib/marketplace/assignments-api";
import { serviceLabel } from "@/lib/marketplace/matching";
import { nextStatus, ruleFor, statusLabel, MAX_MILES } from "@/lib/marketplace/lifecycle";
import { regionName } from "@/lib/profile/catalog";
import { JobSheet } from "@/components/loadready/shared/JobSheet";
import { JobChat } from "@/components/loadready/shared/JobChat";
import { ProofPanel } from "@/components/loadready/shared/ProofPanel";
import { detentionMs, formatDuration } from "@/lib/messaging/types";
import { RateSheet, RatingLine } from "@/components/loadready/shared/RateSheet";
import { EmptyState, ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";
import { isTrackable } from "@/lib/tracking/rules";
import type { Job } from "@/lib/marketplace/assignments-api";

// Leaflet touches `window` at module load, which breaks server rendering.
const LiveTrip = lazy(() =>
  import("@/components/loadready/live/LiveTrip").then((m) => ({ default: m.LiveTrip })),
);

/**
 * The pilot's own jobs, and the one button that moves each one along.
 *
 * What was here was a list of accepted sample offers held in the browser, with
 * Navigate, Chat and Call buttons that all opened the same screen. This is the
 * real thing: work this pilot was actually hired for, and the single next step
 * the state machine allows them to take.
 *
 * One button, never a menu of statuses. The next step is a fact about where
 * they are, so there is only ever one honest answer — and a driver choosing
 * from a list at the wheel is a driver reading a list at the wheel.
 */

const WORKING = ["en_route", "on_site", "escorting"];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/** Closing a job: the miles run and anything the dispatcher needs on the record. */
function FinishSheet({
  job,
  onClose,
  onDone,
}: {
  job: Job;
  onClose: () => void;
  onDone: (job: Job) => void;
}) {
  const [miles, setMiles] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await jobsApi.complete(job.assignment.id, {
        notes: notes.trim() || undefined,
        milesDriven: miles.trim() === "" ? null : Number(miles),
      });
      onDone(res.job);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish the job.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Finish the job"
        className="w-full max-w-[420px] rounded-t-3xl bg-background p-5"
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="font-bold">Finish the job</h3>
            <p className="text-xs text-muted-foreground">{job.load?.reference}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block">
          <span className="text-xs font-semibold">Miles you ran (optional)</span>
          <input
            inputMode="numeric"
            value={miles}
            onChange={(e) => setMiles(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="e.g. 214"
            max={MAX_MILES}
            className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-xs font-semibold">Anything the dispatcher should know</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Detained two hours at the yard, route closed at exit 14…"
            className="mt-1 w-full rounded-xl border border-border bg-surface p-3 text-sm"
          />
        </label>

        <p className="mt-2 text-[11px] text-muted-foreground">
          This goes on the job sheet, which is the record either of you can point at later.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </div>
        )}

        <button
          disabled={busy}
          onClick={() => void finish()}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Job finished
        </button>
      </div>
    </div>
  );
}

function JobCard({
  job,
  onChanged,
  onSheet,
  onRate,
  onFinish,
  onLive,
  onChat,
}: {
  job: Job;
  onChanged: (job: Job) => void;
  onSheet: () => void;
  onRate: () => void;
  onFinish: () => void;
  onLive: () => void;
  onChat: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  const { assignment: a, load: l, company } = job;
  const slot = l?.slots.find((s) => s.id === a.slotId);
  const next = nextStatus(a.status);
  const rule = next ? ruleFor(a.status, next) : null;
  const finished = a.status === "completed" || a.status === "cancelled";

  const step = async () => {
    if (!next) return;
    if (next === "completed") {
      onFinish();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChanged((await jobsApi.advance(a.id, next)).job);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the job.");
    }
    setBusy(false);
  };

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      onChanged((await jobsApi.cancel(a.id, reason)).job);
      setCancelling(false);
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel the job.");
    }
    setBusy(false);
  };

  return (
    /*
     * Named, because a pilot with three jobs on screen has three "I'm on my
     * way" buttons and a screen reader announcing "button" three times is no
     * use to anybody.
     */
    <article
      aria-label={`Job ${l?.reference ?? ""} ${l?.title ?? ""}`.trim()}
      className="rounded-2xl border border-border bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-muted-foreground">
            {l?.reference} · {slot ? serviceLabel(slot.service) : ""}
          </div>
          <div className="truncate text-sm font-semibold">{l?.title}</div>
          {l && (
            <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0 text-primary" aria-hidden />
              {l.origin.city}, {regionName(l.origin.region)} → {l.destination.city},{" "}
              {regionName(l.destination.region)}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-bold text-success">{api.formatMoney(a.agreedAmountCents)}</div>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase">
            {a.noShow ? "No-show" : statusLabel(a.status)}
          </div>
        </div>
      </div>

      {/* Revealed by the assignment, and the reason it exists. */}
      {!finished && (
        <div className="mt-3 flex items-center gap-2">
          {company.phone ? (
            <a
              href={`tel:${company.phone}`}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background text-xs font-semibold"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden /> Call dispatch
            </a>
          ) : (
            <span className="flex-1 text-[11px] text-muted-foreground">
              This dispatcher has no phone number on file.
            </span>
          )}
          <button
            onClick={onSheet}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background text-xs font-semibold"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden /> Job sheet
          </button>
        </div>
      )}

      {/* Only while the job is actually running — there is nothing live about
          a job that starts on Thursday. */}
      {isTrackable(a.status) && (
        <button
          onClick={onLive}
          className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-border bg-background text-xs font-semibold"
        >
          <Satellite className="h-3.5 w-3.5" aria-hidden /> Live trip
        </button>
      )}

      {/* The clock a detention argument turns on, running where the pilot can
          see it rather than reconstructed from timestamps afterwards. */}
      {a.status === "on_site" && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Waiting at the pickup for {formatDuration(detentionMs(a.history, Date.now()))}
        </p>
      )}

      <button
        onClick={onChat}
        className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-border bg-background text-xs font-semibold"
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Messages
        {job.unreadMessages > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {job.unreadMessages}
          </span>
        )}
      </button>

      {!finished && (
        <div className="mt-3 border-t border-border pt-3">
          <ProofPanel job={job} onChanged={onChanged} canAdd />
        </div>
      )}

      {rule && (
        <button
          disabled={busy}
          onClick={() => void step()}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {rule.label}
        </button>
      )}

      {a.status === "cancelled" && a.cancellationReason && (
        <p className="mt-2 rounded-xl bg-background p-2.5 text-[11px]">
          {a.cancelledBy === "pilot" ? "You cancelled" : "The dispatcher cancelled"}:{" "}
          {a.cancellationReason}
        </p>
      )}

      {/* Rating, once there is something to rate. */}
      {a.status === "completed" && (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          {job.youHaveRated ? (
            job.ratings.theirs ? (
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground">
                  What they said about you
                </div>
                <RatingLine score={job.ratings.theirs.score} comment={job.ratings.theirs.comment} />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Rating sent. Theirs appears when they write one
                {job.ratings.theirsVisibleAt
                  ? `, or on ${new Date(job.ratings.theirsVisibleAt).toLocaleDateString()}`
                  : ""}
                .
              </p>
            )
          ) : (
            <button
              onClick={onRate}
              className="flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-border bg-background text-xs font-semibold"
            >
              <Star className="h-3.5 w-3.5" aria-hidden /> Rate this dispatcher
            </button>
          )}
          <button
            onClick={onSheet}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-border bg-background text-xs font-semibold"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden /> Job sheet
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {!finished &&
        (cancelling ? (
          <div className="mt-2 flex gap-2">
            <input
              aria-label="Why you cannot do this job"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why you cannot do it — they are told"
              className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs"
            />
            <button
              disabled={busy}
              onClick={() => void cancel()}
              className="h-9 rounded-lg bg-destructive px-3 text-[11px] font-semibold text-destructive-foreground disabled:opacity-50"
            >
              Cancel job
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCancelling(true)}
            className="mt-2 h-8 w-full text-[11px] font-semibold text-muted-foreground"
          >
            I can't do this job
          </button>
        ))}
    </article>
  );
}

export function MyOrders({
  onBrowse,
  onOpenBids,
}: {
  onBrowse: () => void;
  onOpenBids: () => void;
}) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Job | null>(null);
  const [rating, setRating] = useState<Job | null>(null);
  const [finishing, setFinishing] = useState<Job | null>(null);
  const [live, setLive] = useState<Job | null>(null);
  const [chat, setChat] = useState<Job | null>(null);

  const refresh = useCallback(async () => {
    try {
      setJobs(await jobsApi.myJobs());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your jobs.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const replace = (job: Job) => {
    setJobs((current) =>
      (current ?? []).map((j) => (j.assignment.id === job.assignment.id ? job : j)),
    );
    for (const [value, set] of [
      [sheet, setSheet],
      [rating, setRating],
      [finishing, setFinishing],
      [live, setLive],
      [chat, setChat],
    ] as const) {
      if (value?.assignment.id === job.assignment.id) set(job);
    }
  };

  if (error && !jobs) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!jobs) return <LoadingState message="Loading your jobs…" />;

  const working = jobs.filter((j) => WORKING.includes(j.assignment.status));
  const coming = jobs.filter((j) => j.assignment.status === "assigned");
  const finished = jobs.filter(
    (j) => j.assignment.status === "completed" || j.assignment.status === "cancelled",
  );

  return (
    <div className="flex-1 overflow-y-auto px-5 pt-2 pb-28">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">My orders</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenBids}
            className="flex min-h-11 items-center px-2 text-xs font-semibold text-primary"
          >
            My bids →
          </button>
          <button
            onClick={() => void refresh()}
            aria-label="Refresh"
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No jobs yet"
          message="Work you are hired for appears here with the yard address, who to call and the job sheet."
          action={{ label: "Browse available loads", onClick: onBrowse }}
        />
      ) : (
        <div className="space-y-5">
          {working.length > 0 && (
            <Group title="Working now">
              {working.map((j) => (
                <JobCard
                  key={j.assignment.id}
                  job={j}
                  onChanged={replace}
                  onSheet={() => setSheet(j)}
                  onRate={() => setRating(j)}
                  onFinish={() => setFinishing(j)}
                  onLive={() => setLive(j)}
                  onChat={() => setChat(j)}
                />
              ))}
            </Group>
          )}
          {coming.length > 0 && (
            <Group title="Coming up">
              {coming.map((j) => (
                <JobCard
                  key={j.assignment.id}
                  job={j}
                  onChanged={replace}
                  onSheet={() => setSheet(j)}
                  onRate={() => setRating(j)}
                  onFinish={() => setFinishing(j)}
                  onLive={() => setLive(j)}
                  onChat={() => setChat(j)}
                />
              ))}
            </Group>
          )}
          {finished.length > 0 && (
            <Group title="Finished">
              {finished.map((j) => (
                <JobCard
                  key={j.assignment.id}
                  job={j}
                  onChanged={replace}
                  onSheet={() => setSheet(j)}
                  onRate={() => setRating(j)}
                  onFinish={() => setFinishing(j)}
                  onLive={() => setLive(j)}
                  onChat={() => setChat(j)}
                />
              ))}
            </Group>
          )}
        </div>
      )}

      {live && (
        <Suspense fallback={null}>
          <LiveTrip job={live} role="pilot" onClose={() => setLive(null)} />
        </Suspense>
      )}
      {chat && (
        <JobChat
          assignmentId={chat.assignment.id}
          counterpartName={chat.company.companyName || "The dispatcher"}
          onClose={() => {
            setChat(null);
            void refresh();
          }}
        />
      )}
      {sheet && <JobSheet job={sheet} onClose={() => setSheet(null)} />}
      {finishing && (
        <FinishSheet job={finishing} onClose={() => setFinishing(null)} onDone={replace} />
      )}
      {rating && (
        <RateSheet
          job={rating}
          about={rating.company.companyName || "the dispatcher"}
          onClose={() => setRating(null)}
          onDone={replace}
        />
      )}
    </div>
  );
}

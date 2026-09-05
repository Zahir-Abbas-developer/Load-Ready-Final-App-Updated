import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  MessageCircle,
  Package,
  Phone,
  RefreshCw,
  Satellite,
  Star,
  UserX,
  X,
} from "lucide-react";
import * as api from "@/lib/marketplace/api";
import * as offersApi from "@/lib/marketplace/offers-api";
import * as jobsApi from "@/lib/marketplace/assignments-api";
import { serviceLabel } from "@/lib/marketplace/matching";
import { canMarkNoShow, statusLabel } from "@/lib/marketplace/lifecycle";
import { regionName } from "@/lib/profile/catalog";
import { JobSheet } from "@/components/loadready/shared/JobSheet";
import { JobChat } from "@/components/loadready/shared/JobChat";
import { ProofPanel } from "@/components/loadready/shared/ProofPanel";
import { isTrackable } from "@/lib/tracking/rules";
import { RateSheet, RatingLine } from "@/components/loadready/shared/RateSheet";
import { lazy, Suspense } from "react";

/*
 * The dispatcher's live view, reconnected at last (F-78).
 *
 * It was orphaned in H2 when the invented job list went, and left disconnected
 * in H3 on purpose: it ran on a simulator, and hanging that off a real
 * assignment would have drawn a fictional route over a real escort. It now
 * shows the positions the pilot's device actually reported.
 */
const LiveTrip = lazy(() =>
  import("@/components/loadready/live/LiveTrip").then((m) => ({ default: m.LiveTrip })),
);
import type { Load } from "@/lib/marketplace/types";
import type { Job } from "@/lib/marketplace/assignments-api";
import { EmptyState, ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";

/**
 * The dispatcher's own loads, and who wants them.
 *
 * Replaces a list that read from the browser's own storage and showed jobs no
 * pilot could ever see. This reads the same store the board does, so what is
 * here is what is out there.
 *
 * Applicants are shown with their price, badges and experience — and **no way
 * to contact them**. The phone number appears when one is hired, and not
 * before (ADR-8).
 */

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  open: "Taking offers",
  partially_filled: "Partly filled",
  filled: "Filled",
  in_progress: "In progress",
  completed: "Finished",
  cancelled: "Cancelled",
};

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "cancelled"
      ? "bg-destructive/10 text-destructive"
      : status === "filled" || status === "completed"
        ? "bg-success/10 text-success"
        : status === "draft"
          ? "bg-surface text-muted-foreground"
          : "bg-accent text-primary";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/**
 * One hired pilot, and where their job has got to.
 *
 * The dispatcher watches rather than drives: the status comes from the pilot,
 * who is the only one who knows whether they are standing at the yard. What a
 * dispatcher can do is ring them, print the sheet, cancel with a reason, or —
 * once the pickup window has closed — record that they never came.
 */
function HiredPilot({
  job,
  load,
  onChanged,
  onSheet,
  onRate,
  onLive,
  onChat,
}: {
  job: Job;
  load: Load;
  onChanged: (job: Job) => void;
  onSheet: () => void;
  onRate: () => void;
  onLive: () => void;
  onChat: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"cancel" | "no-show" | null>(null);
  const [reason, setReason] = useState("");

  const { assignment: a, pilot } = job;
  const slot = load.slots.find((s) => s.id === a.slotId);
  const noShow = canMarkNoShow(a, load.pickupTo);
  const finished = a.status === "completed" || a.status === "cancelled";

  const act = async (what: "cancel" | "no-show") => {
    setBusy(true);
    setError(null);
    try {
      const res =
        what === "cancel" ? await jobsApi.cancel(a.id, reason) : await jobsApi.noShow(a.id, reason);
      onChanged(res.job);
      setMode(null);
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    }
    setBusy(false);
  };

  return (
    <div
      className={`rounded-2xl border p-4 ${
        a.status === "cancelled" ? "border-border bg-surface" : "border-success/30 bg-success/5"
      }`}
    >
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
        <span className="text-sm font-semibold">{pilot.businessName || pilot.name}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {slot ? serviceLabel(slot.service) : ""}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <span className="rounded-full bg-background px-2.5 py-1 text-[11px] font-semibold">
          {a.noShow ? "Did not arrive" : statusLabel(a.status)}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {api.formatMoney(a.agreedAmountCents)}
          {a.milesDriven !== null ? ` · ${a.milesDriven} mi` : ""}
        </span>
      </div>

      {/* Revealed by the assignment, and only by it. */}
      {pilot.phone && (
        <a
          href={`tel:${pilot.phone}`}
          className="mt-2 flex items-center gap-1.5 text-sm text-primary"
        >
          <Phone className="h-3.5 w-3.5" aria-hidden /> {pilot.phone}
        </a>
      )}
      {pilot.vehicle && <div className="text-[11px] text-muted-foreground">{pilot.vehicle}</div>}

      {a.completionNotes && (
        <p className="mt-2 rounded-xl bg-background p-2.5 text-[11px]">{a.completionNotes}</p>
      )}
      {a.status === "cancelled" && a.cancellationReason && (
        <p className="mt-2 rounded-xl bg-background p-2.5 text-[11px]">
          {a.cancelledBy === "pilot" ? "The pilot cancelled" : "You cancelled"}:{" "}
          {a.cancellationReason}
          {a.cancellationNoticeHours !== null
            ? ` (${a.cancellationNoticeHours} hours of notice)`
            : ""}
        </p>
      )}

      <div className="mt-2 flex gap-2">
        {isTrackable(a.status) && (
          <button
            onClick={onLive}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background text-xs font-semibold"
          >
            <Satellite className="h-3.5 w-3.5" aria-hidden /> Live
          </button>
        )}
        <button
          onClick={onSheet}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background text-xs font-semibold"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden /> Job sheet
        </button>
        {a.status === "completed" &&
          (job.youHaveRated ? (
            job.ratings.theirs ? (
              <div className="flex-1">
                <RatingLine score={job.ratings.theirs.score} comment={job.ratings.theirs.comment} />
              </div>
            ) : (
              <span className="flex-1 self-center text-[11px] text-muted-foreground">
                Rated. Theirs shows when they rate you.
              </span>
            )
          ) : (
            <button
              onClick={onRate}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background text-xs font-semibold"
            >
              <Star className="h-3.5 w-3.5" aria-hidden /> Rate
            </button>
          ))}
      </div>

      <button
        onClick={onChat}
        className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-border bg-background text-xs font-semibold"
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Messages
        {job.unreadMessages > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {job.unreadMessages}
          </span>
        )}
      </button>

      {job.proofs.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <ProofPanel job={job} onChanged={onChanged} canAdd={!finished} />
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
        (mode ? (
          <div className="mt-2 flex gap-2">
            <input
              aria-label={mode === "cancel" ? "Why you are cancelling" : "What happened"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={mode === "cancel" ? "Why — the pilot is told" : "What happened"}
              className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs"
            />
            <button
              disabled={busy}
              onClick={() => void act(mode)}
              className="h-9 rounded-lg bg-destructive px-3 text-[11px] font-semibold text-destructive-foreground disabled:opacity-50"
            >
              {mode === "cancel" ? "Cancel job" : "Record it"}
            </button>
          </div>
        ) : (
          <div className="mt-2 flex gap-3">
            <button
              onClick={() => setMode("cancel")}
              className="h-8 text-[11px] font-semibold text-muted-foreground"
            >
              Cancel this job
            </button>
            {/*
              A no-show is a mark on somebody's record, so the button is not
              there to press while the pilot is merely expected — and when it is
              missing, the reason is on screen rather than left a mystery.
            */}
            {noShow.ok ? (
              <button
                onClick={() => setMode("no-show")}
                className="flex h-8 items-center gap-1 text-[11px] font-semibold text-destructive"
              >
                <UserX className="h-3 w-3" aria-hidden /> They did not turn up
              </button>
            ) : (
              a.status === "assigned" && (
                <span className="self-center text-[11px] text-muted-foreground">
                  {noShow.reason}
                </span>
              )
            )}
          </div>
        ))}
    </div>
  );
}

function ApplicantsSheet({ load, onClose }: { load: Load; onClose: () => void }) {
  const [data, setData] = useState<offersApi.Applicants | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [sheet, setSheet] = useState<Job | null>(null);
  const [rating, setRating] = useState<Job | null>(null);
  const [live, setLive] = useState<Job | null>(null);
  const [chat, setChat] = useState<Job | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [applicants, all] = await Promise.all([
        offersApi.applicantsFor(load.id),
        jobsApi.myJobs(),
      ]);
      setData(applicants);
      setJobs(all.filter((j) => j.assignment.loadId === load.id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the applicants.");
    }
  }, [load.id]);

  const replace = (job: Job) => {
    setJobs((current) => current.map((j) => (j.assignment.id === job.assignment.id ? job : j)));
    if (sheet?.assignment.id === job.assignment.id) setSheet(job);
    if (rating?.assignment.id === job.assignment.id) setRating(job);
    if (live?.assignment.id === job.assignment.id) setLive(job);
    if (chat?.assignment.id === job.assignment.id) setChat(job);
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hire = async (offerId: string) => {
    setBusy(offerId);
    setError(null);
    try {
      await offersApi.acceptOffer(offerId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not hire that pilot.");
    }
    setBusy(null);
  };

  const decline = async (offerId: string) => {
    setBusy(offerId);
    try {
      await offersApi.declineOffer(offerId, reason);
      setDeclining(null);
      setReason("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not decline that offer.");
    }
    setBusy(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Applicants for ${load.reference}`}
        className="flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-3xl bg-background"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 pt-4 pb-3">
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground">{load.reference}</div>
            <h3 className="font-bold">{load.title}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {!data ? (
            <LoadingState message="Loading applicants…" />
          ) : (
            <>
              {/* ── who you have hired, and how their job is going ──────── */}
              {jobs.length > 0 && (
                <section>
                  <h4 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Hired
                  </h4>
                  <div className="space-y-2">
                    {jobs.map((job) => (
                      <HiredPilot
                        key={job.assignment.id}
                        job={job}
                        load={load}
                        onChanged={replace}
                        onSheet={() => setSheet(job)}
                        onRate={() => setRating(job)}
                        onLive={() => setLive(job)}
                        onChat={() => setChat(job)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* ── who wants it ────────────────────────────────────────── */}
              <section>
                <h4 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Offers
                </h4>
                {data.applicants.length === 0 ? (
                  <EmptyState
                    icon={Package}
                    title="Nobody yet"
                    message="Pilots who work these regions and carry what the positions need can see this load. Offers appear here."
                  />
                ) : (
                  <div className="space-y-2">
                    {data.applicants.map(({ offer, pilot }) => {
                      const slot = load.slots.find((s) => s.id === offer.slotId);
                      return (
                        <div
                          key={offer.id}
                          className="rounded-2xl border border-border bg-surface p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">
                                {pilot.displayName}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {slot ? serviceLabel(slot.service) : ""}
                                {pilot.city && pilot.region
                                  ? ` · ${pilot.city}, ${regionName(pilot.region)}`
                                  : ""}
                                {pilot.yearsExperience ? ` · ${pilot.yearsExperience} years` : ""}
                              </div>
                            </div>
                            <div className="shrink-0 text-lg font-bold text-success">
                              {api.formatMoney(offer.amountCents)}
                            </div>
                          </div>

                          {pilot.badges.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {pilot.badges.map((b) => (
                                <span
                                  key={b}
                                  className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-primary"
                                >
                                  {b}
                                </span>
                              ))}
                            </div>
                          )}

                          {offer.pickupEstimate && (
                            <div className="mt-1.5 text-[11px] text-muted-foreground">
                              At the pickup: {offer.pickupEstimate}
                            </div>
                          )}
                          {offer.notes && <p className="mt-1 text-xs">{offer.notes}</p>}

                          <div className="mt-3 flex gap-2">
                            <button
                              disabled={busy === offer.id}
                              onClick={() => void hire(offer.id)}
                              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-50"
                            >
                              {busy === offer.id && (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              )}
                              Hire
                            </button>
                            <button
                              disabled={busy === offer.id}
                              onClick={() => setDeclining(declining === offer.id ? null : offer.id)}
                              className="h-10 flex-1 rounded-full border border-border text-xs font-semibold disabled:opacity-50"
                            >
                              Decline
                            </button>
                          </div>

                          {declining === offer.id && (
                            <div className="mt-2 flex gap-2">
                              <input
                                aria-label="Reason, optional"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Reason (optional) — it helps them bid better"
                                className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs"
                              />
                              <button
                                onClick={() => void decline(offer.id)}
                                className="h-9 rounded-lg bg-destructive px-3 text-[11px] font-semibold text-destructive-foreground"
                              >
                                Send
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {live && (
        <Suspense fallback={null}>
          <LiveTrip job={live} role="dispatcher" onClose={() => setLive(null)} />
        </Suspense>
      )}
      {chat && (
        <JobChat
          assignmentId={chat.assignment.id}
          counterpartName={chat.pilot.businessName || chat.pilot.name || "The pilot"}
          onClose={() => {
            setChat(null);
            void refresh();
          }}
        />
      )}
      {sheet && <JobSheet job={sheet} onClose={() => setSheet(null)} />}
      {rating && (
        <RateSheet
          job={rating}
          about={rating.pilot.businessName || rating.pilot.name || "the pilot"}
          onClose={() => setRating(null)}
          onDone={replace}
        />
      )}
    </div>
  );
}

export function MyLoads({ onPostLoad }: { onPostLoad: () => void }) {
  const [loads, setLoads] = useState<Load[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Load | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoads((await api.myLoads()).loads);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your jobs.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error && !loads) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!loads) return <LoadingState message="Loading your loads…" />;

  if (loads.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No loads yet"
        message="Post an escort job and every verified pilot who works those regions and carries what the positions need will see it."
        action={{ label: "Post a load", onClick: onPostLoad }}
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => void refresh()}
          aria-label="Refresh"
          className="flex h-9 items-center gap-1.5 rounded-lg bg-surface px-3 text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="space-y-2">
        {loads.map((l) => {
          const filled = l.slots.filter((s) => s.assignedPilotId).length;
          return (
            <button
              key={l.id}
              onClick={() => setOpen(l)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left hover:border-primary/40"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-muted-foreground">{l.reference}</div>
                <div className="truncate text-sm font-semibold">{l.title}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {l.origin.city} → {l.destination.city} · {filled} of {l.slots.length} filled
                </div>
              </div>
              <StatusPill status={l.status} />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>

      {open && (
        <ApplicantsSheet
          load={open}
          onClose={() => {
            setOpen(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

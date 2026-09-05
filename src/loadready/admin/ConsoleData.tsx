import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileWarning,
  Mail,
  RefreshCw,
  Scale,
  Users,
} from "lucide-react";
import { ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";
import * as api from "@/lib/marketplace/api";
import type { Funnels } from "@/server/growth.server";
import type { Stage } from "@/lib/growth/funnel";

/**
 * The console, on real numbers.
 *
 * Everything here used to come from a copy of the app's own localStorage: a
 * dashboard that changed when you cleared your browser and said nothing about
 * the business. These come from the same files the product writes to.
 *
 * A figure we cannot compute honestly is shown as "—" rather than as a zero. A
 * fill rate of 0% on a marketplace with nothing posted reads as a failure; it
 * is not one.
 */

interface Overview {
  people: {
    total: number;
    pilots: number;
    dispatchers: number;
    awaitingApproval: number;
    verificationBacklog: number;
    signedUpThisWeek: number;
  };
  work: {
    loads: Record<string, number>;
    activeEscorts: number;
    fillRate: number | null;
    medianHoursToFill: number | null;
    assignments: { total: number; completed: number; cancelled: number; noShows: number };
  };
  money: {
    entitled: number;
    trialing: number;
    pastDue: number;
    comped: number;
    suspended: number;
  };
  health: { emailConfigured: boolean; deadLetters: number; legalNotReady: number };
}

interface JobRow {
  assignmentId: string;
  reference: string;
  title: string;
  route: string;
  status: string;
  noShow: boolean;
  agreedAmountCents: number;
  createdAt: string;
}

interface AuditEntry {
  id: string;
  at: string;
  actorEmail: string;
  action: string;
  subject: string;
  detail: string;
}

interface Health {
  email: {
    configured: boolean;
    deadLetters: Array<{
      id: string;
      to: string;
      subjectLine: string;
      attempts: number;
      lastError: string | null;
      updatedAt: string;
    }>;
  };
  legal: { ready: boolean; blocking: Array<{ kind: string; isDraft: boolean }> };
}

function useAdmin<T>(view: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin?view=${encodeURIComponent(view)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Could not load that.");
      setData((await res.json()) as T);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that.");
    }
  }, [view]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, error, refresh };
}

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "warn" | "good";
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-bold ${
          tone === "warn" ? "text-destructive" : tone === "good" ? "text-success" : ""
        }`}
      >
        {value}
      </div>
      {note && <div className="mt-0.5 text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}

const orDash = (n: number | null, suffix = "") => (n === null ? "—" : `${n}${suffix}`);

export function ConsoleOverview({ onJump }: { onJump: (id: string) => void }) {
  const { data, error, refresh } = useAdmin<{ overview: Overview }>("overview");

  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!data) return <LoadingState message="Counting…" />;

  const o = data.overview;
  const loads = o.work.loads;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          onClick={() => void refresh()}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-background px-3 text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Right now
        </h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="Escorts under way"
            value={String(o.work.activeEscorts)}
            note="On the road at this moment"
          />
          <Tile label="Loads taking offers" value={String(loads.open + loads.partially_filled)} />
          <Tile
            label="Waiting for approval"
            value={String(o.people.awaitingApproval)}
            tone={o.people.awaitingApproval > 0 ? "warn" : undefined}
            note={o.people.awaitingApproval > 0 ? "Nobody can work until you decide" : undefined}
          />
          <Tile
            label="Profiles in review"
            value={String(o.people.verificationBacklog)}
            tone={o.people.verificationBacklog > 0 ? "warn" : undefined}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          The marketplace
        </h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* Null, not zero: "nothing posted yet" is not a 0% fill rate. */}
          <Tile
            label="Fill rate"
            value={orDash(o.work.fillRate, "%")}
            note="Of everything posted"
          />
          <Tile
            label="Median time to fill"
            value={
              o.work.medianHoursToFill === null
                ? "—"
                : o.work.medianHoursToFill < 1
                  ? "under an hour"
                  : `${Math.round(o.work.medianHoursToFill)} h`
            }
            note="From posting to the first hire"
          />
          <Tile label="Jobs finished" value={String(o.work.assignments.completed)} />
          <Tile
            label="Cancelled"
            value={String(o.work.assignments.cancelled)}
            note={
              o.work.assignments.noShows > 0 ? `${o.work.assignments.noShows} no-show` : undefined
            }
            tone={o.work.assignments.noShows > 0 ? "warn" : undefined}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          People
        </h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Pilots" value={String(o.people.pilots)} />
          <Tile label="Dispatchers" value={String(o.people.dispatchers)} />
          <Tile label="Joined this week" value={String(o.people.signedUpThisWeek)} />
          <Tile
            label="Pilots who can take work"
            value={String(o.money.entitled)}
            note={o.money.comped > 0 ? `${o.money.comped} on a comp` : undefined}
          />
        </div>
      </section>

      {/* The things that are wrong, listed only when they are. */}
      {(!o.health.emailConfigured || o.health.deadLetters > 0 || o.health.legalNotReady > 0) && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Needs attention
          </h3>
          <div className="space-y-2">
            {!o.health.emailConfigured && (
              <button
                onClick={() => onJump("health")}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left"
              >
                <Mail className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                <span className="flex-1 text-sm">
                  No email provider is configured. Nothing is being sent — every message says so in
                  its own log rather than vanishing.
                </span>
              </button>
            )}
            {o.health.deadLetters > 0 && (
              <button
                onClick={() => onJump("health")}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left"
              >
                <FileWarning className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                <span className="flex-1 text-sm">
                  {o.health.deadLetters} message{o.health.deadLetters === 1 ? "" : "s"} never got
                  through after every retry.
                </span>
              </button>
            )}
            {o.health.legalNotReady > 0 && (
              <button
                onClick={() => onJump("legal")}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left"
              >
                <Scale className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                <span className="flex-1 text-sm">
                  {o.health.legalNotReady} polic{o.health.legalNotReady === 1 ? "y is" : "ies are"}{" "}
                  still a draft or still carry an unfilled placeholder.
                </span>
              </button>
            )}
          </div>
        </section>
      )}

      <p className="text-[11px] text-muted-foreground">
        Counted from the live stores when this page loaded. A dash means there is nothing to average
        yet, not zero.
      </p>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  assigned: "Assigned",
  en_route: "On the way",
  on_site: "At the pickup",
  escorting: "Escorting",
  completed: "Finished",
  cancelled: "Cancelled",
};

/**
 * Where people stop.
 *
 * The rest of this console reports totals. This is the only screen that
 * answers the question a founder acts on — which step is losing people — and
 * it is deliberately blunt about not knowing: below twenty at a stage there is
 * no percentage, because a rate computed from four people is a coincidence
 * with a decimal point in it.
 */
export function ConsoleGrowth() {
  const { data, error, refresh } = useAdmin<{ funnels: Funnels }>("growth");

  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!data) return <LoadingState message="Counting…" />;

  const { pilots, dispatchers, worst } = data.funnels;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          Counted from the records the product already writes — there is no analytics service and no
          tracking. These are where people are now, not a history of how they got there.
        </p>
        <button
          onClick={() => void refresh()}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-background px-3 text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {worst ? (
        <div className="rounded-2xl border border-border bg-accent p-3">
          <p className="text-xs font-semibold">Where the week should go</p>
          <p className="mt-1 text-sm">
            {worst.side === "pilots" ? "Pilots" : "Dispatchers"} — {worst.stage.name.toLowerCase()}.{" "}
            {Math.round((1 - (worst.stage.rate ?? 0)) * 100)}% of the people who reached the step
            before it do not get through.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">
            Not enough people yet to say where the drop is. This fills in on its own.
          </p>
        </div>
      )}

      <FunnelTable title="Pilots" stages={pilots} />
      <FunnelTable title="Dispatchers" stages={dispatchers} />
    </div>
  );
}

function FunnelTable({ title, stages }: { title: string; stages: Stage[] }) {
  const top = stages[0]?.count ?? 0;

  return (
    <section className="rounded-2xl border border-border bg-background p-3">
      <h3 className="mb-2 text-sm font-bold">{title}</h3>

      {top === 0 ? (
        <p className="text-xs text-muted-foreground">Nobody yet.</p>
      ) : (
        <div className="space-y-1.5">
          {stages.map((stage, i) => (
            <div key={stage.name}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs">{stage.name}</span>
                <span className="shrink-0 text-sm font-bold tabular-nums">{stage.count}</span>
              </div>

              {/*
               * The bar is against the top of the funnel rather than the
               * previous step, so the shape of the whole thing is visible at
               * a glance instead of every row looking nearly full.
               */}
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${top === 0 ? 0 : Math.round((stage.count / top) * 100)}%` }}
                />
              </div>

              {i > 0 && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {stage.rate === null
                    ? stage.tooFewFor
                      ? `Too few to give a rate — needs ${stage.tooFewFor} at the step before.`
                      : "No rate."
                    : `${Math.round(stage.rate * 100)}% of the step before${
                        stage.lost > 0 ? `, ${stage.lost} did not get here` : ""
                      }.`}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** A load on the market, whether or not anybody has taken it. */
interface LoadRow {
  id: string;
  reference: string;
  title: string;
  route: string;
  status: string;
  positions: number;
  filled: number;
  pickupFrom: string;
  createdAt: string;
}

export function ConsoleJobs() {
  const { data, error, refresh } = useAdmin<{ jobs: JobRow[]; loads: LoadRow[] }>("jobs");

  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!data) return <LoadingState message="Loading jobs…" />;

  const loads = data.loads ?? [];

  if (data.jobs.length === 0 && loads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-background p-6 text-center">
        <Activity className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
        <p className="text-sm font-semibold">Nothing posted yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Loads appear here as soon as a dispatcher posts one, and again below once somebody is
          hired for them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          onClick={() => void refresh()}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-background px-3 text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/*
        Posted loads, whether or not anybody has taken them.

        This screen used to list assignments only, so a load nobody had bid on
        was invisible here — which is exactly the load somebody rings up about.
        No names, no phone numbers, no street addresses: the same line the rest
        of the console holds (PH-60).
      */}
      <h4 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        On the market ({loads.length})
      </h4>

      {loads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
          Nothing posted yet.
        </p>
      ) : (
        loads.map((load) => (
          <div key={load.id} className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{load.title}</p>
                <p className="text-xs text-muted-foreground">
                  {load.reference} · {load.route}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                {load.status.replace(/_/g, " ")}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {load.filled} of {load.positions} position{load.positions === 1 ? "" : "s"} filled ·
              pickup {new Date(load.pickupFrom).toLocaleDateString()}
            </p>
          </div>
        ))
      )}

      <h4 className="pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Escorts running or finished ({data.jobs.length})
      </h4>

      {data.jobs.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
          Nobody has been hired yet.
        </p>
      )}

      {data.jobs.map((job) => (
        <div key={job.assignmentId} className="rounded-xl border border-border bg-background p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-muted-foreground">{job.reference}</div>
              <div className="truncate text-sm font-semibold">{job.title}</div>
              <div className="truncate text-[11px] text-muted-foreground">{job.route}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold">{api.formatMoney(job.agreedAmountCents)}</div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase">
                {job.noShow ? "Did not arrive" : (STATUS_LABEL[job.status] ?? job.status)}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/*
        No names, no phone numbers, no positions — on purpose. This answers
        "which jobs are running", and the moment it answered "where is Alice"
        it would be a way around ADR-8 that happens to be behind a login.
      */}
      <p className="pt-1 text-[11px] text-muted-foreground">
        Names, numbers and positions are not shown here. Seeing into one job is what the dispute
        tool is for, with a reason and an audit entry.
      </p>
    </div>
  );
}

export function ConsoleHealth() {
  const { data, error, refresh } = useAdmin<Health>("health");

  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!data) return <LoadingState message="Checking…" />;

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Email
        </h3>
        <div
          className={`flex items-start gap-3 rounded-xl border p-3 ${
            data.email.configured
              ? "border-success/30 bg-success/5"
              : "border-destructive/30 bg-destructive/5"
          }`}
        >
          {data.email.configured ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          )}
          <div className="text-sm">
            {data.email.configured
              ? "A provider is configured and the queue is delivering."
              : "No provider is configured. Nothing is sent, and every message records why rather than vanishing — set RESEND_API_KEY and MAIL_FROM to turn it on."}
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Never delivered
        </h3>
        {data.email.deadLetters.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing has failed every retry. Messages that do land here rather than being deleted, so
            &quot;we told them&quot; can be checked.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.email.deadLetters.map((d) => (
              <li key={d.id} className="rounded-xl border border-border bg-background p-3 text-xs">
                <div className="font-semibold">{d.subjectLine}</div>
                <div className="text-muted-foreground">
                  {d.to} · {d.attempts} attempts · {new Date(d.updatedAt).toLocaleString()}
                </div>
                {d.lastError && <div className="mt-1 text-destructive">{d.lastError}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Legal
        </h3>
        {data.legal.ready ? (
          <p className="text-xs text-success">Every policy is published and complete.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {data.legal.blocking.map((b) => (
              <li key={b.kind} className="text-destructive">
                {b.kind} — {b.isDraft ? "still a draft" : "carries an unfilled placeholder"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        onClick={() => void refresh()}
        className="flex h-9 items-center gap-1.5 rounded-lg bg-background px-3 text-xs font-semibold"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Refresh
      </button>
    </div>
  );
}

export function ConsoleAudit() {
  const { data, error, refresh } = useAdmin<{ entries: AuditEntry[] }>("audit");
  const [filter, setFilter] = useState("");

  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!data) return <LoadingState message="Loading the log…" />;

  const term = filter.trim().toLowerCase();
  const rows = term
    ? data.entries.filter((e) =>
        [e.actorEmail, e.action, e.subject, e.detail].join(" ").toLowerCase().includes(term),
      )
    : data.entries;

  /** A file the founder can hand to somebody, without a database client. */
  const download = () => {
    const header = "at,actor,action,subject,detail\n";
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const body = rows
      .map((e) => [e.at, e.actorEmail, e.action, e.subject, e.detail].map(escape).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([header + body], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `loadready-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Filter the log</span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by person, action or subject"
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs"
          />
        </label>
        <button
          onClick={download}
          disabled={rows.length === 0}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-background px-3 text-xs font-semibold disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Export
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-background p-6 text-center">
          <Users className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-sm font-semibold">
            {term ? "Nothing matches that" : "Nothing recorded yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Every privileged action lands here — approvals, document reviews, comps, hires and
            cancellations.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((e) => (
            <li key={e.id} className="rounded-xl border border-border bg-background p-3 text-xs">
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold">{e.action}</span>
                <span className="shrink-0 text-muted-foreground">
                  {new Date(e.at).toLocaleString()}
                </span>
              </div>
              <div className="mt-0.5 text-muted-foreground">
                {e.actorEmail} · {e.subject}
              </div>
              {e.detail && <div className="mt-1">{e.detail}</div>}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground">
        The log is append-only. Nothing in the console can edit or remove an entry.
      </p>
    </div>
  );
}

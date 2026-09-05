import { useEffect } from "react";
import { Printer, X } from "lucide-react";
import * as api from "@/lib/marketplace/api";
import { serviceLabel } from "@/lib/marketplace/matching";
import { statusLabel } from "@/lib/marketplace/lifecycle";
import { detentionMs, elapsedMs, formatDuration } from "@/lib/messaging/types";
import { regionName } from "@/lib/profile/catalog";
import type { Job } from "@/lib/marketplace/assignments-api";

/**
 * The job sheet — the piece of paper that goes in the cab.
 *
 * Escort work is checked at the roadside. A trooper asking what this vehicle is
 * doing on a restricted route wants the permit numbers, the approved
 * waypoints, the speed restriction and a name to ring — on something readable
 * without a signal, which a web app on a dead phone is not.
 *
 * So it prints. `window.print()` and a print stylesheet rather than a PDF
 * library: the browser already makes good PDFs, and pulling in a renderer to
 * do what "Save as PDF" does would be weight in the bundle for nothing.
 *
 * Everything on it comes from the assignment. There is no job sheet before
 * somebody is hired, because until then there is no yard address to print.
 */

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function Line({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <div className="flex gap-3 py-1 text-sm">
      <span className="w-36 shrink-0 text-muted-foreground print:text-black">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-3 print:break-inside-avoid">
      <h3 className="mb-1 text-xs font-bold tracking-wider uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function JobSheet({ job, onClose }: { job: Job; onClose: () => void }) {
  const { assignment, load: l, pilot, company } = job;

  /*
   * Marks the page as printing this sheet, so the print stylesheet can hide
   * everything else. Cleared on close — a stray attribute would silently
   * blank the next thing the user tries to print.
   */
  useEffect(() => {
    document.body.dataset.printing = "job-sheet";
    return () => {
      delete document.body.dataset.printing;
    };
  }, []);

  if (!l) {
    return null;
  }

  const finished = assignment.status === "completed";
  const detention = detentionMs(assignment.history, finished ? null : Date.now());
  const elapsed = elapsedMs(assignment.history);
  const slot = l.slots.find((s) => s.id === assignment.slotId);
  const place = (p: typeof l.origin) =>
    [p.address, p.city, p.region ? regionName(p.region) : null, p.postalCode]
      .filter(Boolean)
      .join(", ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 print:static print:block print:bg-white"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${finished ? "Trip receipt" : "Job sheet"} for ${l.reference}`}
        data-print-root
        className="flex max-h-[92vh] w-full max-w-[520px] flex-col rounded-t-3xl bg-background print:max-h-none print:max-w-none print:rounded-none"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 pt-4 pb-3 print:hidden">
          <h3 className="font-bold">{finished ? "Trip receipt" : "Job sheet"}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden /> Print
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

        <div className="flex-1 space-y-3 overflow-y-auto p-5 print:overflow-visible print:p-0">
          <header className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold">{l.reference}</div>
              <div className="text-sm">{l.title}</div>
            </div>
            <div className="text-right text-xs">
              <div className="font-semibold">{statusLabel(assignment.status)}</div>
              <div className="text-muted-foreground print:text-black">
                {slot ? serviceLabel(slot.service) : ""}
              </div>
            </div>
          </header>

          <Section title="Permits">
            {l.permitNumbers.length === 0 ? (
              <p className="text-sm">No permit numbers on this load.</p>
            ) : (
              <ul className="text-sm font-medium">
                {l.permitNumbers.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            {l.route?.speedLimitMph && (
              <div className="mt-1 inline-block rounded border border-foreground px-2 py-0.5 text-sm font-bold">
                Permit speed limit {l.route.speedLimitMph} mph
              </div>
            )}
          </Section>

          <Section title="Route">
            <Line k="Collect from" v={place(l.origin)} />
            <Line k="Deliver to" v={place(l.destination)} />
            <Line k="Pickup window" v={`${fmtDate(l.pickupFrom)} — ${fmtDate(l.pickupTo)}`} />
            <Line k="Deliver by" v={l.deliverBy ? fmtDate(l.deliverBy) : null} />
            {l.route && l.route.waypoints.length > 0 && (
              <div className="mt-1 text-sm">
                <div className="text-muted-foreground print:text-black">Approved waypoints</div>
                <ol className="ml-4 list-decimal font-medium">
                  {l.route.waypoints.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ol>
              </div>
            )}
            {l.route?.notes && <p className="mt-1 text-sm">{l.route.notes}</p>}
          </Section>

          <Section title="The load">
            <Line k="Length" v={api.formatFeetInches(l.lengthIn)} />
            <Line k="Width" v={api.formatFeetInches(l.widthIn)} />
            <Line k="Height" v={api.formatFeetInches(l.heightIn)} />
            <Line k="Weight" v={api.formatWeight(l.weightLb)} />
            <Line k="Distance" v={l.distanceMi ? `${l.distanceMi} mi` : null} />
            {l.constraints.length > 0 && (
              <div className="mt-1 text-sm">
                <div className="text-muted-foreground print:text-black">Constraints</div>
                <ul className="ml-4 list-disc font-medium">
                  {l.constraints.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {l.notes && <p className="mt-1 text-sm">{l.notes}</p>}
          </Section>

          <Section title="Who to call">
            <Line k="Dispatcher" v={company.companyName || null} />
            <Line k="Dispatch phone" v={company.phone} />
            <Line k="USDOT" v={company.usdotNumber} />
            {l.contacts.map((c) => (
              <Line key={c.id} k={`${c.role || "On site"}`} v={`${c.name} — ${c.phone}`} />
            ))}
          </Section>

          <Section title="Escort">
            <Line k="Pilot" v={pilot.businessName || pilot.name || null} />
            <Line k="Phone" v={pilot.phone} />
            <Line k="Vehicle" v={pilot.vehicle} />
            <Line k="Agreed rate" v={api.formatMoney(assignment.agreedAmountCents)} />
          </Section>

          <Section title="Times">
            {assignment.history.map((h) => (
              <Line key={`${h.status}-${h.at}`} k={statusLabel(h.status)} v={fmtDate(h.at)} />
            ))}
            {/*
              The two numbers an invoice argument is actually about, both
              derived from timestamps the pilot set on the road rather than
              from anybody's recollection afterwards.
            */}
            <Line
              k="Waiting at the pickup"
              v={detention === null ? null : formatDuration(detention)}
            />
            <Line k="Total on the job" v={elapsed === null ? null : formatDuration(elapsed)} />
            <Line
              k="Miles run"
              v={assignment.milesDriven === null ? null : `${assignment.milesDriven} mi`}
            />
            {assignment.completionNotes && (
              <p className="mt-1 text-sm">{assignment.completionNotes}</p>
            )}
          </Section>

          {job.proofs.length > 0 && (
            <Section title="Proof">
              {job.proofs.map((proof) => (
                <Line
                  key={proof.id}
                  k={proof.kind === "photo" ? "Photo" : "Note"}
                  v={`${proof.kind === "photo" ? "Attached in the app" : proof.note}${
                    proof.position
                      ? ` — ${proof.position.lat.toFixed(4)}, ${proof.position.lng.toFixed(4)}`
                      : ""
                  } (${fmtDate(proof.createdAt)})`}
                />
              ))}
            </Section>
          )}

          <p className="pt-2 text-[10px] text-muted-foreground print:text-black">
            Printed from LoadReady on {fmtDate(new Date().toISOString())}. LoadReady connects
            dispatchers and escort operators; it is not a party to this job and does not handle
            payment for it.
          </p>
        </div>
      </div>
    </div>
  );
}

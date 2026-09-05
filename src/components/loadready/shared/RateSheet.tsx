import { useState } from "react";
import { Loader2, Star, X } from "lucide-react";
import * as jobsApi from "@/lib/marketplace/assignments-api";
import { BLIND_DAYS, MAX_SCORE, MIN_SCORE } from "@/lib/marketplace/ratings";
import type { Job } from "@/lib/marketplace/assignments-api";

/**
 * Rating the other side of a finished job.
 *
 * The screen says what the blind window is before anybody writes anything.
 * "Why can't I see theirs" is the first question a two-way rating provokes,
 * and answering it afterwards reads like an excuse.
 */

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex justify-center gap-1.5" role="radiogroup" aria-label="Score">
      {Array.from({ length: MAX_SCORE }, (_, i) => i + MIN_SCORE).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} out of ${MAX_SCORE}`}
          onClick={() => onChange(n)}
          className="flex h-12 w-12 items-center justify-center rounded-full"
        >
          <Star
            className={`h-7 w-7 ${
              n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
            }`}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}

export function RateSheet({
  job,
  about,
  onClose,
  onDone,
}: {
  job: Job;
  /** Whose work is being rated, in words the rater recognises. */
  about: string;
  onClose: () => void;
  onDone: (job: Job) => void;
}) {
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await jobsApi.rate(job.assignment.id, score, comment.trim() || undefined);
      onDone(res.job);
      setDone(
        res.visibleAt
          ? `Saved. ${about} sees it once they rate you, or on ${new Date(res.visibleAt).toLocaleDateString()}.`
          : "Saved. You have both rated, so you can each see the other's now.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your rating.");
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Rate ${about}`}
        className="w-full max-w-[420px] rounded-t-3xl bg-background p-5"
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="font-bold">How did it go?</h3>
            <p className="text-xs text-muted-foreground">
              {job.load?.reference} · {about}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <>
            <p className="py-4 text-center text-sm">{done}</p>
            <button
              onClick={onClose}
              className="h-11 w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <Stars value={score} onChange={setScore} />

            <label className="mt-4 block">
              <span className="text-xs font-semibold">Anything worth saying (optional)</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="On time, kept in touch, knew the route…"
                className="mt-1 w-full rounded-xl border border-border bg-surface p-3 text-sm"
              />
            </label>

            <p className="mt-2 rounded-xl bg-surface p-3 text-[11px] text-muted-foreground">
              Neither of you sees the other's rating until you have both written one, or{" "}
              {BLIND_DAYS} days have passed. It cannot be changed afterwards — which is what makes
              it worth reading.
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
              disabled={score < MIN_SCORE || busy}
              onClick={() => void submit()}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Send rating
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** One rating as it is shown back — the score, and what they said. */
export function RatingLine({ score, comment }: { score: number; comment: string | null }) {
  return (
    <div>
      <div className="flex gap-0.5" aria-label={`${score} out of ${MAX_SCORE}`}>
        {Array.from({ length: MAX_SCORE }, (_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${
              i < score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
            }`}
            aria-hidden
          />
        ))}
      </div>
      {comment && <p className="mt-1 text-xs">{comment}</p>}
    </div>
  );
}

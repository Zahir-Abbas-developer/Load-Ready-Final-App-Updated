import { useRef, useState } from "react";
import { Camera, Loader2, MapPin, StickyNote, Trash2 } from "lucide-react";
import * as jobsApi from "@/lib/marketplace/assignments-api";
import type { Job } from "@/lib/marketplace/assignments-api";

/**
 * Proof that the job happened as described.
 *
 * A photo of the load at the yard, or a note about a two-hour wait. Both sides
 * can add and both sides can see everything — proof only one party can read
 * settles nothing.
 *
 * The location on a photo comes from the last fix the pilot's device reported,
 * attached on the server. It is not sent from here, because the value of proof
 * is that it is not assertible: a coordinate the app types in is a claim, not
 * evidence.
 */

async function upload(file: File): Promise<string> {
  const res = await fetch("/api/files", {
    method: "POST",
    headers: { "content-type": file.type, "x-file-name": file.name },
    credentials: "include",
    body: file,
  });
  const data = (await res.json().catch(() => ({}))) as { fileId?: string; error?: string };
  if (!res.ok || !data.fileId) throw new Error(data.error ?? "That file was not accepted.");
  return data.fileId;
}

export function ProofPanel({
  job,
  onChanged,
  canAdd,
}: {
  job: Job;
  onChanged: (job: Job) => void;
  /** Off once the job is over: the record closes with it. */
  canAdd: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [writing, setWriting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addPhoto = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fileId = await upload(file);
      onChanged((await jobsApi.addProof(job.assignment.id, { kind: "photo", fileId })).job);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that.");
    }
    setBusy(false);
  };

  const addNote = async () => {
    setBusy(true);
    setError(null);
    try {
      onChanged((await jobsApi.addProof(job.assignment.id, { kind: "note", note })).job);
      setNote("");
      setWriting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that.");
    }
    setBusy(false);
  };

  const remove = async (proofId: string) => {
    setBusy(true);
    try {
      onChanged((await jobsApi.removeProof(job.assignment.id, proofId)).job);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove that.");
    }
    setBusy(false);
  };

  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Proof
      </h4>

      {job.proofs.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nothing attached yet. A photo at the yard or a note about a delay is what settles an
          argument three weeks later.
        </p>
      ) : (
        <ul className="space-y-2">
          {job.proofs.map((proof) => (
            <li key={proof.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start gap-2">
                {proof.kind === "photo" ? (
                  <Camera className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                ) : (
                  <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                )}
                <div className="min-w-0 flex-1 text-xs">
                  <div className="font-medium">{proof.kind === "photo" ? "Photo" : proof.note}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(proof.createdAt).toLocaleString()}
                  </div>
                  {proof.position && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {proof.position.lat.toFixed(4)}, {proof.position.lng.toFixed(4)}
                    </div>
                  )}
                </div>
                {canAdd && (
                  <button
                    onClick={() => void remove(proof.id)}
                    aria-label="Remove this"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-background"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div role="alert" className="mt-2 text-[11px] text-destructive">
          {error}
        </div>
      )}

      {canAdd && (
        <div className="mt-2">
          {writing ? (
            <div className="flex gap-2">
              <input
                aria-label="What happened"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Detained two hours, gate locked…"
                className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs"
              />
              <button
                disabled={busy || !note.trim()}
                onClick={() => void addNote()}
                className="h-9 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                Add
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <label className="flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border bg-background text-xs font-semibold">
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" aria-hidden />
                )}
                Add a photo
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void addPhoto(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                onClick={() => setWriting(true)}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background text-xs font-semibold"
              >
                <StickyNote className="h-3.5 w-3.5" aria-hidden /> Add a note
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

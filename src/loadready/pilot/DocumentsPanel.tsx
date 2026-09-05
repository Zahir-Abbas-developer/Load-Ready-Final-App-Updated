import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import {
  DOCUMENT_TYPES,
  REGIONS,
  documentLabel,
  regionName,
  type DocumentTypeId,
} from "@/lib/profile/catalog";
import { daysUntilExpiry } from "@/lib/profile/completion";
import type { PilotCertification, PilotDocument, PilotRecord } from "@/lib/profile/types";
import * as api from "@/lib/profile/api";
import { ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";

/**
 * Documents and certifications, held by the server.
 *
 * The screen this replaces said "Upload your licence and insurance" and had no
 * file input at all — every document was a row of typed text in the pilot's own
 * browser, invisible to the administrator being asked to verify them. This is
 * the first version where the word "upload" is true.
 */

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

function StatusPill({ doc }: { doc: PilotDocument }) {
  const tone =
    doc.status === "approved"
      ? "bg-success/10 text-success"
      : doc.status === "rejected" || doc.status === "expired"
        ? "bg-destructive/10 text-destructive"
        : "bg-surface text-muted-foreground";
  const label =
    doc.status === "approved"
      ? "Approved"
      : doc.status === "rejected"
        ? "Rejected"
        : doc.status === "expired"
          ? "Expired"
          : "In review";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

/** Opens the stored file in a new tab, fetching a fresh link at the moment of the click. */
function ViewFile({ fileId }: { fileId: string }) {
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    const url = await api.signedFileUrl(fileId);
    setBusy(false);
    // Links expire in five minutes, so one is fetched per click rather than
    // rendered into the page and left to go stale.
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      onClick={() => void open()}
      className="flex items-center gap-1 text-[11px] font-semibold text-primary"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
      View
    </button>
  );
}

function DocumentRow({ doc, onRemove }: { doc: PilotDocument; onRemove: () => void }) {
  const days = daysUntilExpiry(doc);

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{documentLabel(doc.docType)}</div>
          <div className="truncate text-[11px] text-muted-foreground">{doc.fileName}</div>
        </div>
        <StatusPill doc={doc} />
      </div>

      {doc.expiryDate && (
        <div
          className={`mt-1.5 text-[11px] ${
            days !== null && days <= 30 ? "font-semibold text-destructive" : "text-muted-foreground"
          }`}
        >
          {days !== null && days < 0
            ? `Expired ${Math.abs(days)} days ago`
            : days !== null && days <= 30
              ? `Expires in ${days} days — upload a new one`
              : `Expires ${doc.expiryDate}`}
        </div>
      )}

      {doc.rejectionReason && (
        <p className="mt-2 rounded-lg bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          {doc.rejectionReason}
        </p>
      )}

      <div className="mt-2 flex items-center gap-3">
        {doc.fileId && <ViewFile fileId={doc.fileId} />}
        <button
          onClick={onRemove}
          className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" /> Remove
        </button>
      </div>
    </div>
  );
}

export function DocumentsPanel({ onChanged }: { onChanged?: (r: api.ProfileResponse) => void }) {
  const [data, setData] = useState<api.ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [docType, setDocType] = useState<DocumentTypeId>("drivers-license");
  const [expiry, setExpiry] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const [certRegion, setCertRegion] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [certExpiry, setCertExpiry] = useState("");

  const publish = useCallback(
    (next: api.ProfileResponse) => {
      setData(next);
      onChanged?.(next);
    },
    [onChanged],
  );

  const refresh = useCallback(async () => {
    try {
      publish(await api.loadProfile());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your documents.");
    }
  }, [publish]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedType = DOCUMENT_TYPES.find((d) => d.id === docType);

  const upload = async (file: File) => {
    if (selectedType?.expiryRequired && !expiry) {
      setError("Add the expiry date. A certificate with no end date cannot be checked.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const uploaded = await api.uploadFile(file);
      publish(
        await api.addDocument({
          docType,
          documentNumber: docNumber || null,
          expiryDate: expiry || null,
          fileId: uploaded.fileId,
          fileName: uploaded.fileName,
        }),
      );
      setExpiry("");
      setDocNumber("");
      if (fileInput.current) fileInput.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "That upload failed.");
    }
    setBusy(false);
  };

  const removeDoc = async (id: string) => {
    setBusy(true);
    try {
      publish(await api.removeDocument(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove that.");
    }
    setBusy(false);
  };

  const addCert = async () => {
    if (!certRegion) return;
    setBusy(true);
    setError(null);
    try {
      publish(
        await api.addCertification({
          region: certRegion,
          certNumber: certNumber || null,
          expiryDate: certExpiry || null,
        }),
      );
      setCertRegion("");
      setCertNumber("");
      setCertExpiry("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that certification.");
    }
    setBusy(false);
  };

  const removeCert = async (id: string) => {
    setBusy(true);
    try {
      publish(await api.removeCertification(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove that.");
    }
    setBusy(false);
  };

  if (!data && error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!data) return <LoadingState message="Loading your documents…" />;

  const record: PilotRecord = data.record;

  const field = "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm";

  return (
    <div className="space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* ── documents ────────────────────────────────────────────────── */}
      <section>
        <h4 className="mb-2 text-sm font-semibold">Documents</h4>
        {record.documents.length === 0 ? (
          <p className="mb-3 text-xs text-muted-foreground">
            Nothing uploaded yet. Your driving licence and certificate of insurance are the two you
            need before an administrator can review you.
          </p>
        ) : (
          <div className="mb-3 space-y-2">
            {record.documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} onRemove={() => void removeDoc(doc.id)} />
            ))}
          </div>
        )}

        <div className="space-y-2 rounded-2xl border border-dashed border-border p-3">
          <div className="text-xs font-semibold">Add a document</div>
          <select
            aria-label="Document type"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocumentTypeId)}
            className={field}
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            aria-label="Document number"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            placeholder="Licence or policy number (optional)"
            className={field}
          />
          <div>
            <label htmlFor="doc-expiry" className="mb-1 block text-[11px] text-muted-foreground">
              Expiry date{selectedType?.expiryRequired ? "" : " (optional)"}
            </label>
            <input
              id="doc-expiry"
              type="date"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className={field}
            />
          </div>

          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            aria-label="Choose a file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Choose a photo or PDF
          </button>
          <p className="text-[11px] text-muted-foreground">
            JPEG, PNG, WebP or PDF, up to 10 MB. A clear phone photo of the page is fine. Only you
            and LoadReady administrators can open it.
          </p>
        </div>
      </section>

      {/* ── certifications ───────────────────────────────────────────── */}
      <section>
        <h4 className="mb-2 text-sm font-semibold">Certifications</h4>
        <p className="mb-2 text-xs text-muted-foreground">
          One per state or province you are certified in. Dispatchers can only offer you loads in
          regions you hold a certification for.
        </p>

        {record.certifications.length > 0 && (
          <div className="mb-3 space-y-2">
            {record.certifications.map((c: PilotCertification) => (
              <div
                key={c.id}
                className="flex items-start justify-between gap-2 rounded-2xl border border-border bg-surface p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{regionName(c.region)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.certNumber ? `No. ${c.certNumber}` : "No number given"}
                    {c.expiryDate ? ` · expires ${c.expiryDate}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => void removeCert(c.id)}
                  aria-label={`Remove ${regionName(c.region)} certification`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 rounded-2xl border border-dashed border-border p-3">
          <div className="text-xs font-semibold">Add a certification</div>
          <select
            aria-label="State or province"
            value={certRegion}
            onChange={(e) => setCertRegion(e.target.value)}
            className={field}
          >
            <option value="">Choose a state or province…</option>
            <optgroup label="United States">
              {REGIONS.filter((r) => r.country === "US").map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Canada">
              {REGIONS.filter((r) => r.country === "CA").map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          </select>
          <input
            aria-label="Certification number"
            value={certNumber}
            onChange={(e) => setCertNumber(e.target.value)}
            placeholder="Certification number (optional)"
            className={field}
          />
          <input
            aria-label="Certification expiry"
            type="date"
            value={certExpiry}
            onChange={(e) => setCertExpiry(e.target.value)}
            className={field}
          />
          <button
            type="button"
            disabled={busy || !certRegion}
            onClick={() => void addCert()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary text-sm font-semibold text-primary disabled:opacity-50"
          >
            <FileText className="h-4 w-4" /> Add certification
          </button>
        </div>
      </section>
    </div>
  );
}

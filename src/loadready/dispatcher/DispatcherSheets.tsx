import { useEffect, useMemo, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Building2,
  FileText,
  ShieldCheck,
  AlertCircle,
  Send,
  CheckCircle2,
  Clock,
  Trash2,
  Upload,
} from "lucide-react";
import {
  loadDispatcherState,
  saveDispatcherState,
  recomputeDispatcherCompletion,
  type DispatcherState,
  type DispatcherDocument,
  type DocStatus,
} from "@/lib/dispatcher/demo-store";

// ───────── Sheet shell ─────────
function Sheet({
  children,
  onClose,
  title,
  footer,
  width = "max-w-[420px]",
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  footer?: React.ReactNode;
  width?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${width} bg-background rounded-t-3xl max-h-[92vh] flex flex-col`}
      >
        <div className="sticky top-0 bg-background z-10 flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <h3 className="font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-surface flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-border bg-background">{footer}</div>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-foreground mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 px-3 rounded-xl bg-surface border border-border focus:border-primary text-sm"
      />
    </div>
  );
}

/** The status of a business document. Nothing else has a pill here any more. */
function Pill({ s }: { s: DocStatus }) {
  const map: Record<DocStatus, string> = {
    approved: "bg-success/15 text-success",
    pending: "bg-accent text-primary",
    rejected: "bg-destructive/15 text-destructive",
    expired: "bg-destructive/15 text-destructive",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${map[s]}`}
    >
      {s.replace(/_/g, " ")}
    </span>
  );
}

// ───────── 1) Business verification wizard ─────────
const STEPS = ["Company", "Tax & Authority", "Documents", "Billing"] as const;

/** The wizard has four steps, and only four. */
type Step = 0 | 1 | 2 | 3;

export function BusinessVerificationWizard({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<DispatcherState>(() => loadDispatcherState());
  /*
   * The four steps of the wizard, as a type rather than a number.
   *
   * It was widened away with `as any` at both call sites, which meant the one
   * thing the type existed to prevent — stepping past the end — was exactly
   * what nothing checked. Clamped instead.
   */
  const [idx, setIdx] = useState<Step>(0);
  const completion = useMemo(() => recomputeDispatcherCompletion(state), [state]);

  const update = (next: DispatcherState) => {
    next.profile.completion_pct = recomputeDispatcherCompletion(next);
    setState(next);
    saveDispatcherState(next);
  };

  useEffect(() => {
    update({ ...state }); /* eslint-disable-next-line */
  }, [idx]);

  const submit = () => {
    update({ ...state, profile: { ...state.profile, verification_status: "in_review" } });
    onClose();
  };

  return (
    <Sheet
      title="Business verification"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          {idx > 0 && (
            <button
              onClick={() => setIdx((i) => Math.max(0, i - 1) as Step)}
              className="h-11 px-4 rounded-full border border-border text-sm font-semibold flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          )}
          {idx < 3 ? (
            <button
              onClick={() => setIdx((i) => Math.min(3, i + 1) as Step)}
              className="flex-1 h-11 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1"
            >
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={submit}
              className="flex-1 h-11 rounded-full bg-foreground text-background text-sm font-semibold flex items-center justify-center gap-1"
            >
              <Send className="h-4 w-4" /> Submit for review
            </button>
          )}
        </div>
      }
    >
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-muted-foreground">
            Step {idx + 1} of {STEPS.length} · {STEPS[idx]}
          </div>
          <div className="text-xs font-semibold text-primary">{completion}% complete</div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${completion}%` }} />
        </div>
        <div className="flex gap-1 mt-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= idx ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>
      </div>

      {idx === 0 && <CompanyStep state={state} update={update} />}
      {idx === 1 && <TaxAuthorityStep state={state} update={update} />}
      {idx === 2 && <DispatcherDocsStep state={state} update={update} />}
      {idx === 3 && <BillingStep state={state} update={update} />}
    </Sheet>
  );
}

function CompanyStep({
  state,
  update,
}: {
  state: DispatcherState;
  update: (s: DispatcherState) => void;
}) {
  const p = state.profile;
  const set = (patch: Partial<typeof p>) => update({ ...state, profile: { ...p, ...patch } });
  return (
    <div className="space-y-3">
      <Field
        label="Company name (DBA)"
        value={p.company_name}
        onChange={(v) => set({ company_name: v })}
      />
      <Field
        label="Legal name"
        value={p.legal_name}
        onChange={(v) => set({ legal_name: v })}
        placeholder="Anton Heavy Logistics LLC"
      />
      <Field
        label="Website"
        value={p.website ?? ""}
        onChange={(v) => set({ website: v })}
        placeholder="https://"
      />
      <Field
        label="Primary contact"
        value={p.contact_name}
        onChange={(v) => set({ contact_name: v })}
      />
      <Field
        label="Contact phone"
        value={p.contact_phone}
        onChange={(v) => set({ contact_phone: v })}
        placeholder="+1 …"
      />
    </div>
  );
}

function TaxAuthorityStep({
  state,
  update,
}: {
  state: DispatcherState;
  update: (s: DispatcherState) => void;
}) {
  const p = state.profile;
  const set = (patch: Partial<typeof p>) => update({ ...state, profile: { ...p, ...patch } });
  return (
    <div className="space-y-3">
      <Field
        label="EIN (Employer ID)"
        value={p.ein ?? ""}
        onChange={(v) => set({ ein: v })}
        placeholder="XX-XXXXXXX"
      />
      <Field
        label="MC Number (Motor Carrier)"
        value={p.mc_number ?? ""}
        onChange={(v) => set({ mc_number: v })}
        placeholder="MC-XXXXXX"
      />
      <Field
        label="DOT Number"
        value={p.dot_number ?? ""}
        onChange={(v) => set({ dot_number: v })}
        placeholder="DOT-XXXXXXX"
      />
      <div className="rounded-xl bg-accent border border-primary/20 p-3 text-xs">
        We verify MC/DOT against FMCSA records. Mismatched numbers will block load posting until
        resolved.
      </div>
    </div>
  );
}

function DispatcherDocsStep({
  state,
  update,
}: {
  state: DispatcherState;
  update: (s: DispatcherState) => void;
}) {
  const [type, setType] = useState("W-9");
  const [num, setNum] = useState("");
  const [exp, setExp] = useState("");
  const add = () => {
    if (!type) return;
    const doc: DispatcherDocument = {
      id: crypto.randomUUID(),
      doc_type: type,
      document_number: num || null,
      issuing_authority: null,
      expiry_date: exp || null,
      file_url: null,
      status: "pending",
      rejection_reason: null,
      created_at: new Date().toISOString(),
    };
    update({ ...state, documents: [doc, ...state.documents] });
    setNum("");
    setExp("");
  };
  const remove = (id: string) =>
    update({ ...state, documents: state.documents.filter((d) => d.id !== id) });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Upload W-9, MC Authority letter, COI (Certificate of Insurance) and EIN letter.
      </p>
      <div className="space-y-2">
        {state.documents.map((d) => (
          <div
            key={d.id}
            className="rounded-xl bg-surface border border-border p-3 flex items-start gap-3"
          >
            <div className="h-9 w-9 rounded-full bg-accent text-primary flex items-center justify-center">
              <FileText className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm truncate">{d.doc_type}</div>
                <Pill s={d.status} />
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {d.document_number || "—"} {d.expiry_date ? `· exp ${d.expiry_date}` : ""}
              </div>
            </div>
            <button
              onClick={() => remove(d.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-dashed border-border p-3 space-y-2">
        <div className="text-xs font-semibold">Add document</div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full h-10 px-3 rounded-xl bg-surface border border-border text-sm"
        >
          {[
            "W-9",
            "MC Authority",
            "Certificate of Insurance",
            "EIN Letter",
            "Surety Bond",
            "Operating Authority",
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Number" value={num} onChange={setNum} />
          <Field label="Expires" type="date" value={exp} onChange={setExp} />
        </div>
        <button
          onClick={add}
          className="w-full h-10 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Upload className="h-4 w-4" /> Attach document
        </button>
      </div>
    </div>
  );
}

function BillingStep({
  state,
  update,
}: {
  state: DispatcherState;
  update: (s: DispatcherState) => void;
}) {
  const p = state.profile;
  const set = (patch: Partial<typeof p>) => update({ ...state, profile: { ...p, ...patch } });
  const ready = state.profile.completion_pct >= 80;
  return (
    <div className="space-y-3">
      <Field
        label="Billing address"
        value={p.billing_address ?? ""}
        onChange={(v) => set({ billing_address: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Field label="City" value={p.city ?? ""} onChange={(v) => set({ city: v })} />
        <Field label="State" value={p.state ?? ""} onChange={(v) => set({ state: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Postal code"
          value={p.postal_code ?? ""}
          onChange={(v) => set({ postal_code: v })}
        />
        <Field label="Country" value={p.country ?? ""} onChange={(v) => set({ country: v })} />
      </div>
      <div
        className={`rounded-2xl p-4 ${ready ? "bg-success/10 border border-success/30" : "bg-accent border border-primary/20"}`}
      >
        <div className="flex items-center gap-2 mb-1">
          {ready ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <Clock className="h-4 w-4 text-primary" />
          )}
          <div className="font-semibold text-sm">{ready ? "Ready to submit" : "Almost there"}</div>
        </div>
        <p className="text-xs text-muted-foreground">
          {ready
            ? "Submit for review. Approval typically takes 24h. Loads can be posted as drafts but won't go live until approved."
            : "Reach 80% completion to submit. Stripe customer setup happens automatically on approval."}
        </p>
      </div>
    </div>
  );
}

/**
 * The dispatcher's business-verification state, read from the browser.
 *
 * All this still backs is the "verify your business" banner and its wizard —
 * dispatcher verification has no server side yet (BACKLOG F-83). It used to
 * carry job posting, bid awarding and an escrow ledger as well; loads, offers
 * and hiring are real and on the server now, and LoadReady never holds money
 * for a job (D1), so none of that had any business being here.
 */
export function useDispatcherState() {
  const [state, setState] = useState<DispatcherState>(() => loadDispatcherState());
  useEffect(() => {
    const onStorage = () => setState(loadDispatcherState());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return { state, refresh: () => setState(loadDispatcherState()) };
}

// ───────── Re-exports for parent ─────────
export { Building2, ShieldCheck, AlertCircle };

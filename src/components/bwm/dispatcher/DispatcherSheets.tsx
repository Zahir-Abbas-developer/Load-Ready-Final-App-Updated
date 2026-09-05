import { useEffect, useMemo, useState } from "react";
import {
  X, ChevronLeft, ChevronRight, Building2, FileText, ShieldCheck, AlertCircle, Send,
  MapPin, Calendar, Truck, DollarSign, CheckCircle2, Clock, Star, Trash2, Plus, Upload, Lock, Wallet, Award,
} from "lucide-react";
import {
  loadDispatcherState, saveDispatcherState, recomputeDispatcherCompletion, feeBreakdown,
  type DispatcherState, type DispatcherJob, type DispatcherDocument, type JobBid, type EscrowTxn,
  type EscrowStatus, type DocStatus, type BidStatus, type JobStatus,
} from "@/lib/dispatcher/demo-store";

// ───────── Sheet shell ─────────
function Sheet({
  children, onClose, title, footer, width = "max-w-[420px]",
}: { children: React.ReactNode; onClose: () => void; title: string; footer?: React.ReactNode; width?: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`w-full ${width} bg-background rounded-t-3xl max-h-[92vh] flex flex-col`}>
        <div className="sticky top-0 bg-background z-10 flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-surface flex items-center justify-center">
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
  label, value, onChange, placeholder, type = "text",
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-foreground mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 px-3 rounded-xl bg-surface border border-border focus:outline-none focus:border-primary text-sm"
      />
    </div>
  );
}

function Pill({ s }: { s: JobStatus | EscrowStatus | DocStatus | BidStatus }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    published: "bg-accent text-primary",
    bidding: "bg-primary text-primary-foreground",
    awarded: "bg-success/15 text-success",
    in_transit: "bg-success/15 text-success",
    completed: "bg-success/15 text-success",
    cancelled: "bg-muted text-muted-foreground",
    disputed: "bg-destructive/15 text-destructive",
    held: "bg-primary text-primary-foreground",
    released: "bg-success/15 text-success",
    paid_out: "bg-success/15 text-success",
    refunded: "bg-muted text-muted-foreground",
    failed: "bg-destructive/15 text-destructive",
    initiated: "bg-accent text-primary",
    charged: "bg-accent text-primary",
    approved: "bg-success/15 text-success",
    pending: "bg-accent text-primary",
    rejected: "bg-destructive/15 text-destructive",
    expired: "bg-destructive/15 text-destructive",
    submitted: "bg-accent text-primary",
    shortlisted: "bg-primary text-primary-foreground",
    accepted: "bg-success/15 text-success",
    withdrawn: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${map[s] || "bg-muted text-muted-foreground"}`}>
      {s.replace(/_/g, " ")}
    </span>
  );
}

// ───────── 1) Business verification wizard ─────────
const STEPS = ["Company", "Tax & Authority", "Documents", "Billing"] as const;

export function BusinessVerificationWizard({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<DispatcherState>(() => loadDispatcherState());
  const [idx, setIdx] = useState<0 | 1 | 2 | 3>(0);
  const completion = useMemo(() => recomputeDispatcherCompletion(state), [state]);

  const update = (next: DispatcherState) => {
    next.profile.completion_pct = recomputeDispatcherCompletion(next);
    setState(next);
    saveDispatcherState(next);
  };

  useEffect(() => { update({ ...state }); /* eslint-disable-next-line */ }, [idx]);

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
            <button onClick={() => setIdx((i) => (i - 1) as any)} className="h-11 px-4 rounded-full border border-border text-sm font-semibold flex items-center gap-1">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          )}
          {idx < 3 ? (
            <button onClick={() => setIdx((i) => (i + 1) as any)} className="flex-1 h-11 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1">
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={submit} className="flex-1 h-11 rounded-full bg-foreground text-background text-sm font-semibold flex items-center justify-center gap-1">
              <Send className="h-4 w-4" /> Submit for review
            </button>
          )}
        </div>
      }
    >
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-muted-foreground">Step {idx + 1} of {STEPS.length} · {STEPS[idx]}</div>
          <div className="text-xs font-semibold text-primary">{completion}% complete</div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${completion}%` }} />
        </div>
        <div className="flex gap-1 mt-2">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= idx ? "bg-primary" : "bg-border"}`} />
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

function CompanyStep({ state, update }: { state: DispatcherState; update: (s: DispatcherState) => void }) {
  const p = state.profile;
  const set = (patch: Partial<typeof p>) => update({ ...state, profile: { ...p, ...patch } });
  return (
    <div className="space-y-3">
      <Field label="Company name (DBA)" value={p.company_name} onChange={(v) => set({ company_name: v })} />
      <Field label="Legal name" value={p.legal_name} onChange={(v) => set({ legal_name: v })} placeholder="Anton Heavy Logistics LLC" />
      <Field label="Website" value={p.website ?? ""} onChange={(v) => set({ website: v })} placeholder="https://" />
      <Field label="Primary contact" value={p.contact_name} onChange={(v) => set({ contact_name: v })} />
      <Field label="Contact phone" value={p.contact_phone} onChange={(v) => set({ contact_phone: v })} placeholder="+1 …" />
    </div>
  );
}

function TaxAuthorityStep({ state, update }: { state: DispatcherState; update: (s: DispatcherState) => void }) {
  const p = state.profile;
  const set = (patch: Partial<typeof p>) => update({ ...state, profile: { ...p, ...patch } });
  return (
    <div className="space-y-3">
      <Field label="EIN (Employer ID)" value={p.ein ?? ""} onChange={(v) => set({ ein: v })} placeholder="XX-XXXXXXX" />
      <Field label="MC Number (Motor Carrier)" value={p.mc_number ?? ""} onChange={(v) => set({ mc_number: v })} placeholder="MC-XXXXXX" />
      <Field label="DOT Number" value={p.dot_number ?? ""} onChange={(v) => set({ dot_number: v })} placeholder="DOT-XXXXXXX" />
      <div className="rounded-xl bg-accent border border-primary/20 p-3 text-xs">
        We verify MC/DOT against FMCSA records. Mismatched numbers will block load posting until resolved.
      </div>
    </div>
  );
}

function DispatcherDocsStep({ state, update }: { state: DispatcherState; update: (s: DispatcherState) => void }) {
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
      file_url: "demo://uploaded.pdf",
      status: "pending",
      rejection_reason: null,
      created_at: new Date().toISOString(),
    };
    update({ ...state, documents: [doc, ...state.documents] });
    setNum(""); setExp("");
  };
  const remove = (id: string) => update({ ...state, documents: state.documents.filter((d) => d.id !== id) });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Upload W-9, MC Authority letter, COI (Certificate of Insurance) and EIN letter.</p>
      <div className="space-y-2">
        {state.documents.map((d) => (
          <div key={d.id} className="rounded-xl bg-surface border border-border p-3 flex items-start gap-3">
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
            <button onClick={() => remove(d.id)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-dashed border-border p-3 space-y-2">
        <div className="text-xs font-semibold">Add document</div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-surface border border-border text-sm">
          {["W-9", "MC Authority", "Certificate of Insurance", "EIN Letter", "Surety Bond", "Operating Authority"].map((t) => <option key={t}>{t}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Number" value={num} onChange={setNum} />
          <Field label="Expires" type="date" value={exp} onChange={setExp} />
        </div>
        <button onClick={add} className="w-full h-10 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2">
          <Upload className="h-4 w-4" /> Upload (demo)
        </button>
      </div>
    </div>
  );
}

function BillingStep({ state, update }: { state: DispatcherState; update: (s: DispatcherState) => void }) {
  const p = state.profile;
  const set = (patch: Partial<typeof p>) => update({ ...state, profile: { ...p, ...patch } });
  const ready = state.profile.completion_pct >= 80;
  return (
    <div className="space-y-3">
      <Field label="Billing address" value={p.billing_address ?? ""} onChange={(v) => set({ billing_address: v })} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="City" value={p.city ?? ""} onChange={(v) => set({ city: v })} />
        <Field label="State" value={p.state ?? ""} onChange={(v) => set({ state: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Postal code" value={p.postal_code ?? ""} onChange={(v) => set({ postal_code: v })} />
        <Field label="Country" value={p.country ?? ""} onChange={(v) => set({ country: v })} />
      </div>
      <div className={`rounded-2xl p-4 ${ready ? "bg-success/10 border border-success/30" : "bg-accent border border-primary/20"}`}>
        <div className="flex items-center gap-2 mb-1">
          {ready ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Clock className="h-4 w-4 text-primary" />}
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

// ───────── 2) Job posting wizard ─────────
const POST_STEPS = ["Load", "Route", "Requirements", "Budget"] as const;

export function PostJobWizard({
  onClose, onCreate,
}: { onClose: () => void; onCreate: (job: DispatcherJob) => void }) {
  const [idx, setIdx] = useState<0 | 1 | 2 | 3>(0);
  const [j, setJ] = useState<DispatcherJob>({
    id: crypto.randomUUID(),
    title: "", description: "", cargo_type: "Heavy Equipment",
    dimensions: "", weight: "",
    pickup_location: "", dropoff_location: "",
    pickup_date: null, dropoff_date: null,
    distance_mi: null, budget: 0,
    requirements: { lead: true, chase: true, height_pole: false, police: false, insurance_min: 1000000 },
    permits: [],
    status: "published",
    awarded_pilot_id: null, awarded_bid_id: null, escrow_status: null,
    created_at: new Date().toISOString(),
  });

  const set = (patch: Partial<DispatcherJob>) => setJ((p) => ({ ...p, ...patch }));
  const setReq = (patch: Partial<DispatcherJob["requirements"]>) =>
    setJ((p) => ({ ...p, requirements: { ...p.requirements, ...patch } }));

  const stepValid = [
    !!j.title && !!j.cargo_type,
    !!j.pickup_location && !!j.dropoff_location,
    true,
    j.budget > 0,
  ];

  const submit = (status: JobStatus) => {
    onCreate({ ...j, status });
    onClose();
  };

  return (
    <Sheet
      title="Post a new load"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          {idx > 0 && (
            <button onClick={() => setIdx((i) => (i - 1) as any)} className="h-11 px-4 rounded-full border border-border text-sm font-semibold flex items-center gap-1">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          )}
          {idx < 3 ? (
            <button
              disabled={!stepValid[idx]}
              onClick={() => setIdx((i) => (i + 1) as any)}
              className="flex-1 h-11 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
            >
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex-1 grid grid-cols-2 gap-2">
              <button onClick={() => submit("draft")} className="h-11 rounded-full border border-border text-sm font-semibold">
                Save draft
              </button>
              <button
                disabled={!stepValid[3]}
                onClick={() => submit("published")}
                className="h-11 rounded-full bg-foreground text-background text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1"
              >
                <Send className="h-4 w-4" /> Publish
              </button>
            </div>
          )}
        </div>
      }
    >
      <div className="mb-4">
        <div className="text-xs text-muted-foreground mb-2">Step {idx + 1} of {POST_STEPS.length} · {POST_STEPS[idx]}</div>
        <div className="flex gap-1">
          {POST_STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= idx ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>
      </div>

      {idx === 0 && (
        <div className="space-y-3">
          <Field label="Load title" value={j.title} onChange={(v) => set({ title: v })} placeholder="Industrial Generator" />
          <select value={j.cargo_type} onChange={(e) => set({ cargo_type: e.target.value })} className="w-full h-11 px-3 rounded-xl bg-surface border border-border text-sm">
            {["Heavy Equipment", "Wind Energy", "Modular/Construction", "Industrial", "Oversized Vehicle", "Other"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Dimensions (L × W × H)" value={j.dimensions} onChange={(v) => set({ dimensions: v })} placeholder="45 × 12 × 14 ft" />
            <Field label="Weight" value={j.weight} onChange={(v) => set({ weight: v })} placeholder="lbs" />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Description / notes</label>
            <textarea
              value={j.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={3}
              placeholder="Special handling, route notes, contacts…"
              className="w-full px-3 py-2 rounded-xl bg-surface border border-border focus:outline-none focus:border-primary text-sm"
            />
          </div>
        </div>
      )}
      {idx === 1 && (
        <div className="space-y-3">
          <Field label="Pickup location" value={j.pickup_location} onChange={(v) => set({ pickup_location: v })} placeholder="Dallas, TX" />
          <Field label="Drop-off location" value={j.dropoff_location} onChange={(v) => set({ dropoff_location: v })} placeholder="Houston, TX" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Pickup date" type="datetime-local" value={j.pickup_date?.slice(0, 16) ?? ""} onChange={(v) => set({ pickup_date: v ? new Date(v).toISOString() : null })} />
            <Field label="Drop-off date" type="datetime-local" value={j.dropoff_date?.slice(0, 16) ?? ""} onChange={(v) => set({ dropoff_date: v ? new Date(v).toISOString() : null })} />
          </div>
          <Field label="Approx distance (mi)" type="number" value={j.distance_mi ? String(j.distance_mi) : ""} onChange={(v) => set({ distance_mi: v ? Number(v) : null })} />
          <PermitsPicker permits={j.permits} onChange={(p) => set({ permits: p })} />
        </div>
      )}
      {idx === 2 && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-surface border border-border p-3 space-y-2">
            <Toggle label="Lead car required" v={!!j.requirements.lead} onChange={(v) => setReq({ lead: v })} />
            <Toggle label="Chase car required" v={!!j.requirements.chase} onChange={(v) => setReq({ chase: v })} />
            <Toggle label="Height pole" v={!!j.requirements.height_pole} onChange={(v) => setReq({ height_pole: v })} />
            <Toggle label="Police escort" v={!!j.requirements.police} onChange={(v) => setReq({ police: v })} />
          </div>
          <Field
            label="Min insurance ($)"
            type="number"
            value={String(j.requirements.insurance_min ?? 0)}
            onChange={(v) => setReq({ insurance_min: Number(v || 0) })}
          />
        </div>
      )}
      {idx === 3 && (
        <div className="space-y-3">
          <Field label="Budget (USD)" type="number" value={j.budget ? String(j.budget) : ""} onChange={(v) => set({ budget: Number(v || 0) })} placeholder="3000" />
          {j.budget > 0 && <FeePreview amount={j.budget} />}
          <div className="rounded-xl bg-accent border border-primary/20 p-3 text-xs">
            Funds will be charged to your card and held in escrow when you award a bid. Released to the pilot after delivery proof is approved.
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Toggle({ label, v, onChange }: { label: string; v: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!v)} className="w-full flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <span className={`h-6 w-10 rounded-full transition-colors ${v ? "bg-primary" : "bg-border"} relative`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all ${v ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function PermitsPicker({ permits, onChange }: { permits: string[]; onChange: (p: string[]) => void }) {
  const ALL = ["TX Oversize", "TX Overweight", "OK Oversize", "NM Oversize", "AZ Oversize", "KS Oversize", "Police Escort"];
  const toggle = (p: string) => onChange(permits.includes(p) ? permits.filter((x) => x !== p) : [...permits, p]);
  return (
    <div>
      <div className="text-xs font-medium mb-1">Required permits</div>
      <div className="flex flex-wrap gap-1.5">
        {ALL.map((p) => {
          const on = permits.includes(p);
          return (
            <button key={p} onClick={() => toggle(p)} className={`px-3 h-8 rounded-full text-xs border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-surface border-border"}`}>
              {p}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FeePreview({ amount }: { amount: number }) {
  const f = feeBreakdown(amount);
  return (
    <div className="rounded-2xl bg-surface border border-border p-3 text-xs space-y-1">
      <div className="flex justify-between"><span>Bid amount</span><span className="font-bold">${amount.toFixed(2)}</span></div>
      <div className="flex justify-between text-muted-foreground"><span>Platform fee (12%)</span><span>-${f.platform_fee.toFixed(2)}</span></div>
      <div className="flex justify-between text-muted-foreground"><span>Stripe fee (2.9% + $0.30)</span><span>-${f.stripe_fee.toFixed(2)}</span></div>
      <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="font-semibold">Net to pilot</span><span className="font-bold text-success">${f.net_to_pilot.toFixed(2)}</span></div>
    </div>
  );
}

// ───────── 3) Bid comparison ─────────
export function BidComparisonSheet({
  job, onClose, onAward,
}: { job: DispatcherJob; onClose: () => void; onAward: (bid: JobBid) => void }) {
  const [state, setState] = useState<DispatcherState>(() => loadDispatcherState());
  const [sortBy, setSortBy] = useState<"amount" | "rating" | "trips">("amount");

  const jobBids = useMemo(() => {
    const list = state.bids.filter((b) => b.job_id === job.id);
    return [...list].sort((a, b) => {
      if (sortBy === "amount") return a.amount - b.amount;
      if (sortBy === "rating") return b.pilot_rating - a.pilot_rating;
      return b.pilot_trips - a.pilot_trips;
    });
  }, [state.bids, job.id, sortBy]);

  const shortlist = (id: string) => {
    const next = { ...state, bids: state.bids.map((b) => b.id === id ? { ...b, status: "shortlisted" as const } : b) };
    setState(next); saveDispatcherState(next);
  };
  const reject = (id: string) => {
    const next = { ...state, bids: state.bids.map((b) => b.id === id ? { ...b, status: "rejected" as const } : b) };
    setState(next); saveDispatcherState(next);
  };

  return (
    <Sheet title={`Bids · ${job.title}`} onClose={onClose}>
      <div className="rounded-2xl bg-surface border border-border p-3 mb-3 text-xs">
        <div className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3 text-primary" /> {job.pickup_location} → {job.dropoff_location}</div>
        <div className="flex items-center gap-1 text-muted-foreground mt-1"><DollarSign className="h-3 w-3 text-primary" /> Budget ${job.budget.toLocaleString()}</div>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Sort:</span>
        {(["amount", "rating", "trips"] as const).map((s) => (
          <button key={s} onClick={() => setSortBy(s)} className={`px-3 h-7 rounded-full text-xs border ${sortBy === s ? "bg-primary text-primary-foreground border-primary" : "bg-surface border-border"}`}>
            {s === "amount" ? "Price ↑" : s === "rating" ? "Rating" : "Trips"}
          </button>
        ))}
      </div>
      {jobBids.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bids yet.</p>
      ) : (
        <div className="space-y-2">
          {jobBids.map((b, i) => {
            const f = feeBreakdown(b.amount);
            const isLowest = b.amount === Math.min(...jobBids.map((x) => x.amount));
            return (
              <div key={b.id} className={`rounded-2xl border p-3 ${b.status === "accepted" ? "border-success bg-success/5" : "border-border bg-surface"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-accent text-primary flex items-center justify-center text-xs font-bold">
                      {b.pilot_name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{b.pilot_name}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                        <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-current text-primary" />{b.pilot_rating}</span>
                        <span>· {b.pilot_trips} trips</span>
                        {isLowest && <span className="px-1.5 py-0.5 rounded-full bg-success/15 text-success text-[10px] font-bold">LOWEST</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold">${b.amount.toLocaleString()}</div>
                    <Pill s={b.status} />
                  </div>
                </div>
                {b.message && <div className="text-[11px] text-muted-foreground mt-2 italic">"{b.message}"</div>}
                <div className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
                  <Mini k="Pickup ETA" v={b.eta_pickup ? new Date(b.eta_pickup).toLocaleDateString() : "—"} />
                  <Mini k="Net to pilot" v={`$${f.net_to_pilot.toFixed(0)}`} />
                  <Mini k="Bid #" v={`${i + 1}/${jobBids.length}`} />
                </div>
                {b.status !== "accepted" && b.status !== "rejected" && b.status !== "withdrawn" && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => reject(b.id)} className="flex-1 h-9 rounded-full border border-border text-xs font-semibold">Reject</button>
                    {b.status !== "shortlisted" && (
                      <button onClick={() => shortlist(b.id)} className="flex-1 h-9 rounded-full border border-primary text-primary text-xs font-semibold">Shortlist</button>
                    )}
                    <button onClick={() => onAward(b)} className="flex-1 h-9 rounded-full bg-foreground text-background text-xs font-semibold flex items-center justify-center gap-1">
                      <Lock className="h-3 w-3" /> Award & escrow
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-background border border-border p-2">
      <div className="text-muted-foreground">{k}</div>
      <div className="font-bold text-foreground">{v}</div>
    </div>
  );
}

// ───────── 4) Escrow ledger sheet ─────────
export function EscrowLedgerSheet({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<DispatcherState>(() => loadDispatcherState());
  const advance = (id: string) => {
    const next = { ...state };
    next.escrow = next.escrow.map((e) => {
      if (e.id !== id) return e;
      const flow: EscrowStatus[] = ["initiated", "charged", "held", "released", "paid_out"];
      const i = flow.indexOf(e.status);
      const nextStatus = i >= 0 && i < flow.length - 1 ? flow[i + 1] : e.status;
      return { ...e, status: nextStatus };
    });
    setState(next); saveDispatcherState(next);
  };
  const totals = useMemo(() => {
    const sum = (st: EscrowStatus) => state.escrow.filter((e) => e.status === st).reduce((s, e) => s + e.amount, 0);
    return {
      held: sum("held"),
      released: sum("released"),
      paid: sum("paid_out"),
      fees: state.escrow.reduce((s, e) => s + e.platform_fee + e.stripe_fee, 0),
    };
  }, [state.escrow]);
  return (
    <Sheet title="Escrow & payouts" onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <KPI label="In escrow" v={totals.held} tone="primary" />
        <KPI label="Released" v={totals.released} tone="success" />
        <KPI label="Paid out" v={totals.paid} tone="success" />
      </div>
      <div className="rounded-xl bg-accent border border-primary/20 p-3 text-xs mb-4">
        Total fees collected this period: <span className="font-bold">${totals.fees.toFixed(2)}</span>
      </div>
      <h4 className="font-semibold text-sm mb-2">Transactions</h4>
      <div className="space-y-2">
        {state.escrow.map((e) => (
          <div key={e.id} className="rounded-xl bg-surface border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-sm">Job {e.job_id}</div>
                <div className="text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</div>
              </div>
              <div className="text-right">
                <div className="font-bold">${e.amount.toLocaleString()}</div>
                <Pill s={e.status} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1 mt-2 text-[11px]">
              <Mini k="Platform" v={`$${e.platform_fee.toFixed(2)}`} />
              <Mini k="Stripe" v={`$${e.stripe_fee.toFixed(2)}`} />
              <Mini k="Net" v={`$${e.net_to_pilot.toFixed(2)}`} />
            </div>
            {e.status !== "paid_out" && e.status !== "refunded" && e.status !== "failed" && (
              <button onClick={() => advance(e.id)} className="mt-2 w-full h-9 rounded-full bg-foreground text-background text-xs font-semibold">
                Advance → {nextLabel(e.status)}
              </button>
            )}
            {e.notes && <div className="text-[11px] text-muted-foreground mt-2 italic">{e.notes}</div>}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function nextLabel(s: EscrowStatus): string {
  const map: Record<EscrowStatus, string> = {
    initiated: "Charge card",
    charged: "Hold in escrow",
    held: "Release to pilot",
    released: "ACH payout",
    paid_out: "Done",
    refunded: "—",
    failed: "—",
  };
  return map[s];
}

function KPI({ label, v, tone }: { label: string; v: number; tone: "muted" | "primary" | "success" }) {
  const cls = tone === "success" ? "text-success" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="rounded-xl bg-surface border border-border p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-base font-bold ${cls}`}>${v.toLocaleString()}</div>
    </div>
  );
}

// ───────── Hook so DispatcherHome reads live state ─────────
export function useDispatcherState() {
  const [state, setState] = useState<DispatcherState>(() => loadDispatcherState());
  useEffect(() => {
    const onStorage = () => setState(loadDispatcherState());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return {
    state,
    refresh: () => setState(loadDispatcherState()),
    saveJob: (job: DispatcherJob) => {
      const next = { ...state, jobs: [job, ...state.jobs.filter((j) => j.id !== job.id)] };
      setState(next); saveDispatcherState(next); return next;
    },
    awardBid: (job: DispatcherJob, bid: JobBid) => {
      const escrowRow: EscrowTxn = {
        id: crypto.randomUUID(),
        job_id: job.id,
        pilot_id: bid.pilot_id,
        amount: bid.amount,
        ...feeBreakdown(bid.amount),
        status: "held",
        notes: `Awarded to ${bid.pilot_name}.`,
        created_at: new Date().toISOString(),
      };
      const next: DispatcherState = {
        ...state,
        jobs: state.jobs.map((j) => j.id === job.id ? { ...j, status: "awarded", awarded_pilot_id: bid.pilot_id, awarded_bid_id: bid.id, escrow_status: "held" } : j),
        bids: state.bids.map((b) =>
          b.job_id === job.id
            ? { ...b, status: b.id === bid.id ? "accepted" : "rejected" }
            : b,
        ),
        escrow: [escrowRow, ...state.escrow],
      };
      setState(next); saveDispatcherState(next); return next;
    },
  };
}

// ───────── Re-exports for parent ─────────
export { Building2, ShieldCheck, AlertCircle };

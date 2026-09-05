import { useEffect, useMemo, useState } from "react";
import {
  X, ChevronRight, ChevronLeft, Upload, FileText, CheckCircle2, AlertTriangle,
  Clock, ShieldCheck, Car, Award, DollarSign, Trash2, Plus, Send,
} from "lucide-react";
import {
  loadPilotState, savePilotState, recomputeCompletion,
  type PilotState, type PilotDocument, type PilotCertification, type BidStatus, type DocStatus, type EarningStatus,
} from "@/lib/pilot/demo-store";

// ───────── Reusable sheet ─────────
function Sheet({
  children, onClose, title, footer,
}: { children: React.ReactNode; onClose: () => void; title: string; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] bg-background rounded-t-3xl max-h-[90vh] flex flex-col"
      >
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

function StatusPill({ status }: { status: DocStatus | BidStatus | EarningStatus }) {
  const map: Record<string, string> = {
    approved: "bg-success/15 text-success",
    paid: "bg-success/15 text-success",
    released: "bg-success/15 text-success",
    accepted: "bg-success/15 text-success",
    pending: "bg-accent text-primary",
    submitted: "bg-accent text-primary",
    shortlisted: "bg-primary text-primary-foreground",
    in_review: "bg-accent text-primary",
    rejected: "bg-destructive/15 text-destructive",
    expired: "bg-destructive/15 text-destructive",
    disputed: "bg-destructive/15 text-destructive",
    withdrawn: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${map[status] || "bg-muted text-muted-foreground"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ───────── 1) Verification wizard ─────────
const STEPS = ["Identity", "Documents", "Vehicle", "Certifications", "Payout"] as const;
type StepIdx = 0 | 1 | 2 | 3 | 4;

export function VerificationWizard({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<PilotState>(() => loadPilotState());
  const [idx, setIdx] = useState<StepIdx>(0);
  const completion = useMemo(() => recomputeCompletion(state), [state]);

  useEffect(() => {
    setState((s) => {
      const next = { ...s, profile: { ...s.profile, completion_pct: recomputeCompletion(s) } };
      savePilotState(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const update = (next: PilotState) => {
    next.profile.completion_pct = recomputeCompletion(next);
    setState(next);
    savePilotState(next);
  };

  const submit = () => {
    update({ ...state, profile: { ...state.profile, verification_status: "in_review" } });
    onClose();
  };

  return (
    <Sheet
      title="Verify your account"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          {idx > 0 && (
            <button
              onClick={() => setIdx((i) => (i - 1) as StepIdx)}
              className="h-11 px-4 rounded-full border border-border text-sm font-semibold flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          )}
          {idx < 4 ? (
            <button
              onClick={() => setIdx((i) => (i + 1) as StepIdx)}
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
      {/* Progress */}
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

      {idx === 0 && <IdentityStep state={state} update={update} />}
      {idx === 1 && <DocumentsStep state={state} update={update} />}
      {idx === 2 && <VehicleStep state={state} update={update} />}
      {idx === 3 && <CertificationsStep state={state} update={update} />}
      {idx === 4 && <PayoutStep state={state} update={update} />}
    </Sheet>
  );
}

function IdentityStep({ state, update }: { state: PilotState; update: (s: PilotState) => void }) {
  const p = state.profile;
  const set = (patch: Partial<typeof p>) => update({ ...state, profile: { ...p, ...patch } });
  return (
    <div className="space-y-3">
      <Field label="Full legal name" value={p.full_name} onChange={(v) => set({ full_name: v })} />
      <Field label="Date of birth" type="date" value={p.date_of_birth ?? ""} onChange={(v) => set({ date_of_birth: v })} />
      <Field label="Street address" value={p.address ?? ""} onChange={(v) => set({ address: v })} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="City" value={p.city ?? ""} onChange={(v) => set({ city: v })} />
        <Field label="State" value={p.state ?? ""} onChange={(v) => set({ state: v })} placeholder="TX" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Postal code" value={p.postal_code ?? ""} onChange={(v) => set({ postal_code: v })} />
        <Field label="Country" value={p.country ?? ""} onChange={(v) => set({ country: v })} placeholder="US" />
      </div>
      <Field label="Emergency contact" value={p.emergency_contact ?? ""} onChange={(v) => set({ emergency_contact: v })} placeholder="Name · phone" />
      <Field
        label="Years of experience"
        type="number"
        value={p.years_experience ? String(p.years_experience) : ""}
        onChange={(v) => set({ years_experience: v ? Number(v) : null })}
      />
    </div>
  );
}

function DocumentsStep({ state, update }: { state: PilotState; update: (s: PilotState) => void }) {
  const [type, setType] = useState("Driver's License");
  const [num, setNum] = useState("");
  const [exp, setExp] = useState("");

  const add = () => {
    if (!type) return;
    const doc: PilotDocument = {
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
      <p className="text-xs text-muted-foreground">Upload Driver's License, Insurance, Medical Certificate and any state-specific permits.</p>
      <div className="space-y-2">
        {state.documents.map((d) => (
          <DocCard key={d.id} doc={d} onRemove={() => remove(d.id)} />
        ))}
      </div>
      <div className="rounded-2xl border border-dashed border-border p-3 space-y-2">
        <div className="text-xs font-semibold">Add document</div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full h-10 px-3 rounded-xl bg-surface border border-border text-sm"
        >
          {["Driver's License", "Commercial Insurance", "Medical Certificate", "DOT Permit", "State Pilot Permit", "Background Check"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Number" value={num} onChange={setNum} placeholder="ID/Policy #" />
          <Field label="Expires" type="date" value={exp} onChange={setExp} />
        </div>
        <button
          onClick={add}
          className="w-full h-10 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Upload className="h-4 w-4" /> Upload (demo)
        </button>
      </div>
    </div>
  );
}

function DocCard({ doc, onRemove }: { doc: PilotDocument; onRemove: () => void }) {
  const expSoon = doc.expiry_date && new Date(doc.expiry_date).getTime() - Date.now() < 30 * 86400000;
  return (
    <div className="rounded-xl bg-surface border border-border p-3 flex items-start gap-3">
      <div className="h-9 w-9 rounded-full bg-accent text-primary flex items-center justify-center shrink-0">
        <FileText className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-sm truncate">{doc.doc_type}</div>
          <StatusPill status={doc.status} />
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {doc.document_number || "—"} {doc.expiry_date ? `· exp ${doc.expiry_date}` : ""}
        </div>
        {expSoon && doc.status !== "rejected" && (
          <div className="mt-1 text-[11px] text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Expires soon — renew before booking
          </div>
        )}
        {doc.status === "rejected" && doc.rejection_reason && (
          <div className="mt-1 text-[11px] text-destructive">Rejected: {doc.rejection_reason}</div>
        )}
      </div>
      <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function VehicleStep({ state, update }: { state: PilotState; update: (s: PilotState) => void }) {
  const v = state.vehicle ?? {
    id: crypto.randomUUID(), vehicle_type: "Pilot Car (Lead/Chase)", make: "", model: "", year: new Date().getFullYear(),
    license_plate: "", vin: null, insurance_expiry: null, equipment: {},
  };
  const set = (patch: Partial<typeof v>) => update({ ...state, vehicle: { ...v, ...patch } });
  const EQUIPMENT = ["Height pole", "Magnetic rooftop sign", "Amber strobes", "CB radio", "Flags & cones"];
  return (
    <div className="space-y-3">
      <select
        value={v.vehicle_type}
        onChange={(e) => set({ vehicle_type: e.target.value })}
        className="w-full h-11 px-3 rounded-xl bg-surface border border-border text-sm"
      >
        {["Pilot Car (Lead/Chase)", "Height-Pole Vehicle", "Route Survey", "Steer Car"].map((t) => <option key={t}>{t}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Make" value={v.make ?? ""} onChange={(x) => set({ make: x })} />
        <Field label="Model" value={v.model ?? ""} onChange={(x) => set({ model: x })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Year" type="number" value={String(v.year ?? "")} onChange={(x) => set({ year: Number(x) })} />
        <Field label="License plate" value={v.license_plate ?? ""} onChange={(x) => set({ license_plate: x })} />
      </div>
      <Field label="VIN (optional)" value={v.vin ?? ""} onChange={(x) => set({ vin: x })} />
      <Field label="Insurance expiry" type="date" value={v.insurance_expiry ?? ""} onChange={(x) => set({ insurance_expiry: x })} />
      <div>
        <div className="text-xs font-medium mb-2">Onboard equipment</div>
        <div className="grid grid-cols-2 gap-2">
          {EQUIPMENT.map((e) => {
            const on = !!v.equipment?.[e];
            return (
              <button
                key={e}
                onClick={() => set({ equipment: { ...v.equipment, [e]: !on } })}
                className={`h-10 px-3 rounded-xl border text-xs text-left flex items-center gap-2 ${on ? "border-primary bg-accent text-primary" : "border-border bg-surface text-foreground"}`}
              >
                {on ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {e}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CertificationsStep({ state, update }: { state: PilotState; update: (s: PilotState) => void }) {
  const [t, setT] = useState("TX Pilot/Escort Certification");
  const [num, setNum] = useState("");
  const [exp, setExp] = useState("");
  const add = () => {
    if (!t) return;
    const cert: PilotCertification = {
      id: crypto.randomUUID(), cert_type: t, cert_number: num || null, expiry_date: exp || null, status: "pending",
    };
    update({ ...state, certifications: [cert, ...state.certifications] });
    setNum(""); setExp("");
  };
  const remove = (id: string) => update({ ...state, certifications: state.certifications.filter((c) => c.id !== id) });
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {state.certifications.map((c) => (
          <div key={c.id} className="rounded-xl bg-surface border border-border p-3 flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-accent text-primary flex items-center justify-center">
              <Award className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">{c.cert_type}</div>
                <StatusPill status={c.status} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {c.cert_number || "—"} {c.expiry_date ? `· exp ${c.expiry_date}` : ""}
              </div>
            </div>
            <button onClick={() => remove(c.id)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-dashed border-border p-3 space-y-2">
        <div className="text-xs font-semibold">Add certification</div>
        <select value={t} onChange={(e) => setT(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-surface border border-border text-sm">
          {["TX Pilot/Escort Certification", "OK Pilot/Escort Certification", "OSHA Flagger Training", "Defensive Driving", "First Aid/CPR"].map((x) => <option key={x}>{x}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cert #" value={num} onChange={setNum} />
          <Field label="Expires" type="date" value={exp} onChange={setExp} />
        </div>
        <button onClick={add} className="w-full h-10 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2">
          <Plus className="h-4 w-4" /> Add certification
        </button>
      </div>
    </div>
  );
}

function PayoutStep({ state }: { state: PilotState; update: (s: PilotState) => void }) {
  const ready = state.profile.completion_pct >= 80;
  return (
    <div className="space-y-3">
      <div className={`rounded-2xl p-4 ${ready ? "bg-success/10 border border-success/30" : "bg-accent border border-primary/20"}`}>
        <div className="flex items-center gap-2 mb-1">
          {ready ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Clock className="h-4 w-4 text-primary" />}
          <div className="font-semibold text-sm">
            {ready ? "Ready for review" : "Almost there"}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {ready
            ? "Submit for review. Approval typically takes under 24 hours. You'll be notified when you can start bidding."
            : "Complete the previous steps to reach 80% before submitting for review."}
        </p>
      </div>
      <div className="rounded-2xl bg-surface border border-border p-4">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="h-4 w-4 text-primary" />
          <div className="font-semibold text-sm">Payout method</div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          We use Stripe Connect for ACH payouts. You can set up bank details after approval — escrow funds are released to a verified account.
        </p>
        <div className="rounded-xl bg-background border border-border p-3 text-xs flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-success" />
          Demo: a simulated Stripe Connect account will be linked on approval.
        </div>
      </div>
    </div>
  );
}

// ───────── 2) Documents standalone sheet ─────────
export function DocumentsSheet({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<PilotState>(() => loadPilotState());
  const update = (next: PilotState) => { setState(next); savePilotState(next); };
  return (
    <Sheet title="Documents & certifications" onClose={onClose}>
      <DocumentsStep state={state} update={update} />
      <div className="h-4" />
      <h4 className="font-semibold text-sm mb-2">Certifications</h4>
      <CertificationsStep state={state} update={update} />
    </Sheet>
  );
}

// ───────── 3) Bids list ─────────
export function BidsSheet({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<PilotState>(() => loadPilotState());
  const withdraw = (id: string) => {
    const next = { ...state, bids: state.bids.map((b) => (b.id === id ? { ...b, status: "withdrawn" as const } : b)) };
    setState(next); savePilotState(next);
  };
  return (
    <Sheet title="My bids" onClose={onClose}>
      {state.bids.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bids yet. Bid from the offer detail screen.</p>
      ) : (
        <div className="space-y-2">
          {state.bids.map((b) => (
            <div key={b.id} className="rounded-2xl bg-surface border border-border p-4">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <div className="font-semibold text-sm leading-tight">{b.job_title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{b.route}</div>
                </div>
                <StatusPill status={b.status} />
              </div>
              <div className="flex items-center justify-between text-xs mt-2">
                <div className="text-muted-foreground">
                  {b.eta_pickup ? `Pickup ${b.eta_pickup}` : "ETA pending"}
                </div>
                <div className="text-success font-bold">${b.amount.toLocaleString()}</div>
              </div>
              {b.message && <div className="text-[11px] text-muted-foreground mt-2 italic">"{b.message}"</div>}
              {(b.status === "submitted" || b.status === "shortlisted") && (
                <button
                  onClick={() => withdraw(b.id)}
                  className="mt-3 h-8 px-3 rounded-full text-[11px] font-semibold border border-border text-foreground"
                >
                  Withdraw bid
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// ───────── 4) Earnings ledger ─────────
export function EarningsLedgerSheet({ onClose, onRunStripeDemo }: { onClose: () => void; onRunStripeDemo?: () => void }) {
  const [state] = useState<PilotState>(() => loadPilotState());
  const totals = useMemo(() => {
    const sum = (k: EarningStatus) =>
      state.earnings.filter((e) => e.status === k).reduce((s, e) => s + e.net, 0);
    return {
      pending: sum("pending"),
      released: sum("released"),
      paid: sum("paid"),
      gross: state.earnings.reduce((s, e) => s + e.gross, 0),
      commission: state.earnings.reduce((s, e) => s + e.commission, 0),
    };
  }, [state.earnings]);

  return (
    <Sheet title="My earnings" onClose={onClose}>
      <div className="rounded-2xl bg-gradient-to-br from-primary to-[var(--primary-pressed)] p-5 text-primary-foreground mb-4">
        <div className="text-xs opacity-90">Lifetime earned (net)</div>
        <div className="text-3xl font-bold">${(totals.paid + totals.released).toLocaleString()}</div>
        <div className="text-xs opacity-90 mt-1">
          Gross ${totals.gross.toLocaleString()} · Platform fee ${totals.commission.toLocaleString()}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <KPI label="Pending" v={totals.pending} tone="muted" />
        <KPI label="In escrow" v={totals.released} tone="primary" />
        <KPI label="Paid" v={totals.paid} tone="success" />
      </div>
      {onRunStripeDemo && (
        <button
          onClick={onRunStripeDemo}
          className="w-full mb-4 h-11 rounded-full bg-foreground text-background text-sm font-semibold flex items-center justify-center gap-2"
        >
          <DollarSign className="h-4 w-4" /> Run Stripe Connect demo
        </button>
      )}
      <h4 className="font-semibold text-sm mb-2">Per-job ledger</h4>
      <div className="space-y-2">
        {state.earnings.map((e) => (
          <div key={e.id} className="rounded-xl bg-surface border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{e.description}</div>
                <div className="text-[11px] text-muted-foreground">Job {e.job_id}</div>
              </div>
              <StatusPill status={e.status} />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
              <Mini k="Gross" v={`$${e.gross.toFixed(2)}`} />
              <Mini k="Fee" v={`-$${e.commission.toFixed(2)}`} />
              <Mini k="Net" v={`$${e.net.toFixed(2)}`} highlight />
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
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

function Mini({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-background border border-border p-2">
      <div className="text-muted-foreground">{k}</div>
      <div className={`font-bold ${highlight ? "text-success" : "text-foreground"}`}>{v}</div>
    </div>
  );
}

// ───────── Verification status badge for pilot home ─────────
export function useVerificationStatus() {
  const [state, setState] = useState<PilotState>(() => loadPilotState());
  useEffect(() => {
    const onStorage = () => setState(loadPilotState());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return state.profile;
}

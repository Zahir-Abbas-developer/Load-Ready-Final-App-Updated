import { lazy, Suspense, useEffect, useState } from "react";
import { useOnboarding } from "@/lib/onboarding-context";
import logo from "@/assets/bwm-logo.png";
const AdminLiveMap = lazy(() =>
  import("@/components/maps/AdminLiveMap").then((m) => ({ default: m.AdminLiveMap }))
);
import {
  LayoutDashboard, Users, Package, DollarSign, Scale, Map, BarChart3,
  Settings, LogOut, CheckCircle2, Search,
  MapPin, ShieldCheck, X, RefreshCw, Send, FileText, Menu, History, Inbox, Star,
} from "lucide-react";
import {
  loadAdminState, saveAdminState, resetAdminState, adminKpis,
  approveVerification, rejectVerification, setUserStatus,
  transitionEscrow, canTransition, addDisputeMessage, resolveDispute,
  type AdminState, type AdminDispute, type AdminEscrowTxn, type EscrowStatus,
} from "@/lib/admin/demo-store";
import { CommsHistory } from "@/components/bwm/live/CommsHistory";
import { subscribePhase as subscribePhaseStatus, phaseToStatus, type JobStatus } from "@/lib/live-trip/job-status";
import { DEMO_TRIP } from "@/lib/live-trip/simulator";
import { commsCounts, subscribeComms } from "@/lib/live-trip/comms-log";
import { UserDetailSheet } from "@/components/bwm/admin/UserDetailSheet";

type NavId = "dashboard" | "users" | "verifications" | "loads" | "payments" | "disputes" | "map" | "analytics" | "settings";

const NAV: Array<{ id: NavId; icon: any; label: string }> = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "users", icon: Users, label: "Users" },
  { id: "verifications", icon: ShieldCheck, label: "Verification queue" },
  { id: "loads", icon: Package, label: "Loads & Trips" },
  { id: "payments", icon: DollarSign, label: "Escrow & Payouts" },
  { id: "disputes", icon: Scale, label: "Disputes" },
  { id: "map", icon: Map, label: "Live Map" },
  { id: "analytics", icon: BarChart3, label: "Analytics" },
  { id: "settings", icon: Settings, label: "Settings" },
];

export function AdminDashboard() {
  const { go } = useOnboarding();
  const [active, setActive] = useState<NavId>("dashboard");
  const [state, setState] = useState<AdminState>(() => loadAdminState());
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => { saveAdminState(state); }, [state]);

  const reset = () => setState(resetAdminState());
  const pickNav = (id: NavId) => { setActive(id); setNavOpen(false); };

  const sidebar = (
    <>
      <div className="px-5 py-5 flex items-center gap-2 border-b border-border">
        <img src={logo} alt="BWM" className="h-9 w-9" />
        <div>
          <div className="font-bold text-sm">BWM Admin</div>
          <div className="text-[11px] text-muted-foreground">Console v1.0</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map((n) => {
          const badge =
            n.id === "verifications" ? state.verifications.filter(v => v.status === "pending").length :
            n.id === "disputes" ? state.disputes.filter(d => d.status === "open" || d.status === "investigating").length :
            0;
          return (
            <button
              key={n.id}
              onClick={() => pickNav(n.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active === n.id ? "bg-accent text-primary" : "text-foreground/70 hover:bg-surface hover:text-foreground"
              }`}
            >
              <n.icon className="h-4 w-4" /> <span className="flex-1 text-left">{n.label}</span>
              {badge > 0 && <span className="text-[10px] font-bold bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">{badge}</span>}
            </button>
          );
        })}
      </nav>
      <button onClick={reset} className="mx-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-surface">
        <RefreshCw className="h-3.5 w-3.5" /> Reset demo data
      </button>
      <button onClick={() => go("splash")} className="m-3 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10">
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </>
  );

  return (
    <div className="absolute inset-0 bg-surface flex flex-col overflow-hidden">
      {/* Mobile drawer */}
      {navOpen && (
        <div className="absolute inset-0 z-[70] bg-black/40 animate-in fade-in duration-150" onClick={() => setNavOpen(false)}>
          <aside className="w-[78%] max-w-[300px] h-full bg-background border-r border-border flex flex-col animate-in slide-in-from-left duration-200" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="flex-1 w-full min-w-0 overflow-y-auto overflow-x-hidden">
        <header className="px-3 py-3 border-b border-border bg-background flex items-center justify-between gap-2 sticky top-0 z-10">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button onClick={() => setNavOpen(true)} className="h-9 w-9 rounded-lg hover:bg-surface flex items-center justify-center shrink-0" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-bold truncate">{NAV.find((n) => n.id === active)?.label}</h1>
              <p className="text-[11px] text-muted-foreground truncate">BWM marketplace</p>
            </div>
          </div>
          <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center font-bold text-primary text-sm shrink-0">A</div>
        </header>

        <div key={active} className="w-full max-w-full min-w-0 p-3 pb-5 animate-in fade-in duration-200 overflow-x-hidden">
          {active === "dashboard" && <DashboardView state={state} onJump={pickNav} />}
          {active === "users" && <UsersView state={state} setState={setState} />}
          {active === "verifications" && <VerificationsView state={state} setState={setState} />}
          {active === "loads" && <LoadsView />}
          {active === "payments" && <PaymentsView state={state} setState={setState} />}
          {active === "disputes" && <DisputesView state={state} setState={setState} />}
          {active === "map" && <LiveMapView />}
          {active === "analytics" && <AnalyticsView state={state} />}
          {active === "settings" && <SettingsView state={state} setState={setState} />}
        </div>
      </main>
    </div>
  );
}

// ----------------------- Dashboard ---------------------------------------
function DashboardView({ state, onJump }: { state: AdminState; onJump: (id: NavId) => void }) {
  const k = adminKpis(state);
  const kpis = [
    { label: "Total Users", value: k.totalUsers.toString(), trend: "active", color: "text-success", to: "users" as NavId },
    { label: "Pending Verifications", value: k.pendingVerifications.toString(), trend: "review", color: "text-warning", to: "verifications" as NavId },
    { label: "Held in Escrow", value: `$${k.inEscrowTotal.toLocaleString()}`, trend: "live", color: "text-primary", to: "payments" as NavId },
    { label: "Open Disputes", value: k.openDisputes.toString(), trend: "action", color: "text-destructive", to: "disputes" as NavId },
    { label: "Platform revenue", value: `$${k.revenueThisMonth.toLocaleString()}`, trend: "MTD", color: "text-success", to: "analytics" as NavId },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        {kpis.map((k) => (
          <button key={k.label} onClick={() => onJump(k.to)} className="text-left rounded-2xl bg-background border border-border p-3 hover:border-primary transition-colors min-w-0">
            <div className="text-[11px] text-muted-foreground mb-1 truncate">{k.label}</div>
            <div className="text-xl font-bold text-foreground truncate">{k.value}</div>
            <div className={`text-[11px] font-medium mt-0.5 ${k.color}`}>{k.trend}</div>
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-background border border-border p-4">
        <h3 className="font-semibold mb-3 text-sm">Revenue (last 7 days)</h3>
        <div className="h-36 flex items-end gap-1.5">
          {[40, 65, 50, 80, 60, 95, 75].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
              <div className="w-full rounded-t-md bg-gradient-to-t from-primary to-[var(--primary-pressed)]" style={{ height: `${h}%` }} />
              <span className="text-[10px] text-muted-foreground">D{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-background border border-border p-4">
        <h3 className="font-semibold mb-3 text-sm">Escrow status</h3>
        <div className="space-y-2.5 text-xs">
          {[
            { l: "Released", v: k.releasedTotal, c: "bg-success" },
            { l: "In escrow", v: k.inEscrowTotal, c: "bg-warning" },
            { l: "Disputed", v: k.disputedTotal, c: "bg-destructive" },
          ].map((s) => (
            <div key={s.l} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0"><div className={`h-2.5 w-2.5 rounded-full shrink-0 ${s.c}`} /><span className="truncate">{s.l}</span></div>
              <span className="font-semibold shrink-0">${s.v.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-background border border-border p-5">
        <h3 className="font-semibold mb-4">Recent admin activity</h3>
        <ul className="space-y-3">
          {state.audit.slice(0, 6).map((r) => (
            <li key={r.id} className="flex items-center gap-3 text-sm min-w-0">
              <div className="h-8 w-8 rounded-full bg-surface flex items-center justify-center text-primary shrink-0"><CheckCircle2 className="h-4 w-4" /></div>
              <div className="flex-1 min-w-0"><div className="font-medium truncate">{r.action}</div><div className="text-xs text-muted-foreground truncate">{r.target}</div></div>
              <span className="text-xs text-muted-foreground shrink-0">{relTime(r.at)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

// ----------------------- Toolbar / Badge ---------------------------------
function Toolbar({ placeholder, value, onChange, right }: { placeholder: string; value: string; onChange: (v: string) => void; right?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 mb-4 min-w-0">
      <div className="relative w-full min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full pl-9 pr-3 rounded-lg bg-background border border-border text-sm" placeholder={placeholder} />
      </div>
      {right}
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/15 text-success",
    Active: "bg-success/15 text-success",
    pending: "bg-warning/15 text-warning",
    Pending: "bg-warning/15 text-warning",
    suspended: "bg-destructive/15 text-destructive",
    Suspended: "bg-destructive/15 text-destructive",
    open: "bg-destructive/15 text-destructive",
    investigating: "bg-warning/15 text-warning",
    resolved: "bg-success/15 text-success",
    refunded: "bg-muted text-muted-foreground",
    approved: "bg-success/15 text-success",
    rejected: "bg-destructive/15 text-destructive",
    initiated: "bg-muted text-muted-foreground",
    charged: "bg-primary/15 text-primary",
    held: "bg-warning/15 text-warning",
    released: "bg-success/15 text-success",
    paid_out: "bg-success/15 text-success",
    failed: "bg-destructive/15 text-destructive",
  };
  return <span className={`inline-flex shrink-0 whitespace-nowrap text-[11px] px-2 py-0.5 rounded-full font-medium ${map[status] || "bg-surface text-muted-foreground"}`}>{status}</span>;
}

// ----------------------- Users -------------------------------------------
function UsersView({ state, setState }: { state: AdminState; setState: (s: AdminState) => void }) {
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = state.users.filter(u => !q || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.includes(q.toLowerCase()));
  const selected = selectedId ? state.users.find((u) => u.id === selectedId) ?? null : null;
  return (
    <div>
      <Toolbar placeholder="Search users..." value={q} onChange={setQ} />
      <div className="space-y-2 min-w-0">
        {filtered.map((u) => (
          <div key={u.id} className="rounded-2xl bg-background border border-border p-3 animate-in fade-in duration-200 transition-shadow hover:shadow-md">
            <div className="flex flex-col gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setSelectedId(u.id)}
                className="text-left min-w-0 flex-1 rounded-lg -m-1 p-1 hover:bg-surface/60 active:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm break-words">{u.name}</span>
                  <Badge status={u.status} />
                </div>
                <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
                  <span>{u.role} · {u.trips} trips</span>
                  {u.rating ? (
                    <span className="inline-flex items-center gap-0.5">
                      · <Star className="h-3 w-3 fill-current text-amber-500" /> {u.rating}
                    </span>
                  ) : null}
                  <span className="ml-auto text-primary font-semibold">View profile →</span>
                </div>
              </button>
              {u.status !== "suspended" ? (
                <button onClick={(e) => { e.stopPropagation(); setState(setUserStatus(state, u.id, "suspended")); }} className="h-9 w-full rounded-lg bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors">Suspend</button>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); setState(setUserStatus(state, u.id, "active")); }} className="h-9 w-full rounded-lg bg-success/10 text-success text-xs font-semibold hover:bg-success/20 transition-colors">Reactivate</button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <EmptyState icon={Inbox} title="No users found" message="Try a different search term." />}
      </div>
      {selected && (
        <UserDetailSheet
          user={selected}
          state={state}
          setState={setState}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ----------------------- Verifications ----------------------------------
function VerificationsView({ state, setState }: { state: AdminState; setState: (s: AdminState) => void }) {
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [reject, setReject] = useState<{ id: string; reason: string } | null>(null);
  const items = state.verifications.filter(v => filter === "all" ? true : v.status === filter);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 -mx-3 px-3 admin-mobile-scroll">
        {(["pending", "approved", "rejected", "all"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`h-9 px-3 rounded-lg text-xs font-semibold capitalize shrink-0 whitespace-nowrap ${filter === f ? "bg-primary text-primary-foreground" : "bg-background border border-border"}`}>
            {f} {f === "pending" && `(${state.verifications.filter(v => v.status === "pending").length})`}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {items.map(v => (
          <div key={v.id} className="rounded-2xl bg-background border border-border p-3">
            <div className="flex flex-col gap-3 min-w-0">
              <div className="min-w-0">
                <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-2 gap-y-1 mb-1">
                  <FileText className="h-4 w-4 text-primary mt-0.5" />
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm leading-tight break-words">{v.doc_type}</span>
                  </div>
                  <div />
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <Badge status={v.status} />
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent text-primary font-medium">{v.applicant_role}</span>
                  </div>
                </div>
                <div className="text-sm">{v.applicant_name}</div>
                <div className="text-xs text-muted-foreground leading-relaxed break-words">
                  {v.document_number && <>Doc #{v.document_number} · </>}
                  {v.issuing_authority && <>Issued by {v.issuing_authority} · </>}
                  Submitted {relTime(v.submitted_at)}
                </div>
                {v.rejection_reason && <div className="mt-2 text-xs text-destructive">Reason: {v.rejection_reason}</div>}
                {v.reviewed_at && <div className="mt-1 text-xs text-muted-foreground">Reviewed by {v.reviewed_by} · {relTime(v.reviewed_at)}</div>}
              </div>
              {v.status === "pending" && (
                <div className="grid grid-cols-2 gap-2 w-full">
                  <button onClick={() => setState(approveVerification(state, v.id))} className="h-10 min-w-0 rounded-lg bg-success text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5"><CheckCircle2 className="h-4 w-4 shrink-0" /> Approve</button>
                  <button onClick={() => setReject({ id: v.id, reason: "" })} className="h-10 min-w-0 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold flex items-center justify-center gap-1.5"><X className="h-4 w-4 shrink-0" /> Reject</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && <EmptyState icon={Inbox} title="Nothing here" message={`No ${filter === "all" ? "" : filter} verifications to show.`} />}
      </div>

      {reject && (
        <Modal onClose={() => setReject(null)} title="Reject verification">
          <p className="text-xs text-muted-foreground mb-3">Tell the applicant why so they can resubmit.</p>
          <textarea
            value={reject.reason}
            onChange={(e) => setReject({ ...reject, reason: e.target.value })}
            placeholder="e.g. Document is blurry, expired, or missing signature."
            className="w-full min-h-24 p-3 rounded-lg bg-surface border border-border text-sm"
          />
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button onClick={() => setReject(null)} className="h-9 px-4 rounded-lg bg-background border border-border text-xs font-semibold">Cancel</button>
            <button onClick={() => { setState(rejectVerification(state, reject.id, reject.reason)); setReject(null); }} className="h-9 px-4 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold">Confirm reject</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ----------------------- Loads (live status + comms) --------------------
function LoadsView() {
  const seed = [
    { id: DEMO_TRIP.id, title: DEMO_TRIP.loadName, route: `${DEMO_TRIP.pickup.city} → ${DEMO_TRIP.destination.city}`, price: "$3,000", initial: "active" as JobStatus },
    { id: "EV-2017002", title: "Wind Turbine Blade", route: "Amarillo → OKC", price: "$5,400", initial: "pending" as JobStatus },
    { id: "EV-2017003", title: "Modular Home Section", route: "Tulsa → Wichita", price: "$2,200", initial: "pending" as JobStatus },
  ];
  const [statuses, setStatuses] = useState<Record<string, JobStatus>>(
    () => Object.fromEntries(seed.map((s) => [s.id, s.initial])),
  );
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(seed.map((s) => [s.id, commsCounts(s.id).total])),
  );
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  // Live-sync the demo trip via Realtime broadcast.
  useEffect(() => {
    const unsub = subscribePhaseStatus(DEMO_TRIP.id, (e) =>
      setStatuses((s) => ({ ...s, [DEMO_TRIP.id]: phaseToStatus(e.phase) })),
    );
    return () => { unsub(); };
  }, []);

  // Refresh comms counts whenever the comms log changes.
  useEffect(() => {
    const refresh = () =>
      setCounts(Object.fromEntries(seed.map((s) => [s.id, commsCounts(s.id).total])));
    const unsub = subscribeComms(refresh);
    refresh();
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="space-y-2">
        {seed.map((l) => (
          <div key={l.id} className="rounded-2xl bg-background border border-border p-3 animate-in fade-in duration-200">
            <div className="flex flex-col gap-2 mb-1 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm truncate">{l.title}</span>
                  <LiveStatusBadge status={statuses[l.id]} />
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{l.id}</div>
              </div>
              <div className="text-sm font-bold text-success">{l.price}</div>
            </div>
            <div className="text-xs text-muted-foreground truncate">{l.route}</div>
            <div className="mt-2 flex justify-end">
              <button onClick={() => setHistoryFor(l.id)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                <History className="h-3.5 w-3.5" /> {counts[l.id] ?? 0} comms
              </button>
            </div>
          </div>
        ))}
      </div>
      {historyFor && (
        <div className="fixed inset-0 z-[60]">
          <CommsHistory open={true} onClose={() => setHistoryFor(null)} tripId={historyFor} />
        </div>
      )}
    </>
  );
}

function LiveStatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { label: string; cls: string; dot: string }> = {
    pending: { label: "Pending", cls: "bg-warning/15 text-warning", dot: "bg-warning" },
    active: { label: "Active", cls: "bg-success/15 text-success", dot: "bg-success animate-pulse" },
    completed: { label: "Completed", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full font-medium ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} /> {m.label}
    </span>
  );
}

// ----------------------- Payments / Escrow ------------------------------
function PaymentsView({ state, setState }: { state: AdminState; setState: (s: AdminState) => void }) {
  const k = adminKpis(state);
  const [open, setOpen] = useState<AdminEscrowTxn | null>(null);

  const action = (e: AdminEscrowTxn, to: EscrowStatus) => {
    setState(transitionEscrow(state, e.id, to));
    setOpen(state.escrow.find(x => x.id === e.id) || null);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2">
        {[{ l: "Released", v: k.releasedTotal }, { l: "In escrow", v: k.inEscrowTotal }, { l: "Disputed", v: k.disputedTotal }].map((s) => (
          <div key={s.l} className="rounded-2xl bg-background border border-border p-2.5 min-w-0">
            <div className="text-[10px] text-muted-foreground truncate">{s.l}</div>
            <div className="text-sm font-bold mt-1 truncate">${s.v.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {state.escrow.map((e) => (
          <div key={e.id} className="rounded-2xl bg-background border border-border p-3 animate-in fade-in duration-200">
            <div className="flex flex-col gap-2 mb-1 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm truncate">{e.job_title}</span>
                  <Badge status={e.status} />
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{e.id}</div>
              </div>
              <div className="text-sm font-bold">${e.amount.toLocaleString()}</div>
            </div>
            <div className="text-xs text-muted-foreground truncate">{e.dispatcher_name} → {e.pilot_name}</div>
            <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
              <span className="text-success font-semibold">Net ${e.net_to_pilot.toLocaleString()}</span>
              <button onClick={() => setOpen(e)} className="h-9 w-full rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Manage</button>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <Modal onClose={() => setOpen(null)} title={`Escrow ${open.id}`}>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl bg-surface p-3">
              <div className="font-semibold">{open.job_title}</div>
              <div className="text-xs text-muted-foreground">{open.dispatcher_name} → {open.pilot_name}</div>
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs">
              <Row k="Gross" v={`$${open.amount.toLocaleString()}`} />
              <Row k="Platform fee" v={`-$${open.platform_fee}`} />
              <Row k="Stripe fee" v={`-$${open.stripe_fee}`} />
              <Row k="Net to pilot" v={`$${open.net_to_pilot}`} highlight />
            </div>
            <div className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">Status:</span> <Badge status={open.status} /></div>
            {open.notes && <div className="text-xs text-muted-foreground italic">"{open.notes}"</div>}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {(["charged", "held", "released", "paid_out", "refunded", "failed"] as EscrowStatus[]).map(t => (
                <button
                  key={t}
                  disabled={!canTransition(open.status, t)}
                  onClick={() => action(open, t)}
                  className="h-9 px-3 rounded-lg text-xs font-semibold bg-background border border-border disabled:opacity-30 hover:border-primary"
                >
                  → {t.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between p-2 rounded-lg ${highlight ? "bg-success/10 text-success font-bold" : "bg-surface"}`}>
      <span>{k}</span><span>{v}</span>
    </div>
  );
}

// ----------------------- Disputes ---------------------------------------
function DisputesView({ state, setState }: { state: AdminState; setState: (s: AdminState) => void }) {
  const [open, setOpen] = useState<AdminDispute | null>(null);
  const [reply, setReply] = useState("");
  const [resolving, setResolving] = useState<{ outcome: "release" | "refund" | "split"; note: string } | null>(null);

  const current = open ? state.disputes.find(d => d.id === open.id) || null : null;

  return (
    <div>
      <div className="space-y-3">
        {state.disputes.map((d) => (
          <div key={d.id} className="rounded-2xl bg-background border border-border p-3">
            <div className="flex flex-col gap-3 min-w-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-sm break-words">{d.reason}</span>
                  <Badge status={d.status} />
                </div>
                <div className="text-xs text-muted-foreground break-words">Trip {d.trip_id} · {d.parties} · ${d.amount.toLocaleString()}</div>
                <div className="text-sm mt-2 leading-relaxed break-words">{d.detail}</div>
                {d.resolution && <div className="text-xs mt-2 p-2 rounded-lg bg-success/10 text-success">{d.resolution}</div>}
              </div>
              <button onClick={() => { setOpen(d); setReply(""); }} className="h-9 w-full rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Open</button>
            </div>
          </div>
        ))}
      </div>

      {current && (
        <Modal onClose={() => { setOpen(null); setResolving(null); }} title={`Case ${current.id} — ${current.reason}`}>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl bg-surface p-3 text-xs">
              <div><span className="text-muted-foreground">Trip:</span> {current.trip_id}</div>
              <div><span className="text-muted-foreground">Parties:</span> {current.parties}</div>
              <div><span className="text-muted-foreground">Amount:</span> ${current.amount.toLocaleString()}</div>
              <div className="mt-1 flex items-center gap-2"><span className="text-muted-foreground">Status:</span> <Badge status={current.status} /></div>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {current.messages.map((m, i) => (
                <div key={i} className={`p-2.5 rounded-lg text-xs ${m.role === "admin" ? "bg-primary/10" : "bg-surface"}`}>
                  <div className="font-semibold flex items-center justify-between">
                    <span>{m.by} <span className="text-muted-foreground font-normal">· {m.role}</span></span>
                    <span className="text-muted-foreground font-normal">{relTime(m.at)}</span>
                  </div>
                  <div className="mt-0.5">{m.body}</div>
                </div>
              ))}
            </div>

            {current.status !== "resolved" && current.status !== "refunded" && (
              <>
                <div className="flex flex-col gap-2">
                  <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to both parties..." className="w-full h-10 px-3 rounded-lg bg-surface border border-border text-sm" />
                  <button onClick={() => { setState(addDisputeMessage(state, current.id, reply)); setReply(""); }} className="h-10 w-full rounded-lg bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5"><Send className="h-4 w-4" /> Send</button>
                </div>

                <div className="pt-2 border-t border-border">
                  <div className="text-xs font-semibold mb-2">Resolve case</div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setResolving({ outcome: "release", note: "Funds released to pilot — claim not substantiated." })} className="h-9 px-3 rounded-lg bg-success text-primary-foreground text-xs font-semibold">Release</button>
                    <button onClick={() => setResolving({ outcome: "split", note: "Partial credit issued, pilot received warning." })} className="h-9 px-3 rounded-lg bg-warning text-primary-foreground text-xs font-semibold">Split</button>
                    <button onClick={() => setResolving({ outcome: "refund", note: "Full refund issued to dispatcher." })} className="h-9 px-3 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold">Refund</button>
                  </div>
                </div>
              </>
            )}

            {resolving && (
              <div className="rounded-xl border border-primary p-3 space-y-2">
                <div className="text-xs font-semibold">Confirm resolution ({resolving.outcome})</div>
                <textarea value={resolving.note} onChange={(e) => setResolving({ ...resolving, note: e.target.value })} className="w-full min-h-20 p-2 rounded-lg bg-surface border border-border text-xs" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setResolving(null)} className="h-8 px-3 rounded-lg bg-background border border-border text-xs">Cancel</button>
                  <button onClick={() => { setState(resolveDispute(state, current.id, resolving.outcome, resolving.note)); setResolving(null); }} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Confirm</button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ----------------------- Live Map ---------------------------------------
function LiveMapView() {
  const jobs = [
    { id: "TX-1", title: "Industrial Generator Escort", status: "active", pickup: { lat: 32.7767, lng: -96.797, label: "Dallas, TX" }, dropoff: { lat: 29.76, lng: -95.37, label: "Houston, TX" }, current: { lat: 31.5, lng: -96.1 } },
    { id: "OK-2", title: "Wind Turbine Blade", status: "delayed", pickup: { lat: 35.4676, lng: -97.5164, label: "OKC, OK" }, dropoff: { lat: 36.1539, lng: -95.9928, label: "Tulsa, OK" }, current: { lat: 35.8, lng: -96.7 } },
    { id: "AZ-3", title: "Modular Home", status: "active", pickup: { lat: 33.4484, lng: -112.074, label: "Phoenix, AZ" }, dropoff: { lat: 32.2226, lng: -110.9747, label: "Tucson, AZ" }, current: { lat: 32.85, lng: -111.5 } },
    { id: "LA-4", title: "Bridge Beam", status: "issue", pickup: { lat: 30.4515, lng: -91.1871, label: "Baton Rouge, LA" }, dropoff: { lat: 29.9511, lng: -90.0715, label: "New Orleans, LA" }, current: { lat: 30.2, lng: -90.6 } },
  ];
  return (
    <div className="rounded-2xl bg-background border border-border overflow-hidden animate-in fade-in">
      <Suspense fallback={<div style={{ height: 360 }} className="bg-surface animate-pulse" />}>
        <AdminLiveMap jobs={jobs} height={360} />
      </Suspense>
      <div className="px-3 py-2 border-t border-border flex items-center justify-between text-[11px] gap-2">
        <div className="truncate"><span className="font-semibold">{jobs.length} active</span> · demo data</div>
        <div className="text-muted-foreground shrink-0">Just now</div>
      </div>
    </div>
  );
}


// ----------------------- Analytics --------------------------------------
function AnalyticsView({ state }: { state: AdminState }) {
  const k = adminKpis(state);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-background border border-border p-5">
        <h3 className="font-semibold mb-4">Trips per state</h3>
        <div className="space-y-2">
          {[{ s: "Texas", v: 78 }, { s: "Oklahoma", v: 54 }, { s: "Arizona", v: 41 }, { s: "Louisiana", v: 33 }, { s: "Kansas", v: 22 }].map((r) => (
            <div key={r.s}>
              <div className="flex justify-between text-xs mb-1"><span>{r.s}</span><span className="text-muted-foreground">{r.v}</span></div>
              <div className="h-2 rounded-full bg-surface overflow-hidden"><div className="h-full bg-primary" style={{ width: `${r.v}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl bg-background border border-border p-5">
        <h3 className="font-semibold mb-4">Marketplace KPIs</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <KpiTile label="Avg pilot rating" value="4.7/5" />
          <KpiTile label="Total users" value={k.totalUsers.toString()} />
          <KpiTile label="Open disputes" value={k.openDisputes.toString()} />
          <KpiTile label="Pending verifications" value={k.pendingVerifications.toString()} />
          <KpiTile label="Held in escrow" value={`$${k.inEscrowTotal.toLocaleString()}`} />
          <KpiTile label="Platform revenue" value={`$${k.revenueThisMonth.toLocaleString()}`} />
        </div>
      </div>
    </div>
  );
}
function KpiTile({ label, value }: { label: string; value: string }) {
  return <div className="p-3 rounded-xl bg-surface"><div className="text-[11px] text-muted-foreground">{label}</div><div className="text-lg font-bold">{value}</div></div>;
}

// ----------------------- Settings ---------------------------------------
function SettingsView({ state, setState }: { state: AdminState; setState: (s: AdminState) => void }) {
  const update = (k: keyof AdminState["settings"], v: any) => setState({ ...state, settings: { ...state.settings, [k]: v } });
  const fields: Array<{ k: keyof AdminState["settings"]; l: string; type: "number" | "text" }> = [
    { k: "platform_fee_pct", l: "Marketplace fee (%)", type: "number" },
    { k: "payout_window_days", l: "Auto-payout window (days)", type: "number" },
    { k: "auto_approve_below", l: "Auto-approve verifications below ($)", type: "number" },
    { k: "kyc_provider", l: "KYC provider", type: "text" },
    { k: "support_email", l: "Support email", type: "text" },
  ];
  return (
    <div className="space-y-3 w-full max-w-full min-w-0">
      {fields.map((f) => (
        <div key={f.k} className="rounded-2xl bg-background border border-border p-3 flex flex-col gap-2 min-w-0">
          <div className="text-sm font-medium leading-snug break-words">{f.l}</div>
          <input
            type={f.type}
            value={state.settings[f.k] as any}
            onChange={(e) => update(f.k, f.type === "number" ? Number(e.target.value) : e.target.value)}
            className="h-10 w-full min-w-0 px-3 rounded-lg bg-surface border border-border text-sm"
          />
        </div>
      ))}
    </div>
  );
}

// ----------------------- Empty state ------------------------------------
function EmptyState({ icon: Icon, title, message }: { icon: any; title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center animate-in fade-in duration-300">
      <div className="h-14 w-14 rounded-full bg-surface flex items-center justify-center mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground mt-1 max-w-xs">{message}</div>
    </div>
  );
}

// ----------------------- Modal -----------------------------------------
function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center p-2 animate-in fade-in duration-150" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-background rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in zoom-in-95 fade-in duration-200">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between sticky top-0 bg-background z-10">
          <div className="font-semibold truncate pr-2">{title}</div>
          <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-surface flex items-center justify-center shrink-0" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 min-w-0 overflow-x-hidden">{children}</div>
      </div>
    </div>
  );
}

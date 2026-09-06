import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { LoadReadyMark } from "@/components/loadready/brand/Brand";
import type { IconComponent } from "@/components/loadready/AppShell";
import {
  Activity,
  Flag,
  SlidersHorizontal,
  LayoutDashboard,
  Users,
  Package,
  CreditCard,
  BadgeCheck,
  FileText,
  Scale,
  LogOut,
  ShieldCheck,
  Menu,
  TrendingUp,
} from "lucide-react";
import { PeoplePanel } from "@/components/loadready/admin/PeoplePanel";
import { DisputesPanel } from "@/components/loadready/admin/DisputesPanel";
import { AdminSettingsPanel } from "@/components/loadready/admin/SettingsPanel";
import { SignupApprovals } from "@/components/loadready/admin/SignupApprovals";
import { PilotAccessPanel } from "@/components/loadready/admin/PilotAccessPanel";
import { VerificationQueue } from "@/components/loadready/admin/VerificationQueue";
import { AdminLegalPanel } from "@/components/loadready/admin/LegalPanel";
import {
  ConsoleAudit,
  ConsoleHealth,
  ConsoleGrowth,
  ConsoleJobs,
  ConsoleOverview,
} from "@/components/loadready/admin/ConsoleData";

type NavId =
  | "dashboard"
  | "people"
  | "disputes"
  | "verifications"
  | "pilot-verification"
  | "jobs"
  | "growth"
  | "pilot-access"
  | "legal"
  | "audit"
  | "health"
  | "settings";

/*
 * Only what exists.
 *
 * "Escrow & Payouts" is gone: it was a ledger of held, released and paid-out
 * money with a 12% platform fee, for money LoadReady never touches (D1, F-85).
 * Users, Disputes and Settings needed the browser's demo store; they come back
 * in J2 and J3 on real data rather than staying as screens that pretend.
 */
const NAV: Array<{ id: NavId; icon: IconComponent; label: string }> = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "people", icon: Users, label: "People" },
  { id: "verifications", icon: ShieldCheck, label: "Signup approvals" },
  { id: "pilot-verification", icon: BadgeCheck, label: "Pilot verification" },
  { id: "jobs", icon: Package, label: "Jobs" },
  { id: "growth", icon: TrendingUp, label: "Where people stop" },
  { id: "pilot-access", icon: CreditCard, label: "Pilot access" },
  { id: "disputes", icon: Flag, label: "Disputes" },
  { id: "legal", icon: Scale, label: "Legal" },
  { id: "audit", icon: FileText, label: "Audit log" },
  { id: "health", icon: Activity, label: "System health" },
  { id: "settings", icon: SlidersHorizontal, label: "Settings" },
];

export function AdminDashboard() {
  const { signOut } = useAuth();
  const [active, setActive] = useState<NavId>("dashboard");
  const [navOpen, setNavOpen] = useState(false);

  /*
   * The two counts worth a badge, from the server.
   *
   * Both are queues where nobody can work until an administrator acts, which
   * is the only reason a number in a sidebar earns its place.
   */
  const [queues, setQueues] = useState({ approvals: 0, verifications: 0 });
  useEffect(() => {
    void fetch("/api/admin", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.overview) return;
        setQueues({
          approvals: data.overview.people.awaitingApproval,
          verifications: data.overview.people.verificationBacklog,
        });
      })
      .catch(() => {
        // A badge that failed to load is not worth an error screen over the
        // whole console; every panel reports its own failures.
      });
  }, []);

  const pickNav = (id: NavId) => {
    setActive(id);
    setNavOpen(false);
  };

  const sidebar = (
    <>
      <div className="px-5 py-5 flex items-center gap-2 border-b border-border">
        <LoadReadyMark className="h-9 w-9" />
        <div>
          <div className="font-bold text-sm">LoadReady Admin</div>
          <div className="text-[11px] text-muted-foreground">Console v1.0</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map((n) => {
          const badge =
            n.id === "verifications"
              ? queues.approvals
              : n.id === "pilot-verification"
                ? queues.verifications
                : 0;
          return (
            <button
              key={n.id}
              onClick={() => pickNav(n.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active === n.id
                  ? "bg-accent text-primary"
                  : "text-foreground/70 hover:bg-surface hover:text-foreground"
              }`}
            >
              <n.icon className="h-4 w-4" /> <span className="flex-1 text-left">{n.label}</span>
              {badge > 0 && (
                <span className="text-[10px] font-bold bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <button
        onClick={() => void signOut()}
        className="m-3 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </>
  );

  return (
    <div className="absolute inset-0 bg-surface flex flex-col overflow-hidden">
      {/* Mobile drawer */}
      {navOpen && (
        <div
          className="absolute inset-0 z-[70] bg-black/40 animate-in fade-in duration-150"
          onClick={() => setNavOpen(false)}
        >
          <aside
            className="w-[78%] max-w-[300px] h-full bg-background border-r border-border flex flex-col animate-in slide-in-from-left duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebar}
          </aside>
        </div>
      )}

      <main className="flex-1 w-full min-w-0 overflow-y-auto overflow-x-hidden">
        <header className="px-3 py-3 border-b border-border bg-background flex items-center justify-between gap-2 sticky top-0 z-10">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => setNavOpen(true)}
              className="h-9 w-9 rounded-lg hover:bg-surface flex items-center justify-center shrink-0"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-bold truncate">
                {NAV.find((n) => n.id === active)?.label}
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">LoadReady marketplace</p>
            </div>
          </div>
          <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center font-bold text-primary text-sm shrink-0">
            A
          </div>
        </header>

        <div
          key={active}
          className="w-full max-w-full min-w-0 p-3 pb-5 animate-in fade-in duration-200 overflow-x-hidden"
        >
          {active === "dashboard" && <ConsoleOverview onJump={(id) => pickNav(id as NavId)} />}
          {active === "people" && <PeoplePanel />}
          {active === "verifications" && <SignupApprovals />}
          {active === "pilot-verification" && <VerificationQueue />}
          {active === "jobs" && <ConsoleJobs />}
          {active === "growth" && <ConsoleGrowth />}
          {active === "pilot-access" && <PilotAccessPanel />}
          {active === "legal" && <AdminLegalPanel />}
          {active === "disputes" && <DisputesPanel />}
          {active === "audit" && <ConsoleAudit />}
          {active === "settings" && <AdminSettingsPanel />}
          {active === "health" && <ConsoleHealth />}
        </div>
      </main>
    </div>
  );
}

// ----------------------- Empty state ------------------------------------

import { useEffect, useState } from "react";
import { useOnboarding } from "@/lib/onboarding-context";
import { useAuth } from "@/lib/auth-context";
import { SubscriptionBanner, SubscriptionSheet } from "./BillingScreens";
import { VerificationWizardSheet } from "@/components/loadready/pilot/VerificationWizard";
import { CompanyProfilePanel } from "@/components/loadready/dispatcher/CompanyProfilePanel";
import { SettingsPanel } from "./SettingsPanel";
import { LegalPanel } from "./LegalScreens";
import { LoadBoard } from "@/components/loadready/pilot/LoadBoard";
import { PostLoadWizard } from "@/components/loadready/dispatcher/PostLoadWizard";
import { MyLoads } from "@/components/loadready/dispatcher/MyLoads";
import * as marketplace from "@/lib/marketplace/api";
import type { Load } from "@/lib/marketplace/types";
import { useAppNav, type NavItem } from "@/components/loadready/AppShell";
import { LoadReadyMark } from "@/components/loadready/brand/Brand";
import {
  Truck,
  User,
  Home as HomeIcon,
  ClipboardList,
  Power,
  Plus,
  X,
  ChevronRight,
  Star,
  LogOut,
  Settings,
  FileText,
  Wallet,
  CreditCard,
  Building2,
  Scale,
  Shield,
  Briefcase,
} from "lucide-react";
import type { IconComponent } from "@/components/loadready/AppShell";
/*
 * The live-trip screens are not wired to real jobs, and deliberately.
 *
 * Both of them — the pilot's and the dispatcher's — are driven by a simulator
 * that walks a hard-coded Dallas-to-Houston route. Hanging that off a real
 * assignment would draw an invented route over a real escort and show a
 * dispatcher a truck that is not there. They need real GPS from the pilot's
 * device and the load's approved route, which is Phase I (BACKLOG F-78).
 */
import { DocumentsSheet, useVerificationStatus } from "@/components/loadready/pilot/PilotSheets";
import { MyOrders } from "@/components/loadready/pilot/MyOrders";
import { MyBids } from "@/components/loadready/pilot/MyBids";
import { EarningsSheet } from "@/components/loadready/pilot/EarningsSheet";
import { SecurityPanel } from "@/components/loadready/shared/SecurityPanel";
import {
  NotificationBell,
  NotificationCentre,
} from "@/components/loadready/shared/NotificationCentre";
import { ShieldCheck, AlertCircle } from "lucide-react";

type Tab = "orders" | "home" | "profile";

/** Bottom bar on a phone, sidebar on a desktop — the shell decides which. */
const TABS: NavItem[] = [
  { id: "orders", label: "My orders", icon: ClipboardList },
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "profile", label: "Profile", icon: User },
];

/** First letter of a name, for the avatar circle. */
const initialOf = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

/**
 * A bottom sheet with a title, for panels that bring their own content.
 * The role screens each had their own copy of this; one is enough.
 */
function PanelSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-3xl bg-background"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 pt-4 pb-3">
          <h3 className="font-bold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ───────── PILOT ─────────
export function PilotHome() {
  const { role } = useOnboarding();
  const { signOut, user } = useAuth();
  const displayName = user?.fullName || user?.email || "";
  const [online, setOnline] = useState(true);
  const [tab, setTab] = useState<Tab>("home");
  const [showEarnings, setShowEarnings] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showBids, setShowBids] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLegal, setShowLegal] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const profile = useVerificationStatus();
  const verified = profile.verification_status === "approved";

  useAppNav({ items: TABS, active: tab, onSelect: (id) => setTab(id as Tab) });

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/60">
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
          <button
            onClick={() => setTab("profile")}
            className="flex items-center gap-2.5 min-w-0 group"
            aria-label="Open profile"
          >
            <div className="relative shrink-0">
              <div className="h-11 w-11 rounded-full bg-gradient-to-br from-primary to-[var(--primary-pressed)] flex items-center justify-center font-bold text-primary-foreground shadow-sm">
                {initialOf(displayName)}
              </div>
              <div
                className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${
                  online ? "bg-success" : "bg-muted-foreground"
                }`}
              />
            </div>
            <div className="min-w-0 text-left">
              <div className="font-semibold text-sm truncate">{displayName}</div>
              {/*
                A rating is earned from finished jobs and stays hidden until
                both sides have written one, so there is nothing to show until
                there is. No invented star, and no zero dressed up as a score.
              */}
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Star className="h-3 w-3 text-muted-foreground" />
                <span>Pilot</span>
              </div>
            </div>
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            {/*
              The bell used to wear a red dot permanently, over an empty list.
              It now carries the real unread count and goes out when read.
            */}
            <NotificationBell onOpen={() => setShowNotif(true)} />
            <button
              onClick={() => setShowEarnings(true)}
              /* h-11: 44px, rule 11. Tapped from a cab, sometimes with gloves. */
              className="h-11 px-3.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-sm hover:bg-[var(--primary-pressed)] transition-colors"
            >
              <Wallet className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Earnings</span>
              <span className="xs:hidden">$</span>
            </button>
          </div>
        </div>
        <div className="px-4 pb-2 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-[10px] font-medium text-primary border border-primary/20">
            <LoadReadyMark className="h-2.5 w-2.5" />
            {role === "dispatcher" ? "Dispatcher" : "Pilot"} preview
          </span>
        </div>
      </header>

      {/* Body switch by tab */}
      {tab === "home" && (
        <PilotDashboard
          online={online}
          setOnline={setOnline}
          verified={verified}
          completionPct={profile.completion_pct}
          verificationStatus={profile.verification_status}
          onOpenVerify={() => setShowVerify(true)}
          onOpenEarnings={() => setShowEarnings(true)}
          onOpenBids={() => setShowBids(true)}
          onOpenDocs={() => setShowDocs(true)}
          onOpenOrders={() => setTab("orders")}
          onOpenSubscription={() => setShowSubscription(true)}
        />
      )}
      {tab === "orders" && (
        <MyOrders onOpenBids={() => setShowBids(true)} onBrowse={() => setTab("home")} />
      )}
      {tab === "profile" && (
        <ProfileTab
          name={displayName}
          onLogout={() => void signOut()}
          role="Pilot"
          onOpen={(k) => {
            if (k === "verify") setShowVerify(true);
            if (k === "documents") setShowDocs(true);
            if (k === "earnings") setShowEarnings(true);
            if (k === "bids") setShowBids(true);
            if (k === "subscription") setShowSubscription(true);
            if (k === "settings") setShowSettings(true);
            if (k === "security") setShowSecurity(true);
            if (k === "legal") setShowLegal(true);
          }}
        />
      )}

      {showEarnings && <EarningsSheet onClose={() => setShowEarnings(false)} />}
      {showVerify && <VerificationWizardSheet onClose={() => setShowVerify(false)} />}
      {showDocs && <DocumentsSheet onClose={() => setShowDocs(false)} />}
      {showBids && (
        <MyBids
          onClose={() => setShowBids(false)}
          onBrowse={() => {
            setShowBids(false);
            setTab("home");
          }}
        />
      )}
      {showSubscription && <SubscriptionSheet onClose={() => setShowSubscription(false)} />}
      {showSettings && (
        <PanelSheet title="Preferences" onClose={() => setShowSettings(false)}>
          <SettingsPanel />
        </PanelSheet>
      )}
      {showLegal && (
        <PanelSheet title="Terms & privacy" onClose={() => setShowLegal(false)}>
          <LegalPanel />
        </PanelSheet>
      )}
      {showSecurity && (
        <PanelSheet title="Security" onClose={() => setShowSecurity(false)}>
          <SecurityPanel />
        </PanelSheet>
      )}
      {showNotif && <NotificationCentre onClose={() => setShowNotif(false)} />}
    </div>
  );
}

function PilotDashboard({
  online,
  setOnline,
  verified,
  completionPct,
  verificationStatus,
  onOpenVerify,
  onOpenEarnings,
  onOpenBids,
  onOpenDocs,
  onOpenOrders,
  onOpenSubscription,
}: {
  online: boolean;
  setOnline: (v: boolean | ((p: boolean) => boolean)) => void;
  verified: boolean;
  completionPct: number;
  verificationStatus: string;
  onOpenVerify: () => void;
  onOpenEarnings: () => void;
  onOpenBids: () => void;
  onOpenDocs: () => void;
  onOpenOrders: () => void;
  onOpenSubscription: () => void;
}) {
  return (
    <div className="flex-1 px-4 pt-4 space-y-4">
      {/* Online status hero */}
      <div
        className={`relative overflow-hidden rounded-3xl p-5 transition-colors ${
          online
            ? "bg-gradient-to-br from-primary to-[var(--primary-pressed)] text-primary-foreground"
            : "bg-surface border border-border text-foreground"
        }`}
      >
        {online && (
          <>
            <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/20" />
            <div className="absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-white/10" />
          </>
        )}
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2.5 w-2.5">
                {online && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-success-foreground/70 opacity-75 animate-ping" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${online ? "bg-success-foreground" : "bg-muted-foreground"}`}
                />
              </span>
              <span
                className={`text-[11px] font-semibold uppercase tracking-wider ${online ? "opacity-90" : "text-muted-foreground"}`}
              >
                {online ? "You're online" : "You're offline"}
              </span>
            </div>
            <h2 className="text-lg font-bold leading-tight">
              {online ? "Ready to receive offers" : "You won't receive offers"}
            </h2>
            <p className={`text-xs mt-1 ${online ? "opacity-90" : "text-muted-foreground"}`}>
              {online
                ? "Stay nearby — new loads in your area will appear instantly."
                : "Go online to start receiving load offers in your area."}
            </p>
          </div>
          <button
            onClick={() => setOnline((o) => !o)}
            className={`shrink-0 h-11 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm ${
              online
                ? "bg-card text-primary hover:bg-card/90"
                : "bg-primary text-primary-foreground hover:bg-[var(--primary-pressed)]"
            }`}
          >
            <Power className="h-3.5 w-3.5" />
            Go {online ? "offline" : "online"}
          </button>
        </div>
      </div>

      <SubscriptionBanner onOpen={onOpenSubscription} />

      {/* Verification card */}
      {!verified && (
        <button
          onClick={onOpenVerify}
          className="w-full text-left rounded-2xl bg-surface border border-border p-4 flex items-center gap-3 hover:border-primary/40 transition-colors"
        >
          <div className="h-11 w-11 rounded-xl bg-accent flex items-center justify-center shrink-0">
            {verificationStatus === "in_review" ? (
              <ShieldCheck className="h-5 w-5 text-primary" />
            ) : (
              <AlertCircle className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold truncate">
                {verificationStatus === "in_review"
                  ? "Verification in review"
                  : "Finish your verification"}
              </div>
              <span className="text-[10px] font-bold text-primary shrink-0">{completionPct}%</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {verificationStatus === "in_review"
                ? "Bidding unlocks after admin approval"
                : "Complete your profile to start bidding"}
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-background overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-[var(--primary-pressed)] transition-all"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      )}

      {/* Quick actions */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
          Quick actions
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: Briefcase, label: "Bids", onClick: onOpenBids },
            { icon: Truck, label: "Orders", onClick: onOpenOrders },
            { icon: FileText, label: "Docs", onClick: onOpenDocs },
            { icon: Wallet, label: "Earnings", onClick: onOpenEarnings },
          ].map((q) => (
            <button
              key={q.label}
              onClick={q.onClick}
              className="rounded-2xl bg-surface border border-border p-3 flex flex-col items-center gap-1.5 hover:border-primary/40 hover:bg-accent transition-colors"
            >
              <div className="h-9 w-9 rounded-xl bg-accent flex items-center justify-center">
                <q.icon className="h-4 w-4 text-primary" />
              </div>
              <span className="text-[11px] font-medium">{q.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Available loads */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Available loads
          </h3>
          <button
            onClick={onOpenBids}
            className="flex min-h-11 items-center px-2 text-[11px] font-semibold text-primary"
          >
            My bids
          </button>
        </div>
        {!online ? (
          <div className="rounded-2xl bg-surface border border-dashed border-border p-6 text-center">
            <div className="h-11 w-11 rounded-full bg-accent mx-auto flex items-center justify-center mb-2">
              <Power className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm font-semibold">You're offline</p>
            <p className="text-xs text-muted-foreground mt-1">
              Go online to see available loads in your area.
            </p>
          </div>
        ) : (
          /*
            The real board, from the server.

            What was here was a list of invented offers held in the browser —
            titles, prices and distances that no dispatcher had posted. This is
            work that actually exists, filtered to the regions this pilot works,
            with the reason attached when they cannot take it.
          */
          <LoadBoard onOpenProfile={onOpenVerify} />
        )}
      </div>

      {/*
        An earnings tile used to sit here showing
        `accepted.length * 3000 + 8420` dollars and "payout in 2 days".

        Both were invented, and the second was a promise LoadReady cannot keep:
        dispatchers pay pilots directly and we never hold or release the money
        (D1). Real earnings are agreed-pay records against completed
        assignments, which arrive with the assignment lifecycle in H3.
      */}
    </div>
  );
}

// ───────── DISPATCHER ─────────
import {
  BusinessVerificationWizard,
  useDispatcherState,
} from "@/components/loadready/dispatcher/DispatcherSheets";

export function DispatcherHome() {
  const { signOut, user } = useAuth();
  const displayName = user?.fullName || user?.email || "";
  const [tab, setTab] = useState<Tab>("home");
  const [showCreate, setShowCreate] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [showCompany, setShowCompany] = useState(false);
  const [showDispatcherSettings, setShowDispatcherSettings] = useState(false);
  const [showDispatcherLegal, setShowDispatcherLegal] = useState(false);
  const [showDispatcherSecurity, setShowDispatcherSecurity] = useState(false);
  useAppNav({ items: TABS, active: tab, onSelect: (id) => setTab(id as Tab) });
  const { state } = useDispatcherState();
  const verified = state.profile.verification_status === "verified";

  /*
   * The counters read the real loads.
   *
   * They used to count jobs in the browser's own storage — a "3 in transit"
   * that no pilot had ever been hired for. These are the loads this dispatcher
   * actually posted, in the state the assignments on them put them in.
   */
  const [loads, setLoads] = useState<Load[]>([]);
  useEffect(() => {
    marketplace
      .myLoads()
      .then((r) => setLoads(r.loads))
      // A failed count is not worth a banner over the whole home screen; the
      // loads tab reports it properly when they go looking.
      .catch(() => setLoads([]));
  }, []);

  const count = (...statuses: string[]) => loads.filter((l) => statuses.includes(l.status)).length;
  const open = count("open", "partially_filled");
  const inTransit = count("in_progress", "filled");
  const done = count("completed");

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center font-bold text-primary">
            M
          </div>
          <div>
            <div className="font-semibold text-sm">
              {state.profile.contact_name || "Dispatcher"}
            </div>
            {/*
              No star. A dispatcher's rating is earned from finished jobs and
              hidden until both sides have written one — showing a 0 out of 5
              to somebody who has never been rated is worse than showing
              nothing.
            */}
            <div className="text-xs text-muted-foreground">
              {loads.length} load{loads.length === 1 ? "" : "s"} posted
            </div>
          </div>
        </div>
        <NotificationBell onOpen={() => setShowNotif(true)} />
      </div>

      {tab === "home" && !verified && (
        <button
          onClick={() => setShowVerify(true)}
          className="mx-4 mb-2 rounded-2xl bg-accent border border-primary/20 px-4 py-3 flex items-center gap-3 text-left"
        >
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            {state.profile.verification_status === "in_review" ? (
              <ShieldCheck className="h-4 w-4 text-primary" />
            ) : (
              <AlertCircle className="h-4 w-4 text-primary" />
            )}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">
              {state.profile.verification_status === "in_review"
                ? "Business verification in review"
                : "Verify your business"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {state.profile.completion_pct}% complete · loads can publish at 100%
            </div>
            <div className="mt-1 h-1 w-full rounded-full bg-background overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${state.profile.completion_pct}%` }}
              />
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      )}

      {tab === "home" && (
        <div className="flex-1 relative bg-[linear-gradient(135deg,#f5f5f5_25%,#ebebeb_25%,#ebebeb_50%,#f5f5f5_50%,#f5f5f5_75%,#ebebeb_75%)] bg-[length:24px_24px] overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center shadow-lg">
              <Truck className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>

          <div className="absolute left-0 right-0 bottom-0 bg-background rounded-t-3xl shadow-[0_-8px_24px_rgba(0,0,0,0.08)] px-5 pt-4 pb-24">
            <div className="h-1 w-10 bg-border rounded-full mx-auto mb-4" />
            <h2 className="text-lg font-bold text-primary">
              Welcome, {state.profile.contact_name?.split(" ")[0] || "there"}
            </h2>
            {/*
              The old line promised escrow. LoadReady never holds the money for
              a job — the dispatcher pays the pilot directly (D1) — so it said
              something we do not do.
            */}
            <p className="text-sm text-muted-foreground mb-4">
              Post a load, compare the pilots who want it, and hire one.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="w-full h-13 rounded-full bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-[var(--primary-pressed)] py-3"
            >
              <Plus className="h-5 w-5" /> Post a new load
            </button>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="Open" v={String(open)} />
              <Stat label="In transit" v={String(inTransit)} />
              <Stat label="Done" v={String(done)} />
            </div>
          </div>
        </div>
      )}
      {/*
        The real loads, from the server. What was here read the browser's own
        storage and listed jobs no pilot could ever see (BACKLOG F-76).
      */}
      {tab === "orders" && <MyLoads onPostLoad={() => setShowCreate(true)} />}
      {tab === "profile" && (
        <ProfileTab
          name={displayName}
          onLogout={() => void signOut()}
          role="Dispatcher"
          onOpen={(k) => {
            if (k === "verify") setShowVerify(true);
            if (k === "company") setShowCompany(true);
            if (k === "settings") setShowDispatcherSettings(true);
            if (k === "security") setShowDispatcherSecurity(true);
            if (k === "legal") setShowDispatcherLegal(true);
          }}
        />
      )}

      {showCreate && (
        <PostLoadWizard
          onClose={() => setShowCreate(false)}
          onPosted={() => {
            setShowCreate(false);
            setTab("orders");
          }}
        />
      )}
      {showVerify && <BusinessVerificationWizard onClose={() => setShowVerify(false)} />}
      {showCompany && (
        <PanelSheet title="Company profile" onClose={() => setShowCompany(false)}>
          <CompanyProfilePanel />
        </PanelSheet>
      )}
      {showDispatcherSettings && (
        <PanelSheet title="Preferences" onClose={() => setShowDispatcherSettings(false)}>
          <SettingsPanel />
        </PanelSheet>
      )}
      {showDispatcherLegal && (
        <PanelSheet title="Terms & privacy" onClose={() => setShowDispatcherLegal(false)}>
          <LegalPanel />
        </PanelSheet>
      )}
      {showDispatcherSecurity && (
        <PanelSheet title="Security" onClose={() => setShowDispatcherSecurity(false)}>
          <SecurityPanel />
        </PanelSheet>
      )}
      {showNotif && <NotificationCentre onClose={() => setShowNotif(false)} />}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-xl bg-surface border border-border p-2.5">
      <div className="text-lg font-bold text-foreground">{v}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

// ───────── SHARED ─────────

type ProfileAction =
  | "verify"
  | "documents"
  | "earnings"
  | "bids"
  | "subscription"
  | "company"
  | "security"
  | "settings"
  | "legal";

function ProfileTab({
  onLogout,
  role,
  name,
  onOpen,
}: {
  onLogout: () => void;
  role: string;
  name: string;
  onOpen?: (k: ProfileAction) => void;
}) {
  const items: Array<{ icon: IconComponent; label: string; action?: ProfileAction }> = [
    { icon: ShieldCheck, label: "Verification", action: "verify" },
    {
      icon: User,
      label: role === "Dispatcher" ? "Business verification" : "Personal information",
      action: "verify",
    },
    /*
     * Pilots only. A dispatcher's documents are a step inside business
     * verification above — this row was shown to them and wired to nothing,
     * so it did nothing when tapped.
     */
    ...(role === "Pilot"
      ? [{ icon: FileText, label: "Documents & certifications", action: "documents" as const }]
      : []),
    /*
     * Bids, earnings and the subscription belong to pilots.
     *
     * A dispatcher does not bid on anything and is never shown billing
     * (ADR-1) — and "payouts" was in this list for a product that does not make
     * any: the dispatcher pays the pilot directly (D1).
     */
    ...(role === "Pilot"
      ? [
          { icon: ClipboardList, label: "My bids", action: "bids" as const },
          { icon: Wallet, label: "My earnings", action: "earnings" as const },
          { icon: CreditCard, label: "Subscription", action: "subscription" as const },
        ]
      : []),
    ...(role === "Dispatcher"
      ? [{ icon: Building2, label: "Company profile", action: "company" as const }]
      : []),
    /*
     * Security had no action at all — the row was there and tapping it did
     * nothing. It opens the panel it always should have.
     */
    { icon: Shield, label: "Security", action: "security" as const },
    { icon: Settings, label: "Preferences", action: "settings" as const },
    { icon: Scale, label: "Terms & privacy", action: "legal" as const },
    /*
     * "Help & support" was the same dead row, and there is nowhere for it to
     * go: the support address is still an open decision. A row that does
     * nothing is worse than no row, so it is out until there is something
     * behind it (BACKLOG).
     */
  ];
  return (
    <div className="flex-1 px-5 pt-2 pb-28 overflow-y-auto">
      <div className="rounded-2xl bg-gradient-to-br from-primary to-[var(--primary-pressed)] p-5 text-primary-foreground mb-4">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-white/25 flex items-center justify-center text-xl font-bold">
            {initialOf(name)}
          </div>
          <div>
            <div className="font-bold">{name}</div>
            {/*
             * Just the role.
             *
             * This said "Verified · 4.8 · 142 trips" for **everybody**, on
             * their first minute, before they had uploaded a document or done
             * a single job. Invented ratings and badges are exactly what
             * CLAUDE.md rule 7 forbids, and on a marketplace where a
             * dispatcher picks a pilot off a score it is worse than
             * decoration — it is a claim about somebody's work.
             *
             * The real rating and trip count exist (Phase H3). Showing them
             * here needs the profile loading into this component, which is a
             * change worth making on purpose rather than in passing.
             */}
            <div className="text-xs opacity-90">{role}</div>
          </div>
        </div>
      </div>
      <div className="rounded-2xl bg-surface border border-border divide-y divide-border">
        {items.map((it) => (
          <button
            key={it.label}
            onClick={() => it.action && onOpen?.(it.action)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-background"
          >
            <it.icon className="h-4 w-4 text-primary" />
            <span className="flex-1 text-sm">{it.label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
      <button
        onClick={onLogout}
        className="mt-4 w-full h-12 rounded-full border border-destructive text-destructive font-semibold flex items-center justify-center gap-2"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}

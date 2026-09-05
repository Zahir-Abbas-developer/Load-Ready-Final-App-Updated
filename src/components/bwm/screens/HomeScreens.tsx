import { lazy, Suspense, useState } from "react";
import { useOnboarding } from "@/lib/onboarding-context";
import logo from "@/assets/bwm-logo.png";
import {
  MapPin, Truck, User, Home as HomeIcon, ClipboardList, Power, Plus,
  Bell, X, ChevronRight, DollarSign, Star, LogOut, Settings, Phone,
  MessageCircle, FileText, Wallet, Shield, HelpCircle, CheckCircle2,
  Calendar, Ruler, Weight, Clock, Navigation, TrendingUp, Briefcase,
  Inbox, Sparkles,
} from "lucide-react";
// Lazy-load live-trip screens — they import Leaflet, which touches `window`
// at module load and breaks SSR if imported eagerly.
const PilotLiveTrip = lazy(() =>
  import("@/components/bwm/live/PilotLiveTrip").then((m) => ({ default: m.PilotLiveTrip }))
);
const DispatcherLiveTrip = lazy(() =>
  import("@/components/bwm/live/DispatcherLiveTrip").then((m) => ({ default: m.DispatcherLiveTrip }))
);
import { PaymentsDemo } from "@/components/bwm/PaymentsDemo";
import {
  VerificationWizard, DocumentsSheet, BidsSheet, EarningsLedgerSheet, useVerificationStatus,
} from "@/components/bwm/pilot/PilotSheets";
import { ShieldCheck, AlertCircle, BadgeCheck } from "lucide-react";

type Tab = "orders" | "home" | "profile";

const SAMPLE_OFFERS = [
  {
    id: "OF-1001",
    title: "Industrial Generator (Heavy Equipment)",
    date: "13 Nov 2025 · 03:00 PM",
    price: "3000",
    from: "Dallas, TX", to: "Houston, TX",
    dim: "45 ft × 12 ft × 14 ft", weight: "105,000 lbs", distance: "240 mi", eta: "4 days",
  },
  {
    id: "OF-1002",
    title: "Wind Turbine Blade",
    date: "15 Nov 2025 · 09:00 AM",
    price: "5400",
    from: "Amarillo, TX", to: "Oklahoma City, OK",
    dim: "180 ft × 10 ft × 12 ft", weight: "70,000 lbs", distance: "260 mi", eta: "3 days",
  },
  {
    id: "OF-1003",
    title: "Modular Home Section",
    date: "18 Nov 2025 · 06:00 AM",
    price: "2200",
    from: "Tulsa, OK", to: "Wichita, KS",
    dim: "60 ft × 16 ft × 13 ft", weight: "48,000 lbs", distance: "180 mi", eta: "2 days",
  },
];

const NOTIFICATIONS = [
  { t: "New offer in your area: Wind Turbine Blade", time: "2m ago" },
  { t: "Payment of $3,000 released to your account", time: "1h ago" },
  { t: "Trip #EV-2017003 started", time: "3h ago" },
  { t: "Document expires in 14 days: Insurance", time: "1d ago" },
];

type Offer = (typeof SAMPLE_OFFERS)[number];

// ───────── PILOT ─────────
export function PilotHome() {
  const { role, go, demo, setDemo } = useOnboarding();
  const [online, setOnline] = useState(true);
  const [tab, setTab] = useState<Tab>("home");
  // In demo mode, pre-accept the first offer so "My orders" + live trip are immediately testable.
  const [accepted, setAccepted] = useState<string[]>(demo ? ["OF-1001"] : []);
  const [activeOffer, setActiveOffer] = useState<Offer | null>(null);
  const [showEarnings, setShowEarnings] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showBids, setShowBids] = useState(false);
  const [showStripe, setShowStripe] = useState(false);
  const profile = useVerificationStatus();
  const verified = profile.verification_status === "verified";

  const acceptOffer = (id: string) => {
    setAccepted((a) => [...a, id]);
    setActiveOffer(null);
  };

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
                M
              </div>
              <div
                className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${
                  online ? "bg-success" : "bg-muted-foreground"
                }`}
              />
            </div>
            <div className="min-w-0 text-left">
              <div className="font-semibold text-sm truncate">Mark Anton</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Star className="h-3 w-3 fill-primary text-primary" />
                <span className="font-medium text-foreground">4.8</span>
                <span>· {accepted.length} accepted</span>
              </div>
            </div>
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowNotif(true)}
              className="h-10 w-10 rounded-full bg-surface hover:bg-accent border border-border/60 flex items-center justify-center relative transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
            </button>
            <button
              onClick={() => setShowEarnings(true)}
              className="h-10 px-3.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-sm hover:bg-[var(--primary-pressed)] transition-colors"
            >
              <Wallet className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Earnings</span>
              <span className="xs:hidden">$</span>
            </button>
          </div>
        </div>
        <div className="px-4 pb-2 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-[10px] font-medium text-primary border border-primary/20">
            <img src={logo} className="h-2.5 w-2.5" alt="" />
            {role === "dispatcher" ? "Dispatcher" : "Pilot"} preview
          </span>
          {demo && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-foreground/10 text-[10px] font-medium text-foreground">
              <Sparkles className="h-2.5 w-2.5" /> Demo data
            </span>
          )}
        </div>
      </header>

      {/* Body switch by tab */}
      {tab === "home" && (
        <PilotDashboard
          online={online}
          setOnline={setOnline}
          offers={SAMPLE_OFFERS.filter((o) => !accepted.includes(o.id))}
          accepted={accepted}
          onOpenOffer={setActiveOffer}
          verified={verified}
          completionPct={profile.completion_pct}
          verificationStatus={profile.verification_status}
          onOpenVerify={() => setShowVerify(true)}
          onOpenEarnings={() => setShowEarnings(true)}
          onOpenBids={() => setShowBids(true)}
          onOpenDocs={() => setShowDocs(true)}
          onOpenOrders={() => setTab("orders")}
        />
      )}
      {tab === "orders" && (
        <PilotOrders
          accepted={accepted.map((id) => SAMPLE_OFFERS.find((o) => o.id === id)!)}
          onOpenBids={() => setShowBids(true)}
        />
      )}
      {tab === "profile" && (
        <ProfileTab
          onLogout={() => { setDemo(false); go("splash"); }}
          role="Pilot"
          onOpen={(k) => {
            if (k === "verify") setShowVerify(true);
            if (k === "documents") setShowDocs(true);
            if (k === "earnings") setShowEarnings(true);
            if (k === "bids") setShowBids(true);
          }}
        />
      )}

      {/* Bottom nav */}
      <BottomNav tab={tab} setTab={setTab} />

      {activeOffer && (
        <OfferDetailSheet
          offer={activeOffer}
          onClose={() => setActiveOffer(null)}
          onAccept={() => acceptOffer(activeOffer.id)}
        />
      )}
      {showEarnings && (
        <EarningsLedgerSheet
          onClose={() => setShowEarnings(false)}
          onRunStripeDemo={() => setShowStripe(true)}
        />
      )}
      {showVerify && <VerificationWizard onClose={() => setShowVerify(false)} />}
      {showDocs && <DocumentsSheet onClose={() => setShowDocs(false)} />}
      {showBids && <BidsSheet onClose={() => setShowBids(false)} />}
      {showStripe && <PaymentsDemo onClose={() => setShowStripe(false)} />}
      {showNotif && <NotificationsSheet onClose={() => setShowNotif(false)} />}
    </div>
  );
}

function PilotDashboard({
  online, setOnline, offers, accepted, onOpenOffer,
  verified, completionPct, verificationStatus,
  onOpenVerify, onOpenEarnings, onOpenBids, onOpenDocs, onOpenOrders,
}: {
  online: boolean;
  setOnline: (v: boolean | ((p: boolean) => boolean)) => void;
  offers: Offer[];
  accepted: string[];
  onOpenOffer: (o: Offer) => void;
  verified: boolean;
  completionPct: number;
  verificationStatus: string;
  onOpenVerify: () => void;
  onOpenEarnings: () => void;
  onOpenBids: () => void;
  onOpenDocs: () => void;
  onOpenOrders: () => void;
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
            <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary-foreground/10" />
            <div className="absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-primary-foreground/5" />
          </>
        )}
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2.5 w-2.5">
                {online && <span className="absolute inline-flex h-full w-full rounded-full bg-success-foreground/70 opacity-75 animate-ping" />}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${online ? "bg-success-foreground" : "bg-muted-foreground"}`} />
              </span>
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${online ? "opacity-90" : "text-muted-foreground"}`}>
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
                ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                : "bg-primary text-primary-foreground hover:bg-[var(--primary-pressed)]"
            }`}
          >
            <Power className="h-3.5 w-3.5" />
            Go {online ? "offline" : "online"}
          </button>
        </div>
      </div>

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
                {verificationStatus === "in_review" ? "Verification in review" : "Finish your verification"}
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

      {/* Available offers */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Available offers {online && offers.length > 0 && (
              <span className="ml-1 text-primary">({offers.length})</span>
            )}
          </h3>
          {online && offers.length > 0 && (
            <button onClick={onOpenBids} className="text-[11px] font-semibold text-primary">
              View all
            </button>
          )}
        </div>
        {!online ? (
          <div className="rounded-2xl bg-surface border border-dashed border-border p-6 text-center">
            <div className="h-11 w-11 rounded-full bg-accent mx-auto flex items-center justify-center mb-2">
              <Power className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm font-semibold">You're offline</p>
            <p className="text-xs text-muted-foreground mt-1">Go online to see available loads in your area.</p>
          </div>
        ) : offers.length === 0 ? (
          <div className="rounded-2xl bg-surface border border-dashed border-border p-6 text-center">
            <div className="h-11 w-11 rounded-full bg-accent mx-auto flex items-center justify-center mb-2">
              <Inbox className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm font-semibold">No offers right now</p>
            <p className="text-xs text-muted-foreground mt-1">We'll notify you when something matches.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {offers.map((o) => (
              <button
                key={o.id}
                onClick={() => onOpenOffer(o)}
                className="w-full text-left rounded-2xl bg-surface border border-border p-4 hover:border-primary/40 hover:shadow-md transition-all active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wide shrink-0">
                      New
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">{o.date}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-bold text-success leading-none">${o.price}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">USD</div>
                  </div>
                </div>
                <h4 className="font-semibold text-sm mb-2 leading-snug line-clamp-2">{o.title}</h4>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex flex-col items-center pt-1">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <div className="h-5 w-px bg-border my-0.5" />
                    <div className="h-2 w-2 rounded-sm bg-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 text-xs space-y-1">
                    <div className="font-medium truncate">{o.from}</div>
                    <div className="text-muted-foreground truncate">{o.to}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border pt-2.5">
                  <span className="flex items-center gap-1">
                    <Navigation className="h-3 w-3 text-primary" /> {o.distance}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-primary" /> {o.eta}
                  </span>
                  <span className="flex items-center gap-1">
                    <Weight className="h-3 w-3 text-primary" /> {o.weight}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Earnings preview */}
      <button
        onClick={onOpenEarnings}
        className="w-full text-left rounded-2xl bg-foreground text-background p-4 flex items-center gap-3 hover:bg-foreground/90 transition-colors"
      >
        <div className="h-11 w-11 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <TrendingUp className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider opacity-70">This month</div>
          <div className="text-xl font-bold leading-none mt-0.5">
            ${(accepted.length * 3000 + 8420).toLocaleString()}
          </div>
          <div className="text-[11px] opacity-70 mt-1">
            ${(accepted.length * 3000).toLocaleString()} pending · payout in 2 days
          </div>
        </div>
        <ChevronRight className="h-4 w-4 opacity-70 shrink-0" />
      </button>
    </div>
  );
}

function PilotOrders({ accepted, onOpenBids }: { accepted: Offer[]; onOpenBids?: () => void }) {
  const [live, setLive] = useState(false);
  return (
    <div className="flex-1 px-5 pt-2 pb-28 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">My orders</h2>
        {onOpenBids && (
          <button onClick={onOpenBids} className="text-xs font-semibold text-primary">
            View my bids →
          </button>
        )}
      </div>
      {accepted.length === 0 ? (
        <div className="rounded-2xl bg-surface border border-border p-6 text-center">
          <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No active orders.</p>
          <p className="text-xs text-muted-foreground mt-1">Accept an offer from the Home tab to see it here.</p>
          <button
            onClick={() => setLive(true)}
            className="mt-4 h-10 px-4 rounded-full bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-2"
          >
            <Navigation className="h-4 w-4" /> Open demo live trip
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {accepted.map((o) => (
            <div key={o.id} className="rounded-2xl bg-surface border border-border p-4">
              <div className="flex items-start justify-between mb-2">
                <span className="px-2 py-0.5 rounded-full bg-success text-white text-xs font-bold">Active</span>
                <span className="text-success font-bold">${o.price}</span>
              </div>
              <div className="font-semibold text-sm mb-1">{o.title}</div>
              <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-primary" />
                {o.from} → {o.to}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setLive(true)}
                  className="flex-1 h-9 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1"
                >
                  <Navigation className="h-3 w-3" /> Navigate
                </button>
                <button
                  onClick={() => setLive(true)}
                  className="flex-1 h-9 rounded-full bg-background border border-border text-xs font-semibold flex items-center justify-center gap-1"
                >
                  <MessageCircle className="h-3 w-3" /> Chat
                </button>
                <button
                  onClick={() => setLive(true)}
                  aria-label="Call dispatcher"
                  className="h-9 w-9 rounded-full bg-background border border-border flex items-center justify-center"
                >
                  <Phone className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {live && (
        <Suspense fallback={null}>
          <PilotLiveTrip onClose={() => setLive(false)} />
        </Suspense>
      )}
    </div>
  );
}

// ───────── DISPATCHER ─────────
import {
  BusinessVerificationWizard, PostJobWizard, BidComparisonSheet, EscrowLedgerSheet, useDispatcherState,
} from "@/components/bwm/dispatcher/DispatcherSheets";
import type { DispatcherJob } from "@/lib/dispatcher/demo-store";

export function DispatcherHome() {
  const { go, setDemo } = useOnboarding();
  const [tab, setTab] = useState<Tab>("home");
  const [showCreate, setShowCreate] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [showEscrow, setShowEscrow] = useState(false);
  const [bidJob, setBidJob] = useState<DispatcherJob | null>(null);
  const { state, saveJob, awardBid } = useDispatcherState();
  const verified = state.profile.verification_status === "verified";

  const open = state.jobs.filter((j) => j.status === "published" || j.status === "bidding").length;
  const inTransit = state.jobs.filter((j) => j.status === "in_transit" || j.status === "awarded").length;
  const done = state.jobs.filter((j) => j.status === "completed").length;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center font-bold text-primary">M</div>
          <div>
            <div className="font-semibold text-sm">{state.profile.contact_name || "Dispatcher"}</div>
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
              {state.profile.rating} · {state.jobs.length} loads
            </div>
          </div>
        </div>
        <button onClick={() => setShowNotif(true)} className="h-10 w-10 rounded-full bg-surface flex items-center justify-center relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
        </button>
      </div>

      {tab === "home" && !verified && (
        <button
          onClick={() => setShowVerify(true)}
          className="mx-4 mb-2 rounded-2xl bg-accent border border-primary/20 px-4 py-3 flex items-center gap-3 text-left"
        >
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            {state.profile.verification_status === "in_review" ? <ShieldCheck className="h-4 w-4 text-primary" /> : <AlertCircle className="h-4 w-4 text-primary" />}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">
              {state.profile.verification_status === "in_review" ? "Business verification in review" : "Verify your business"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {state.profile.completion_pct}% complete · loads can publish at 100%
            </div>
            <div className="mt-1 h-1 w-full rounded-full bg-background overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${state.profile.completion_pct}%` }} />
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
            <h2 className="text-lg font-bold text-primary">Welcome, {state.profile.contact_name?.split(" ")[0] || "there"}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Post loads, compare bids, and manage escrow — all in one place.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="w-full h-13 rounded-full bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-[var(--primary-pressed)] py-3"
            >
              <Plus className="h-5 w-5" /> Post a new load
            </button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={() => setShowEscrow(true)} className="h-11 rounded-full bg-foreground text-background text-xs font-semibold flex items-center justify-center gap-1">
                <DollarSign className="h-4 w-4" /> Escrow & payouts
              </button>
              <button onClick={() => setShowPay(true)} className="h-11 rounded-full border border-border text-xs font-semibold flex items-center justify-center gap-1">
                <DollarSign className="h-4 w-4" /> Stripe demo
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="Open" v={String(open)} />
              <Stat label="In transit" v={String(inTransit)} />
              <Stat label="Done" v={String(done)} />
            </div>
          </div>
        </div>
      )}
      {tab === "orders" && <DispatcherOrders jobs={state.jobs} onOpenBids={(j) => setBidJob(j)} />}
      {tab === "profile" && <ProfileTab onLogout={() => { setDemo(false); go("splash"); }} role="Dispatcher" onOpen={(k) => {
        if (k === "verify") setShowVerify(true);
        if (k === "earnings") setShowEscrow(true);
      }} />}

      <BottomNav tab={tab} setTab={setTab} />

      {showCreate && (
        <PostJobWizard
          onClose={() => setShowCreate(false)}
          onCreate={(job) => { saveJob(job); setTab("orders"); }}
        />
      )}
      {showVerify && <BusinessVerificationWizard onClose={() => setShowVerify(false)} />}
      {showEscrow && <EscrowLedgerSheet onClose={() => setShowEscrow(false)} />}
      {bidJob && (
        <BidComparisonSheet
          job={bidJob}
          onClose={() => setBidJob(null)}
          onAward={(bid) => { awardBid(bidJob, bid); setBidJob(null); setShowEscrow(true); }}
        />
      )}
      {showNotif && <NotificationsSheet onClose={() => setShowNotif(false)} />}
      {showPay && <PaymentsDemo onClose={() => setShowPay(false)} amount={3000} tripId="LD-001" />}
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

function DispatcherOrders({ jobs, onOpenBids }: { jobs: DispatcherJob[]; onOpenBids: (j: DispatcherJob) => void }) {
  const [live, setLive] = useState(false);
  return (
    <div className="flex-1 px-5 pt-2 pb-28 overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">My loads</h2>
      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No loads yet.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((l) => (
            <div key={l.id} className="rounded-2xl bg-surface border border-border p-4">
              <div className="flex items-start justify-between mb-1">
                <div className="font-semibold text-sm">{l.title}</div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-primary font-bold">{l.id.slice(0, 8)}</span>
              </div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-primary" />
                {l.pickup_location} → {l.dropoff_location}
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-primary font-bold uppercase tracking-wide">{l.status.replace(/_/g, " ")}</span>
                <span className="text-success font-bold text-sm">${l.budget.toLocaleString()}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setLive(true)}
                  className="flex-1 h-9 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1"
                >
                  <Navigation className="h-3 w-3" /> Track live
                </button>
                <button onClick={() => onOpenBids(l)} className="flex-1 h-9 rounded-full bg-background border border-border text-xs font-semibold">
                  View bids
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {live && (
        <Suspense fallback={null}>
          <DispatcherLiveTrip onClose={() => setLive(false)} />
        </Suspense>
      )}
    </div>
  );
}


// ───────── SHARED ─────────
function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] h-20 bg-background border-t border-border flex items-center justify-around px-6 pb-3 z-20">
      {[
        { id: "orders", icon: ClipboardList, label: "My orders" },
        { id: "home", icon: HomeIcon, label: "Home" },
        { id: "profile", icon: User, label: "Profile" },
      ].map((t) => {
        const active = tab === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={`flex flex-col items-center gap-1 ${active ? "text-primary" : "text-muted-foreground"}`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[11px] font-medium">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

type ProfileAction = "verify" | "documents" | "earnings" | "bids";
function ProfileTab({
  onLogout, role, onOpen,
}: { onLogout: () => void; role: string; onOpen?: (k: ProfileAction) => void }) {
  const items: Array<{ icon: any; label: string; action?: ProfileAction }> = [
    { icon: ShieldCheck, label: "Verification", action: "verify" },
    { icon: User, label: "Personal information", action: "verify" },
    { icon: FileText, label: "Documents & certifications", action: "documents" },
    { icon: ClipboardList, label: "My bids", action: "bids" },
    { icon: Wallet, label: "Earnings & payouts", action: "earnings" },
    { icon: Shield, label: "Security" },
    { icon: Settings, label: "Preferences" },
    { icon: HelpCircle, label: "Help & support" },
  ];
  return (
    <div className="flex-1 px-5 pt-2 pb-28 overflow-y-auto">
      <div className="rounded-2xl bg-gradient-to-br from-primary to-[var(--primary-pressed)] p-5 text-primary-foreground mb-4">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-primary-foreground/20 flex items-center justify-center text-xl font-bold">M</div>
          <div>
            <div className="font-bold">Mark Anton</div>
            <div className="text-xs opacity-90 inline-flex items-center gap-1">
              {role} · <BadgeCheck className="h-3.5 w-3.5" /> Verified
            </div>
            <div className="text-xs flex items-center gap-1 mt-0.5">
              <Star className="h-3 w-3 fill-current" /> 4.8 · 142 trips
            </div>
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
      <p className="text-center text-[11px] text-muted-foreground mt-4">BWM v1.0 · Demo mode</p>
    </div>
  );
}

// ───────── SHEETS ─────────
function Sheet({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] bg-background rounded-t-3xl max-h-[85vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-background z-10 flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-surface flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function OfferDetailSheet({ offer, onClose, onAccept }: { offer: Offer; onClose: () => void; onAccept: () => void }) {
  return (
    <Sheet title="Offer details" onClose={onClose}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-bold text-base">{offer.title}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Calendar className="h-3 w-3" /> {offer.date}
          </div>
        </div>
        <div className="text-2xl font-bold text-success">${offer.price}</div>
      </div>
      <div className="rounded-2xl bg-surface border border-border p-4 mb-3">
        <Row icon={MapPin} k="Pickup" v={offer.from} />
        <Row icon={MapPin} k="Drop-off" v={offer.to} />
        <Row icon={Ruler} k="Dimensions" v={offer.dim} />
        <Row icon={Weight} k="Weight" v={offer.weight} />
        <Row icon={Clock} k="Distance · ETA" v={`${offer.distance} · ${offer.eta}`} />
      </div>
      <div className="rounded-xl bg-accent border border-primary/20 p-3 text-xs text-foreground mb-3">
        Payment is held in escrow and released after trip completion.
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 h-12 rounded-full bg-background border border-border font-semibold">Decline</button>
        <button onClick={onAccept} className="flex-1 h-12 rounded-full bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Accept
        </button>
      </div>
    </Sheet>
  );
}

function Row({ icon: Icon, k, v }: { icon: any; k: string; v: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 text-xs">
        <div className="text-muted-foreground">{k}</div>
        <div className="font-medium text-foreground">{v}</div>
      </div>
    </div>
  );
}

function EarningsSheet({ onClose, accepted }: { onClose: () => void; accepted: number }) {
  const [pay, setPay] = useState(false);
  return (
    <Sheet title="My earnings" onClose={onClose}>
      <div className="rounded-2xl bg-gradient-to-br from-primary to-[var(--primary-pressed)] p-5 text-primary-foreground mb-4">
        <div className="text-xs opacity-90">This month</div>
        <div className="text-3xl font-bold">${(accepted * 3000 + 8420).toLocaleString()}</div>
        <div className="text-xs opacity-90 mt-1">{accepted + 4} trips · payout in 2 days</div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-xl bg-surface border border-border p-3">
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="text-lg font-bold">${(accepted * 3000).toLocaleString()}</div>
        </div>
        <div className="rounded-xl bg-surface border border-border p-3">
          <div className="text-xs text-muted-foreground">Released</div>
          <div className="text-lg font-bold">$8,420</div>
        </div>
      </div>
      <button
        onClick={() => setPay(true)}
        className="w-full mb-4 h-11 rounded-full bg-foreground text-background text-sm font-semibold flex items-center justify-center gap-2"
      >
        <DollarSign className="h-4 w-4" /> Run Stripe Connect demo (escrow → ACH → payout)
      </button>
      <h4 className="font-semibold mb-2 text-sm">Recent payouts</h4>
      <div className="space-y-2">
        {[
          { d: "Nov 8", a: 3000, t: "Generator escort · Dallas → Houston" },
          { d: "Nov 3", a: 2200, t: "Modular home · Tulsa → Wichita" },
          { d: "Oct 28", a: 1820, t: "Steel coils · OKC" },
        ].map((p) => (
          <div key={p.d} className="flex items-center gap-3 rounded-xl bg-surface border border-border p-3">
            <div className="h-9 w-9 rounded-full bg-success/15 text-success flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </div>
            <div className="flex-1 text-xs">
              <div className="font-medium">{p.t}</div>
              <div className="text-muted-foreground">{p.d}</div>
            </div>
            <div className="font-bold text-success">+${p.a}</div>
          </div>
        ))}
      </div>
      {pay && <PaymentsDemo onClose={() => setPay(false)} />}
    </Sheet>
  );
}

function NotificationsSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Notifications" onClose={onClose}>
      <div className="space-y-2">
        {NOTIFICATIONS.map((n, i) => (
          <div key={i} className="flex gap-3 rounded-xl bg-surface border border-border p-3">
            <div className="h-9 w-9 rounded-full bg-accent text-primary flex items-center justify-center shrink-0">
              <Bell className="h-4 w-4" />
            </div>
            <div className="flex-1 text-xs">
              <div className="text-foreground">{n.t}</div>
              <div className="text-muted-foreground mt-0.5">{n.time}</div>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function CreateLoadSheet({
  onClose, onCreate,
}: { onClose: () => void; onCreate: (l: { title: string; from: string; to: string }) => void }) {
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dim, setDim] = useState("");
  const [weight, setWeight] = useState("");
  const [budget, setBudget] = useState("");
  const ok = title && from && to;
  return (
    <Sheet title="Post a new load" onClose={onClose}>
      <div className="space-y-3">
        <Input label="Load title" value={title} onChange={setTitle} placeholder="Ex: Industrial transformer" />
        <Input label="Pickup city/state" value={from} onChange={setFrom} placeholder="Dallas, TX" />
        <Input label="Drop-off city/state" value={to} onChange={setTo} placeholder="Houston, TX" />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Dimensions" value={dim} onChange={setDim} placeholder="L × W × H" />
          <Input label="Weight" value={weight} onChange={setWeight} placeholder="lbs" />
        </div>
        <Input label="Budget (USD)" value={budget} onChange={setBudget} placeholder="3000" />
        <button
          disabled={!ok}
          onClick={() => onCreate({ title, from, to })}
          className="w-full h-12 rounded-full bg-primary text-primary-foreground font-semibold disabled:opacity-50"
        >
          Post load
        </button>
        <p className="text-[11px] text-muted-foreground text-center">Pilot drivers in the area will be notified.</p>
      </div>
    </Sheet>
  );
}

function Input({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-foreground mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-12 px-3 rounded-xl bg-surface border border-border focus:outline-none focus:border-primary text-sm"
      />
    </div>
  );
}

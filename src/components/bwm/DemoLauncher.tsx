import { useState } from "react";
import { useOnboarding, clearDemoSession, type Role } from "@/lib/onboarding-context";
import { Sparkles, X, Copy, Check, RotateCcw, Power } from "lucide-react";

export const DEMO_ACCOUNTS: Record<
  Exclude<Role, null>,
  { email: string; password: string; label: string }
> = {
  pilot: { email: "pilot@bwm.test", password: "Demo@1234", label: "Pilot Car Driver" },
  dispatcher: { email: "dispatcher@bwm.test", password: "Demo@1234", label: "Fleet Dispatcher" },
  admin: { email: "admin@bwm.test", password: "Demo@1234", label: "Admin" },
};

export function DemoLauncher() {
  const { go, setRole, setContact, demo, setDemo } = useOnboarding();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const launch = (r: Exclude<Role, null>) => {
    setRole(r);
    setContact(DEMO_ACCOUNTS[r].email);
    setDemo(true);
    if (r === "admin") go("admin");
    else go("home");
    setOpen(false);
  };

  const reset = () => {
    clearDemoSession();
    setDemo(false);
    setRole(null);
    setContact("");
    go("splash");
    setOpen(false);
    // hard reload to flush all in-memory seeded state
    if (typeof window !== "undefined") setTimeout(() => window.location.reload(), 50);
  };

  const toggleDemo = () => {
    if (demo) {
      setDemo(false);
      clearDemoSession();
    } else {
      setDemo(true);
    }
  };

  const copy = (t: string) => {
    navigator.clipboard?.writeText(t);
    setCopied(t);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div suppressHydrationWarning>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 h-12 px-5 rounded-full bg-black text-white shadow-xl shadow-black/30 border border-white/10 flex items-center gap-2 text-xs font-semibold hover:bg-neutral-900 transition-colors"
        aria-label="Demo accounts"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        Demo
        {demo && (
          <span className="ml-1 h-2 w-2 rounded-full bg-success animate-pulse" aria-label="demo mode active" />
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-end justify-center"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] bg-background rounded-t-3xl p-5 pb-8 animate-in slide-in-from-bottom"
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Demo control
              </h3>
              <button onClick={() => setOpen(false)} className="h-8 w-8 rounded-full bg-surface flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Demo mode seeds full content (orders, chat, notifications, admin) and persists across refreshes.
            </p>

            {/* Mode toggle + reset */}
            <div className="rounded-2xl border border-border bg-surface p-3 mb-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-full flex items-center justify-center ${demo ? "bg-success/15 text-success" : "bg-background border border-border text-muted-foreground"}`}>
                <Power className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">Demo API mode</div>
                <div className="text-[11px] text-muted-foreground">
                  {demo ? "ON — using seeded data" : "OFF — using live backend"}
                </div>
              </div>
              <button
                onClick={toggleDemo}
                className={`h-9 px-3 rounded-full text-xs font-bold ${demo ? "bg-foreground text-background" : "bg-primary text-primary-foreground"}`}
              >
                {demo ? "Turn off" : "Turn on"}
              </button>
            </div>
            <button
              onClick={reset}
              className="w-full mb-4 h-10 rounded-full border border-border text-xs font-semibold flex items-center justify-center gap-2 hover:bg-surface"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset demo data &amp; restart
            </button>

            <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
              Quick sign-in
            </p>
            <div className="space-y-3">
              {(Object.keys(DEMO_ACCOUNTS) as Array<Exclude<Role, null>>).map((r) => {
                const acc = DEMO_ACCOUNTS[r];
                return (
                  <div key={r} className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-sm">{acc.label}</div>
                      <span className="text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full bg-accent text-primary">
                        {r}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1 mb-3">
                      <Row k="Email" v={acc.email} onCopy={copy} copied={copied === acc.email} />
                      <Row k="Password" v={acc.password} onCopy={copy} copied={copied === acc.password} />
                    </div>
                    <button
                      onClick={() => launch(r)}
                      className="w-full h-10 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-[var(--primary-pressed)]"
                    >
                      Sign in as {acc.label}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-4">
              Demo mode · session persisted in localStorage
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, onCopy, copied }: { k: string; v: string; onCopy: (s: string) => void; copied: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 w-16">{k}</span>
      <code className="flex-1 truncate text-foreground font-mono text-xs">{v}</code>
      <button onClick={() => onCopy(v)} className="h-7 w-7 rounded-md bg-background border border-border flex items-center justify-center">
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

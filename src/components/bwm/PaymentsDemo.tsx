import { useEffect, useState } from "react";
import { X, CreditCard, Lock, ArrowRight, Banknote, CheckCircle2, Loader2, RotateCcw } from "lucide-react";

/**
 * Stripe Connect-style demo payment flow.
 * Simulates: customer charge → escrow hold → release → ACH transfer → payout.
 * No real Stripe API calls — uses test/demo data only.
 */

type Stage = "idle" | "charging" | "escrow" | "releasing" | "transferring" | "paid";

const STAGES: Array<{ id: Stage; label: string; sub: string; icon: any }> = [
  { id: "charging",     label: "Charge customer",   sub: "tok_visa · 4242", icon: CreditCard },
  { id: "escrow",       label: "Hold in escrow",    sub: "platform balance", icon: Lock },
  { id: "releasing",    label: "Release on completion", sub: "trip verified", icon: CheckCircle2 },
  { id: "transferring", label: "ACH to pilot bank", sub: "acct ••6789",     icon: Banknote },
  { id: "paid",         label: "Payout settled",    sub: "T+2 business days", icon: CheckCircle2 },
];

export function PaymentsDemo({ amount = 3000, tripId = "EV-2017001", onClose }: {
  amount?: number;
  tripId?: string;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const order: Stage[] = ["charging", "escrow", "releasing", "transferring", "paid"];
    const idx = order.indexOf(stage);
    if (idx < 0 || idx === order.length - 1) {
      if (idx === order.length - 1) setRunning(false);
      return;
    }
    const t = setTimeout(() => setStage(order[idx + 1]), 1200);
    return () => clearTimeout(t);
  }, [stage, running]);

  const start = () => { setStage("charging"); setRunning(true); };
  const reset = () => { setStage("idle"); setRunning(false); };

  const stageIdx = STAGES.findIndex((s) => s.id === stage);
  const fee = Math.round(amount * 0.029 + 0.3);
  const platformFee = Math.round(amount * 0.12);
  const net = amount - fee - platformFee;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] bg-background rounded-t-3xl max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 bg-background flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <div>
            <h3 className="font-bold text-base">Stripe Connect · Demo</h3>
            <p className="text-[11px] text-muted-foreground">Simulated escrow → ACH → payout</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-surface flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl bg-gradient-to-br from-primary to-[var(--primary-pressed)] p-4 text-primary-foreground">
            <div className="text-[11px] opacity-90">Trip {tripId}</div>
            <div className="text-3xl font-bold">${amount.toLocaleString()}.00</div>
            <div className="text-xs opacity-90 mt-1">USD · Test mode</div>
          </div>

          {/* Stages */}
          <ol className="space-y-2">
            {STAGES.map((s, i) => {
              const done = stageIdx > i || stage === "paid";
              const active = stageIdx === i && running;
              const Icon = s.icon;
              return (
                <li
                  key={s.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                    done
                      ? "border-success/40 bg-success/5"
                      : active
                      ? "border-primary bg-accent"
                      : "border-border bg-surface opacity-70"
                  }`}
                >
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                      done ? "bg-success text-white" : active ? "bg-primary text-primary-foreground" : "bg-background border border-border text-muted-foreground"
                    }`}
                  >
                    {active ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{s.label}</div>
                    <div className="text-[11px] text-muted-foreground">{s.sub}</div>
                  </div>
                  {done && <span className="text-[10px] font-bold uppercase text-success">ok</span>}
                </li>
              );
            })}
          </ol>

          {/* Breakdown */}
          <div className="rounded-2xl border border-border bg-surface p-4 text-xs space-y-1.5">
            <Row k="Gross charge" v={`$${amount.toFixed(2)}`} />
            <Row k="Stripe fee (2.9% + $0.30)" v={`-$${fee.toFixed(2)}`} />
            <Row k="Platform fee (12%)" v={`-$${platformFee.toFixed(2)}`} />
            <div className="border-t border-border my-1.5" />
            <Row k="Net to pilot" v={`$${net.toFixed(2)}`} bold />
          </div>

          <div className="flex gap-2">
            <button
              onClick={reset}
              className="h-11 px-4 rounded-full bg-surface border border-border text-sm font-semibold flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <button
              onClick={start}
              disabled={running}
              className="flex-1 h-11 rounded-full bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {stage === "paid" ? "Replay" : running ? "Running…" : "Start escrow flow"} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            Test card 4242·4242·4242·4242 · No real money moves.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-foreground font-bold text-sm" : "text-muted-foreground"}`}>
      <span>{k}</span>
      <span className={bold ? "text-success" : "text-foreground font-medium"}>{v}</span>
    </div>
  );
}

import type { TurnInstruction } from "@/lib/live-trip/types";
import {
  ArrowUp, ArrowUpRight, ArrowUpLeft, CornerUpLeft, CornerUpRight, RotateCcw,
} from "lucide-react";

const ICON: Record<TurnInstruction["modifier"], React.ComponentType<{ className?: string }>> = {
  straight: ArrowUp,
  "slight-right": ArrowUpRight,
  "slight-left": ArrowUpLeft,
  right: CornerUpRight,
  left: CornerUpLeft,
  uturn: RotateCcw,
};

export function TurnByTurnBanner({
  instr,
  speedMph,
  distanceLabel,
}: {
  instr: TurnInstruction;
  speedMph: number;
  distanceLabel: string;
}) {
  const Icon = ICON[instr.modifier];
  const ratio = speedMph / instr.speedLimitMph;
  const speedColor =
    ratio > 1.15 ? "bg-destructive text-white" : ratio > 0.95 ? "bg-warning text-foreground" : "bg-white text-foreground";
  return (
    <div className="mx-3 mt-3 rounded-2xl bg-[#0F172A] text-white shadow-xl flex items-center gap-3 px-3 py-3">
      <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center">
        <Icon className="h-7 w-7 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-white/60">{distanceLabel}</div>
        <div className="font-semibold truncate">{instr.text}</div>
        {instr.next && <div className="text-xs text-white/70 truncate">Then: {instr.next}</div>}
      </div>
      <div className={`h-12 min-w-12 px-2 rounded-full ${speedColor} flex flex-col items-center justify-center text-[10px] font-bold leading-tight border border-black/10`}>
        <span>MAX</span>
        <span className="text-sm">{instr.speedLimitMph}</span>
      </div>
    </div>
  );
}

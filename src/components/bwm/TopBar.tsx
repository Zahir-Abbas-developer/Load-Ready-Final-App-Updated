import logo from "@/assets/bwm-logo.png";
import { useOnboarding } from "@/lib/onboarding-context";

interface Props {
  rightLabel?: string;
  onRight?: () => void;
  progress?: { current: number; total: number };
  onBack?: () => void;
}

export function TopBar({ rightLabel = "Need help ?", onRight, progress, onBack }: Props) {
  const { back } = useOnboarding();
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-3">
      <button
        onClick={onBack ?? back}
        className="flex items-center gap-2"
        aria-label="Back"
      >
        <img src={logo} alt="BWM" className="h-9 w-9 object-contain" />
      </button>
      <div className="flex items-center gap-3">
        {progress && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-success transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {progress.current}/{progress.total}
            </span>
          </div>
        )}
        <button
          onClick={onRight}
          className="text-sm font-medium text-foreground/70 hover:text-foreground"
        >
          {rightLabel}
        </button>
      </div>
    </div>
  );
}

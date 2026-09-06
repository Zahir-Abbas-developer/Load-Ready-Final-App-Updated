import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost";
}

export const PrimaryButton = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "primary", disabled, children, ...rest }, ref) => {
    const base =
      "h-[52px] w-full rounded-full font-semibold text-base transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";
    const styles =
      variant === "primary"
        ? "bg-primary text-primary-foreground hover:bg-[var(--primary-pressed)] disabled:bg-neutral-200 disabled:text-neutral-400"
        : variant === "outline"
          ? "border border-primary text-primary bg-background hover:bg-accent"
          : "text-primary hover:bg-accent";
    return (
      <button ref={ref} disabled={disabled} className={cn(base, styles, className)} {...rest}>
        {children}
      </button>
    );
  },
);
PrimaryButton.displayName = "PrimaryButton";

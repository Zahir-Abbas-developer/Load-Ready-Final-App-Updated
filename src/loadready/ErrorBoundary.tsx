import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { PrimaryButton } from "./PrimaryButton";

/**
 * Catches a crash inside the app and shows something useful instead of a blank
 * screen.
 *
 * The route already has an errorComponent, but that only covers errors thrown
 * while a route loads or renders at the top level — a component that throws
 * deeper, mid-interaction, would otherwise unmount the tree and leave nothing.
 *
 * Reporting goes to console.error for now. CLAUDE.md rule 10 wants Sentry with
 * context; wiring that up is the security-hardening phase, and this is the one
 * place in the app where console.error is the intended behaviour rather than a
 * leftover — a swallowed crash would be worse.
 */

interface Props {
  children: ReactNode;
  /** Shown instead of the default screen, when a section wants its own. */
  fallback?: (reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ui] unhandled error", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);

    return (
      <div
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center px-8 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-tint">
          <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden />
        </div>
        <h1 className="mt-4 text-xl font-bold text-foreground">Something went wrong</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
          This screen stopped working. Nothing you had already saved is affected. Try again, and if
          it keeps happening tell support what you were doing.
        </p>

        <div className="mt-7 w-full max-w-xs space-y-3">
          <PrimaryButton onClick={this.reset}>Try again</PrimaryButton>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 w-full rounded-full border border-border text-sm font-semibold hover:bg-surface"
          >
            Reload the app
          </button>
        </div>
      </div>
    );
  }
}

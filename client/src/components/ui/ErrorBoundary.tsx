import React, { Component, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw, Home, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** Human-readable correlation ID for bug reports + customer support handoff */
  errorId: string;
}

/**
 * Generate a short, copy-pasteable error correlation ID.
 * Format: ERR-<8 hex chars> — human-friendly, fits in bug tracker search boxes.
 * Never PII; pure random nonce.
 */
function generateErrorId(): string {
  const bytes = new Uint8Array(6);
  (globalThis.crypto || (globalThis as any).msCrypto)?.getRandomValues?.(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
  return `ERR-${hex || "00000000"}`;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: generateErrorId() };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Refresh errorId on each NEW distinct error captured so bug reports don't collide
    return { hasError: true, error, errorId: generateErrorId() };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Centralized error telemetry hook. Always log regardless of env.
    // TODO: wire to Sentry/Datadog/LogRocket when observability stack onboarded.
    // NEVER alert user here; UI render below handles UX.
    console.error("[ErrorBoundary] Captured error", {
      errorId: this.state.errorId,
      message: error?.message,
      name: error?.name,
      componentStack: info?.componentStack,
    });
  }

  private onBackHome = (): void => {
    window.location.assign("/");
  };

  private onReload = (): void => {
    window.location.reload();
  };

  private onCopyErrorId = async (): Promise<void> => {
    const { errorId } = this.state;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(errorId);
      } else {
        // Fallback: legacy execCommand for ancient browsers / iframe contexts without Secure Context clipboard
        const ta = document.createElement("textarea");
        ta.value = errorId;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success(`Error ID ${errorId} copied to clipboard`);
    } catch (e) {
      console.warn("[ErrorBoundary] clipboard copy failed", e);
      toast.error("Could not copy error ID to clipboard. Please copy manually.");
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isProd = Boolean(import.meta.env.PROD || import.meta.env.MODE === "production");
    const { error, errorId } = this.state;

    return (
      <div className="flex items-center justify-center min-h-screen p-8 bg-background">
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center w-full max-w-2xl p-8 text-center"
        >
          <AlertTriangle
            size={48}
            className="text-destructive mb-6 flex-shrink-0"
            aria-hidden="true"
          />

          <h2 className="text-xl font-semibold mb-2">An unexpected error occurred.</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Reference ID: <code className="font-mono bg-muted px-2 py-0.5 rounded">{errorId}</code>
          </p>

          {/*
            HARD GATE — Never expose stack traces in PROD (SEC + EEAT trust risk:
            internal paths, library versions, and source filenames leak to attackers).
            In DEV, engineers need full stack to reproduce.
          */}
          {isProd ? (
            <div className="p-4 w-full rounded-lg bg-muted/50 border border-border mb-6">
              <p className="text-sm text-muted-foreground">
                Something went wrong on our end. Please try again or return home.
                When contacting support, include the <strong>Reference ID</strong> above.
              </p>
            </div>
          ) : (
            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6 text-left">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Dev Only — Stack Trace
              </p>
              <pre className="text-sm text-muted-foreground whitespace-break-spaces font-mono">
                {error?.stack || error?.message || String(error)}
              </pre>
            </div>
          )}

          {/* ===== 3 Recovery Actions (Golden UX: Leave, Refresh, Report) ===== */}
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={this.onBackHome}
              aria-label="Back Home"
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
                "border border-border bg-background hover:bg-accent",
                "text-foreground cursor-pointer transition-colors"
              )}
            >
              <Home size={16} aria-hidden="true" />
              Back Home
            </button>

            <button
              type="button"
              onClick={this.onReload}
              aria-label="Reload Page"
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer transition-opacity"
              )}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Reload Page
            </button>

            <button
              type="button"
              onClick={this.onCopyErrorId}
              aria-label={`Copy Error ID ${errorId}`}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
                "border border-border bg-background hover:bg-accent",
                "text-foreground cursor-pointer transition-colors"
              )}
            >
              <Copy size={16} aria-hidden="true" />
              Copy Error ID
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;

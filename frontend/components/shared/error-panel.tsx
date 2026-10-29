"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "cn";
import type { UiError } from "@/lib/errors";

export function ErrorPanel({
  error,
  title,
  onRetry,
  className,
  compact = false,
}: {
  error: UiError | { title: string; message: string; hint?: string; raw?: string };
  title?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-rust/25 bg-rust/[0.04] p-5",
        compact && "p-4",
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rust" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{title ?? error.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{error.message}</p>
          {error.hint && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{error.hint}</p>
          )}
          {"raw" in error && error.raw && (
            <details className="mt-3">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Detail teknis
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {error.raw}
              </pre>
            </details>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-forest underline-offset-4 hover:underline"
            >
              <RefreshCw className="size-3" />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

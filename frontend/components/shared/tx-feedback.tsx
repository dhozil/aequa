"use client";

import * as React from "react";
import { Check, Clock, Loader2, X } from "lucide-react";
import { cn } from "cn";
import { useElapsed } from "@/hooks/use-elapsed";
import type { TxState } from "@/hooks/use-tx";
import { ErrorPanel } from "./error-panel";
import { Hash } from "./address";

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function TxFeedback({
  state,
  onReset,
  onResume,
  successTitle,
  successDescription,
  pendingHint,
  className,
}: {
  state: TxState;
  onReset?: () => void;
  onResume?: () => void;
  successTitle?: string;
  successDescription?: string;
  pendingHint?: string;
  className?: string;
}) {
  const isPending = state.phase === "signing" || state.phase === "pending";
  const elapsed = useElapsed(state.startedAt, isPending);

  if (state.phase === "idle") return null;

  if (state.phase === "error" && state.error) {
    return (
      <div className={cn("space-y-3", className)}>
        <ErrorPanel error={state.error} />
        {state.hash && (
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <p className="label mb-1">Transaction hash</p>
            <Hash value={state.hash} />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {onResume && state.hash && state.error.kind !== "wallet" && (
            <button
              type="button"
              onClick={onResume}
              className="rounded-md border border-border bg-card px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground transition-colors hover:bg-muted"
            >
              Check transaction status
            </button>
          )}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  if (state.phase === "success") {
    return (
      <div
        className={cn(
          "rounded-lg border border-forest/25 bg-forest/[0.05] p-4",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-forest text-paper">
            <Check className="size-3" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">
              {successTitle ?? "Transaction successful"}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {successDescription ?? "On-chain state has been updated."}
            </p>
            {state.hash && (
              <div className="mt-2">
                <Hash value={state.hash} />
              </div>
            )}
          </div>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-brass/30 bg-brass/[0.05] p-4",
        className,
      )}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-brass" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">
              {state.phase === "signing"
                ? "Waiting for the wallet signature…"
                : `${state.label ?? "Transaction"} is processing`}
            </p>
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <Clock className="size-3" />
              {formatElapsed(elapsed)}
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {state.phase === "signing"
              ? "Approve the request in your wallet. Do not close this page."
              : pendingHint ??
                "Waiting for validator consensus. Usually 15–60 seconds; AI evaluation can take 1–3 minutes."}
          </p>
          {state.hash && (
            <div className="mt-2">
              <Hash value={state.hash} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

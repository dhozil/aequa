"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { shortAddress } from "@/lib/format";

export function useCopy() {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(async (value: string, message = "Copied to clipboard") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(message);
      window.setTimeout(() => setCopied(false), 1600);
      return true;
    } catch {
      toast.error("Could not copy", {
        description: "The browser blocked clipboard access. Copy the text on screen manually.",
      });
      return false;
    }
  }, []);

  return { copied, copy };
}

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
      aria-label={label}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function Address({
  value,
  chars = 4,
  className,
  showCopy = true,
}: {
  value: string;
  chars?: number;
  className?: string;
  showCopy?: boolean;
}) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="font-mono text-xs tracking-tight text-foreground/80">
        {shortAddress(value, chars)}
      </span>
      {showCopy && <CopyButton value={value} label="Copy address" />}
    </span>
  );
}

export function Hash({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <code className="break-all font-mono text-[11px] text-foreground/75">{value}</code>
      <CopyButton value={value} label="Copy hash" />
    </span>
  );
}

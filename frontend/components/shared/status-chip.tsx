import { cn } from "cn";
import { statusLabel } from "@/lib/format";
import type { ProposalStatus, RoundStatus } from "@/lib/types";

const tones: Record<string, string> = {
  open: "border-moss/35 bg-moss/10 text-moss",
  closed: "border-ink/20 bg-ink/5 text-ink/70",
  submitted: "border-brass/35 bg-brass/10 text-brass",
  approved: "border-forest/30 bg-forest/10 text-forest",
  rejected: "border-rust/30 bg-rust/10 text-rust",
  payout_pending: "border-brass/40 bg-brass/10 text-brass",
  paid: "border-forest/40 bg-forest text-paper",
  payout_failed: "border-rust/40 bg-rust/10 text-rust",
};

export function StatusChip({
  status,
  label,
  className,
}: {
  status: RoundStatus | ProposalStatus;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] font-mono text-[10px] font-medium uppercase tracking-[0.14em]",
        tones[status] ?? tones.closed,
        className,
      )}
    >
      <span className="size-1 rounded-full bg-current" />
      {label ?? statusLabel(status)}
    </span>
  );
}

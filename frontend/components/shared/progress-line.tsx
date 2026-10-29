import { cn } from "cn";

export function ProgressLine({
  value,
  max,
  tone = "forest",
  className,
  height = 4,
}: {
  value: bigint | number;
  max: bigint | number;
  tone?: "forest" | "brass" | "rust";
  className?: string;
  height?: number;
}) {
  const ratio =
    typeof value === "bigint" && typeof max === "bigint"
      ? max > 0n
        ? Math.min(Math.max(Number((value * 1000n) / max) / 10, 0), 100)
        : 0
      : max > 0
        ? Math.min(Math.max((Number(value) / Number(max)) * 100, 0), 100)
        : 0;

  const color = tone === "brass" ? "bg-brass" : tone === "rust" ? "bg-rust" : "bg-forest";

  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-border/80", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(ratio)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${ratio}%` }} />
    </div>
  );
}

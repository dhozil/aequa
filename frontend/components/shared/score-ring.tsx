import { cn } from "cn";

export function ScoreRing({
  score,
  threshold,
  size = 132,
  tone = "forest",
  className,
}: {
  score: number;
  threshold?: number;
  size?: number;
  tone?: "forest" | "rust" | "brass";
  className?: string;
}) {
  const stroke = 3;
  const radius = (size - stroke) / 2 - 6;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(score, 0), 100);
  const dash = (clamped / 100) * circumference;
  const color =
    tone === "rust" ? "var(--rust)" : tone === "brass" ? "var(--brass)" : "var(--forest)";

  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className="display text-[40px] text-ink">{score}</span>
        <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
          of 100
        </span>
        {typeof threshold === "number" && (
          <span className="mt-2 rounded-full border border-border bg-card px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
            threshold {threshold}
          </span>
        )}
      </div>
    </div>
  );
}

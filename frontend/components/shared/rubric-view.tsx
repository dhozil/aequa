import { cn } from "cn";
import { titleFromId } from "@/lib/format";
import type { Rubric } from "@/lib/types";

export function RubricView({
  rubric,
  variant = "full",
  className,
}: {
  rubric: Rubric;
  variant?: "full" | "compact";
  className?: string;
}) {
  const compact = variant === "compact";
  return (
    <div className={cn("space-y-6", className)}>
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <p className="label">Criteria · weight</p>
          <span className="font-mono text-[10px] text-muted-foreground">
            {rubric.criteria.reduce((sum, item) => sum + item.weight, 0)} / 100
          </span>
        </div>
        <ul className="divide-y divide-border/70 border-y border-border/70">
          {rubric.criteria.map((criterion, index) => (
            <li key={criterion.id} className={cn("py-3", compact && "py-2.5")}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 w-5 shrink-0 font-mono text-[10px] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{titleFromId(criterion.id)}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {criterion.question}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-mono text-xs tabular text-ink">{criterion.weight}</span>
                  <div className="mt-1 h-[3px] w-16 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-brass"
                      style={{ width: `${criterion.weight}%` }}
                    />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="label mb-3">Gates · all must pass</p>
        <ul className="space-y-2">
          {rubric.gates.map((gate) => (
            <li
              key={gate.id}
              className="flex items-start gap-3 rounded-md border border-border/70 bg-background/50 px-3 py-2.5"
            >
              <span className="mt-1 size-2 shrink-0 rounded-[2px] border border-forest/40 bg-forest/10" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{titleFromId(gate.id)}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {gate.question}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

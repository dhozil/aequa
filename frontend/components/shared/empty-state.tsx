import * as React from "react";
import { cn } from "cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/60 px-6 py-16 text-center",
        className,
      )}
    >
      {icon && <div className="mb-4 grid size-11 place-items-center rounded-full border border-border bg-background text-muted-foreground">{icon}</div>}
      <h3 className="text-[22px] text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

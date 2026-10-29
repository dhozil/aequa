import { Skeleton } from "@/components/ui/skeleton";

/**
 * Static fallback for dynamic route segments. It renders while the `params`
 * promise resolves so a navigation can paint the shell immediately instead of
 * blocking on the URL value.
 */
export function RouteSkeleton({
  variant = "detail",
}: {
  variant?: "detail" | "form" | "proposal";
}) {
  if (variant === "form") {
    return (
      <div className="shell py-12 sm:py-16">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-6 h-10 w-2/3" />
        <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
        <div className="mt-10 grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <Skeleton className="h-[560px] w-full" />
          <Skeleton className="h-[420px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="shell py-12 sm:py-16">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-6 h-10 w-2/3" />
      <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
      <Skeleton className="mt-3 h-4 w-1/2" />
      <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border/70 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="bg-card p-5">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="mt-3 h-5 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-3">
          {Array.from({ length: variant === "proposal" ? 4 : 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}

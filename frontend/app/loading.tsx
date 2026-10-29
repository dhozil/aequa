import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="shell py-16">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-6 h-11 w-2/3 max-w-xl" />
      <Skeleton className="mt-4 h-4 w-full max-w-lg" />
      <Skeleton className="mt-3 h-4 w-1/2 max-w-sm" />
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

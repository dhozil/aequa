import { Suspense } from "react";
import type { Metadata } from "next";
import { RoundDetail } from "@/components/rounds/round-detail";
import { RouteSkeleton } from "@/components/shared/route-skeleton";

export const metadata: Metadata = {
  title: "Round detail",
  description:
    "Rubric, treasury, and proposal list for a single Aequa Grants grant round.",
};

export default function RoundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      {params.then(({ id }) => (
        <RoundDetail roundId={id} />
      ))}
    </Suspense>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { SubmitProposal } from "@/components/proposals/submit-form";
import { RouteSkeleton } from "@/components/shared/route-skeleton";

export const metadata: Metadata = {
  title: "Submit a proposal",
  description:
    "Submit a grant proposal with public evidence. GenLayer AI validators re-score every proposal against the round rubric.",
};

export default function SubmitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<RouteSkeleton variant="form" />}>
      {params.then(({ id }) => (
        <SubmitProposal roundId={id} />
      ))}
    </Suspense>
  );
}

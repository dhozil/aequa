import { Suspense } from "react";
import type { Metadata } from "next";
import { ProposalDetail } from "@/components/proposals/proposal-detail";
import { RouteSkeleton } from "@/components/shared/route-skeleton";

export const metadata: Metadata = {
  title: "Proposal detail",
  description:
    "Scores, gates, evidence quotes, and the reasoning behind each AI consensus decision for an Aequa Grants proposal.",
};

export default function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<RouteSkeleton variant="proposal" />}>
      {params.then(({ id }) => (
        <ProposalDetail proposalId={id} />
      ))}
    </Suspense>
  );
}

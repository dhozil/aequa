import type { Metadata } from "next";
import { ConsensusContent } from "./content";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Consensus",
  description:
    "How GenLayer AI validators re-evaluate every Aequa Grants proposal independently and only write state when their decisions agree.",
};

export default function ConsensusPage() {
  return (
    <>
      <div className="shell pt-12 sm:pt-14 lg:pt-16">
        <PageHeader
          eyebrow="Decision-level consensus"
          title="From public evidence to a shared decision."
          description="Every validator runs its own evaluation from the same evidence. The contract compares final decisions and only writes state when they all agree."
        />
      </div>
      <ConsensusContent />
    </>
  );
}

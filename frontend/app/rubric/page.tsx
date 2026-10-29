import type { Metadata } from "next";
import { RubricContent } from "./content";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Rubric",
  description:
    "The public Aequa Grants rubric: weighted criteria, hard gates, and the score threshold every proposal is measured against.",
};

export default function RubricPage() {
  return (
    <>
      <div className="shell pt-12 sm:pt-14 lg:pt-16">
        <PageHeader
          eyebrow="Aequa Grants · transparency"
          title="An open rubric, before proposals arrive."
          description="Weights, criteria questions, and gates are set upfront. Applicants know exactly what will be evaluated — and a proposal is rejected outright if a single gate fails."
        />
      </div>
      <RubricContent />
    </>
  );
}

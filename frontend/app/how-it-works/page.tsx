import { HowItWorks, Principles } from "@/components/home/sections";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "How it works" };

export default function HowItWorksPage() {
  return (
    <>
      <div className="shell pt-12 sm:pt-14 lg:pt-16">
        <PageHeader
          eyebrow="Aequa Grants · AI Governance"
          title="How funds move legitimately."
          description="From community funding to payout, every step is recorded on-chain and open for anyone to inspect."
        />
      </div>
      <HowItWorks />
      <Principles />
    </>
  );
}

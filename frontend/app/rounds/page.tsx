import type { Metadata } from "next";
import { RoundsList } from "@/components/rounds/rounds-list";

export const metadata: Metadata = {
  title: "Rounds",
  description:
    "Browse grant rounds on Aequa Grants: public rubric, on-chain budget, and proposals evaluated by GenLayer AI validators.",
};

export default function RoundsPage() {
  return <RoundsList />;
}

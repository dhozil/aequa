import { HeroFinancial } from "@/components/ui/hero-financial";
import {
  CallToAction,
  ExploreCards,
  Principles,
} from "@/components/home/sections";

export default function HomePage() {
  return (
    <>
      <HeroFinancial />
      <Principles />
      <ExploreCards />
      <CallToAction />
    </>
  );
}

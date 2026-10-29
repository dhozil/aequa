"use client";

import { RubricSection } from "@/components/home/sections";
import { useRounds } from "@/hooks/use-contract";

export function RubricContent() {
  const rounds = useRounds();
  const latestRound = [...(rounds.data ?? [])]
    .reverse()
    .find((round) => round.rubric.criteria.length > 0);

  return <RubricSection round={latestRound} />;
}

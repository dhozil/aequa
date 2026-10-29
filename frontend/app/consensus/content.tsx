"use client";

import { ConsensusSection } from "@/components/home/sections";
import { useAllProposals, useRounds } from "@/hooks/use-contract";

export function ConsensusContent() {
  const rounds = useRounds();
  const proposals = useAllProposals();

  const evaluated = [...(proposals.data ?? [])]
    .filter((proposal) => proposal.status !== "submitted")
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const evaluatedRound = (rounds.data ?? []).find(
    (round) => round.id === evaluated?.roundId,
  );

  return (
    <ConsensusSection
      proposal={evaluated}
      rubric={evaluatedRound?.rubric}
      threshold={evaluatedRound?.minScore}
    />
  );
}

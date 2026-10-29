"use client";

import { useQuery } from "@tanstack/react-query";
import { read, readClient } from "@/lib/genlayer";
import {
  normalizeProposal,
  normalizeRefund,
  normalizeRound,
  normalizeStats,
  type Proposal,
  type RefundQuote,
  type Round,
  type Stats,
} from "@/lib/types";

// Studionet allows 500 RPC calls per hour, so polling stays deliberately calm:
// every open page refetches at most four queries a minute, and hidden tabs stop
// polling entirely. Mutations invalidate their queries directly.
const REFRESH = 60_000;

/**
 * A single dropped request should not surface as a contract error: retry once
 * after a short pause, but only for transport failures. On-chain reverts and
 * rate limits fail fast because retrying them would hammer the RPC.
 */
function retryNetworkError(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|networkerror|network error|load failed|timeout|timed out/i.test(
    message,
  );
}

const retryPolicy = {
  retry: retryNetworkError,
  retryDelay: 1_200,
};

export const queryKeys = {
  stats: ["stats"] as const,
  rounds: ["rounds"] as const,
  round: (id: string) => ["round", id] as const,
  roundProposals: (id: string) => ["round", id, "proposals"] as const,
  proposal: (id: string) => ["proposal", id] as const,
  proposals: ["proposals"] as const,
  refund: (roundId: string, address: string) => ["refund", roundId, address] as const,
};

export function useStats() {
  return useQuery<Stats>({
    queryKey: queryKeys.stats,
    queryFn: async () => normalizeStats(await read({ functionName: "get_stats" })),
    refetchInterval: REFRESH,
  });
}

export function useRounds() {
  return useQuery<Round[]>({
    queryKey: queryKeys.rounds,
    queryFn: async () => {
      const raw = await read<unknown[]>({ functionName: "list_rounds" });
      return (raw ?? []).map(normalizeRound);
    },
    refetchInterval: REFRESH,
  });
}

export function useRound(roundId: string) {
  return useQuery<Round>({
    queryKey: queryKeys.round(roundId),
    queryFn: async () =>
      normalizeRound(await read({ functionName: "get_round", args: [roundId] })),
    enabled: Boolean(roundId),
    ...retryPolicy,
    refetchInterval: REFRESH,
  });
}

export function useRoundProposals(roundId: string) {
  return useQuery<Proposal[]>({
    queryKey: queryKeys.roundProposals(roundId),
    queryFn: async () => {
      const raw = await read<unknown[]>({
        functionName: "list_round_proposals",
        args: [roundId],
      });
      return (raw ?? []).map(normalizeProposal);
    },
    enabled: Boolean(roundId),
    ...retryPolicy,
    refetchInterval: REFRESH,
  });
}

export function useProposal(proposalId: string) {
  return useQuery<Proposal>({
    queryKey: queryKeys.proposal(proposalId),
    queryFn: async () =>
      normalizeProposal(
        await read({ functionName: "get_proposal", args: [proposalId] }),
      ),
    enabled: Boolean(proposalId),
    ...retryPolicy,
    refetchInterval: (query) =>
      query.state.data?.status === "submitted" ? 20_000 : false,
  });
}

export function useAllProposals() {
  return useQuery<Proposal[]>({
    queryKey: queryKeys.proposals,
    queryFn: async () => {
      const raw = await read<unknown[]>({ functionName: "list_proposals" });
      return (raw ?? []).map(normalizeProposal);
    },
    refetchInterval: REFRESH,
  });
}

/**
 * One-shot read used after a transaction finalizes, to confirm the state the
 * caller expected to change actually changed. Not a hook, so it can be called
 * from `useTx`'s verify callback.
 */
export async function fetchProposal(proposalId: string): Promise<Proposal> {
  return normalizeProposal(await read({ functionName: "get_proposal", args: [proposalId] }));
}

export async function fetchRefund(roundId: string, address: string): Promise<RefundQuote> {
  return normalizeRefund(
    await read({ functionName: "get_refund", args: [roundId, address] }),
  );
}

/** The connected funder's own refund position, read from the deposit ledger. */
export function useRefundQuote(roundId: string, address: string | null) {
  return useQuery<RefundQuote>({
    queryKey: queryKeys.refund(roundId, address ?? ""),
    queryFn: async () => fetchRefund(roundId, address as string),
    enabled: Boolean(roundId && address),
    ...retryPolicy,
    refetchInterval: REFRESH,
  });
}

export async function fetchRoundProposals(roundId: string): Promise<Proposal[]> {
  const raw = await read<unknown[]>({
    functionName: "list_round_proposals",
    args: [roundId],
  });
  return (raw ?? []).map(normalizeProposal);
}

export function useGenBalance(address: string | null) {
  return useQuery<bigint | null>({
    queryKey: ["balance", address],
    queryFn: async () => {
      if (!address) return null;
      try {
        const value = await readClient.getBalance({
          address: address as `0x${string}`,
        });
        return typeof value === "bigint" ? value : BigInt(value ?? 0);
      } catch {
        return null;
      }
    },
    enabled: Boolean(address),
    retry: false,
    staleTime: 15_000,
  });
}

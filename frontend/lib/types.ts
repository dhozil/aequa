export type RoundStatus = "open" | "closed";
export type ProposalStatus =
  | "submitted"
  | "approved"
  | "rejected"
  | "payout_pending"
  | "paid"
  | "payout_failed";
export type Decision = "approve" | "reject" | "";

export type RubricCriterion = {
  id: string;
  weight: number;
  question: string;
};

export type RubricGate = {
  id: string;
  question: string;
};

export type Rubric = {
  criteria: RubricCriterion[];
  gates: RubricGate[];
};

export type Round = {
  id: string;
  title: string;
  description: string;
  rubric: Rubric;
  budgetAtto: bigint;
  fundedAtto: bigint;
  reservedAtto: bigint;
  paidAtto: bigint;
  refundedAtto: bigint;
  availableAtto: bigint;
  maxGrantAtto: bigint;
  minScore: number;
  deadlineIso: string;
  status: RoundStatus;
  createdBy: string;
  proposalCount: number;
};

export type CriterionResult = {
  id: string;
  score: number;
  quote: string;
  quoteVerified: boolean;
  reason: string;
};

export type EvidenceSource = {
  url: string;
  status: "ok" | "failed" | string;
  chars: number;
  fingerprint: string;
};

export type Proposal = {
  id: string;
  roundId: string;
  applicant: string;
  title: string;
  summary: string;
  evidenceUrls: string[];
  requestedAtto: bigint;
  status: ProposalStatus;
  score: number;
  decision: Decision;
  decisionReason: string;
  gates: Record<string, boolean>;
  criteria: CriterionResult[];
  rationale: string;
  paidAtto: bigint;
  createdAt: number;
  evaluatedAt: number;
  sources: EvidenceSource[];
  payoutState: string;
  payoutSentAt: number;
  /** When delivery was first observed; 0 until then. */
  payoutObservedAt: number;
  /** Unix time from which a second confirmation can settle the grant. */
  payoutConfirmAfter: number;
  payoutSettleSeconds: number;
  payoutAttempts: number;
};

export type Stats = {
  owner: string;
  paused: boolean;
  balanceAtto: bigint;
  totalFundedAtto: bigint;
  totalReservedAtto: bigint;
  totalPaidAtto: bigint;
  totalRefundedAtto: bigint;
  totalReceivedAtto: bigint;
  payoutInFlight: number;
  refundInFlight: number;
  /** Refund transfers that bounced and were released for another claim. */
  bouncedRefunds: number;
  bouncedAtto: bigint;
  roundCount: number;
  proposalCount: number;
};

/**
 * What one address can take back from a round. Refunds are pull-based and
 * pro-rata: the contract computes the share from the deposit ledger, so the
 * owner never holds community money and no funder can reach another's deposit.
 */
export type RefundQuote = {
  roundId: string;
  funder: string;
  depositAtto: bigint;
  entitledAtto: bigint;
  claimedAtto: bigint;
  claimableAtto: bigint;
  /** Amount sent but not yet reconciled: it may still be in flight or bounced. */
  pendingAtto: bigint;
  /**
   * "sent" while a claim waits for delivery confirmation, "owed" when the last
   * claim bounced and was released for a retry, otherwise "".
   */
  refundState: "sent" | "owed" | "" | string;
  refundSentAt: number;
  refundAttempts: number;
  /** When delivery was first observed; 0 until then. */
  refundObservedAt: number;
  /** Unix time from which a second confirmation can settle the claim. */
  refundConfirmAfter: number;
  refundSettleSeconds: number;
  refundPoolAtto: bigint;
  ready: boolean;
  blockedReason: string;
};

/* ------------------------------------------------------------------ */
/* Defensive decoding: calldata maps come back as Map or plain object. */
/* ------------------------------------------------------------------ */

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function toBigInt(value: unknown, fallback = 0n): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return fallback;
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function toText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

export function toRecord<T = unknown>(value: unknown): Record<string, T> {
  if (value instanceof Map) {
    const out: Record<string, T> = {};
    for (const [key, item] of value.entries()) out[String(key)] = item as T;
    return out;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, T>;
  }
  return {};
}

export function toArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value instanceof Map) return Array.from(value.values()) as T[];
  return [];
}

export function parseRubric(value: unknown): Rubric {
  const record = toRecord<unknown>(typeof value === "string" ? safeJson(value) : value);
  return {
    criteria: toArray<Record<string, unknown>>(record.criteria).map((item) => ({
      id: toText(item.id),
      weight: toNumber(item.weight),
      question: toText(item.question),
    })),
    gates: toArray<Record<string, unknown>>(record.gates).map((item) => ({
      id: toText(item.id),
      question: toText(item.question),
    })),
  };
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function normalizeRound(raw: unknown): Round {
  const item = toRecord<unknown>(raw);
  return {
    id: toText(item.id),
    title: toText(item.title),
    description: toText(item.description),
    rubric: parseRubric(item.rubric),
    budgetAtto: toBigInt(item.budget_atto),
    fundedAtto: toBigInt(item.funded_atto),
    reservedAtto: toBigInt(item.reserved_atto),
    paidAtto: toBigInt(item.paid_atto),
    refundedAtto: toBigInt(item.refunded_atto),
    availableAtto: toBigInt(item.available_atto),
    maxGrantAtto: toBigInt(item.max_grant_atto),
    minScore: toNumber(item.min_score),
    deadlineIso: toText(item.deadline_iso),
    status: toText(item.status, "open") === "closed" ? "closed" : "open",
    createdBy: toText(item.created_by),
    proposalCount: toNumber(item.proposal_count),
  };
}

export function normalizeProposal(raw: unknown): Proposal {
  const item = toRecord<unknown>(raw);
  const gates = toRecord<unknown>(
    typeof item.gates === "string" ? safeJson(item.gates) : item.gates,
  );
  const criteriaRaw =
    typeof item.criteria === "string" ? safeJson(item.criteria) : item.criteria;
  const evidenceRaw =
    typeof item.evidence_urls === "string" ? safeJson(item.evidence_urls) : item.evidence_urls;
  return {
    id: toText(item.id),
    roundId: toText(item.round_id),
    applicant: toText(item.applicant),
    title: toText(item.title),
    summary: toText(item.summary),
    evidenceUrls: toArray<string>(evidenceRaw).map((url) => toText(url)),
    requestedAtto: toBigInt(item.requested_atto),
    status: toText(item.status, "submitted") as ProposalStatus,
    score: toNumber(item.score),
    decision: toText(item.decision) as Decision,
    decisionReason: toText(item.decision_reason),
    gates: Object.fromEntries(
      Object.entries(gates).map(([key, value]) => [key, Boolean(value)]),
    ),
    criteria: toArray<Record<string, unknown>>(criteriaRaw).map((entry) => ({
      id: toText(entry.id),
      score: toNumber(entry.score),
      quote: toText(entry.quote),
      quoteVerified: Boolean(entry.quote_verified),
      reason: toText(entry.reason),
    })),
    rationale: toText(item.rationale),
    paidAtto: toBigInt(item.paid_atto),
    createdAt: toNumber(item.created_at),
    evaluatedAt: toNumber(item.evaluated_at),
    sources: toArray<Record<string, unknown>>(
      typeof item.sources === "string" ? safeJson(item.sources) : item.sources,
    ).map((source) => ({
      url: toText(source.url),
      status: toText(source.status),
      chars: toNumber(source.chars),
      fingerprint: toText(source.fingerprint),
    })),
    payoutState: toText(item.payout_state),
    payoutSentAt: toNumber(item.payout_sent_at),
    payoutObservedAt: toNumber(item.payout_observed_at),
    payoutConfirmAfter: toNumber(item.payout_confirm_after),
    payoutSettleSeconds: toNumber(item.payout_settle_seconds),
    payoutAttempts: toNumber(item.payout_attempts),
  };
}

export function normalizeStats(raw: unknown): Stats {
  const item = toRecord<unknown>(raw);
  return {
    owner: toText(item.owner),
    paused: Boolean(item.paused),
    balanceAtto: toBigInt(item.balance_atto),
    totalFundedAtto: toBigInt(item.total_funded_atto),
    totalReservedAtto: toBigInt(item.total_reserved_atto),
    totalPaidAtto: toBigInt(item.total_paid_atto),
    totalRefundedAtto: toBigInt(item.total_refunded_atto),
    totalReceivedAtto: toBigInt(item.total_received_atto),
    payoutInFlight: toNumber(item.payout_in_flight),
    refundInFlight: toNumber(item.refund_in_flight),
    bouncedRefunds: toNumber(item.bounced_refunds),
    bouncedAtto: toBigInt(item.bounced_atto),
    roundCount: toNumber(item.round_count),
    proposalCount: toNumber(item.proposal_count),
  };
}

export function normalizeRefund(raw: unknown): RefundQuote {
  const item = toRecord<unknown>(raw);
  return {
    roundId: toText(item.round_id),
    funder: toText(item.funder),
    depositAtto: toBigInt(item.deposit_atto),
    entitledAtto: toBigInt(item.entitled_atto),
    claimedAtto: toBigInt(item.claimed_atto),
    claimableAtto: toBigInt(item.claimable_atto),
    pendingAtto: toBigInt(item.pending_atto),
    refundState: toText(item.refund_state),
    refundSentAt: toNumber(item.refund_sent_at),
    refundAttempts: toNumber(item.refund_attempts),
    refundObservedAt: toNumber(item.refund_observed_at),
    refundConfirmAfter: toNumber(item.refund_confirm_after),
    refundSettleSeconds: toNumber(item.refund_settle_seconds),
    refundPoolAtto: toBigInt(item.refund_pool_atto),
    ready: Boolean(item.ready),
    blockedReason: toText(item.blocked_reason),
  };
}

export function isUnknownResourceError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return text.toLowerCase().includes("unknown round") ||
    text.toLowerCase().includes("unknown proposal");
}

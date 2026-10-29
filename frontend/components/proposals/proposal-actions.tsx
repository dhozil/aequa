"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Gavel,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TxFeedback } from "@/components/shared/tx-feedback";
import { Address } from "@/components/shared/address";
import { WalletButton } from "@/components/wallet/wallet-button";
import { fetchProposal, queryKeys, useStats } from "@/hooks/use-contract";
import { useTx } from "@/hooks/use-tx";
import { useWallet } from "@/hooks/use-wallet";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { formatGenUnit, formatTimestamp } from "@/lib/format";
import type { Proposal } from "@/lib/types";

type Action = "evaluate" | "disburse" | "confirm" | "recover";

const MAX_PAYOUT_ATTEMPTS = 3;

const FUNCTION_NAME: Record<Action, string> = {
  evaluate: "evaluate_proposal",
  disburse: "disburse",
  confirm: "confirm_payout",
  recover: "recover_payout",
};

const COPY: Record<
  Action,
  {
    title: string;
    description: string;
    confirm: string;
    label: string;
    successTitle: string;
    successDescription: string;
    pendingHint: string;
  }
> = {
  evaluate: {
    title: "Run AI evaluation?",
    description:
      "Validators fetch the evidence URLs and re-run the rubric independently. The decision only counts once they agree.",
    confirm: "Start evaluation",
    label: "Evaluating the proposal",
    successTitle: "Evaluation finalized",
    successDescription: "The consensus decision is stored on-chain.",
    pendingHint:
      "Validators are re-scoring the proposal. Usually 1–3 minutes; do not close the page.",
  },
  disburse: {
    title: "Send the payout?",
    description:
      "The transfer leaves as a separate transaction. The proposal stays in payout pending until the contract can observe that the funds arrived, so a failed transfer can be retried instead of being recorded as paid.",
    confirm: "Send payout",
    label: "Sending the payout",
    successTitle: "Payout submitted",
    successDescription:
      "The transfer was submitted. It is marked paid only after delivery is observed on-chain.",
    pendingHint: "Submitting the payout transfer. Usually 15–60 seconds.",
  },
  confirm: {
    title: "Confirm the payout?",
    description:
      "This is permissionless and only reduces what the contract owes. It succeeds when the contract's balance shows the transfer has actually left.",
    confirm: "Check and confirm",
    label: "Confirming the payout",
    successTitle: "Payout confirmed",
    successDescription: "Delivery was observed on-chain and the grant is now paid.",
    pendingHint: "Checking whether the transfer has been delivered.",
  },
  recover: {
    title: "Recover the payout?",
    description:
      "If the transfer failed, its value returns to the contract. After the one-hour grace period this puts the grant back in play so it can be sent again. After three failed attempts the reservation is released back to the round.",
    confirm: "Recover payout",
    label: "Recovering the payout",
    successTitle: "Payout recovered",
    successDescription: "The grant can be sent again, or its reservation was released.",
    pendingHint: "Reconciling the payout.",
  },
};

export function ProposalActions({
  proposal,
  roundId,
  isOwner,
}: {
  proposal: Proposal;
  roundId: string;
  isOwner: boolean;
}) {
  const { address } = useWallet();
  const stats = useStats();
  // Evaluation is the one action the contract rejects while paused; payouts and
  // their reconciliation stay open, so only that button is gated.
  const paused = Boolean(stats.data?.paused);
  const tx = useTx();
  const [action, setAction] = React.useState<Action | null>(null);

  const isApplicant =
    Boolean(address) && address?.toLowerCase() === proposal.applicant.toLowerCase();
  const canDisburse = isOwner || isApplicant;
  const needsWallet = !address;
  const canEvaluate = proposal.status === "submitted";

  const payoutPending = proposal.status === "payout_pending";
  const payoutSent = payoutPending && proposal.payoutState === "sent";
  const payoutOwed = payoutPending && proposal.payoutState === "owed";
  const attemptsLeft = MAX_PAYOUT_ATTEMPTS - proposal.payoutAttempts;

  const invalidate = [
    queryKeys.stats,
    queryKeys.rounds,
    queryKeys.round(roundId),
    queryKeys.roundProposals(roundId),
    queryKeys.proposal(proposal.id),
    queryKeys.proposals,
  ];

  const open = (next: Action) => {
    tx.reset();
    setAction(next);
  };

  const handleRun = () => {
    if (!action || tx.isBusy || !address) return;
    const current = action;
    void tx.run({
      label: COPY[current].label,
      send: (client) =>
        client.writeContract({
          address: CONTRACT_ADDRESS,
          functionName: FUNCTION_NAME[current],
          args: [proposal.id],
          value: 0n,
        }),
      invalidate,
      successTitle: COPY[current].successTitle,
      successDescription: COPY[current].successDescription,
      waitRetries: 240,
      waitInterval: 3_000,
      // Finality is not the same as the expected effect. Read the proposal back
      // and only report success when the state actually moved.
      verify: async () => {
        try {
          const fresh = await fetchProposal(proposal.id);
          if (current === "evaluate") return fresh.status !== "submitted";
          if (current === "disburse") {
            return fresh.status === "payout_pending" || fresh.status === "paid";
          }
          if (current === "confirm") return fresh.status === "paid";
          return fresh.payoutState !== "sent";
        } catch {
          // A failed readback is inconclusive, not a failed transaction.
          return true;
        }
      },
    });
  };

  const close = (value: boolean) => {
    if (!value) {
      setAction(null);
      tx.reset();
    }
  };

  const copy = action ? COPY[action] : null;

  return (
    <>
      <div className="space-y-2">
        {canEvaluate && (
          <Button
            size="lg"
            className="w-full justify-center"
            onClick={() => open("evaluate")}
            disabled={needsWallet || paused}
            title={paused ? "The contract is paused by the owner" : undefined}
          >
            <Sparkles className="size-3.5" />
            Run AI evaluation
          </Button>
        )}

        {canEvaluate && paused && (
          <p className="rounded-md border border-brass/30 bg-brass/[0.05] px-3 py-2.5 text-[11px] leading-relaxed text-brass">
            The contract is paused, so evaluation is rejected until the owner unpauses
            it. Nothing is lost: the proposal stays in the queue.
          </p>
        )}

        {proposal.status === "approved" && canDisburse && (
          <Button
            size="lg"
            variant="outline"
            className="w-full justify-center"
            onClick={() => open("disburse")}
          >
            <Banknote className="size-3.5" />
            Send payout {formatGenUnit(proposal.requestedAtto, 2)}
          </Button>
        )}

        {proposal.status === "approved" && !canDisburse && (
          <p className="rounded-md border border-border bg-secondary/30 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            Only the contract owner or the applicant can send this proposal&apos;s payout.
          </p>
        )}

        {payoutSent && (
          <div className="space-y-2.5 rounded-md border border-brass/35 bg-brass/[0.05] px-3 py-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-ink">Payout submitted</span>{" "}
              {proposal.payoutSentAt ? formatTimestamp(proposal.payoutSentAt) : ""} · attempt{" "}
              {proposal.payoutAttempts} of {MAX_PAYOUT_ATTEMPTS}. It is not marked paid until
              the contract observes the delivery.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 justify-center"
                onClick={() => open("confirm")}
                disabled={needsWallet}
              >
                <CheckCircle2 className="size-3.5" />
                Confirm delivery
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 justify-center"
                onClick={() => open("recover")}
                disabled={needsWallet}
              >
                <RefreshCw className="size-3.5" />
                Transfer failed?
              </Button>
            </div>
          </div>
        )}

        {payoutOwed && canDisburse && (
          <Button
            size="lg"
            variant="outline"
            className="w-full justify-center"
            onClick={() => open("disburse")}
            disabled={attemptsLeft <= 0}
          >
            <RefreshCw className="size-3.5" />
            Retry payout {formatGenUnit(proposal.requestedAtto, 2)}
          </Button>
        )}

        {payoutOwed && !canDisburse && (
          <p className="rounded-md border border-border bg-secondary/30 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            The transfer returned to the contract. The owner or the applicant can send it
            again.
          </p>
        )}

        {proposal.status === "payout_failed" && (
          <p className="rounded-md border border-rust/30 bg-rust/[0.05] px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            The grant was approved, but the transfer could not be delivered after{" "}
            {MAX_PAYOUT_ATTEMPTS} attempts. The reservation was released back to the round.
          </p>
        )}

        {needsWallet && (canEvaluate || payoutSent) && (
          <div className="space-y-2 rounded-md border border-border bg-card p-3">
            <p className="flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <Wallet className="size-3 shrink-0" />
              Connect your wallet to act on this proposal.
            </p>
            <WalletButton fullWidth />
          </div>
        )}
      </div>

      <Dialog open={action === "evaluate"} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run AI evaluation?</DialogTitle>
            <DialogDescription>
              Every validator fetches the evidence URLs and re-scores the rubric
              independently. The transaction only counts as complete when validators
              reach the same decision.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-start gap-2.5">
              <Gavel className="mt-0.5 size-3.5 shrink-0 text-forest" />
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Evaluation usually takes <strong className="text-ink">1–3 minutes</strong>.
                Do not close the page while the transaction is waiting for consensus.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-forest" />
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                If validators do not agree, state does not change and no funds are
                allocated. The evaluation can be run again.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-forest" />
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                The funding decision is what validators agree on. Scores, gate results and
                evidence quotes are recorded from the leader run for transparency.
              </p>
            </div>
          </div>

          {action === "evaluate" && tx.state.phase !== "idle" && (
            <TxFeedback
              state={tx.state}
              onReset={tx.reset}
              successTitle="Evaluation finalized"
              successDescription="The consensus result is stored. This page reloads automatically."
              pendingHint={COPY.evaluate.pendingHint}
            />
          )}

          <DialogFooter className="gap-2">
            {tx.isSuccess ? (
              <Button onClick={() => close(false)}>View result</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => close(false)} disabled={tx.isBusy}>
                  {tx.isBusy ? "Running…" : "Cancel"}
                </Button>
                <Button onClick={handleRun} disabled={needsWallet || tx.isBusy}>
                  {tx.isBusy ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Waiting for consensus…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" />
                      Start evaluation
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={action !== null && action !== "evaluate"} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy?.title}</DialogTitle>
            <DialogDescription>{copy?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                amount
              </span>
              <span className="font-mono text-base tabular text-ink">
                {formatGenUnit(proposal.requestedAtto, 4)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                recipient
              </span>
              <Address value={proposal.applicant} chars={4} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                round
              </span>
              <Link
                href={`/rounds/${roundId}`}
                className="inline-flex items-center gap-1 font-mono text-[10px] text-forest hover:underline"
              >
                {roundId} <ArrowUpRight className="size-3" />
              </Link>
            </div>
          </div>

          {action !== null && action !== "evaluate" && tx.state.phase !== "idle" && (
            <TxFeedback
              state={tx.state}
              onReset={tx.reset}
              successTitle={COPY[action].successTitle}
              successDescription={COPY[action].successDescription}
              pendingHint={COPY[action].pendingHint}
            />
          )}

          <DialogFooter className="gap-2">
            {tx.isSuccess ? (
              <Button onClick={() => close(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => close(false)} disabled={tx.isBusy}>
                  Cancel
                </Button>
                <Button onClick={handleRun} disabled={needsWallet || tx.isBusy}>
                  {tx.isBusy ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>
                      <Banknote className="size-3.5" />
                      {copy?.confirm}
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import * as React from "react";
import { Lock } from "lucide-react";
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
import { queryKeys } from "@/hooks/use-contract";
import { useTx } from "@/hooks/use-tx";
import { CONTRACT_ADDRESS } from "@/lib/config";
import type { Round } from "@/lib/types";

/**
 * Owner-only round controls.
 *
 * There is deliberately no refund action here: the owner has no path to
 * community money. Refunds are pull-based and pro-rata, handled per funder in
 * `RefundClaim`, so closing the round is the only lever the owner has over the
 * treasury.
 */
export function RoundControls({
  round,
  isOwner,
}: {
  round: Round;
  isOwner: boolean;
}) {
  const tx = useTx();
  const [open, setOpen] = React.useState(false);

  if (!isOwner || round.status !== "open") return null;

  const handleClose = async () => {
    if (tx.isBusy) return;
    await tx.run({
      label: "Closing the round",
      send: (client) =>
        client.writeContract({
          address: CONTRACT_ADDRESS,
          functionName: "close_round",
          args: [round.id],
          value: 0n,
        }),
      invalidate: [
        queryKeys.stats,
        queryKeys.rounds,
        queryKeys.round(round.id),
        queryKeys.roundProposals(round.id),
      ],
      successTitle: "Round closed",
      successDescription: `${round.id} no longer accepts new proposals or funds. Funders can claim refunds once every proposal has a decision.`,
    });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) tx.reset();
  };

  return (
    <>
      <Button variant="outline" size="lg" onClick={() => setOpen(true)}>
        <Lock className="size-3.5" />
        Close round
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close this round?</DialogTitle>
            <DialogDescription>
              Once closed, there are no new proposals, no new funding, and no rubric changes.
              Evaluation of proposals already submitted can still run.
            </DialogDescription>
          </DialogHeader>

          <p className="rounded-md border border-border bg-secondary/30 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            Closing does not move any money. Unallocated funds stay in the contract and can
            only be claimed back by the addresses that funded the round, pro rata.
          </p>

          {tx.state.phase !== "idle" && (
            <TxFeedback
              state={tx.state}
              onReset={tx.reset}
              successTitle="Round closed"
              successDescription={`${round.id} no longer accepts new proposals or funds.`}
            />
          )}

          <DialogFooter className="gap-2">
            {tx.isSuccess ? (
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={tx.isBusy}>
                  Cancel
                </Button>
                <Button onClick={() => void handleClose()} disabled={tx.isBusy}>
                  {tx.isBusy ? "Processing…" : "Close round"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

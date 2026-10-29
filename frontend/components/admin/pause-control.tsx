"use client";

import * as React from "react";
import { AlertTriangle, Pause, Play, ShieldCheck } from "lucide-react";
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
import { cn } from "cn";

export function PauseControl({ paused }: { paused: boolean }) {
  const tx = useTx();
  const [open, setOpen] = React.useState(false);
  const next = !paused;

  const handleToggle = async () => {
    if (tx.isBusy) return;
    await tx.run({
      label: next ? "Pausing the contract" : "Unpausing the contract",
      send: (client) =>
        client.writeContract({
          address: CONTRACT_ADDRESS,
          functionName: "set_paused",
          args: [next],
          value: 0n,
        }),
      invalidate: [queryKeys.stats, queryKeys.rounds],
      successTitle: next ? "Contract paused" : "Contract active again",
      successDescription: next
        ? "All new writes are rejected until the contract is unpaused. Funds stay safe in the contract."
        : "Proposals, funding, and evaluation can run again.",
    });
  };

  const close = (value: boolean) => {
    setOpen(value);
    if (!value) tx.reset();
  };

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border",
              paused
                ? "border-brass/30 bg-brass/10 text-brass"
                : "border-forest/25 bg-forest/[0.06] text-forest",
            )}
          >
            {paused ? <Pause className="size-4" /> : <ShieldCheck className="size-4" />}
          </span>
          <div>
            <p className="text-sm font-medium text-ink">
              {paused ? "Contract is paused" : "Contract operating normally"}
            </p>
            <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
              {paused
                ? "New proposals, funding, and evaluations are rejected. Approved payouts can still be sent and reconciled, so pausing never traps reserved funds."
                : "Pausing stops new proposals, funding, and evaluations without touching funds or state. Approved payouts stay claimable while paused."}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="lg"
          className="shrink-0"
          onClick={() => setOpen(true)}
          disabled={tx.isBusy}
        >
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          {paused ? "Unpause contract" : "Pause contract"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {next ? "Pause the entire contract?" : "Unpause the contract?"}
            </DialogTitle>
            <DialogDescription>
              {next
                ? "While paused, new proposals, funding, and evaluations stop. Approved payouts can still be sent and reconciled, so the treasury keeps a working exit."
                : "Once active, applicants and funders can transact again as usual."}
            </DialogDescription>
          </DialogHeader>

          {next && (
            <div className="flex items-start gap-2.5 rounded-md border border-brass/30 bg-brass/[0.05] px-3 py-2.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-brass" />
              <p className="text-[11px] leading-relaxed text-brass">
                This is not a tool for cancelling proposals. Use the pause only during a
                security incident or maintenance.
              </p>
            </div>
          )}

          {tx.state.phase !== "idle" && (
            <TxFeedback
              state={tx.state}
              onReset={tx.reset}
              successTitle={next ? "Contract paused" : "Contract active again"}
              successDescription={
                next
                  ? "All new writes are rejected until the contract is unpaused."
                  : "The contract accepts new transactions again."
              }
            />
          )}

          <DialogFooter className="gap-2">
            {tx.isSuccess ? (
              <Button onClick={() => close(false)}>Done</Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => close(false)}
                  disabled={tx.isBusy}
                >
                  Cancel
                </Button>
                <Button
                  variant={next ? "outline" : "default"}
                  onClick={() => void handleToggle()}
                  disabled={tx.isBusy}
                >
                  {tx.isBusy
                    ? "Processing…"
                    : next
                      ? "Yes, pause the contract"
                      : "Yes, unpause"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

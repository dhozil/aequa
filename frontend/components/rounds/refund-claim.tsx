"use client";

import * as React from "react";
import { CheckCircle2, HandCoins, Info, RefreshCw } from "lucide-react";
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
import { ConnectWalletButton } from "@/components/wallet/wallet-picker";
import { fetchRefund, queryKeys, useRefundQuote } from "@/hooks/use-contract";
import { useTx } from "@/hooks/use-tx";
import { useWallet } from "@/hooks/use-wallet";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { formatGenUnit } from "@/lib/format";
import type { Round } from "@/lib/types";

type Action = "claim" | "confirm" | "recover";

const FUNCTION_NAME: Record<Action, string> = {
  claim: "claim_refund",
  confirm: "confirm_refund",
  recover: "recover_refund",
};

function friendlyBlockedReason(reason: string): string {
  if (reason.includes("close the round first")) {
    return "The owner has not closed this round yet.";
  }
  if (reason.includes("evaluate every proposal")) {
    return "Every proposal must be evaluated before refunds open.";
  }
  if (reason.includes("awaiting reconciliation")) {
    return "A payout is still being reconciled. Confirm or recover it first.";
  }
  if (reason.includes("awaiting confirmation")) {
    return "Your refund is waiting for delivery confirmation. Confirm it below.";
  }
  if (reason.includes("nothing to refund")) {
    return "You have already claimed your full share.";
  }
  return reason;
}

/**
 * Pull-based refund claim for one funder.
 *
 * The contract pays each address its own pro-rata share of the unallocated
 * pool, so there is no owner sweep to guard against and no way for one funder
 * to take another's deposit. The buttons only ever send a function with no
 * amount parameter: the contract computes the amount from its ledger.
 *
 * A claim is not a payment. `claim_refund` emits a child transfer and records a
 * pending claim; the ledger only moves in `confirm_refund`, once the contract's
 * balance proves the money left. When the transfer bounces, the contract is
 * notified and releases the claim itself, so the funder can simply claim again;
 * `recover_refund` is the manual fallback after the grace period.
 */
export function RefundClaim({ round }: { round: Round }) {
  const { address } = useWallet();
  const quote = useRefundQuote(round.id, address);
  const tx = useTx();
  const [action, setAction] = React.useState<Action | null>(null);
  const [now, setNow] = React.useState(() => Math.floor(Date.now() / 1000));
  const pendingClaim =
    quote.data?.refundState === "sent" && (quote.data?.pendingAtto ?? 0n) > 0n;
  React.useEffect(() => {
    if (!pendingClaim) return;
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pendingClaim]);

  if (round.status !== "closed") return null;

  const pool = round.availableAtto;
  const data = quote.data;

  if (!address) {
    if (pool === 0n) return null;
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {formatGenUnit(pool, 4)} was not allocated. Only the addresses that funded this
            round can claim it back, pro rata — the owner cannot withdraw it.
          </span>
        </p>
        <ConnectWalletButton size="sm" variant="outline" />
      </div>
    );
  }

  if (!data) return null;

  if (data.depositAtto === 0n) {
    if (pool === 0n) return null;
    return (
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-card px-4 py-3">
        <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          This wallet did not fund {round.id}. The {formatGenUnit(pool, 4)} left over can only
          be claimed by the addresses that deposited it.
        </p>
      </div>
    );
  }

  const pending = data.refundState === "sent" && data.pendingAtto > 0n;
  // A bounced child transfer is reported by the contract itself, which puts the
  // claim back immediately - no grace period before the retry.
  const bounced = data.refundState === "owed";
  // A bouncing child transfer also debits its value for a moment, so delivery
  // is only trusted once the balance has stayed down for the settle window.
  const settleIn =
    pending && data.refundObservedAt > 0
      ? Math.max(0, data.refundConfirmAfter - now)
      : 0;
  const observed = pending && data.refundObservedAt > 0;
  const blocked = !pending && data.claimableAtto > 0n
    ? friendlyBlockedReason(data.blockedReason)
    : "";

  const open = (next: Action) => {
    tx.reset();
    setAction(next);
  };

  const close = (value: boolean) => {
    if (!value) {
      setAction(null);
      tx.reset();
    }
  };

  const handleRun = () => {
    if (!action || tx.isBusy || !address) return;
    const current = action;

    const invalidate = [
      queryKeys.stats,
      queryKeys.rounds,
      queryKeys.round(round.id),
      queryKeys.roundProposals(round.id),
      queryKeys.refund(round.id, address),
    ];

    void tx.run({
      label:
        current === "claim"
          ? "Claiming your refund"
          : current === "confirm"
            ? "Confirming the refund delivery"
            : "Recovering the refund",
      send: (client) =>
        client.writeContract({
          address: CONTRACT_ADDRESS,
          functionName: FUNCTION_NAME[current],
          args: [round.id],
          value: 0n,
        }),
      invalidate,
      successTitle:
        current === "claim"
          ? "Refund sent"
          : current === "confirm"
            ? "Refund confirmed"
            : "Refund recovered",
      successDescription:
        current === "claim"
          ? `${formatGenUnit(data.claimableAtto, 4)} is on its way. It is marked returned once the contract observes the delivery.`
          : current === "confirm"
            ? "Delivery was observed on-chain. The claim settles after the settle window."
            : "The claim was discarded. You can claim again.",
      // Finality is not the expected effect. Read the ledger back and only
      // report success when the state actually moved.
      verify: async () => {
        try {
          const after = await fetchRefund(round.id, address);
          if (current === "claim") {
            return (
              after.pendingAtto > 0n ||
              after.claimedAtto > data.claimedAtto ||
              // A transfer that bounced is reported by the contract at once: the
              // claim was recorded and released, so the tx still did its job.
              after.refundState === "owed"
            );
          }
          if (current === "confirm") {
            return (
              after.claimedAtto > data.claimedAtto ||
              after.refundObservedAt > data.refundObservedAt
            );
          }
          return after.refundState !== "sent";
        } catch {
          // A failed readback is inconclusive, not a failed transaction.
          return true;
        }
      },
    });
  };

  const amount = pending ? data.pendingAtto : data.claimableAtto;

  return (
    <>
      <div className="mt-4 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="label">Your refund</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              You funded {formatGenUnit(data.depositAtto, 4)} in {round.id}. Your pro-rata share
              of the unallocated pool is {formatGenUnit(data.entitledAtto, 4)}
              {data.claimedAtto > 0n
                ? `, and ${formatGenUnit(data.claimedAtto, 4)} has already been returned.`
                : "."}
            </p>
            {pending && (
              <p className="mt-1 text-[12px] leading-relaxed text-brass">
                {formatGenUnit(data.pendingAtto, 4)} was sent and is awaiting confirmation
                (attempt {data.refundAttempts}). It is not counted as returned until the
                contract observes the delivery.
                {settleIn > 0
                  ? ` Delivery observed — it settles in ${settleIn}s.`
                  : observed
                    ? " Delivery observed; confirm it now to settle the claim."
                    : ""}
              </p>
            )}
            {bounced && (
              <p className="mt-1 text-[12px] leading-relaxed text-brass">
                Attempt {data.refundAttempts} did not arrive: the transfer bounced and its
                value returned to the contract, so the claim is back. Claim again whenever
                you are ready.
              </p>
            )}
          </div>
          {pending ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="sm"
                onClick={() => open("confirm")}
                disabled={tx.isBusy || settleIn > 0}
                title={settleIn > 0 ? `Settles in ${settleIn}s` : undefined}
              >
                <CheckCircle2 className="size-3.5" />
                {settleIn > 0 ? `Confirm in ${settleIn}s` : "Confirm delivery"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => open("recover")}
                disabled={tx.isBusy}
              >
                <RefreshCw className="size-3.5" />
                Transfer failed?
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => open("claim")}
              disabled={!data.ready || data.claimableAtto === 0n || tx.isBusy}
              title={blocked || undefined}
            >
              <HandCoins className="size-3.5" />
              Claim {formatGenUnit(data.claimableAtto, 4)}
            </Button>
          )}
        </div>
        {blocked && (
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{blocked}</p>
        )}
      </div>

      <Dialog open={action !== null} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action === "confirm"
                ? "Confirm the refund?"
                : action === "recover"
                  ? "Recover the refund?"
                  : "Claim your refund?"}
            </DialogTitle>
            <DialogDescription>
              {action === "confirm"
                ? "This is permissionless and only records what the contract balance already shows. It succeeds once the transfer has actually left the contract."
                : action === "recover"
                  ? "A failed transfer is usually reported by the network and its claim is released automatically, so you can claim again. This manual recovery is the fallback for when no bounce report arrives; it is only allowed after the one-hour grace period, because until then a transfer still in flight and a bounced one look identical."
                  : `You are taking back ${formatGenUnit(data.claimableAtto, 4)}, your pro-rata share of the funds this round did not allocate. Money reserved for approved proposals stays in the contract.`}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                your deposit
              </span>
              <span className="font-mono text-xs tabular text-ink">
                {formatGenUnit(data.depositAtto, 4)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                {pending ? "awaiting confirmation" : "claiming now"}
              </span>
              <span className="font-mono text-xs tabular text-ink">
                {formatGenUnit(amount, 4)}
              </span>
            </div>
            {!pending && (
              <div className="mt-1.5 flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  unallocated after this
                </span>
                <span className="font-mono text-xs tabular text-ink">
                  {formatGenUnit(pool - data.claimableAtto, 4)}
                </span>
              </div>
            )}
          </div>

          {action === "confirm" && settleIn > 0 && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              The transfer is visible on the balance, but a failing transfer looks the same for
              a moment. Confirmation can settle in {settleIn}s.
            </p>
          )}

          {tx.state.phase !== "idle" && (
            <TxFeedback
              state={tx.state}
              onReset={tx.reset}
              successTitle={
                action === "confirm"
                  ? "Refund confirmed"
                  : action === "recover"
                    ? "Refund recovered"
                    : "Refund sent"
              }
              successDescription={
                action === "confirm"
                  ? "Delivery was observed on-chain. The claim settles after the settle window."
                  : action === "recover"
                    ? "The claim was discarded. You can claim again."
                    : `${formatGenUnit(data.claimableAtto, 4)} is on its way. It is marked returned once the contract observes the delivery.`
              }
              pendingHint={
                action === "confirm"
                  ? "Checking whether the transfer has been delivered."
                  : action === "recover"
                    ? "Reconciling the refund."
                    : "Sending the refund transfer. Usually 15–60 seconds."
              }
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
                <Button
                  onClick={handleRun}
                  disabled={tx.isBusy || (action === "confirm" && settleIn > 0)}
                >
                  {tx.isBusy
                    ? "Processing…"
                    : action === "confirm"
                      ? "Check and confirm"
                      : action === "recover"
                        ? "Recover refund"
                        : "Claim refund"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import * as React from "react";
import { ArrowDownToLine, Landmark, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TxFeedback } from "@/components/shared/tx-feedback";
import { WalletButton } from "@/components/wallet/wallet-button";
import { useGenBalance } from "@/hooks/use-contract";
import { queryKeys } from "@/hooks/use-contract";
import { useTx } from "@/hooks/use-tx";
import { useWallet } from "@/hooks/use-wallet";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { formatGen, formatGenUnit, parseGen, percent } from "@/lib/format";
import type { Round } from "@/lib/types";
import { cn } from "cn";

const QUICK_AMOUNTS = [1n, 5n, 10n, 25n];

export function FundRoundDialog({
  round,
  open,
  onOpenChange,
}: {
  round: Round;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { address } = useWallet();
  const balance = useGenBalance(address);
  const tx = useTx();
  const [amount, setAmount] = React.useState("5");

  const parsed = React.useMemo(() => parseGen(amount), [amount]);
  const amountError = React.useMemo(() => {
    if (!amount.trim()) return "Enter a funding amount.";
    if (parsed === null) return "Invalid amount format. Example: 2.5";
    if (parsed <= 0n) return "The amount must be greater than 0 GEN.";
    if (balance.data !== null && balance.data !== undefined && parsed > balance.data) {
      return "Your wallet balance is not enough for this amount.";
    }
    return null;
  }, [amount, parsed, balance.data]);

  const canSubmit = Boolean(address) && parsed !== null && parsed > 0n && !amountError;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      tx.reset();
      setAmount("5");
    }
    onOpenChange(next);
  };

  const handleFund = async () => {
    if (!canSubmit || tx.isBusy) return;
    const value = parsed as bigint;
    await tx.run({
      label: "Funding the round",
      send: (client) =>
        client.writeContract({
          address: CONTRACT_ADDRESS,
          functionName: "fund_round",
          args: [round.id],
          value,
        }),
      invalidate: [
        queryKeys.stats,
        queryKeys.rounds,
        queryKeys.round(round.id),
      ],
      successTitle: "Funding recorded",
      successDescription: `${formatGenUnit(value, 4)} went into the treasury of ${round.id}. The round balance and total funded have been updated.`,
    });
  };

  const progress = percent(round.fundedAtto, round.budgetAtto);
  const projected = (round.fundedAtto ?? 0n) + (parsed && parsed > 0n ? parsed : 0n);
  const projectedProgress = percent(projected, round.budgetAtto);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fund round</DialogTitle>
          <DialogDescription>
            Funds go into the contract treasury and only leave through approved proposals
            or a funder&apos;s own pro-rata refund once the round is closed. The owner can
            never withdraw them.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-secondary/30 p-4">
          <p className="label">Round</p>
          <p className="mt-1 line-clamp-2 text-sm text-ink">{round.title}</p>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              funded {formatGen(round.fundedAtto, 2)} / {formatGen(round.budgetAtto, 2)} GEN
            </span>
            <span className="font-mono text-[9px] tabular text-muted-foreground">
              {progress}%
            </span>
          </div>
          <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-forest transition-[width] duration-300"
              style={{ width: `${Math.max(progress, projectedProgress)}%` }}
            />
          </div>
        </div>

        {!address ? (
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <Wallet className="size-4 text-forest" />
              Connect your wallet first
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Funding is an on-chain transaction. The wallet is only used to sign;
              your private key is never sent to a server.
            </p>
            <WalletButton fullWidth />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="fund-amount">Amount</Label>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  balance {balance.data != null ? formatGenUnit(balance.data, 3) : "—"}
                </span>
              </div>
              <div className="relative mt-1.5">
                <Input
                  id="fund-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className={cn(
                    "h-12 pr-14 font-mono text-lg tabular",
                    amountError && amount !== "" && "border-rust/50 focus-visible:border-rust",
                  )}
                  placeholder="5"
                  disabled={tx.isBusy || tx.isSuccess}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  GEN
                </span>
              </div>
              {amountError && amount !== "" && !tx.isSuccess && (
                <p className="mt-1.5 text-[11px] text-rust">{amountError}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_AMOUNTS.map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setAmount(String(value))}
                    disabled={tx.isBusy || tx.isSuccess}
                    className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-forest/30 hover:text-ink disabled:opacity-50"
                  >
                    {String(value)} GEN
                  </button>
                ))}
              </div>
            </div>

            {projected > round.budgetAtto && (
              <p className="rounded-md border border-brass/30 bg-brass/[0.05] px-3 py-2 text-[11px] leading-relaxed text-brass">
                This funding exceeds the planned budget. The contract still accepts
                it, but only funds up to the budget limit can be allocated to
                proposals.
              </p>
            )}
          </div>
        )}

        {tx.state.phase !== "idle" && (
          <TxFeedback
            state={tx.state}
            onReset={tx.reset}
            successTitle="Funding successful"
            successDescription={`${formatGenUnit(parsed ?? 0n, 4)} went into the treasury of ${round.id}.`}
            pendingHint="Waiting for the funding to confirm. This usually takes 15–60 seconds."
          />
        )}

        <DialogFooter className="gap-2">
          {tx.isSuccess ? (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={tx.isBusy}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleFund()}
                disabled={!canSubmit || tx.isBusy}
              >
                {tx.isBusy ? (
                  "Processing…"
                ) : (
                  <>
                    <ArrowDownToLine className="size-3.5" />
                    Fund {parsed && parsed > 0n ? formatGenUnit(parsed, 3) : "round"}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>

        <p className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
          <Landmark className="size-3" />
          funds are locked in the contract · not a transfer to the owner
        </p>
      </DialogContent>
    </Dialog>
  );
}

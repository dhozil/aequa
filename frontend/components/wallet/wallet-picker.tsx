"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWallet } from "@/hooks/use-wallet";
import { CHAIN_ID, MARKETING } from "@/lib/config";

export function WalletIcon({ icon, className = "size-8" }: { icon: string; className?: string }) {
  if (!icon) {
    return (
      <span className={`grid ${className} place-items-center rounded-md border border-border bg-muted`}>
        <Wallet className="size-4 text-muted-foreground" />
      </span>
    );
  }
  // A data: URL announced by the wallet itself through EIP-6963.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={icon} alt="" className={`${className} rounded-md`} />
  );
}

/**
 * The single place a visitor picks which EVM wallet signs. Wallets announce
 * themselves through EIP-6963, so MetaMask, Rabby and others are listed side by
 * side instead of overwriting each other on `window.ethereum`.
 */
export function WalletPickerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { wallets, status, error, connect, clearError } = useWallet();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const hasProvider = wallets.length > 0;

  const handleConnect = async (walletId: string) => {
    setPendingId(walletId);
    const ok = await connect(walletId);
    setPendingId(null);
    if (ok) {
      onOpenChange(false);
      toast.success("Wallet connected");
    } else {
      toast.error("Failed to connect wallet", {
        description: "Open the wallet, finish any pending request, then try again.",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) clearError();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{hasProvider ? "Choose a wallet" : "Wallet not detected"}</DialogTitle>
          <DialogDescription>
            {hasProvider
              ? "Each wallet is asked separately, so MetaMask and Rabby never compete. Every transaction is signed by the wallet you pick here."
              : "Aequa Grants uses a browser EVM wallet to sign transactions. No private key is ever sent to a server."}
          </DialogDescription>
        </DialogHeader>

        {hasProvider ? (
          <ul className="space-y-2">
            {wallets.map((wallet) => {
              const busy = pendingId === wallet.id;
              const disabled = pendingId !== null || status === "connecting";
              return (
                <li key={wallet.id}>
                  <button
                    type="button"
                    onClick={() => void handleConnect(wallet.id)}
                    disabled={disabled}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-foreground/30 hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <WalletIcon icon={wallet.icon} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {wallet.name}
                      </span>
                      <span className="block truncate font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {wallet.legacy ? "Injected provider" : wallet.id}
                      </span>
                    </span>
                    {busy ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Connect
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>1. Install MetaMask, Rabby, or another EVM wallet that supports custom networks.</p>
            <p>
              2. Reload this page, then connect your wallet and add the GenLayer Studio network
              (chain {CHAIN_ID}).
            </p>
            <p>
              3. Need GEN to fund a round? Get some from the Studionet faucet on the GenLayer
              dashboard.
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-md border border-rust/25 bg-rust/[0.05] px-3 py-2 text-xs text-rust">
            {error.message}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" asChild>
            <Link href={MARKETING.studio} target="_blank" rel="noreferrer">
              Open GenLayer Studio <ExternalLink className="size-3.5" />
            </Link>
          </Button>
          {hasProvider ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          ) : (
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="size-3.5" /> Reload
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Connect button that always opens the wallet picker. */
export function ConnectWalletButton({
  label = "Connect wallet",
  className,
  size = "default",
  variant = "default",
}: {
  label?: string;
  className?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline";
}) {
  const { status, clearError } = useWallet();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        disabled={status === "connecting"}
        onClick={() => {
          clearError();
          setOpen(true);
        }}
      >
        <Wallet className="size-3.5" />
        {status === "connecting" ? "Connecting…" : label}
      </Button>
      <WalletPickerDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

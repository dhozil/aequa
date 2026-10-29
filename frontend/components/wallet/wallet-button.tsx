"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  ExternalLink,
  LogOut,
  Wallet,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWallet } from "@/hooks/use-wallet";
import { shortAddress } from "@/lib/format";
import { CHAIN_ID, MARKETING } from "@/lib/config";
import { explorerAddress } from "@/lib/genlayer";

export function WalletButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const {
    address,
    chainId,
    hasProvider,
    ready,
    status,
    error,
    isWrongNetwork,
    connect,
    disconnect,
    switchNetwork,
    clearError,
  } = useWallet();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);

  const handleConnect = async () => {
    const ok = await connect();
    if (ok) {
      setDialogOpen(false);
      toast.success("Wallet connected");
    } else {
      toast.error("Failed to connect wallet", {
        description:
          "Open your wallet, finish any pending request, then try again.",
      });
    }
  };

  const handleSwitch = async () => {
    setSwitching(true);
    const ok = await switchNetwork();
    setSwitching(false);
    if (ok) toast.success("Network switched to GenLayer Studio");
  };

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Address copied");
    } catch {
      toast.error("Could not copy the address");
    }
  };

  if (!ready) {
    return (
      <div
        className={`h-9 animate-pulse rounded-md bg-muted ${fullWidth ? "w-full" : "w-32"}`}
        aria-hidden="true"
      />
    );
  }

  if (!address) {
    return (
      <>
        <Button
          size="lg"
          className={fullWidth ? "w-full" : undefined}
          onClick={() => {
            if (hasProvider) {
              void handleConnect();
            } else {
              clearError();
              setDialogOpen(true);
            }
          }}
          disabled={status === "connecting"}
        >
          <Wallet className="size-3.5" />
          {status === "connecting" ? "Connecting…" : "Connect wallet"}
        </Button>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Wallet not detected</DialogTitle>
              <DialogDescription>
                Aequa Grants uses a browser EVM wallet to sign transactions. No private
                key is ever sent to a server.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>1. Install MetaMask or another EVM wallet that supports custom networks.</p>
              <p>
                2. Reload this page, then connect your wallet and add the GenLayer Studio
                network (chain {CHAIN_ID}).
              </p>
              <p>
                3. Need GEN to fund a round? Get some from the Studionet faucet on the
                GenLayer dashboard.
              </p>
            </div>

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
              <Button onClick={() => window.location.reload()}>Reload</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (isWrongNetwork) {
    return (
      <Button
        variant="outline"
        size="lg"
        onClick={() => void handleSwitch()}
        disabled={switching}
        className={`border-brass/40 bg-brass/10 text-brass hover:bg-brass/15 hover:text-brass ${fullWidth ? "w-full" : ""}`}
      >
        <AlertTriangle className="size-3.5" />
        {switching ? "Switching network…" : "Wrong network"}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="lg" className={fullWidth ? "w-full justify-between" : undefined}>
          <span className="inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-forest" />
            <span className="font-mono text-xs">{shortAddress(address)}</span>
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="label">Wallet connected</span>
          <span className="break-all font-mono text-[11px] font-normal text-foreground/80">
            {address}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void copyAddress()}>
          <Copy className="size-3.5" /> Copy address
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={explorerAddress(address)} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" /> View in explorer
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={disconnect}>
          <LogOut className="size-3.5" /> Disconnect session
        </DropdownMenuItem>
        <div className="px-2 py-1.5">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            Chain {chainId ?? CHAIN_ID} · GenLayer Studio
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

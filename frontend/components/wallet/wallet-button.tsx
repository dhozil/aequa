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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWallet } from "@/hooks/use-wallet";
import { shortAddress } from "@/lib/format";
import { CHAIN_ID } from "@/lib/config";
import { explorerAddress } from "@/lib/genlayer";
import { WalletPickerDialog } from "@/components/wallet/wallet-picker";

export function WalletButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const {
    address,
    chainId,
    provider,
    wallets,
    walletName,
    ready,
    status,
    isWrongNetwork,
    disconnect,
    switchNetwork,
    clearError,
  } = useWallet();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);

  const openPicker = () => {
    clearError();
    setPickerOpen(true);
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

  const picker = <WalletPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />;

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
          onClick={openPicker}
          disabled={status === "connecting"}
        >
          <Wallet className="size-3.5" />
          {status === "connecting" ? "Connecting…" : "Connect wallet"}
        </Button>
        {picker}
      </>
    );
  }

  if (isWrongNetwork) {
    return (
      <>
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
        {picker}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="lg"
            className={fullWidth ? "w-full justify-between" : undefined}
          >
            <span className="inline-flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-forest" />
              <span className="font-mono text-xs">{shortAddress(address)}</span>
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex flex-col gap-1">
            <span className="label">
              {walletName ? `${walletName} connected` : "Wallet connected"}
            </span>
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
          {wallets.length > 1 && (
            <DropdownMenuItem onClick={openPicker}>
              <Wallet className="size-3.5" /> Change wallet
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={disconnect}>
            <LogOut className="size-3.5" /> Disconnect session
          </DropdownMenuItem>
          <div className="px-2 py-1.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              {provider ? "Signing via selected wallet" : "Wallet unavailable"}
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              Chain {chainId ?? CHAIN_ID} · GenLayer Studio
            </p>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {picker}
    </>
  );
}

"use client";

import * as React from "react";
import { CHAIN_ID, CHAIN_ID_HEX, WALLET_CHAIN_PARAMS } from "@/lib/config";
import { toUiError, type UiError } from "@/lib/errors";
import { useWalletDiscovery } from "@/hooks/use-wallet-discovery";
import {
  readStoredWalletId,
  storeWalletId,
  type Eip1193Provider,
  type WalletOption,
} from "@/lib/wallets";

type WalletStatus = "idle" | "connecting";

type WalletContextValue = {
  address: string | null;
  chainId: number | null;
  /** Provider of the wallet the visitor picked; never a shared global. */
  provider: Eip1193Provider | null;
  /** Every EVM wallet this browser exposes, for the picker. */
  wallets: WalletOption[];
  /** Name of the selected wallet, e.g. "MetaMask" or "Rabby". */
  walletName: string | null;
  hasProvider: boolean;
  ready: boolean;
  status: WalletStatus;
  error: UiError | null;
  isWrongNetwork: boolean;
  /** Opens the chosen wallet's approval prompt. Pass an id to switch wallets. */
  connect: (walletId?: string) => Promise<boolean>;
  disconnect: () => void;
  switchNetwork: () => Promise<boolean>;
  ensureStudioNet: () => Promise<void>;
  clearError: () => void;
};

const WalletContext = React.createContext<WalletContextValue | null>(null);

function parseChainId(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, value.startsWith("0x") ? 16 : 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "number") return value;
  return null;
}

function firstAccount(value: unknown): string | null {
  const list = Array.isArray(value) ? (value as unknown[]) : [];
  const first = list[0];
  return typeof first === "string" && first ? first : null;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { wallets, settled: discoverySettled } = useWalletDiscovery();
  // The last wallet this origin used; read during hydration so a returning
  // visitor only has to approve, not choose again.
  const [selectedId, setSelectedId] = React.useState<string | null>(() => readStoredWalletId());
  const [address, setAddress] = React.useState<string | null>(null);
  const [chainId, setChainId] = React.useState<number | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const [status, setStatus] = React.useState<WalletStatus>("idle");
  const [error, setError] = React.useState<UiError | null>(null);

  const selected = React.useMemo<WalletOption | null>(() => {
    if (wallets.length === 0) return null;
    if (selectedId) {
      const match = wallets.find((wallet) => wallet.id === selectedId);
      if (match) return match;
    }
    return null;
  }, [wallets, selectedId]);
  const provider = selected?.provider ?? null;

  // Switching wallets drops the previous session during render, before any
  // transaction could read a stale address from the old wallet.
  const [trackedProvider, setTrackedProvider] = React.useState<Eip1193Provider | null>(null);
  if (trackedProvider !== provider) {
    setTrackedProvider(provider);
    setAddress(null);
    setChainId(null);
    setError(null);
    setHydrated(provider === null);
  }

  // Ready once discovery settled and, if a wallet is selected, its account
  // state has been read. Without a selected wallet there is nothing to read.
  const ready = discoverySettled && (provider === null || hydrated);

  React.useEffect(() => {
    if (!provider) return;
    let cancelled = false;

    void (async () => {
      try {
        const [accounts, currentChain] = await Promise.all([
          provider.request({ method: "eth_accounts" }),
          provider.request({ method: "eth_chainId" }),
        ]);
        if (cancelled) return;
        setAddress(firstAccount(accounts));
        setChainId(parseChainId(currentChain));
      } catch {
        // A locked or busy wallet must not break the page.
        if (!cancelled) setAddress(null);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [provider]);

  React.useEffect(() => {
    if (!provider) return;

    const onAccounts = (...args: never[]) => {
      setAddress(firstAccount(args[0]));
      setError(null);
    };
    const onChain = (...args: never[]) => {
      setChainId(parseChainId(args[0]));
    };

    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [provider]);

  const connect = React.useCallback(
    async (walletId?: string) => {
      const target = walletId
        ? (wallets.find((wallet) => wallet.id === walletId) ?? null)
        : selected;

      if (!target) {
        setError({
          kind: "wallet",
          title: "No EVM wallet found",
          message:
            "This browser does not expose an EVM wallet. Install MetaMask, Rabby, or another EIP-1193 wallet to sign transactions.",
          hint: "Once installed, reload this page and pick the wallet.",
          retryable: false,
        });
        return false;
      }

      const switching = target.id !== selectedId;
      if (switching) {
        // Never let a stale session sign with the previous wallet.
        setAddress(null);
        setChainId(null);
      }
      setSelectedId(target.id);
      storeWalletId(target.id);
      setStatus("connecting");
      setError(null);

      try {
        const accounts = await target.provider.request({ method: "eth_requestAccounts" });
        const account = firstAccount(accounts);
        if (!account) throw new Error("The wallet did not return an address.");
        setAddress(account);
        const currentChain = await target.provider.request({ method: "eth_chainId" });
        setChainId(parseChainId(currentChain));
        return true;
      } catch (cause) {
        setError(toUiError(cause, "Failed to connect wallet"));
        return false;
      } finally {
        setStatus("idle");
      }
    },
    [wallets, selected, selectedId],
  );

  const disconnect = React.useCallback(() => {
    // The extension keeps its own authorisation; this only ends the app session.
    setAddress(null);
    setError(null);
  }, []);

  const switchNetwork = React.useCallback(async () => {
    if (!provider) {
      setError({
        kind: "wallet",
        title: "Connect a wallet first",
        message: "Choose a wallet before switching networks.",
        retryable: false,
      });
      return false;
    }
    setError(null);
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } catch (cause) {
      const code =
        cause && typeof cause === "object" && "code" in cause
          ? (cause as { code?: number }).code
          : undefined;
      if (code === 4902) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [WALLET_CHAIN_PARAMS],
          });
        } catch (addCause) {
          setError(toUiError(addCause, "Failed to add network"));
          return false;
        }
      } else {
        setError(toUiError(cause, "Failed to switch network"));
        return false;
      }
    }
    try {
      const currentChain = await provider.request({ method: "eth_chainId" });
      const parsed = parseChainId(currentChain);
      setChainId(parsed);
      return parsed === CHAIN_ID;
    } catch {
      return false;
    }
  }, [provider]);

  const ensureStudioNet = React.useCallback(async () => {
    if (chainId === CHAIN_ID) return;
    const switched = await switchNetwork();
    if (!switched) {
      throw new Error(
        "Wrong chain: the wallet must be on the GenLayer Studio network (chain 61999).",
      );
    }
  }, [chainId, switchNetwork]);

  const value = React.useMemo<WalletContextValue>(
    () => ({
      address,
      chainId,
      provider,
      wallets,
      walletName: selected?.name ?? null,
      hasProvider: wallets.length > 0,
      ready,
      status,
      error,
      isWrongNetwork: Boolean(address) && chainId !== CHAIN_ID,
      connect,
      disconnect,
      switchNetwork,
      ensureStudioNet,
      clearError: () => setError(null),
    }),
    [
      address,
      chainId,
      provider,
      wallets,
      selected,
      ready,
      status,
      error,
      connect,
      disconnect,
      switchNetwork,
      ensureStudioNet,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = React.useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}

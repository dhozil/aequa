"use client";

import * as React from "react";
import { CHAIN_ID, CHAIN_ID_HEX, WALLET_CHAIN_PARAMS } from "@/lib/config";
import { toUiError, type UiError } from "@/lib/errors";

type WalletStatus = "idle" | "connecting";

type WalletContextValue = {
  address: string | null;
  chainId: number | null;
  hasProvider: boolean;
  ready: boolean;
  status: WalletStatus;
  error: UiError | null;
  isWrongNetwork: boolean;
  connect: () => Promise<boolean>;
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

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = React.useState<string | null>(null);
  const [chainId, setChainId] = React.useState<number | null>(null);
  const [hasProvider, setHasProvider] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [status, setStatus] = React.useState<WalletStatus>("idle");
  const [error, setError] = React.useState<UiError | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const provider = typeof window !== "undefined" ? window.ethereum : undefined;

    const hydrate = async () => {
      if (!provider) {
        setReady(true);
        return;
      }
      setHasProvider(true);

      try {
        const [accounts, currentChain] = await Promise.all([
          provider.request({ method: "eth_accounts" }),
          provider.request({ method: "eth_chainId" }),
        ]);
        if (cancelled) return;
        const list = Array.isArray(accounts) ? (accounts as string[]) : [];
        setAddress(list[0] ?? null);
        setChainId(parseChainId(currentChain));
      } catch {
        // A locked wallet must not break the page; the user can connect manually.
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    const timer = window.setTimeout(() => {
      void hydrate();
    }, 0);

    const onAccounts = (...args: never[]) => {
      const accounts = args[0] as unknown;
      const list = Array.isArray(accounts) ? (accounts as string[]) : [];
      setAddress(list[0] ?? null);
      setError(null);
    };
    const onChain = (...args: never[]) => {
      setChainId(parseChainId(args[0]));
    };

    provider?.on?.("accountsChanged", onAccounts);
    provider?.on?.("chainChanged", onChain);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      provider?.removeListener?.("accountsChanged", onAccounts);
      provider?.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = React.useCallback(async () => {
    const provider = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!provider) {
      setError({
        kind: "wallet",
        title: "Wallet not available",
        message: "Install an EVM wallet such as MetaMask to send transactions.",
        hint: "Once installed, reload this page.",
        retryable: false,
      });
      return false;
    }
    setStatus("connecting");
    setError(null);
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const list = Array.isArray(accounts) ? (accounts as string[]) : [];
      if (!list[0]) throw new Error("The wallet did not return an address.");
      setAddress(list[0]);
      const currentChain = await provider.request({ method: "eth_chainId" });
      setChainId(parseChainId(currentChain));
      return true;
    } catch (cause) {
      setError(toUiError(cause, "Failed to connect wallet"));
      return false;
    } finally {
      setStatus("idle");
    }
  }, []);

  const disconnect = React.useCallback(() => {
    setAddress(null);
    setError(null);
  }, []);

  const switchNetwork = React.useCallback(async () => {
    const provider = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!provider) return false;
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
  }, []);

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
      hasProvider,
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
      hasProvider,
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

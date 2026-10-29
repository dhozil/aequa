"use client";

import * as React from "react";
import {
  legacyWalletOption,
  toWalletOption,
  type Eip1193Provider,
  type Eip6963ProviderDetail,
  type WalletOption,
} from "@/lib/wallets";

type InjectedWindow = Window & { ethereum?: Eip1193Provider };

const ANNOUNCE_EVENT = "eip6963:announceProvider";
const REQUEST_EVENT = "eip6963:requestProvider";
/** Wallets that ignore EIP-6963 announce slightly after their script loads. */
const LEGACY_FALLBACK_MS = 400;

/**
 * Collects every installed EVM wallet without touching `window.ethereum`
 * unless no wallet speaks EIP-6963.
 */
export function useWalletDiscovery(): { wallets: WalletOption[]; settled: boolean } {
  const [wallets, setWallets] = React.useState<WalletOption[]>([]);
  // True once wallets had their chance to announce, so the UI can stop
  // showing a skeleton even when nothing is installed.
  const [settled, setSettled] = React.useState(false);

  React.useEffect(() => {
    const found = new Map<string, WalletOption>();
    const publish = () => {
      setWallets((current) => {
        const next = Array.from(found.values());
        if (
          current.length === next.length &&
          current.every((item, index) => item.id === next[index]?.id)
        ) {
          return current;
        }
        return next;
      });
    };

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      const option = toWalletOption(detail);
      if (!option) return;
      // A wallet may announce more than once; the first provider wins.
      if (found.has(option.id)) return;
      found.set(option.id, option);
      publish();
      setSettled(true);
    };

    window.addEventListener(ANNOUNCE_EVENT, onAnnounce as EventListener);
    window.dispatchEvent(new Event(REQUEST_EVENT));

    const timer = window.setTimeout(() => {
      const injected = (window as InjectedWindow).ethereum;
      if (found.size === 0 && injected && typeof injected.request === "function") {
        const option = legacyWalletOption(injected);
        found.set(option.id, option);
        publish();
      }
      setSettled(true);
    }, LEGACY_FALLBACK_MS);

    return () => {
      window.removeEventListener(ANNOUNCE_EVENT, onAnnounce as EventListener);
      window.clearTimeout(timer);
    };
  }, []);

  return { wallets, settled };
}

/**
 * EIP-6963 wallet discovery.
 *
 * Several injected wallets used to fight over `window.ethereum`, so whichever
 * extension loaded last won and the others were unreachable. EIP-6963 lets each
 * wallet announce its own provider on its own channel; we collect the
 * announcements and let the visitor pick one. From then on every RPC call and
 * every transaction goes through that provider only.
 */

export type Eip1193Request = {
  method: string;
  params?: unknown[] | object;
};

export type Eip1193Provider = {
  request: (args: Eip1193Request) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
};

export type Eip6963ProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

export type Eip6963ProviderDetail = {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
};

export type WalletOption = {
  /** Stable key: rdns when the wallet provides one, otherwise its uuid. */
  id: string;
  name: string;
  /** data:image/svg+xml;base64,… announced by the wallet, or "" for legacy. */
  icon: string;
  provider: Eip1193Provider;
  /** True for a wallet found only through `window.ethereum`. */
  legacy: boolean;
};

export const WALLET_STORAGE_KEY = "aequa.wallet.id";

function safeIcon(icon: unknown): string {
  // Only inline images are rendered; a wallet cannot inject a remote URL or a
  // javascript: payload into an <img src>.
  return typeof icon === "string" && icon.startsWith("data:image/") ? icon : "";
}

export function toWalletOption(detail: Eip6963ProviderDetail): WalletOption | null {
  const info = detail?.info;
  const provider = detail?.provider;
  if (!info || !provider || typeof provider.request !== "function") return null;
  const rdns = typeof info.rdns === "string" ? info.rdns : "";
  const uuid = typeof info.uuid === "string" ? info.uuid : "";
  const id = rdns || uuid;
  if (!id) return null;
  return {
    id,
    name: typeof info.name === "string" && info.name.trim() ? info.name.trim() : id,
    icon: safeIcon(info.icon),
    provider,
    legacy: false,
  };
}

export function legacyWalletOption(provider: Eip1193Provider): WalletOption {
  const name = provider.isRabby
    ? "Rabby"
    : provider.isMetaMask
      ? "MetaMask"
      : provider.isCoinbaseWallet
        ? "Coinbase Wallet"
        : "Browser wallet";
  return { id: "injected", name, icon: "", provider, legacy: true };
}

export function readStoredWalletId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(WALLET_STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function storeWalletId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(WALLET_STORAGE_KEY, id);
    else window.localStorage.removeItem(WALLET_STORAGE_KEY);
  } catch {
    // Private mode or a blocked storage partition: the session still works.
  }
}

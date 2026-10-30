export const APP_NAME = "Aequa Grants";
export const APP_TAGLINE = "Grants by open criteria";

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_AEQUA_ADDRESS ??
  "0xBcbB12be1D8A9ccf8eDaD5F883668ecbb8B5A75e") as `0x${string}`;

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://studio.genlayer.com/api";

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://genlayer-explorer.vercel.app";

export const CHAIN_ID = 61999;
export const CHAIN_ID_HEX = "0xF22F";

export const WALLET_CHAIN_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: "GenLayer Studio",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: [RPC_URL],
  blockExplorerUrls: [EXPLORER_URL],
} as const;

export const GEN_DECIMALS = 18;

export const MARKETING = {
  github: "https://github.com/genlayerlabs",
  docs: "https://docs.genlayer.com",
  studio: "https://studio.genlayer.com",
} as const;

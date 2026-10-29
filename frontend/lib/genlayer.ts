import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { CONTRACT_ADDRESS, RPC_URL } from "./config";

/**
 * Read-only client. No wallet required, so every page can render state even
 * before a visitor connects anything.
 */
export const readClient = createClient({ chain: studionet, endpoint: RPC_URL });

/**
 * Write client. The injected wallet signs; the SDK routes the transaction
 * through the provider, so no private key ever touches the browser bundle.
 */
export function writeClient(address: string) {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask is not installed.");
  }
  return createClient({
    chain: studionet,
    endpoint: RPC_URL,
    account: address as `0x${string}`,
    provider: window.ethereum,
  });
}

type ReadArgs = {
  functionName: string;
  args?: unknown[];
};

export async function read<T>({ functionName, args = [] }: ReadArgs): Promise<T> {
  const result = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args: args as never[],
  });
  return result as T;
}

export function explorerAddress(address: string): string {
  return `${process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://genlayer-explorer.vercel.app"}/address/${address}`;
}

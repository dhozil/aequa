import { TxTimeoutError } from "./errors";

/**
 * Polling a transaction to finality.
 *
 * The SDK's own `waitForTransactionReceipt` aborts the whole wait when a single
 * poll fails, so a rate-limited or dropped request is reported as "never
 * finalized" even though the transaction had already finalized. This loop keeps
 * polling through transient failures and only reports a timeout when the
 * deadline really passed.
 */

export const STATUS_NAMES: Record<string, string> = {
  "0": "UNINITIALIZED",
  "1": "PENDING",
  "2": "PROPOSING",
  "3": "COMMITTING",
  "4": "REVEALING",
  "5": "ACCEPTED",
  "6": "UNDETERMINED",
  "7": "FINALIZED",
  "8": "CANCELED",
  "9": "APPEAL_REVEALING",
  "10": "APPEAL_COMMITTING",
  "11": "READY_TO_FINALIZE",
  "12": "VALIDATORS_TIMEOUT",
  "13": "LEADER_TIMEOUT",
};

/** Statuses where consensus has decided, so waiting longer cannot change it. */
export const SETTLED_STATUSES = new Set([
  "FINALIZED",
  "UNDETERMINED",
  "CANCELED",
  "VALIDATORS_TIMEOUT",
  "LEADER_TIMEOUT",
]);

export type TxReceiptLike = {
  status?: unknown;
  status_name?: unknown;
  statusName?: unknown;
  [key: string]: unknown;
};

export function statusNameOf(receipt: TxReceiptLike): string {
  const raw = receipt.status ?? receipt.status_name ?? receipt.statusName;
  if (raw === undefined || raw === null) return "";
  const text = String(raw);
  return STATUS_NAMES[text] ?? text;
}

export function isSettled(receipt: TxReceiptLike): boolean {
  return SETTLED_STATUSES.has(statusNameOf(receipt));
}

export type WaitArgs = {
  hash: string;
  /** One status read. Throwing means "this poll failed", not "tx failed". */
  getTransaction: (hash: string) => Promise<TxReceiptLike>;
  intervalMs: number;
  timeoutMs: number;
  /** Injectable so tests do not wait in real time. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Called after every poll, so the UI can show what the chain reports. */
  onPoll?: (status: string) => void;
};

export async function waitForFinalized<T extends TxReceiptLike>({
  hash,
  getTransaction,
  intervalMs,
  timeoutMs,
  now = Date.now,
  sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  onPoll,
}: WaitArgs): Promise<T> {
  const deadline = now() + timeoutMs;
  let lastError: unknown = null;

  for (;;) {
    try {
      const receipt = (await getTransaction(hash)) as T;
      const status = statusNameOf(receipt);
      onPoll?.(status);
      if (SETTLED_STATUSES.has(status)) return receipt;
      lastError = null;
    } catch (cause) {
      lastError = cause;
    }

    if (now() >= deadline) {
      throw new TxTimeoutError(
        lastError
          ? "The transaction status could not be read within the time limit."
          : "The transaction did not finalize within the time limit.",
        hash,
      );
    }
    await sleep(intervalMs);
  }
}

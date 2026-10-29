"use client";

import * as React from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Hash } from "genlayer-js/types";
import { readClient, writeClient } from "@/lib/genlayer";
import {
  ConsensusError,
  TxExecutionError,
  WalletNotConnectedError,
  toUiError,
  type UiError,
} from "@/lib/errors";
import { useWallet } from "@/hooks/use-wallet";
import { statusNameOf, waitForFinalized } from "@/lib/tx-wait";

export type TxPhase = "idle" | "signing" | "pending" | "success" | "error";

export type TxState = {
  phase: TxPhase;
  label?: string;
  hash?: string;
  error?: UiError;
  startedAt?: number;
};

type Receipt = {
  resultName?: string;
  result_name?: string;
  statusName?: string;
  txExecutionResultName?: string;
  tx_execution_result_name?: string;
  [key: string]: unknown;
};

const SUCCESS_RESULTS = new Set(["AGREE", "MAJORITY_AGREE"]);
const SUCCESS_EXECUTION = "FINISHED_WITH_RETURN";
const CONSENSUS_RESULTS = new Set([
  "DISAGREE",
  "MAJORITY_DISAGREE",
  "NO_MAJORITY",
  "TIMEOUT",
  "UNDETERMINED",
  "VALIDATORS_TIMEOUT",
  "LEADER_TIMEOUT",
]);

const RESULT_NAMES: Record<string, string> = {
  "0": "IDLE",
  "1": "AGREE",
  "2": "DISAGREE",
  "3": "TIMEOUT",
  "4": "DETERMINISTIC_VIOLATION",
  "5": "NO_MAJORITY",
  "6": "MAJORITY_AGREE",
  "7": "MAJORITY_DISAGREE",
};

const EXECUTION_NAMES: Record<string, string> = {
  "0": "NOT_VOTED",
  "1": "FINISHED_WITH_RETURN",
  "2": "FINISHED_WITH_ERROR",
};

function named(value: unknown, table: Record<string, string>): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return table[text] ?? text;
}



function findContractError(value: unknown, depth = 0): string | null {
  if (value == null || depth > 5) return null;
  if (typeof value === "string") {
    return /\[(EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\]/.test(value) ? value : null;
  }
  if (typeof value !== "object") return null;
  let best: string | null = null;
  for (const item of Object.values(value as Record<string, unknown>)) {
    const found = findContractError(item, depth + 1);
    if (found && (!best || found.length > best.length)) best = found;
  }
  return best;
}

function assertReceipt(receipt: Receipt, hash: string): void {
  const status = statusNameOf(receipt);
  const resultName = named(
    receipt.resultName ?? receipt.result_name ?? receipt.result,
    RESULT_NAMES,
  );
  const execution = named(
    receipt.txExecutionResultName ??
      receipt.tx_execution_result_name ??
      receipt.txExecutionResult ??
      receipt.tx_execution_result,
    EXECUTION_NAMES,
  );

  if (
    status === "UNDETERMINED" ||
    status === "CANCELED" ||
    status === "VALIDATORS_TIMEOUT" ||
    CONSENSUS_RESULTS.has(resultName)
  ) {
    throw new ConsensusError(
      "Validators did not reach the same decision.",
      resultName || status,
      hash,
    );
  }

  if (resultName && !SUCCESS_RESULTS.has(resultName)) {
    throw new ConsensusError("Transaction did not reach consensus.", resultName, hash);
  }

  // Consensus on the votes is not the same thing as the contract having run
  // successfully. A finalized transaction can still carry a failed execution,
  // and reporting that as success would show state that never changed.
  if (execution && execution !== SUCCESS_EXECUTION) {
    const raw = findContractError(receipt) ?? "";
    throw new TxExecutionError("Contract execution failed.", hash, raw || undefined);
  }
}

export type RunOptions = {
  label: string;
  send: (client: ReturnType<typeof writeClient>) => Promise<`0x${string}`>;
  invalidate?: QueryKey[];
  successTitle?: string;
  successDescription?: string;
  toastOnSuccess?: boolean;
  onSuccess?: (receipt: Receipt) => void;
  /**
   * Runs after finalization and after the cache is invalidated. Return false if
   * the state the caller expected to change did not actually change - the
   * transaction is then reported as a failure rather than a success.
   */
  verify?: () => Promise<boolean>;
  waitRetries?: number;
  waitInterval?: number;
};

export function useTx() {
  const { address, provider, ensureStudioNet } = useWallet();
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<TxState>({ phase: "idle" });
  const inFlight = React.useRef(false);

  const reset = React.useCallback(() => setState({ phase: "idle" }), []);

  const invalidate = React.useCallback(
    async (keys: QueryKey[] | undefined) => {
      if (!keys || keys.length === 0) {
        await queryClient.invalidateQueries();
        return;
      }
      await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: key })));
    },
    [queryClient],
  );

  const finish = React.useCallback(
    async (receipt: Receipt, hash: string, options: RunOptions, startedAt: number) => {
      if (options.verify) {
        const ok = await options.verify();
        if (!ok) {
          throw new TxExecutionError(
            "The transaction finalized, but the expected on-chain change was not observed.",
            hash,
          );
        }
      }
      // Success is reported from the receipt, never from a cache refresh. A slow
      // or rate-limited read must not leave a finalized transaction looking
      // like it is still processing.
      setState({ phase: "success", label: options.label, hash, startedAt });
      if (options.toastOnSuccess !== false) {
        toast.success(options.successTitle ?? "Transaction finalized", {
          description: options.successDescription ?? "Finalized on-chain.",
        });
      }
      options.onSuccess?.(receipt);
      void invalidate(options.invalidate).catch(() => {
        toast.warning("Transaction confirmed, but the page is showing older data", {
          description: "Reload the page in a moment to see the updated state.",
        });
      });
      return receipt;
    },
    [invalidate],
  );

  const waitFor = React.useCallback(
    async (hash: string, options: RunOptions): Promise<Receipt> => {
      const interval = options.waitInterval ?? 4_000;
      // `waitRetries` is kept as the caller-facing knob, but it now means "how
      // many polls before giving up", not "how many polls the SDK may attempt
      // before it aborts on a single failed request".
      return waitForFinalized<Receipt>({
        hash,
        getTransaction: (value) =>
          readClient.getTransaction({ hash: value as Hash }) as unknown as Promise<Receipt>,
        intervalMs: interval,
        timeoutMs: (options.waitRetries ?? 150) * interval,
      });
    },
    [],
  );

  const explainFailure = React.useCallback((cause: unknown): UiError => {
    // Report what actually failed. Turning every post-signature error into a
    // timeout hid rate limits and dropped connections behind a wrong message.
    return toUiError(cause, "Transaction failed");
  }, []);

  const run = React.useCallback(
    async (options: RunOptions): Promise<Receipt | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      const startedAt = Date.now();
      setState({ phase: "signing", label: options.label, startedAt });

      let hash: string | undefined;
      try {
        if (!address) throw new WalletNotConnectedError();
        if (!provider) throw new WalletNotConnectedError();
        await ensureStudioNet();
        const client = writeClient(address, provider);
        hash = await options.send(client);
        if (!hash) throw new Error("The wallet did not return a transaction hash.");
        setState({ phase: "pending", label: options.label, hash, startedAt });
        const receipt = await waitFor(hash, options);
        assertReceipt(receipt, hash);
        return await finish(receipt, hash, options, startedAt);
      } catch (cause) {
        const ui = explainFailure(cause);
        setState({ phase: "error", label: options.label, hash, error: ui, startedAt });
        toast.error(ui.title, { description: ui.message });
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    [address, provider, ensureStudioNet, explainFailure, finish, waitFor],
  );

  const resume = React.useCallback(
    async (hash: string, options: RunOptions) => {
      if (inFlight.current) return null;
      inFlight.current = true;
      const startedAt = Date.now();
      setState({ phase: "pending", label: options.label, hash, startedAt });
      try {
        const receipt = await waitFor(hash, { ...options, waitRetries: options.waitRetries ?? 60 });
        assertReceipt(receipt, hash);
        return await finish(receipt, hash, options, startedAt);
      } catch (cause) {
        const ui = toUiError(cause, "Transaction not finished");
        setState({ phase: "error", label: options.label, hash, error: ui, startedAt });
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    [finish, waitFor],
  );

  return {
    state,
    run,
    resume,
    reset,
    isBusy: state.phase === "signing" || state.phase === "pending",
    isSuccess: state.phase === "success",
    isError: state.phase === "error",
  };
}

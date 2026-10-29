"use client";

import * as React from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { TransactionStatus } from "genlayer-js/types";
import type { Hash } from "genlayer-js/types";
import { readClient, writeClient } from "@/lib/genlayer";
import {
  ConsensusError,
  TxExecutionError,
  TxTimeoutError,
  WalletNotConnectedError,
  toUiError,
  type UiError,
} from "@/lib/errors";
import { useWallet } from "@/hooks/use-wallet";

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

// `waitForTransactionReceipt` returns the SDK's simplified receipt, which
// renames `statusName` to `status_name` and may leave only the numeric fields
// behind on Studio. Decode every shape, or a canceled transaction would be
// reported as a success because its status name looked empty.
const STATUS_NAMES: Record<string, string> = {
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
  const status = named(receipt.status_name ?? receipt.statusName ?? receipt.status, STATUS_NAMES);
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
      await invalidate(options.invalidate);
      if (options.verify) {
        const ok = await options.verify();
        if (!ok) {
          throw new TxExecutionError(
            "The transaction finalized, but the expected on-chain change was not observed.",
            hash,
          );
        }
      }
      setState({ phase: "success", label: options.label, hash, startedAt });
      if (options.toastOnSuccess !== false) {
        toast.success(options.successTitle ?? "Transaction finalized", {
          description:
            options.successDescription ??
            "Finalized on-chain, and the latest state has been reloaded.",
        });
      }
      options.onSuccess?.(receipt);
      return receipt;
    },
    [invalidate],
  );

  const waitFor = React.useCallback(
    async (hash: string, options: RunOptions) =>
      (await readClient.waitForTransactionReceipt({
        hash: hash as Hash,
        // ACCEPTED only means the leader proposed the transaction. Waiting for
        // FINALIZED is what makes the success message true: consensus and
        // execution are settled by then, and the state read back afterwards is
        // the state the next block will see.
        status: TransactionStatus.FINALIZED,
        retries: options.waitRetries ?? 240,
        interval: options.waitInterval ?? 3_000,
      })) as unknown as Receipt,
    [],
  );

  const explainFailure = React.useCallback((cause: unknown, hash?: string): UiError => {
    if (cause instanceof ConsensusError || cause instanceof TxExecutionError) {
      return toUiError(cause);
    }
    if (hash) return toUiError(new TxTimeoutError("Timed out waiting for finalization.", hash));
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
        const ui = explainFailure(cause, hash);
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

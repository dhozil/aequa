export type UiErrorKind =
  | "wallet"
  | "network"
  | "consensus"
  | "execution"
  | "timeout"
  | "validation"
  | "unknown";

export type UiError = {
  kind: UiErrorKind;
  title: string;
  message: string;
  hint?: string;
  raw?: string;
  hash?: string;
  retryable: boolean;
};

export class ConsensusError extends Error {
  constructor(
    message: string,
    readonly resultName: string,
    readonly hash: string,
  ) {
    super(message);
    this.name = "ConsensusError";
  }
}

export class TxExecutionError extends Error {
  constructor(
    message: string,
    readonly hash: string,
    readonly raw?: string,
  ) {
    super(message);
    this.name = "TxExecutionError";
  }
}

export class TxTimeoutError extends Error {
  constructor(
    message: string,
    readonly hash: string,
  ) {
    super(message);
    this.name = "TxTimeoutError";
  }
}

export class WalletNotConnectedError extends Error {
  constructor() {
    super("Wallet is not connected.");
    this.name = "WalletNotConnectedError";
  }
}

type ErrorLike = {
  code?: number | string;
  message?: string;
  shortMessage?: string;
  details?: string;
  cause?: unknown;
  data?: unknown;
};

function collectText(error: unknown, depth = 0): string {
  if (error == null || depth > 4) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const like = error as ErrorLike;
    const parts = [
      like.message,
      like.shortMessage,
      like.details,
      typeof like.data === "string" ? like.data : "",
      collectText(like.cause, depth + 1),
    ];
    return parts.filter(Boolean).join(" | ");
  }
  if (typeof error === "object") {
    const like = error as ErrorLike;
    const parts = [
      like.message,
      like.shortMessage,
      like.details,
      typeof like.data === "string" ? like.data : "",
      collectText(like.cause, depth + 1),
    ];
    if (parts.some(Boolean)) return parts.filter(Boolean).join(" | ");
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function extractCode(error: unknown): number | string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as ErrorLike).code;
    if (typeof code === "number" || typeof code === "string") return code;
  }
  return undefined;
}

function contractMessage(text: string): { tag: string; message: string } | null {
  const match = text.match(/\[(EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\]\s*([^|"\\\n]+)/);
  if (!match) return null;
  return { tag: match[1], message: match[2].trim().replace(/[.,;]+$/, "") };
}

const CONTRACT_MESSAGES: Array<{
  match: (message: string) => boolean;
  ui: Omit<UiError, "kind" | "raw" | "retryable">;
}> = [
  {
    match: (m) => m.includes("one proposal per applicant per round"),
    ui: {
      title: "You already submitted a proposal",
      message:
        "Each address may submit only one proposal per round. Submit in the next round or use a different wallet.",
    },
  },
  {
    match: (m) => m.includes("round deadline has passed"),
    ui: {
      title: "Deadline has passed",
      message: "This round is past its proposal submission deadline.",
    },
  },
  {
    match: (m) => m.includes("round is closed"),
    ui: {
      title: "Round is closed",
      message: "The owner has closed this round for new proposals and funding.",
    },
  },
  {
    match: (m) => m.includes("requested amount exceeds"),
    ui: {
      title: "Amount exceeds the limit",
      message:
        "The requested amount is larger than the per-proposal cap or the round budget.",
    },
  },
  {
    match: (m) => m.includes("only the owner"),
    ui: {
      title: "Owner only",
      message: "The connected wallet is not the owner of this contract.",
    },
  },
  {
    match: (m) => m.includes("only the owner or applicant"),
    ui: {
      title: "Not authorized to disburse",
      message: "Only the owner or the applicant of this proposal can trigger the payout.",
    },
  },
  {
    match: (m) => m.includes("proposal already evaluated"),
    ui: {
      title: "Proposal already evaluated",
      message: "Evaluation can only run once per proposal.",
    },
  },
  {
    match: (m) => m.includes("proposal is not approved"),
    ui: {
      title: "Not ready for payout",
      message: "Only approved proposals can be paid out.",
    },
  },
  {
    match: (m) => m.includes("contract is paused"),
    ui: {
      title: "Contract is paused",
      message: "The owner has paused the contract. Try again once it is unpaused.",
    },
  },
  {
    match: (m) => m.includes("deadline must be in the future"),
    ui: {
      title: "Invalid deadline",
      message: "The deadline must be in the future.",
    },
  },
  {
    match: (m) => m.includes("weights must sum to 100"),
    ui: {
      title: "Invalid rubric weights",
      message: "All criterion weights must add up to exactly 100.",
    },
  },
  {
    match: (m) => m.includes("send some GEN"),
    ui: {
      title: "Funding amount is empty",
      message: "Send an amount of GEN greater than 0 to fund the round.",
    },
  },
  {
    match: (m) => m.includes("no evidence could be fetched"),
    ui: {
      title: "Evidence could not be fetched",
      message:
        "Validators could not open the evidence URLs. Make sure each link is public, accessible without login, and contains enough text.",
    },
  },
  {
    match: (m) => m.includes("nothing to refund"),
    ui: {
      title: "Nothing left to claim",
      message:
        "Your share has already been claimed, or the round has no unallocated funds left.",
    },
  },
  {
    match: (m) => m.includes("before recovering"),
    ui: {
      title: "Grace period not over yet",
      message:
        "A transfer that is still in flight and one that bounced look identical for the first hour. Recovery opens after that grace period.",
    },
  },
  {
    match: (m) => m.includes("no refund awaiting"),
    ui: {
      title: "No refund to reconcile",
      message:
        "There is no claimed refund waiting for this round. Claim first, then confirm the delivery.",
    },
  },
  {
    match: (m) => m.includes("no payout awaiting"),
    ui: {
      title: "No payout to reconcile",
      message:
        "There is no payout waiting for confirmation on this proposal.",
    },
  },
  {
    match: (m) => m.includes("awaiting reconciliation") || m.includes("awaiting confirmation"),
    ui: {
      title: "Another transfer is still open",
      message:
        "One outbound transfer is reconciled at a time. Confirm or recover the open one first.",
    },
  },
  {
    match: (m) => m.includes("only funders of this round"),
    ui: {
      title: "Only funders can claim",
      message:
        "This wallet did not deposit into the round. Refunds go back pro rata to the addresses that funded it, never to the owner.",
    },
  },
];

const GENERIC_CONTRACT_MESSAGE: Omit<UiError, "kind" | "raw" | "retryable"> = {
  title: "Transaction rejected by the contract",
  message:
    "The contract rejected this transaction. Check your input and the round state before trying again.",
};

export function toUiError(error: unknown, fallbackTitle = "Something went wrong"): UiError {
  const text = collectText(error);
  const lowered = text.toLowerCase();
  const code = extractCode(error);
  const raw = text.slice(0, 600);

  if (error instanceof WalletNotConnectedError) {
    return {
      kind: "wallet",
      title: "Wallet not connected",
      message: "Connect your wallet before sending a transaction.",
      retryable: true,
      raw,
    };
  }

  if (error instanceof ConsensusError) {
    return {
      kind: "consensus",
      title: "Validators did not agree",
      message:
        "Validators re-evaluated the proposal independently and did not reach the same decision. No funds or state changed.",
      hint:
        error.resultName === "MAJORITY_DISAGREE" || error.resultName === "DISAGREE"
          ? "This usually happens with ambiguous evidence. Clarify the evidence or the rubric, then run the evaluation again."
          : "Run the evaluation again. If it keeps repeating, review the evidence quality and how the gates are worded.",
      hash: error.hash,
      retryable: true,
      raw,
    };
  }

  if (error instanceof TxExecutionError) {
    return {
      kind: "execution",
      title: "Contract execution failed",
      message:
        "The transaction reached the network but contract execution failed. State did not change.",
      hint: "Check the technical details below and make sure your input is correct.",
      hash: error.hash,
      retryable: true,
      raw: error.raw ?? raw,
    };
  }

  if (error instanceof TxTimeoutError) {
    return {
      kind: "timeout",
      title: "Transaction still processing",
      message:
        "The network has not returned a result within the time limit. The transaction may still complete shortly.",
      hint: "Check the transaction status with the hash below before resending.",
      hash: error.hash,
      retryable: true,
      raw,
    };
  }

  if (code === 4001 || lowered.includes("user rejected") || lowered.includes("rejected the request")) {
    return {
      kind: "wallet",
      title: "Cancelled in wallet",
      message: "You declined the signature request. No transaction was sent.",
      retryable: true,
      raw,
    };
  }

  if (code === -32002 || lowered.includes("already pending")) {
    return {
      kind: "wallet",
      title: "Wallet is busy",
      message: "Another request is still pending in your wallet. Open the wallet and finish it first.",
      retryable: true,
      raw,
    };
  }

  if (
    lowered.includes("metamask is not installed") ||
    lowered.includes("no provider") ||
    lowered.includes("connect a wallet") ||
    lowered.includes("window.ethereum is undefined")
  ) {
    return {
      kind: "wallet",
      title: "Wallet not available",
      message: "This browser does not detect a wallet that can sign transactions.",
      hint: "Pick an EVM wallet (MetaMask, Rabby, …) from the connect button, then try again.",
      retryable: false,
      raw,
    };
  }

  if (code === 4902 || lowered.includes("unrecognized chain")) {
    return {
      kind: "network",
      title: "Network missing in wallet",
      message: "GenLayer Studio (chain 61999) has not been added to your wallet yet.",
      hint: "Add the network with the network button in the header, then try again.",
      retryable: true,
      raw,
    };
  }

  if (
    lowered.includes("wrong chain") ||
    lowered.includes("chain mismatch") ||
    lowered.includes("does not match") ||
    lowered.includes("chainid")
  ) {
    return {
      kind: "network",
      title: "Wrong wallet network",
      message: "Your wallet must be on GenLayer Studio (chain 61999) before sending a transaction.",
      hint: "Switch networks with the button in the header.",
      retryable: true,
      raw,
    };
  }

  if (lowered.includes("insufficient funds") || lowered.includes("exceeds balance")) {
    return {
      kind: "wallet",
      title: "Not enough GEN",
      message: "The connected wallet does not have enough GEN for this transaction.",
      hint: "Top up from the Studionet faucet, or lower the funding amount.",
      retryable: false,
      raw,
    };
  }

  if (lowered.includes("429") || lowered.includes("rate limit") || lowered.includes("too many requests")) {
    return {
      kind: "network",
      title: "Too many requests",
      message: "The GenLayer Studio RPC is currently rate limiting requests.",
      hint: "Wait about a minute and try again.",
      retryable: true,
      raw,
    };
  }

  if (
    lowered.includes("failed to fetch") ||
    lowered.includes("fetch failed") ||
    lowered.includes("networkerror") ||
    lowered.includes("econnreset") ||
    lowered.includes("timeout")
  ) {
    return {
      kind: "network",
      title: "RPC connection lost",
      message:
        "The request to the GenLayer RPC failed, timed out, or was rate limited.",
      hint: "Wait a moment and try again. Studionet allows 500 requests per hour.",
      retryable: true,
      raw,
    };
  }

  const contract = contractMessage(text);
  if (contract) {
    const known = CONTRACT_MESSAGES.find((item) => item.match(contract.message));
    const ui = known?.ui ?? GENERIC_CONTRACT_MESSAGE;
    return {
      kind: ui === GENERIC_CONTRACT_MESSAGE ? "validation" : "execution",
      title: ui.title,
      message: known ? ui.message : `${ui.message} (${contract.message})`,
      hint: contract.tag === "EXTERNAL" ? "Validators could not access the external evidence." : undefined,
      retryable: false,
      raw,
    };
  }

  return {
    kind: "unknown",
    title: fallbackTitle,
    message:
      "The transaction did not complete. If your wallet already reported success, wait a moment and reload the data.",
    hint: "Technical details are shown below for debugging.",
    retryable: true,
    raw,
  };
}

export function isUserRejection(error: unknown): boolean {
  const text = collectText(error).toLowerCase();
  return extractCode(error) === 4001 || text.includes("user rejected");
}

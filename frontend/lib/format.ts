import type { Decision, ProposalStatus, RoundStatus } from "./types";

export const GEN = 10n ** 18n;

export function formatGen(atto: bigint | string | number, maxFrac = 4): string {
  let value: bigint;
  try {
    value = typeof atto === "bigint" ? atto : BigInt(atto);
  } catch {
    return "0";
  }
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / GEN;
  const fraction = (abs % GEN).toString().padStart(18, "0").slice(0, maxFrac);
  const trimmed = fraction.replace(/0+$/, "");
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${wholeText}${trimmed ? `.${trimmed}` : ""}`;
}

export function formatGenUnit(atto: bigint | string | number, maxFrac = 4): string {
  return `${formatGen(atto, maxFrac)} GEN`;
}

/** Plain decimal string for form inputs: 2500000000000000000n -> "2.5" */
export function genInputValue(atto: bigint): string {
  const whole = atto / GEN;
  const fraction = (atto % GEN).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

export function parseGen(input: string): bigint | null {
  let clean = input.trim().replace(/\s/g, "");
  // "1,000.5" and "1.5" both work. With both separators present the comma is a
  // thousands separator (removing the dot instead would read 1,000.5 as 1.0005);
  // a comma on its own is the decimal separator, as in "1,5".
  if (clean.includes(",") && clean.includes(".")) {
    clean = clean.replace(/,/g, "");
  } else if (clean.includes(",")) {
    clean = clean.replace(",", ".");
  }
  if (!/^\d+(\.\d{0,18})?$/.test(clean)) return null;
  const [whole, fraction = ""] = clean.split(".");
  const padded = (fraction + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * GEN + BigInt(padded || "0");
}

export function shortAddress(address: string, size = 4): string {
  if (!address) return "";
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size + 2)}…${address.slice(-size)}`;
}

export function shortHash(hash: string): string {
  return shortAddress(hash, 6);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDateShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

export function formatTimestamp(seconds: number): string {
  if (!seconds) return "—";
  return formatDate(new Date(seconds * 1000).toISOString());
}

export type DeadlineInfo = {
  label: string;
  expired: boolean;
  urgent: boolean;
  ratio: number;
};

export function describeDeadline(
  iso: string,
  status?: RoundStatus,
  now = Date.now(),
): DeadlineInfo {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { label: "No deadline", expired: false, urgent: false, ratio: 1 };
  }
  if (status === "closed") {
    return { label: "Closed", expired: true, urgent: false, ratio: 0 };
  }
  const diff = date.getTime() - now;
  if (diff <= 0) return { label: "Closed", expired: true, urgent: false, ratio: 0 };

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  let label: string;
  if (days >= 1) label = `${days} ${days === 1 ? "day" : "days"} left`;
  else if (hours >= 1) label = `${hours} ${hours === 1 ? "hour" : "hours"} left`;
  else label = `${Math.max(minutes, 1)} min left`;

  return {
    label,
    expired: false,
    urgent: diff < 1000 * 60 * 60 * 24 * 2,
    ratio: Math.min(Math.max(diff / (1000 * 60 * 60 * 24 * 14), 0), 1),
  };
}

export function isFutureIso(iso: string): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() > Date.now();
}

export function percent(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  const ratio = (Number(part) / Number(total)) * 100;
  return Math.min(Math.max(ratio, 0), 100);
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  const word = count === 1 ? singular : (pluralForm ?? `${singular}s`);
  return `${count} ${word}`;
}

export function titleFromId(id: string): string {
  const text = id.replace(/[_-]+/g, " ").trim();
  if (!text) return id;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function decisionReasonLabel(reason: string): string {
  if (!reason) return "Not evaluated yet.";
  if (reason === "approved") return "Passed every gate and the round score threshold.";
  if (reason === "score_below_threshold") return "Total score is below the round threshold.";
  if (reason === "budget_exhausted") {
    return "The round budget left is not enough for the requested amount.";
  }
  if (reason === "payout_failed") {
    return "The grant was approved, but the transfer could not be delivered. The reservation was released back to the round.";
  }
  if (reason.startsWith("gate_failed:")) {
    const ids = reason.slice("gate_failed:".length).split(",").filter(Boolean);
    return `Gate not met: ${ids.map(titleFromId).join(", ")}.`;
  }
  return reason;
}

export function statusLabel(status: ProposalStatus | RoundStatus): string {
  const labels: Record<string, string> = {
    open: "Open",
    closed: "Closed",
    submitted: "Awaiting evaluation",
    approved: "Approved",
    rejected: "Rejected",
    payout_pending: "Payout pending",
    paid: "Paid",
    payout_failed: "Payout failed",
  };
  return labels[status] ?? status;
}

export function decisionLabel(decision: Decision): string {
  if (decision === "approve") return "APPROVE";
  if (decision === "reject") return "REJECT";
  return "PENDING";
}

export function evaluateDisabledReason(roundStatus: RoundStatus): string | null {
  if (roundStatus === "closed") return "This round is closed for new proposals.";
  return null;
}

export function truncate(text: string, max = 160): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function toDatetimeLocal(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromDatetimeLocal(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Contract <-> frontend smoke test.
 *
 * Sends the exact `writeContract` payloads the Next.js components send
 * (create_round, fund_round, submit_proposal, set_paused, close_round,
 * claim_refund) through the same genlayer-js version and client shape the app
 * uses, then reads the state back the way `lib/genlayer.ts` does.
 *
 * MetaMask cannot be driven headlessly, so this script signs with the same
 * wallet keys the integration suite uses. It is the write-path half of the
 * frontend check; the browser check covers rendering.
 *
 *     node scripts/contract-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const GEN = 10n ** 18n;
const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://studio.genlayer.com/api";
const EVIDENCE = "https://raw.githubusercontent.com/genlayerlabs/genlayer-js/main/README.md";

function parseEnv(relativePath) {
  const text = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    out[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return out;
}

const secrets = parseEnv("../../.env");
const local = parseEnv("../.env.local");
const CONTRACT = process.env.AEQUA_ADDRESS ?? local.NEXT_PUBLIC_AEQUA_ADDRESS;

if (!CONTRACT) throw new Error("AEQUA_ADDRESS / NEXT_PUBLIC_AEQUA_ADDRESS is not set");
if (!secrets.APPLICANT_PRIVATE_KEY) throw new Error("APPLICANT_PRIVATE_KEY missing in .env");

function toHexKey(value) {
  const key = (value ?? "").trim();
  return key.startsWith("0x") ? key : `0x${key}`;
}

const readClient = createClient({ chain: studionet, endpoint: RPC });
const ownerClient = createClient({
  chain: studionet,
  endpoint: RPC,
  account: createAccount(toHexKey(secrets.ACCOUNT_PRIVATE_KEY)),
});
const applicantClient = createClient({
  chain: studionet,
  endpoint: RPC,
  account: createAccount(toHexKey(secrets.APPLICANT_PRIVATE_KEY)),
});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function read(functionName, args = []) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await readClient.readContract({ address: CONTRACT, functionName, args });
    } catch (error) {
      if (attempt === 4) throw error;
      console.log(`  retry   ${functionName}: ${String(error).slice(0, 90)}`);
      await pause(6000);
    }
  }
  return undefined;
}

async function send(client, functionName, args, value = 0n) {
  await pause(2000);
  const hash = await client.writeContract({
    address: CONTRACT,
    functionName,
    args,
    value,
  });
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: "ACCEPTED",
    interval: 3000,
    retries: 200,
  });
  const leader = receipt?.consensus_data?.leader_receipt?.[0];
  const ok = leader?.execution_result === "SUCCESS";
  console.log(`  ${ok ? "ok     " : "FAILED "} ${functionName} ${hash}`);
  if (!ok) {
    console.log(JSON.stringify(leader?.genvm_result ?? {}, null, 2).slice(0, 900));
    throw new Error(`${functionName} failed`);
  }
  return receipt;
}

const rubric = {
  criteria: [
    { id: "impact", weight: 50, question: "Does this create real value for GenLayer developers?" },
    { id: "feasibility", weight: 30, question: "Is the plan concrete and achievable?" },
    { id: "alignment", weight: 20, question: "Does it align with open-source values?" },
  ],
  gates: [{ id: "public_evidence", question: "Is the evidence reachable on the public web?" }],
};

function deadline(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const summary = {};

console.log(`contract: ${CONTRACT}`);

// 1. read path used by every page before a wallet connects
const stats = await read("get_stats");
assert(typeof stats === "object" && stats.owner, "get_stats returned no object");
console.log(`  read     get_stats  rounds=${stats.round_count} proposals=${stats.proposal_count}`);
summary.owner = stats.owner;

// 2. create a live round exactly like admin/create-round-form.tsx
await send(ownerClient, "create_round", [
  "Frontend smoke round",
  "Round created through genlayer-js with the same payload the admin form sends.",
  JSON.stringify(rubric),
  2n * GEN,
  1n * GEN,
  60n,
  deadline(3),
]);
const rounds = await read("list_rounds");
const liveRound = rounds[rounds.length - 1];
assert(liveRound?.rubric?.criteria?.length === 3, "created round did not decode its rubric");
summary.liveRound = liveRound.id;

// 3. fund it with a decimal GEN amount (rounds/fund-dialog.tsx sends bigint value)
await send(ownerClient, "fund_round", [liveRound.id], GEN);
const funded = await read("get_round", [liveRound.id]);
assert(BigInt(funded.funded_atto) === GEN, "fund_round value was not applied");

// 4. applicant proposal (proposals/submit-form.tsx)
await send(applicantClient, "submit_proposal", [
  liveRound.id,
  "Frontend smoke proposal",
  "A proposal submitted through the same client call the submit form uses, to prove the calldata encoding of a string list and a u256 amount works end to end.",
  [EVIDENCE],
  500_000_000_000_000_000n,
]);
const liveProposals = await read("list_round_proposals", [liveRound.id]);
assert(liveProposals.length === 1, "proposal was not recorded");
assert(liveProposals[0].evidence_urls[0] === EVIDENCE, "evidence URL did not survive encoding");
summary.liveProposal = liveProposals[0].id;

// 5. pause toggle (admin/pause-control.tsx) — bool argument
await send(ownerClient, "set_paused", [true]);
assert((await read("get_stats")).paused === true, "pause did not apply");
await send(ownerClient, "set_paused", [false]);
assert((await read("get_stats")).paused === false, "unpause did not apply");

// 6. second round: close + pull-based refund (rounds/round-controls.tsx, refund-claim.tsx)
await send(ownerClient, "create_round", [
  "Frontend refund round",
  "Unfunded proposals, so the funder can pull its deposit back after closing.",
  JSON.stringify(rubric),
  GEN,
  GEN,
  60n,
  deadline(3),
]);
const refundRound = (await read("list_rounds")).at(-1);
await send(ownerClient, "fund_round", [refundRound.id], GEN);
await send(ownerClient, "close_round", [refundRound.id]);
const quote = await read("get_refund", [refundRound.id, stats.owner]);
assert(quote.ready === true, `refund not ready: ${quote.blocked_reason}`);
await send(ownerClient, "claim_refund", [refundRound.id]);

// A claim is pending, not returned: the ledger moves in confirm_refund once the
// contract balance proves the transfer left.
const pendingQuote = await read("get_refund", [refundRound.id, stats.owner]);
assert(pendingQuote.refund_state === "sent", "claim was not recorded as pending");
assert(BigInt(pendingQuote.pending_atto) === GEN, "pending amount is wrong");

let confirmed = false;
for (let attempt = 1; attempt <= 8; attempt += 1) {
  await send(ownerClient, "confirm_refund", [refundRound.id]);
  const quote = await read("get_refund", [refundRound.id, stats.owner]);
  if (BigInt(quote.claimed_atto) === GEN) {
    confirmed = true;
    break;
  }
  // Delivery is only trusted after the balance stays down for the settle
  // window (a bouncing transfer debits its value for a moment too).
  const waitMs = Math.min(
    Math.max(3000, (Number(quote.refund_confirm_after) - Math.floor(Date.now() / 1000) + 2) * 1000),
    100_000,
  );
  await pause(waitMs);
}
assert(confirmed, "confirm_refund never observed the delivery");

const settled = await read("get_round", [refundRound.id]);
assert(BigInt(settled.refunded_atto) === GEN, "refund was not recorded");
assert(BigInt(settled.available_atto) === 0n, "round still shows available funds");
summary.refundRound = refundRound.id;

console.log(JSON.stringify(summary, null, 2));
console.log("frontend write/read path: OK");

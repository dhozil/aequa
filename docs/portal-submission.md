# GenLayer Portal submission — Aequa Grants

Copy-paste text for each field of the project submission form.

## 02 · One-liner (≤180)

```
Aequa Grants: grant rounds where AI validators fetch public evidence, score proposals against a published rubric, and the treasury pays only after consensus approves.
```

## 03 · Project overview / Description (≤1000)

```
Aequa Grants is a grant program that runs on-chain, with no admin deciding payouts.

A round owner publishes a title, budget, deadline and a public rubric of weighted criteria and pass/fail gates. Funders deposit GEN into the round treasury; applicants submit a summary, an amount and public evidence URLs. Anyone can call evaluate_proposal: GenLayer validators independently fetch the evidence and run an LLM pass, and they must agree on the approve/reject decision. The contract keeps every score, gate result and only quotes that really appear in the fetched text, so invented citations are dropped.

Payout is two-phase: disburse emits the transfer and confirm_payout records paid only after the balance has stayed down for a settle window, and a bounce reported after that still reverses the settlement. Payouts also wait for any unresolved refund transfer. Leftover money stays with the funders: each claims a pro-rata share after the round closes.

GenLayer intelligent contract plus a Next.js frontend that reads straight from it.
```

## Tags

Primary: **AI & Agent — source verification**

Secondary: **DeFi — treasury / payout reconciliation**, **Governance — public-goods allocation**

Third (optional): **Dispute resolution — evidence assessment**

## 04 · Demo video

Optional field. Paste the direct YouTube or X post link, for example:

```
https://www.youtube.com/watch?v=REPLACE_WITH_YOUR_DEMO
```

## 05 · How-to (one heading + one instruction per step)

| Heading | Instruction |
| --- | --- |
| Open the app | Go to `https://aequa-grant.vercel.app/rounds`. The round list, budgets and deadlines load straight from the contract; no wallet or account is needed to browse. |
| Connect a wallet | Press **Connect wallet** in the header and pick MetaMask or Rabby from the list. Every EVM wallet is discovered separately (EIP-6963), so no extension overrides another; approve the request and let the app switch the wallet to GenLayer Studio (chain 61999). The header then shows your address and "Signing via selected wallet". |
| Fund a round | Open round `r0001` and press **Fund round**, keep `5` GEN, then sign. The panel reports "Funding recorded" once the transaction finalizes, and the round's funded bar and Total funded both rise. |
| Submit a proposal | From the round page press **Submit proposal**, fill in the title, summary, requested amount and at least one public evidence URL, then sign. The proposal appears as "Awaiting evaluation". |
| Run the AI evaluation | Open the proposal and press **Evaluate**. GenLayer validators fetch the evidence and re-score it independently; after one to three minutes the page shows each criterion's score, the gate results, the verified quotes and the APPROVE or REJECT decision. |
| Pay out or refund | For an approved proposal press **Disburse**, then **Confirm payout** — it becomes Paid only after the balance drop is observed. After a round closes, each funder can claim its pro-rata refund from the round page. |

## 06 · Review verification / Expected outcome (≤500)

```
After Connect wallet the header shows your address and chain 61999.

Fund round r0001 with 5 GEN: the panel turns green with "Funding recorded", the round's funded bar rises, and Total funded on /rounds increases.

Press Evaluate on a proposal: within one to three minutes it shows criterion scores, gate results, verified quotes and an APPROVE or REJECT decision, with the transaction FINALIZED on the Studio explorer.
```

## 06 · Contract link

```
https://explorer-studio.genlayer.com/address/0x7079fE0a3321442818705E85f45C04210eBE7832
```

Deployed from `main` (`6114e14`) on 30 October 2026, tx
`0x7cc0c98d69ffff8ad700a179353165e473fb4550a0ee8a5328ccca6737517385`. Demo state at deploy:
round `r0001` open with 5 GEN funded, budget 5 GEN, cap 2 GEN, threshold 0.

The contract is deployed on **StudioNet** (chain 61999), so the link points at the Studio
explorer. The form's placeholder shows `scan.bradbury.genlayer.com`; if the stewards require a
Bradbury deployment, deploy the same contract there and add that address instead:

```bash
python scripts/deploy.py --rpc <bradbury-rpc-url>
```

## Live app

```
https://aequa-grant.vercel.app
```

## Repository

```
https://github.com/dhozil/aequa
```

## Corrected source (steward review)

- Contract: `https://github.com/dhozil/aequa/blob/main/contracts/aequa_grants.py`
- Payout reconciliation tests: `https://github.com/dhozil/aequa/blob/main/tests/direct/test_payout.py`
- Refund reconciliation tests: `https://github.com/dhozil/aequa/blob/main/tests/direct/test_rounds.py`
- Design notes: `https://github.com/dhozil/aequa/blob/main/README.md#payout-lifecycle`

What changed for this review:

- `confirm_payout` no longer settles from one balance reading. It records
  `payout_observed_at` and finalises only after `PAYOUT_SETTLE_SECONDS = 90`, so a temporary child
  transfer debit cannot be marked delivered on the first observation.
- `__on_errored_message__` now also reverses payouts. `disburse` adds a watch record to
  `payout_watch_atto`/`payout_watch_at` (pruned, capped at 8), so a bounce reported after an early
  confirmation returns `paid_atto` to `reserved_atto`, drops `total_paid`, clears `paid_atto`,
  restores `status = payout_pending`/`payout_state = owed`, and allows a retry on the same
  reservation. The record is removed on reversal and expires after `PAYOUT_REVERSAL_WINDOW`.
- `disburse` refuses to start while `refund_in_flight > 0`, so a payout can never overlap a refund
  transfer that could still bounce; `claim_refund` already refused while a payout was in flight.
- `get_stats` exposes `bounced_payouts`, `bounced_payout_atto`, the in-flight amounts and
  `returned_surplus_atto`; `get_proposal` exposes `payout_observed_at`, `payout_confirm_after`, and
  `payout_settle_seconds`.
- Bounce detection no longer depends on `__on_errored_message__`: the live StudioNet deployment had
  three GEN of returned transfers with `bounced_refunds = 0`, so the hook was never dispatched.
  `reconcile_payout(proposal_id)` and `reconcile_refund(round_id)` are permissionless and reverse a
  settlement when the contract balance proves the value came back (funding minus the ledger cannot
  explain the surplus). Both refuse when no returned value covers the amount.
- Focused tests: `test_confirm_payout_after_the_balance_drops`,
  `test_a_settle_observation_is_forgotten_when_the_value_returns`,
  `test_an_early_confirmation_is_reversed_when_the_transfer_bounces`,
  `test_a_confirmed_payout_is_reversed_when_the_value_returns`,
  `test_reconcile_payout_refuses_without_a_returned_transfer`,
  `test_reconcile_refund_releases_a_settled_claim_whose_value_returned`,
  `test_a_bounce_of_an_unrelated_payout_value_is_ignored`,
  `test_payout_cannot_start_while_a_refund_is_unresolved`.

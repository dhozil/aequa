# Aequa Grants

Grant rounds with **public criteria** and **evaluation by AI validators**. The community fills a
round's budget, the owner publishes the rubric, applicants submit proposals together with public
evidence, and GenLayer validators score them independently. When the validators agree, the
contract disburses funds to the applicant.

Category: **AI Governance**. Status: contract, tests, and frontend are complete.

Reviewer notes for the payout/refund reconciliation fix (request, mechanics, tests, transaction
links): [`information_needed.md`](information_needed.md).

## Deployment

| Item | Value |
| --- | --- |
| Network | Studionet (`https://studio.genlayer.com/api`, chain id `61999`) |
| Contract | `0x7079fE0a3321442818705E85f45C04210eBE7832` |
| Deploy tx | `0x7cc0c98d69ffff8ad700a179353165e473fb4550a0ee8a5328ccca6737517385` |
| Owner | `0x3958A649b41cd7C8561F4233cC0F5b0469Bc98E0` |
| Runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` (pinned) |

This deployment is fresh: one open round, funded by the owner, so the demo path works without any
setup.

- `r0001` — "Community tooling round", funded 5 GEN, budget 5 GEN, cap 2 GEN per proposal,
  `min_score 0`, deadline 14 days after creation. No proposals yet.

The previous deployment (`0x2489Af08c51C8346F4362d3D1e4C6c63a6E1E5e6`) is the one whose state proved
that a failed child transfer returns its value without the hook ever firing: it held 3 GEN more than
its ledger accounted for while `bounced_refunds` was still 0. That is what `reconcile_payout` and
`reconcile_refund` now detect.

The historical first deployment (`0x28f860B6bCAC299Ee470C35060732C91cbe985c3`) is the one that
exposed the refund problem: two refund child transfers ended `NO_MAJORITY` while the ledger had
already counted them as returned. That is what the two-phase refund plus the bounce hook below fix.

## Flow

1. The **owner** creates a round: title, description, rubric JSON, budget, cap per proposal,
   `min_score`, and an ISO-8601 deadline.
2. **Anyone** funds the round through `fund_round` (payable; the GEN value is sent with the
   transaction).
3. The **applicant** submits a proposal: title, summary, 1-3 `https` evidence URLs, and the
   requested amount. One proposal per address per round.
4. **Anyone** triggers `evaluate_proposal`. The leader runs the evaluation, every validator re-runs
   the same evaluation independently, and all of them must reach the same decision. If they
   disagree, the transaction ends `UNDETERMINED` and no state changes.
5. The **owner or applicant** calls `disburse` for an approved proposal. The transfer leaves as a
   child transaction, so the proposal moves to `payout_pending`; `confirm_payout` marks it paid only
   after the contract's own balance has shown the funds gone for the full settle window. A bounced
   transfer returns its value, is reversed even if it had already been confirmed, and can be retried
   after a one-hour grace period. Payouts wait for any unresolved refund transfer.
6. Once the round is closed and every proposal has a decision, each **funder** can call
   `claim_refund` to take back its own pro-rata share of the money that was never allocated. The
   claim emits a child transfer and stays pending until `confirm_refund` observes that the money
   left; `recover_refund` discards a claim that never arrived so it can be retried. The owner has no
   withdrawal function at all.

## Payout lifecycle

A single `disburse` call cannot know whether its child transfer arrived: the value may still be in
flight, or it may have bounced back. Recording the payment at emit time is therefore a claim the
contract cannot support, and it is exactly how a failed transfer ends up counted as paid.

```
approved --disburse--> payout_pending (payout_state = sent)
                          |            |
        confirm_payout ---+            +--- recover_payout (after 1h, transfer bounced)
        1st call: observation               |
        +90s: balance still down            +--> payout_state = owed  -> disburse retries
             |                              |
             v                              +--> 3rd failure: reservation released,
           paid                                  status = payout_failed
             |
             +<-- __on_errored_message__ (bounce reported later:
                  paid_atto -> reserved_atto, total_paid reversed,
                  status = payout_pending, payout_state = owed)
```

Refunds mirror it exactly:

```
claimable --claim_refund--> pending (refund_state = sent, snapshot of balance)
                                |            |
              confirm_refund ---+            +--- recover_refund (after 1h, manual fallback)
              (balance stays down                   |
               for 90s)                             +--> claimable again -> claim_refund retries
                   |                              |
                   v                              |
              refunded_atto += amount              |
                   |                              |
          __on_errored_message__ -----------------+ (network reports the bounce:
          (value came back)                         claim released immediately, ledger reversed)
```

A bouncing child transfer debits its value for a moment before returning it, so one low balance
reading is not proof of delivery. `confirm_payout` and `confirm_refund` both first record the
observation, then only settle once the balance has stayed down for `PAYOUT_SETTLE_SECONDS = 90` /
`REFUND_SETTLE_SECONDS = 90`; a reading that goes back up clears the observation.

The settle window is only a smoothing device. The authoritative signal is the GenVM hook
`__on_errored_message__`, which the network calls on the sending contract when an emitted transfer
fails, crediting the value back through `gl.message.value`. The hook releases the claim at once —
and, if `confirm_refund` had already settled it from a fooled balance reading, takes the ledger
credit back (`claimed_refunds`, `refunded_atto`, `total_refunded`). A refund therefore cannot stay
recorded as returned while its GEN sits in the contract, no matter how long the bounce takes.
`recover_refund` remains as the manual fallback for the case where no hook report arrives.

The same hook also owns settled payouts. `disburse` adds a watch record to `payout_watch_atto` /
`payout_watch_at` (keyed by proposal, pruned on expiry, capped at `MAX_PAYOUT_WATCH = 8`), so a
bounce reported up to `PAYOUT_REVERSAL_WINDOW = 7200` seconds later reverses the settlement itself:
`paid_atto` goes back to `reserved_atto`, `total_paid` drops, `paid_atto` on the proposal returns to
zero, the status goes back to `payout_pending`/`owed`, and the payout can be sent again on the same
reservation. The record is removed after use, so one bounce can never reverse two settlements, and it
expires so a stale record cannot match an unrelated transfer later. Bounce counters are exposed as
`bounced_payouts`/`bounced_payout_atto` next to the refund ones.

One limit is inherent to the hook: it carries the returned value but not the recipient, so when two
watched payouts share an amount the contract cannot tell them apart. It reverses a settled record
first (leaving one recorded as paid while its GEN is back in the contract is the corruption this
exists to prevent) and the most recent record otherwise. Payouts of different amounts, which is the
normal case across rounds, are always attributed exactly.

### Bounce detection that does not depend on the hook

The live StudioNet deployment showed why the hook cannot be the only safety net: three GEN of failed
child transfers had returned to the contract while `bounced_refunds` was still 0, so
`__on_errored_message__` had never been dispatched. The returned value is still observable, because
it raises the contract's balance above what funding and the ledger account for:

```
expected = total_received - total_paid - total_refunded
           - payout_in_flight_atto - refund_in_flight_atto
surplus  = max(0, balance - expected)
```

Every payable entry point (`fund_round`, and the hook when it does fire) records its value, so a
surplus can only be a child transfer handing its value back. `reconcile_payout(proposal_id)` and
`reconcile_refund(round_id)` are permissionless and use that surplus to undo a settlement that was
recorded before its transfer failed: the grant returns to `payout_pending`/`owed` on the same
reservation, or the refund ledger credit is taken back and the funder can claim again. Both refuse
when no returned value covers the amount, so a real delivery can never be reversed by calling them.
They only handle *settled* transfers; while a transfer is still in flight the money has not been
recorded as paid and `recover_payout`/`recover_refund` keep owning that case. `get_stats` reports
`returned_surplus_atto` so the surplus is visible before anyone reconciles.

Rules enforced by the contract:

- **One un-reconciled payout at a time** (`payout_in_flight`). With two transfers in flight, a
  balance reading cannot be attributed to either one, so neither could be confirmed or recovered.
- **A payout cannot start while a refund transfer is unresolved** (`refund_in_flight > 0`). The
  refund could still bounce and hand its value back, and two outbound transfers competing for one
  balance reading cannot be reconciled. Refunds are blocked in the other direction too, so the two
  legs are strictly sequential: reconcile one, then the other.
- **`confirm_payout` is permissionless** and only reduces what the contract owes. It is arithmetic
  against a snapshot the contract wrote before the emit (`payout_balance_at_emit`,
  `payout_received_at_emit`), net of funding that arrived afterwards — not a claim by the caller.
- **`recover_payout` is permissionless but slow.** Before the grace period, "still in flight" and
  "bounced" look identical; recovering too early would pay the applicant twice. After
  `MAX_PAYOUT_ATTEMPTS = 3` failed attempts the reservation is released back into the round, so an
  address that cannot receive GEN cannot lock community funds forever.
- **Refunds are pull-based and pro-rata.** `claim_refund` is the only way money leaves a round
  besides a payout, it has no amount parameter, and it pays the caller only. The amount is
  `deposit × (funded − reserved − paid) ÷ funded`, minus what that funder already claimed, so the
  owner can never receive community money and one funder can never reach another's deposit.
  Floor division means the sum of all claims can never exceed the pool; the remaining atto of
  rounding dust stays in the contract.
- **Refunds use the same delivery contract as payouts.** A claim is pending, not paid. `refunded_atto`
  and `claimed_atto` only move in `confirm_refund`, and one refund may be un-reconciled at a time
  (`refund_in_flight`). A bounced transfer is reported through `__on_errored_message__`, which puts
  the claim back immediately (`refund_state = owed`, counted in `bounced_refunds`/`bounced_atto`), so
  the funder can claim again without waiting. `recover_refund` is the slow fallback for a bounce the
  network never reported: after one hour it discards the claim and the amount becomes claimable
  again. Attempts are recorded per funder in `refund_attempts`.
- `claim_refund` is refused while any payout is un-reconciled, while any refund is un-reconciled, and
  while any proposal in the round is still `submitted` — a refund would shrink the pool those
  proposals are scored against and turn them into permanent `budget_exhausted` rejections. It is
  **not** refused while paused: a pause must never trap money that is already in the contract.
- Accounting moves only on confirmation: `reserved_atto` → `paid_atto` and `total_paid_atto` lag
  reality until somebody reconciles. `paid_atto` never claims a payment that did not happen, and
  `refunded_atto` only moves when a funder's refund delivery is observed.

## Consensus model

`evaluate_proposal` uses `gl.vm.run_nondet_unsafe` with two functions:

- **`leader_fn`** — fetches the contents of each evidence URL (`gl.nondet.web.render`), builds the
  prompt, requests structured JSON (`gates`, `criteria`, `summary`), and normalizes the result. The
  total score is computed deterministically from the rubric weights (0-5 per criterion, weights
  summing to 100), not from a number invented by the model. A failed gate forces a reject.
- **`validator_fn`** — **re-runs the entire evaluation** (web fetch + LLM + normalization), not
  just a shape check on the JSON. The result is compared against the leader's.

Agreement rule: **the decision must match** (`approve` vs `reject`).

The reason: payment is binary. Two runs that both approve or both reject move exactly the same
amount of money, while per-criterion scores from an LLM can differ slightly between nodes. The
leader's scores and gates are still stored on-chain for transparency and auditing. If there is a
real split (one approve, one reject), consensus is allowed to fail: `UNDETERMINED` is better than
paying based on a coin flip.

Additional safeguards in the contract:

- The prompt marks evidence content as **untrusted** and forbids following instructions inside it.
- The default gates are conservative; evidence that cannot be fetched counts as a failure.
- Public `https` URLs only; private hosts, loopback, and `.local` are rejected.
- Scores outside 0-5, missing gates, missing criteria, or broken JSON cancel the evaluation
  instead of scoring it partially.
- **Scores are parsed without float arithmetic.** `4.4`, `4`, and `4.0` are all accepted; rounding
  is half-away-from-zero decided by the first fractional digit, so the same text always produces
  the same integer on every node. `4,5`, `4.5.6`, booleans, and words abort the evaluation.
- **Quotes must be grounded in the fetched text.** A quote that does not appear (after whitespace
  and case normalization) in the evidence the leader fetched is blanked and marked
  `quote_verified: false`, so an invented citation is never displayed as evidence.
- **Each fetched source is fingerprinted** (URL, fetch status, character count, and an FNV-1a 64
  fingerprint of the text) and stored with the proposal. This is leader output for audit, not
  consensus output: validators are only required to reproduce the funding decision, so the
  fingerprints are deliberately excluded from the equivalence comparison and are labelled as
  leader-run in the UI.

## Repo structure

```
contracts/aequa_grants.py             # main contract (21 methods: 8 view, 13 write)
tests/direct/                         # 100 direct mode tests (mock web + LLM)
tests/integration/                    # end-to-end suite against Studionet (+ adversarial wallet)
frontend/scripts/contract-smoke.mjs   # frontend SDK write/read smoke test
scripts/aequa.py                      # operator CLI (create/fund/submit/evaluate/disburse/confirm/recover)
scripts/deploy.py                     # deploy the contract with the key from .env
scripts/sync_wallet.py                # sync .env from the shared wallet folder
scripts/rubric.json                   # sample rubric used for the demo
docs/genlayer-research-and-architecture.md
gltest.config.yaml                    # default network: studionet
frontend/                             # Next.js 16 app (landing, rounds, proposals, admin)
```

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Keys are not stored in the repo. The shared wallet lives in `../wallet` (override with
`AEQUA_WALLET_DIR` or `--wallet-dir`), and `.env` is generated from it:

```bash
python scripts/sync_wallet.py
```

That script verifies that the private key actually produces the address recorded in
`wallet/address.txt` and `wallet/recipient.json`, then writes:

```
ACCOUNT_PRIVATE_KEY=<deployer/owner>
ACCOUNT_ADDRESS=<owner address>
APPLICANT_PRIVATE_KEY=<applicant>
APPLICANT_ADDRESS=<applicant address>
```

If you use a different wallet, fill in `.env` manually following `.env.example`.

## Running tests

```bash
# lint + contract validation
genvm-lint check contracts/aequa_grants.py

# 105 direct mode tests, ~8 seconds
python -m pytest

# end-to-end against Studionet (fresh deploy, create, fund, submit, evaluate, disburse)
gltest tests/integration -v -s --network studionet

# compact pass: every method once, adversarial guards folded in (~20 transactions)
gltest tests/integration/test_aequa_compact.py -v -s --network studionet

# full surface: every method, owner-only guards, payout/refund lifecycle,
# adversarial calls from a third wallet (deploys fresh unless attached)
gltest tests/integration/test_aequa_full_surface.py -v -s --network studionet

# frontend write path through genlayer-js (same payloads as the UI components)
cd frontend && node scripts/contract-smoke.mjs

# end-to-end against an already deployed contract (no new deploy)
$env:AEQUA_GRANTS_ADDRESS="0x883D589c8822CD932DAbD26578FD72cfe24b1D64"
gltest tests/integration -v -s --network studionet
```

Integration tests use a real LLM and real web fetches. Evaluation results can vary between runs, so
the tests accept either an `approved` or a `rejected` decision; what they validate is state
consistency (reserved/paid/available, stats deltas) and transaction execution. When attached to an
existing contract, the test only adds a new round and asserts that the numbers increase relative to
the previous state.

## Running the frontend

```bash
cd frontend
npm install
copy .env.example .env.local   # contract address + RPC + explorer
npm run dev                    # http://localhost:3000
npm run lint                   # eslint
npm run build                  # production build
```

### Deploying the frontend to Vercel

The Next.js app lives in `frontend/`, so set **Root Directory = `frontend`** in the Vercel project.
Framework preset: Next.js; build command and output stay at their defaults (`npm run build`).
Set these environment variables for Production (and Preview) before the first build:

| Variable | Example |
| --- | --- |
| `NEXT_PUBLIC_AEQUA_ADDRESS` | `0x7079fE0a3321442818705E85f45C04210eBE7832` |
| `NEXT_PUBLIC_RPC_URL` | `https://studio.genlayer.com/api` |
| `NEXT_PUBLIC_EXPLORER_URL` | `https://genlayer-explorer.vercel.app` |

Only `NEXT_PUBLIC_*` values are needed: reads go straight to the GenLayer RPC and writes are signed
by the visitor's wallet, so there is no server-side secret.

Available pages: `/` (landing with a live treasury and consensus), `/how-it-works` (how the process
works), `/rubric` (rubric and gates), `/consensus` (validator consensus model), `/rounds`,
`/rounds/[id]` (rubric, treasury, owner actions, proposal list), `/rounds/[id]/submit`,
`/proposals/[id]` (per-criterion scores, gates, evidence quotes, consensus reasoning), and `/admin`
(owner panel: stats, create/close rounds, rubric builder, contract pause).

Operational notes:

- All data is read straight from the contract; there is no backend. Wallets are discovered with
  EIP-6963 (MetaMask, Rabby, …) and the visitor picks one, so no extension overwrites another's
  `window.ethereum`; transactions are written through that selected provider via `genlayer-js`.
- Studionet limits **500 `gen_call` per hour**. Auto-refresh is deliberately kept at 60 seconds
  (20 seconds for proposals still `submitted`), inactive tabs stop polling, and transport failures
  are retried only once. Because 429 responses carry no CORS headers, the browser shows them as
  "Failed to fetch"; the UI maps that to an RPC limit message.
- An exhausted rate limit makes the page show an error panel with a retry button instead of fake
  data. Stat values become `—` while the query is failing.

## Deploy

```bash
python scripts/deploy.py
```

The deploy uses `ACCOUNT_PRIVATE_KEY` from `.env` (not the CLI keystore), waits for the receipt,
then prints the address, tx hash, `result_name`, and `get_stats()`.

## Demo through the CLI

The stock `genlayer write` always sends `value: 0` and strips quotes from JSON arguments in
PowerShell, so write to the contract through the Python helper:

```bash
# inspect all state
python scripts/aequa.py --contract 0x883D589c8822CD932DAbD26578FD72cfe24b1D64 list

# create a round (owner)
python scripts/aequa.py --contract 0x... create-round \
  --title "Documentation round" \
  --description "Developer documentation for the GenLayer ecosystem." \
  --budget 5 --max-grant 2 --min-score 50 \
  --deadline 2026-12-31T23:59:59Z

# fund the round (the GEN value is sent along)
python scripts/aequa.py --contract 0x... fund --round-id r0002 --gen 5

# submit a proposal as the applicant
python scripts/aequa.py --contract 0x... --key-env APPLICANT_PRIVATE_KEY submit \
  --round-id r0002 --title "Proposal title" \
  --summary "Summary of the plan and how the funds will be used." \
  --evidence https://example.com/public-evidence \
  --request 2

# AI evaluation (anyone can trigger it; wait 1-3 minutes)
python scripts/aequa.py --contract 0x... evaluate --proposal-id p00000002

# payout for an approved proposal (moves it to payout_pending)
python scripts/aequa.py --contract 0x... disburse --proposal-id p00000002

# reconcile the transfer: marks it paid once the balance shows the funds left
python scripts/aequa.py --contract 0x... confirm-payout --proposal-id p00000002

# if the transfer bounced: after the 1h grace period, return it for retry
python scripts/aequa.py --contract 0x... recover-payout --proposal-id p00000002

# close the round once it is done taking proposals and money
python scripts/aequa.py --contract 0x... close-round --round-id r0002

# each funder claims its own pro-rata share of what was not allocated
# (run this once per funder wallet; the amount comes from the deposit ledger)
python scripts/aequa.py --contract 0x... --key-env ACCOUNT_PRIVATE_KEY claim-refund --round-id r0002
```

You can also read state without the helper:

```bash
genlayer call 0x7079fE0a3321442818705E85f45C04210eBE7832 list_rounds
```

## Contract API

**Write (15, one payable)**

| Method | Who | Notes |
| --- | --- | --- |
| `create_round(title, description, rubric_json, budget, max_grant, min_score, deadline_iso)` | owner | `rubric_json` is a JSON string (optional `json:` prefix) |
| `fund_round(round_id)` | anyone | payable; adds to `funded_atto`, `total_received`, and the funder's deposit |
| `close_round(round_id)` | owner | closes the round to new proposals and funding; does not move money |
| `claim_refund(round_id)` | each funder | pull-based, no amount argument: emits the caller's pro-rata share and records a **pending** claim |
| `confirm_refund(round_id)` | anyone | permissionless; observes delivery, then settles `refunded_atto`/`claimed_atto` after the 90s settle window |
| `recover_refund(round_id)` | anyone | permissionless fallback; after 1h, discards an undelivered claim so the funder can claim again |
| `__on_errored_message__()` | GenVM | payable system hook: a bounced transfer returns its value here, releasing the refund claim and reversing an already-settled ledger credit |
| `submit_proposal(round_id, title, summary, evidence_urls, requested)` | anyone | 1 proposal per address per round |
| `evaluate_proposal(proposal_id)` | anyone | web + LLM + consensus; once per proposal |
| `disburse(proposal_id)` | owner / applicant | emits the GEN transfer and moves the proposal to `payout_pending` |
| `confirm_payout(proposal_id)` | anyone | permissionless; marks paid when the balance proves the transfer left |
| `recover_payout(proposal_id)` | anyone | permissionless; after 1h, returns a bounced payout for retry or releases the reservation |
| `reconcile_payout(proposal_id)` | anyone | permissionless; reverses a settled payout whose value is visibly back in the contract |
| `reconcile_refund(round_id)` | anyone | permissionless; reverses a settled refund whose value is visibly back in the contract |
| `set_paused(value)` | owner | stops new rounds, funding, and evaluation; payouts stay claimable |
| `transfer_ownership(new_owner)` | owner | change the admin |

**View (8)**

`get_stats()`, `get_round(round_id)`, `list_rounds()`, `list_round_proposals(round_id)`,
`get_proposal(proposal_id)`, `list_proposals()`, `get_refund(round_id, funder)`,
`list_round_funders(round_id)`. `get_refund` also reports `pending_atto`, `refund_state`
(`"sent"`, `"owed"` after a bounce, or empty), `refund_sent_at`, and `refund_attempts` so the UI can
tell "claimable", "sent but not confirmed" and "bounced, claim again" apart. `get_stats` reports
`bounced_refunds` and `bounced_atto` next to the in-flight counters, plus
`payout_in_flight_atto`, `refund_in_flight_atto` and `returned_surplus_atto` (value that came back
from a failed transfer and is not explained by funding minus the ledger).

`funder` in `get_refund` is a 0x-prefixed hex string (case-insensitive), so the ledger can be read
from the JS SDK without constructing calldata address objects. `list_round_funders` returns every
deposit in the round with its entitlement and what has already been claimed, which makes a refund
auditable by anyone.

The owner **cannot** approve a proposal unilaterally, and has **no function that moves money**:
the only outflows are `disburse`/`confirm_payout` for an approved proposal and
`claim_refund` to the funder that deposited. The only path to approved status is
`evaluate_proposal` passing consensus.

## Rubric format

`rubric_json` accepts a JSON string (not a dict) because the CLI/JS SDK turns dict arguments into
non-JSON strings. A full example is in `scripts/rubric.json`:

```json
{
  "criteria": [
    { "id": "impact", "weight": 30, "question": "How large is the demonstrated impact?" }
  ],
  "gates": [
    { "id": "public_evidence", "question": "Is the evidence publicly accessible?" }
  ]
}
```

- 1-8 criteria, integer positive weights, **weights must total 100**.
- 1-8 gates, all of which must be true for a proposal to be approved.
- Each criterion is scored 0-5; the total score is `sum(score * weight) / 5`, so 0-100.
- `min_score` is 0-100, and `max_grant` may not exceed `budget`.

## Limits and risks

- AI evaluation can be wrong, especially when evidence is thin or a gate is ambiguous. Gates
  disputed between models end in `UNDETERMINED` (no funds move) rather than a careless payment.
- Evidence is fetched only once during evaluation; a URL that changes afterwards can change the
  result.
- There is no identity verification: `applicant` is an address, and one address gets one proposal
  per round.
- Funds sit in the contract. Refunds are pull-based and pro-rata: a funder can take back only its
  own share of what was never allocated, only after the owner closes the round, and only once every
  proposal has a decision. The owner cannot withdraw community funds at all.
- Payout accounting lags reality until it is reconciled: `paid_atto` and `total_paid_atto` move in
  `confirm_payout`, not in `disburse`. A payout that is never confirmed stays `payout_pending`, and
  the UI shows that state instead of claiming payment.
- Refund accounting uses floor division, so up to one atto per funder of rounding dust stays in the
  contract. It is never sent to the owner or to the last claimer.
- A funder that loses its key can never recover its share: there is no owner override by design.
  The money stays in the contract rather than becoming withdrawable by someone else.
- `u256` is used as-is (atto/GEN, 18 decimals); formatting happens in the frontend
  (`lib/format.ts`).
- Studio rate-limits requests (`standard` bucket: 500 `gen_call`/hour, reset hourly); evaluation
  needs tens of seconds up to a few minutes.

## Next steps

1. Rubric version history per round (the rubric is currently immutable once a round is created).
2. An appeal window or re-evaluation after `UNDETERMINED`.
3. Airdrop / Investment DAO as separate modules (outside the Aequa Grants MVP).

# Aequa Grants — steward review notes

This file documents the review request we received, what was actually wrong, what changed, how it
is tested, and where to verify it on-chain.

| Item | Value |
| --- | --- |
| Project | Aequa Grants — AI-adjudicated grant rounds |
| Network | GenLayer StudioNet (`https://studio.genlayer.com/api`, chain id `61999`) |
| Contract under review | `0xBcbB12be1D8A9ccf8eDaD5F883668ecbb8B5A75e` |
| Repository | https://github.com/dhozil/aequa |
| Source | [`contracts/aequa_grants.py`](contracts/aequa_grants.py) on `main` (`107b586`) — the file the deployed bytecode was built from |
| Runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` (pinned) |
| Commits with the fix | `cfd79de`, `b434cec`, `6114e14`, `f48361a`, `ae65e6a`, `107b586` |

## 1. The review request

> Please make payout reconciliation bounce-safe so a temporary child-transfer debit cannot be
> finalized as delivered without a later-bounce reversal, and prevent payouts from starting while a
> refund transfer is unresolved. Add focused tests for early payout confirmation followed by a bounce
> and for attempted payout/refund overlap, then link the corrected source for verification.

We read this as four separate obligations:

1. A payout must not become `paid` from a single observation of the balance.
2. If a payout is confirmed and its child transfer later bounces, the settlement must be reversible.
3. `disburse` must not start while a refund transfer could still bounce.
4. Focused tests for both scenarios, plus a link to the corrected source.

## 2. What was wrong before

`confirm_payout` settled the grant on the first balance reading that looked like the money had left:

```python
if not self._payout_delivered(proposal):
    return PAYOUT_SENT
# settled immediately
```

A failing child transfer debits its value before handing it back, so that first reading is not proof
of delivery. The only reversal path was `recover_payout`, which refuses once the proposal is `paid`,
and an optional `__on_errored_message__` hook.

`disburse` refused a second payout while one was in flight (`payout_in_flight`) but never looked at
`refund_in_flight`, so a payout could start while a refund transfer was still unresolved.

## 3. Why the bounce hook alone is not enough

`__on_errored_message__` was the obvious reversal mechanism, and the previous version relied on it. We
checked it against the live deployment before trusting it:

| Check | Result |
| --- | --- |
| Current GenLayer docs "Special Methods" | Only `__handle_undefined_method__` and `__receive__`; the hook is not documented |
| Current SDK (v0.3.x) `Contract` base class | No `__on_errored_message__` (it exists in v0.1.4) |
| Docs "Value Transfers" | "If the child transaction fails, the value is not automatically returned to the sender" |
| `genlayer schema` of the deployed contract | The hook is **not** in the ABI, so no external caller can invoke it |
| `get_stats` on the previous deployment `0x2489Af…e5e6` | `balance 11 GEN`, ledger accounts for `8 GEN`, `bounced_refunds = 0` |

The last row is the important one: three GEN of failed child transfers had already returned to the
contract while the hook had never been dispatched. A reversal that waits for `__on_errored_message__`
is a reversal that never happens on StudioNet.

The returned value is still observable, because a bounced transfer raises the contract balance
without raising `total_received`. Every payable entry point in this contract records its value
(`fund_round`, and the hook if it ever fires), and there is no `__receive__`, so an unexplained
balance surplus can only be a returned transfer:

```text
expected = total_received - total_paid - total_refunded
           - payout_in_flight_atto - refund_in_flight_atto
surplus  = max(0, balance - expected)
```

This is the mechanism the fix now depends on. The hook is kept as a fast path, but nothing depends
on it firing.

## 4. What changed in the contract

### 4.1 Payouts are settled after a window, not on one reading

`confirm_payout` now does two steps:

1. First call that sees a delivery-shaped balance records `payout_observed_at` and returns `sent`.
2. Only a later call, at least `PAYOUT_SETTLE_SECONDS = 90` after that observation, with the balance
   still down, moves the reservation to `paid`. A reading that goes back up clears the observation.

`get_proposal` exposes `payout_observed_at`, `payout_confirm_after` and `payout_settle_seconds`, and
the frontend shows "Delivery observed — confirm again in Ns" instead of reporting a failure.

### 4.2 A settled payout is still reversible

`disburse` records a watch entry (`payout_watch_atto` / `payout_watch_at`, keyed by proposal, pruned
on expiry, capped at `MAX_PAYOUT_WATCH = 8`). The entry survives `confirm_payout`.

`reconcile_payout(proposal_id)` — callable only by the applicant — checks the surplus above. If it
covers the watched amount, it reverses the settlement:

- `round.paid_atto` goes back down, `round.reserved_atto` goes back up,
- `total_paid` drops and `total_reserved` rises (fund conservation is preserved),
- `proposal.paid_atto` returns to 0, status returns to `payout_pending`, state to `owed`,
- the watch entry is removed, so one bounce can never reverse two settlements,
- `bounced_payouts` / `bounced_payout_atto` record the event.

The grant can then be disbursed again on the same reservation, without a new approval.

The restriction to the applicant is deliberate, and it came out of the on-chain drill in section 5b:
a plain GEN transfer to the contract raises the same balance a returned transfer would, so the
surplus alone can be forged. Because only the applicant can assert that their own payout did not
arrive, a third party can no longer donate the amount and force someone else's payment back to
`owed`. `reconcile_refund` is restricted the same way, to the funder whose claim is pending.

`__on_errored_message__` calls the same `_reverse_payout` helper when the runtime does dispatch it,
so both paths share one implementation.

### 4.3 Payouts wait for refunds

`disburse` now refuses while `refund_in_flight > 0`:

```text
a refund is awaiting reconciliation; confirm or recover it before paying out
```

`claim_refund` already refused while a payout was in flight, so the two outbound legs are strictly
sequential: reconcile one, then the other. The refund leg has the matching reversal —
`reconcile_refund(round_id)` — so a returned refund does not block payouts for the full one-hour
recovery window.

### 4.4 Accounting

To make the surplus check exact, the contract tracks the value currently held in a child transfer per
leg: `payout_in_flight_atto` and `refund_in_flight_atto`. They move with every emit, settle, recover
and reversal. `get_stats` reports both, plus `returned_surplus_atto`, next to the existing counters.

## 5. Tests

`python -m pytest tests/direct -q` → **116 passed**.

The focused cases the review asked for:

| Test | What it proves |
| --- | --- |
| `test_confirm_payout_after_the_balance_drops` | the first call only records an observation; `paid` requires the settle window |
| `test_a_settle_observation_is_forgotten_when_the_value_returns` | a temporary debit that comes back clears the observation |
| `test_an_early_confirmation_is_reversed_when_the_transfer_bounces` | **early confirmation followed by a bounce**: `paid → payout_pending/owed`, `paid 0`, `reserved 100`, `bounced_payouts 1`, retry allowed |
| `test_a_confirmed_payout_is_reversed_when_the_value_returns` | same reversal through the balance surplus, with no hook at all |
| `test_a_bounce_is_reversed_even_after_another_payout_started` | the watch set does not lose an earlier settled payout |
| `test_reconcile_payout_refuses_without_a_returned_transfer` | a real delivery cannot be reversed by calling reconcile |
| `test_reconcile_payout_refuses_while_the_transfer_is_in_flight` | in-flight transfers stay with `recover_payout` |
| `test_payout_cannot_start_while_a_refund_is_unresolved` | **payout/refund overlap**: refused, then allowed once the refund is reconciled |
| `test_reconcile_refund_releases_a_settled_claim_whose_value_returned` | a returned refund is undone and stops blocking the payout |
| `test_refund_blocked_while_a_payout_is_unreconciled` | the opposite direction of the same rule |

Supporting refund tests live in `tests/direct/test_rounds.py` (settle window, bounce, grace period,
unrelated value).

`genvm-lint check contracts/aequa_grants.py` → lint and validation pass; contract `AequaGrants`,
23 methods (8 view, 15 write). The hook is not counted, matching its absence from the ABI.

## 5b. On-chain drill (StudioNet)

A throwaway instance was deployed to replay the two scenarios with real transactions:
`0x0aE0139DBD00DB704Ac27Eb45492FD1A73a33Ae8`, with a sink contract
(`0xaa5c7cbEb2AA514F2F1b918c017ED209BfCf1e81`, `tests/integration/bounce_sink.py`) as the applicant.
Raw output: [`docs/bounce-drill.json`](docs/bounce-drill.json).

| Step | Hash | Outcome |
| --- | --- | --- |
| `create_round` `r0003` | `0xf06eb83c2c2958522f4c80be6681388deb790d7131df37da114a616380fa7903` | `MAJORITY_AGREE` |
| `fund_round` 1 GEN | `0x4625fbddfd6a398c023c96a52da03228fc746da60a67a0b5eb364cd971c476b6` | `MAJORITY_AGREE` |
| sink submits proposal | `0x2ef8b05b112f58a155f928ef90f344c203bd120f2e8e688cf3bd7e7280ff3543` | `p00000003`, applicant = sink |
| `evaluate_proposal` | `0xfbcfedb38009cede221a72c93eb31b5599a6882c7b70504933ce04e274b72184` | approved, score 94, all gates true |
| `close_round` | `0x647f2d21a0a99434be2e2ef1c05fcbcaad804bb897f6a16f310d3077f0176a68` | `MAJORITY_AGREE` |
| `claim_refund` (owner) | `0x58054e501e8faad7a08c3db460e30af56b9358b2de8b5d8099d757b4ae9a482c` | pending 0.5 GEN, `refund_state = sent` |
| **`disburse` during the refund** | `0x3d14c45fff4f6889ab122f5e6a9194479b95c8ebee0f09838f7cb5f4214e30cb` | **refused**: `[EXPECTED] a refund is awaiting reconciliation; confirm or recover it before paying out` |
| `confirm_refund` (observation) | `0xfe9490d0a28fb4d66af43059c4a0613156da731753e7aebaa8a6f2de8519e1ca` | no ledger move |
| `confirm_refund` (settle) | `0x5e3e785b64ca6c9d7d00944706000161c360b60e9c7e60066ddf2baadbdbf156` | claimed 0.5 GEN, `refund_in_flight = 0` |
| `disburse` after the refund | `0x295c82b98088e4df9bb52fd7232e2e668a3b1a24eb9d4eeb2e2f0d481c853909` | `payout_pending` / `sent` |
| `confirm_payout` (first) | `0x6518d5313ce2b98020353b205b60f6bca79cc291906938c963d602c6ba78d0f8` | status still `payout_pending`, `payout_observed_at` set, `payout_confirm_after` +90s |
| `confirm_payout` (settle) | `0xcac450bcaca0ee6dee11e87a98bfd8a41b68813e5458011db98c85103def06ba` | `paid`, `paid_atto = 0.5 GEN` |
| `reconcile_payout` after a real delivery | `0xe73dd36a90044626b9b72eeaf4896114ea50dfbf3c574fa59a4719b93e1c8214` | refused: `[EXPECTED] no returned transfer covers this payout` |

What this proves on-chain:

1. **Payout/refund overlap is enforced by the deployed contract**, with the exact rejection the
   steward asked for, and the payout becomes possible once the refund is settled.
2. **One confirmation no longer settles a payout.** The first call recorded the observation and left
   the grant in `payout_pending`; only the call after the settle window moved it to `paid`.
3. The transfer to the sink **landed anyway**, even though the sink has no payable method, so the
   runner credits plain value transfers to contracts. A bounce therefore cannot be forced from
   outside, and the reversal branch (settled → bounce → `reconcile_payout`) remains covered by the
   direct tests rather than by a live transaction.
4. The drill also exposed a flaw the first design missed: **a bare GEN transfer counts as returned
   value**. Nothing in the contract can intercept a plain transfer on this runner (it has no
   `__receive__`), so `balance - accounted` rises exactly like a bounced child transfer.
   `scripts/donation_probe.py` sends 0.001 GEN with no calldata,
   tx `0xf0345517a1d9e97fd06275bdfc98e17bb99770a27941487db7d7f7146cc11246` (FINALIZED), and
   `returned_surplus_atto` moves from 0.004 to 0.005 GEN — the same ledger field `reconcile_payout`
   reads (the script is repeatable: each run adds its own amount); raw output in [`docs/donation-probe.json`](docs/donation-probe.json). On this pre-fix
   instance `reconcile_payout` refused only because 0.001 GEN did not cover the 0.5 GEN payout:
   a donation of the full amount would have forced a real payment back to `owed`. That is why
   reconciliation is now restricted to
   the beneficiary and covered by `test_a_donation_cannot_force_a_settled_payout_back` and its
   refund twin.

The drill instance was deployed before that restriction, so it still runs the earlier permissionless
version; the main deployment below includes the fix.

## 6. Deployment and transactions

| Step | Hash | Result | Explorer |
| --- | --- | --- | --- |
| Deploy | `0xd16e80965b68687c6dc3d74b23e5d21e6a84e88b795e0db160db407c428448fb` | `MAJORITY_AGREE` | https://explorer-studio.genlayer.com/tx/0xd16e80965b68687c6dc3d74b23e5d21e6a84e88b795e0db160db407c428448fb |
| `create_round` (`r0001`) | `0x2c9bf00e8c983f39f07f3746bf2e8b57fb879dc0bf9be9ad881de786da188bb2` | returned `"r0001"` | https://explorer-studio.genlayer.com/tx/0x2c9bf00e8c983f39f07f3746bf2e8b57fb879dc0bf9be9ad881de786da188bb2 |
| `fund_round` (5 GEN) | `0xb859b4e27bc31bbd4c747fde4d848418fc341b3f56dd5246ee14b206c3f9c942` | `value 5e18` | https://explorer-studio.genlayer.com/tx/0xb859b4e27bc31bbd4c747fde4d848418fc341b3f56dd5246ee14b206c3f9c942 |

Contract page:
https://explorer-studio.genlayer.com/address/0xBcbB12be1D8A9ccf8eDaD5F883668ecbb8B5A75e

All three transactions are `FINALIZED`. The deploy receipt reports `MAJORITY_AGREE` and the
contract address above; `create_round` returned `"r0001"`; the `fund_round` receipt carries
`value: 5000000000000000000n`.

Previous deployment (evidence for section 3):
https://explorer-studio.genlayer.com/address/0x2489Af08c51C8346F4362d3D1e4C6c63a6E1E5e6

## 7. How to verify

Read the current state (no wallet, no transaction):

```bash
genlayer call 0xBcbB12be1D8A9ccf8eDaD5F883668ecbb8B5A75e get_stats
genlayer call 0xBcbB12be1D8A9ccf8eDaD5F883668ecbb8B5A75e get_round --args r0001
genlayer schema 0xBcbB12be1D8A9ccf8eDaD5F883668ecbb8B5A75e | grep -E "reconcile_|confirm_payout"
```

`get_stats` on the fresh deployment reports `total_received_atto = 5000000000000000000`,
`balance_atto = 5000000000000000000`, `returned_surplus_atto = "0"` — the invariant holds with a
funded, open round and no transfers in flight.

### Confirm the deployed source *is* the corrected source

GenLayer stores source, not bytecode, and the deploy transaction carries it: `data.contract_code`
is the base64 of the exact file that was deployed. Decoding it and diffing against this repository
answers "is the live contract the fixed one" without trusting a timestamp:

```bash
python - <<'PY'
import base64, pathlib, requests
rpc = "https://studio.genlayer.com/api"
h = "0xd16e80965b68687c6dc3d74b23e5d21e6a84e88b795e0db160db407c428448fb"
tx = requests.post(rpc, json={"jsonrpc": "2.0", "id": 1, "method": "eth_getTransactionByHash",
                              "params": [h]}, timeout=30).json()["result"]
live = base64.b64decode(tx["data"]["contract_code"]).replace(b"\r\n", b"\n")
repo = pathlib.Path("contracts/aequa_grants.py").read_bytes().replace(b"\r\n", b"\n")
print("identical:", live == repo)
print("applicant check:", b"only the applicant can report that a payout did not arrive" in live)
print("funder check:", b"only the funder of this claim can report that it did not arrive" in live)
print("overlap guard:", b"a refund is awaiting reconciliation" in live)
PY
```

Result against the deployment in section 6: `identical: True`, `applicant check: True`,
`funder check: True`, `overlap guard: True` (78 443 bytes, same as the repository file apart from
line endings). The deploy block is `2026-10-30T03:00:59Z`, later than every commit touching the
contract, and the working tree at `8c20a20` is clean.

To exercise the bounce path itself, the contract needs a child transfer that fails. That cannot be
forced from the outside, so the reversal path is covered by the direct-mode tests above rather than
by a live transaction. Once a transfer does fail, the sequence is:

```bash
# after a payout was settled and its value came back
python scripts/aequa.py --contract 0xBcbB12be1D8A9ccf8eDaD5F883668ecbb8B5A75e \
  --key-env APPLICANT_PRIVATE_KEY reconcile-payout --proposal-id p00000001

# after a refund was settled and its value came back
python scripts/aequa.py --contract 0xBcbB12be1D8A9ccf8eDaD5F883668ecbb8B5A75e \
  --key-env ACCOUNT_PRIVATE_KEY reconcile-refund --round-id r0001
```

Both refuse when `returned_surplus_atto` is smaller than the watched amount, and both must be called by
the beneficiary (the applicant, or the funder whose claim is pending). Together that means a delivery
that actually happened cannot be reversed, and a third party cannot force a reversal with a donation.

## 8. Known limits

- **Amount ambiguity in the hook.** `gl.message.value` carries the returned value but not the
  recipient. If two watched payouts share an amount, the hook path reverses a settled record first
  and the most recent record otherwise. Balance-based reconciliation is caller-directed, one
  transfer per call.
- **Reconcile only handles settled transfers.** While a transfer is in flight the money has not been
  recorded as paid, and `recover_payout` / `recover_refund` keep owning that case (one-hour grace).
- **A beneficiary can still claim non-receipt falsely.** If a payout really arrived and the applicant
  reports otherwise, the contract cannot prove it; the claim is attributable on-chain and auditable
  on the explorer, which is the limit of what this runtime allows. Third parties cannot do it.
- **No live bounce.** The rejecting sink in 5b still received the value (the runner credits plain
  transfers to contracts), so the settled → bounce → reconcile branch is verified by the 116
  direct-mode tests, not by a transaction. The deploy, the seeded round, the payout/refund overlap
  rejection and the forged-surplus rejection are verified on-chain.
- **Frontend environment.** The Vercel project must set
  `NEXT_PUBLIC_AEQUA_ADDRESS=0xBcbB12be1D8A9ccf8eDaD5F883668ecbb8B5A75e` and redeploy. The local
  `frontend/.env.local` is already updated.

## 9. File map

| File | Role |
| --- | --- |
| `contracts/aequa_grants.py` | contract; payout/refund reconciliation, `reconcile_payout`, `reconcile_refund` |
| `tests/direct/test_payout.py` | payout lifecycle, settle window, bounce reversal, payout/refund overlap |
| `tests/direct/test_rounds.py` | refund reconciliation, settle window, bounce handling |
| `tests/direct/conftest.py` | direct-mode fixtures (`deliver_payout`, `deliver_refund`) |
| `tests/integration/test_aequa_full_surface.py` | on-chain suite (waits for the settle window) |
| `scripts/aequa.py` | operator CLI, including `reconcile-payout` / `reconcile-refund` |
| `scripts/bounce_drill.py` | on-chain drill runner used for section 5b |
| `tests/integration/bounce_sink.py` | recipient that rejects transfers, used as the drill applicant |
| `docs/bounce-drill.json` | raw receipts and state transitions from the drill |
| `scripts/donation_probe.py` | sends a bare transfer and shows the surplus it forges (`docs/donation-probe.json`) |
| `README.md` | architecture, payout lifecycle, deployment |
| `frontend/components/proposals/proposal-actions.tsx` | UI for the two-step confirmation |

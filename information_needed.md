# Aequa Grants — steward review notes

This file documents the review request we received, what was actually wrong, what changed, how it
is tested, and where to verify it on-chain.

| Item | Value |
| --- | --- |
| Project | Aequa Grants — AI-adjudicated grant rounds |
| Network | GenLayer StudioNet (`https://studio.genlayer.com/api`, chain id `61999`) |
| Contract under review | `0x7079fE0a3321442818705E85f45C04210eBE7832` |
| Repository | https://github.com/dhozil/aequa |
| Source | [`contracts/aequa_grants.py`](contracts/aequa_grants.py) |
| Runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` (pinned) |
| Commits with the fix | `cfd79de`, `b434cec`, `6114e14`, `f48361a` |

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

`reconcile_payout(proposal_id)` — permissionless — checks the surplus above. If it covers the
watched amount, it reverses the settlement:

- `round.paid_atto` goes back down, `round.reserved_atto` goes back up,
- `total_paid` drops and `total_reserved` rises (fund conservation is preserved),
- `proposal.paid_atto` returns to 0, status returns to `payout_pending`, state to `owed`,
- the watch entry is removed, so one bounce can never reverse two settlements,
- `bounced_payouts` / `bounced_payout_atto` record the event.

The grant can then be disbursed again on the same reservation, without a new approval.

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

`python -m pytest tests/direct -q` → **114 passed**.

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

## 6. Deployment and transactions

| Step | Hash | Result | Explorer |
| --- | --- | --- | --- |
| Deploy | `0x7cc0c98d69ffff8ad700a179353165e473fb4550a0ee8a5328ccca6737517385` | `MAJORITY_AGREE` | https://explorer-studio.genlayer.com/tx/0x7cc0c98d69ffff8ad700a179353165e473fb4550a0ee8a5328ccca6737517385 |
| `create_round` (`r0001`) | `0x54c626afd96bea3f78f5eb49cb2e8ec616b1a553cd4beb48ff97a24e8a80d353` | returned `"r0001"` | https://explorer-studio.genlayer.com/tx/0x54c626afd96bea3f78f5eb49cb2e8ec616b1a553cd4beb48ff97a24e8a80d353 |
| `fund_round` (5 GEN) | `0x5732dc390545293225668706f330f08d881e0b7591fc48ea75880d13c83a1310` | `value 5e18` | https://explorer-studio.genlayer.com/tx/0x5732dc390545293225668706f330f08d881e0b7591fc48ea75880d13c83a1310 |

Contract page:
https://explorer-studio.genlayer.com/address/0x7079fE0a3321442818705E85f45C04210eBE7832

All three transactions are `FINALIZED`. The deploy receipt reports `MAJORITY_AGREE` and the
contract address above; `create_round` returned `"r0001"`; the `fund_round` receipt carries
`value: 5000000000000000000n`.

Previous deployment (evidence for section 3):
https://explorer-studio.genlayer.com/address/0x2489Af08c51C8346F4362d3D1e4C6c63a6E1E5e6

## 7. How to verify

Read the current state (no wallet, no transaction):

```bash
genlayer call 0x7079fE0a3321442818705E85f45C04210eBE7832 get_stats
genlayer call 0x7079fE0a3321442818705E85f45C04210eBE7832 get_round --args r0001
genlayer schema 0x7079fE0a3321442818705E85f45C04210eBE7832 | grep -E "reconcile_|confirm_payout"
```

`get_stats` on the fresh deployment reports `total_received_atto = 5000000000000000000`,
`balance_atto = 5000000000000000000`, `returned_surplus_atto = "0"` — the invariant holds with a
funded, open round and no transfers in flight.

To exercise the bounce path itself, the contract needs a child transfer that fails. That cannot be
forced from the outside, so the reversal path is covered by the direct-mode tests above rather than
by a live transaction. Once a transfer does fail, the sequence is:

```bash
# after a payout was settled and its value came back
python scripts/aequa.py --contract 0x7079… --key-env ACCOUNT_PRIVATE_KEY \
  reconcile-payout --proposal-id p00000001

# after a refund was settled and its value came back
python scripts/aequa.py --contract 0x7079… --key-env ACCOUNT_PRIVATE_KEY \
  reconcile-refund --round-id r0001
```

Both refuse when `returned_surplus_atto` is smaller than the watched amount, so they cannot reverse a
delivery that actually happened.

## 8. Known limits

- **Amount ambiguity in the hook.** `gl.message.value` carries the returned value but not the
  recipient. If two watched payouts share an amount, the hook path reverses a settled record first
  and the most recent record otherwise. Balance-based reconciliation is caller-directed, one
  transfer per call.
- **Reconcile only handles settled transfers.** While a transfer is in flight the money has not been
  recorded as paid, and `recover_payout` / `recover_refund` keep owning that case (one-hour grace).
- **No live bounce test yet.** The deployment, the seeded round and the clean surplus invariant are
  verified on-chain; the reversal branch is verified by 114 direct-mode tests.
- **Frontend environment.** The Vercel project must set
  `NEXT_PUBLIC_AEQUA_ADDRESS=0x7079fE0a3321442818705E85f45C04210eBE7832` and redeploy. The local
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
| `README.md` | architecture, payout lifecycle, deployment |
| `frontend/components/proposals/proposal-actions.tsx` | UI for the two-step confirmation |

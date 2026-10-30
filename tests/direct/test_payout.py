"""Payout lifecycle: approved -> payout_pending -> paid.

Direct mode never credits `self.balance` when `fund_round` receives value, so
the tests that need delivery reconciliation deal the contract's balance by hand
(`_credit`). That mirrors what the host does on a live network: the contract
holds the GEN that was funded into it, and a delivered child transfer lowers
that balance.
"""

from conftest import EVIDENCE_TEXT, llm_payload

GRACE = 3600
# The fixtures warp the clock to this instant, so one grace period later is:
AFTER_GRACE = "2026-01-01T01:00:01Z"
AFTER_TWO_GRACES = "2026-01-01T02:00:02Z"
AFTER_THREE_GRACES = "2026-01-01T03:00:03Z"


def _approved(funded_round, grants, submit, direct_vm, direct_alice, requested=100):
    proposal_id = submit(funded_round, direct_alice, requested=requested)
    direct_vm.mock_web(
        r"https://example\.com/proposal",
        {"status": 200, "body": EVIDENCE_TEXT},
    )
    direct_vm.mock_llm(r"(?s).*independent grant evaluator.*", llm_payload())
    grants.evaluate_proposal(proposal_id)
    return proposal_id


def _credit(direct_vm, amount):
    direct_vm.deal(direct_vm._contract_address, amount)


def _disburse(grants, direct_vm, proposal_id, sender):
    direct_vm.sender = sender
    grants.disburse(proposal_id)


def test_disburse_records_a_pending_payout_not_a_payment(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)

    _disburse(grants, direct_vm, proposal_id, direct_alice)

    data = grants.get_proposal(proposal_id)
    # The child transaction has been created, not resolved: nothing is paid yet.
    assert data["status"] == "payout_pending"
    assert data["payout_state"] == "sent"
    assert data["payout_attempts"] == 1
    assert data["paid_atto"] == "0"

    round_data = grants.get_round(funded_round)
    assert round_data["reserved_atto"] == "100"
    assert round_data["paid_atto"] == "0"
    assert round_data["available_atto"] == "900"

    stats = grants.get_stats()
    assert stats["total_paid_atto"] == "0"
    assert stats["total_reserved_atto"] == "100"
    assert stats["payout_in_flight"] == 1


def test_confirm_payout_after_the_balance_drops(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)

    # A bouncing child transfer debits its value first, so one low reading is
    # only an observation: the ledger must not move yet.
    _credit(direct_vm, 900)  # the child transfer delivered 100
    assert grants.confirm_payout(proposal_id) == "sent"
    observed = grants.get_proposal(proposal_id)
    assert observed["status"] == "payout_pending"
    assert observed["paid_atto"] == "0"
    assert observed["payout_observed_at"] > 0
    assert observed["payout_confirm_after"] == (
        observed["payout_observed_at"] + observed["payout_settle_seconds"]
    )

    # Still inside the window: nothing is recorded.
    assert grants.confirm_payout(proposal_id) == "sent"
    assert grants.get_proposal(proposal_id)["status"] == "payout_pending"

    direct_vm.warp("2026-01-01T00:05:00Z")
    assert grants.confirm_payout(proposal_id) == "delivered"

    data = grants.get_proposal(proposal_id)
    assert data["status"] == "paid"
    assert data["paid_atto"] == "100"
    assert data["payout_state"] == "delivered"

    round_data = grants.get_round(funded_round)
    assert round_data["reserved_atto"] == "0"
    assert round_data["paid_atto"] == "100"
    assert round_data["available_atto"] == "900"

    stats = grants.get_stats()
    assert stats["total_reserved_atto"] == "0"
    assert stats["total_paid_atto"] == "100"
    assert stats["payout_in_flight"] == 0


def test_confirm_is_a_noop_while_the_transfer_is_unresolved(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)

    # Balance unchanged: either still in flight or bounced. Never mark it paid.
    assert grants.confirm_payout(proposal_id) == "sent"
    data = grants.get_proposal(proposal_id)
    assert data["status"] == "payout_pending"
    assert data["paid_atto"] == "0"
    assert grants.get_stats()["total_paid_atto"] == "0"


def test_confirm_is_idempotent(
    funded_round, grants, submit, direct_vm, direct_alice, deliver_payout
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)

    deliver_payout(proposal_id, held=1000, amount=100)

    assert grants.confirm_payout(proposal_id) == "delivered"
    assert grants.get_stats()["total_paid_atto"] == "100"


def test_owner_can_disburse_on_behalf(
    funded_round, grants, submit, direct_vm, direct_alice, direct_owner
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)

    direct_vm.sender = direct_owner
    grants.disburse(proposal_id)
    assert grants.get_proposal(proposal_id)["status"] == "payout_pending"


def test_third_party_cannot_disburse(
    funded_round, grants, submit, direct_vm, direct_alice, direct_bob
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only the owner or applicant"):
        grants.disburse(proposal_id)


def test_cannot_disburse_twice(funded_round, grants, submit, direct_vm, direct_alice):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)
    _credit(direct_vm, 900)
    grants.confirm_payout(proposal_id)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("not approved"):
        grants.disburse(proposal_id)


def test_cannot_disburse_before_approval(funded_round, grants, submit, direct_vm, direct_alice):
    proposal_id = submit(funded_round, direct_alice)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("not approved"):
        grants.disburse(proposal_id)


def test_only_one_payout_can_be_in_flight(
    funded_round, grants, submit, direct_vm, direct_alice, direct_bob
):
    first = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    second = submit(funded_round, direct_bob, requested=100)
    direct_vm.mock_web(
        r"https://example\.com/proposal",
        {"status": 200, "body": EVIDENCE_TEXT},
    )
    direct_vm.mock_llm(r"(?s).*independent grant evaluator.*", llm_payload())
    grants.evaluate_proposal(second)
    _credit(direct_vm, 1000)

    _disburse(grants, direct_vm, first, direct_alice)

    direct_vm.sender = direct_bob
    # A second outbound transfer would make the shared balance impossible to
    # attribute to either payout, so it is refused rather than queued.
    with direct_vm.expect_revert("another payout is awaiting reconciliation"):
        grants.disburse(second)


def test_recover_requires_the_grace_period(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)

    with direct_vm.expect_revert("before recovering"):
        grants.recover_payout(proposal_id)


def test_recover_returns_a_bounced_payout_for_retry(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)

    direct_vm.warp(AFTER_GRACE)
    assert grants.recover_payout(proposal_id) == "owed"

    data = grants.get_proposal(proposal_id)
    assert data["status"] == "payout_pending"
    assert data["payout_state"] == "owed"
    # The reservation is still held: the money came back and is still owed.
    assert grants.get_round(funded_round)["reserved_atto"] == "100"
    assert grants.get_stats()["payout_in_flight"] == 0

    # Retry, then deliver.
    _disburse(grants, direct_vm, proposal_id, direct_alice)
    assert grants.get_proposal(proposal_id)["payout_attempts"] == 2
    _credit(direct_vm, 900)
    assert grants.confirm_payout(proposal_id) == "sent"
    direct_vm.warp("2026-01-01T01:05:00Z")
    assert grants.confirm_payout(proposal_id) == "delivered"
    assert grants.get_proposal(proposal_id)["status"] == "paid"


def test_recover_refuses_when_the_payout_was_delivered(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)
    _credit(direct_vm, 900)

    direct_vm.warp(AFTER_GRACE)
    with direct_vm.expect_revert("confirm_payout instead"):
        grants.recover_payout(proposal_id)


def test_repeated_failures_release_the_reservation(
    funded_round, grants, submit, direct_vm, direct_alice, direct_owner, direct_bob
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)

    for moment in (AFTER_GRACE, AFTER_TWO_GRACES, AFTER_THREE_GRACES):
        _disburse(grants, direct_vm, proposal_id, direct_alice)
        direct_vm.warp(moment)
        outcome = grants.recover_payout(proposal_id)

    # Third failure: the address cannot receive GEN, so the grant stops holding
    # community funds hostage and the reservation goes back to the round.
    assert outcome == "payout_failed"
    data = grants.get_proposal(proposal_id)
    assert data["status"] == "payout_failed"
    assert data["decision_reason"] == "payout_failed"
    assert data["paid_atto"] == "0"

    round_data = grants.get_round(funded_round)
    assert round_data["reserved_atto"] == "0"
    assert round_data["available_atto"] == "1000"
    assert grants.get_stats()["total_reserved_atto"] == "0"

    # The released funds are usable again: the funder can take them back.
    direct_vm.sender = direct_owner
    grants.close_round(funded_round)
    direct_vm.sender = direct_bob
    grants.claim_refund(funded_round)
    _credit(direct_vm, 0)  # the refund child transfer delivered the full pool
    assert grants.confirm_refund(funded_round) == "sent"  # observation
    direct_vm.warp("2026-01-01T03:05:00Z")
    assert grants.confirm_refund(funded_round) == "delivered"
    assert grants.get_round(funded_round)["available_atto"] == "0"
    assert grants.get_round(funded_round)["refunded_atto"] == "1000"


def test_payouts_still_work_while_paused(
    funded_round, grants, submit, direct_vm, direct_alice, direct_owner, deliver_payout
):
    """Pausing stops new work, but never traps an approved payout."""
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    direct_vm.sender = direct_owner
    grants.set_paused(True)

    _disburse(grants, direct_vm, proposal_id, direct_alice)
    deliver_payout(proposal_id, held=1000, amount=100)
    assert grants.get_proposal(proposal_id)["status"] == "paid"


def test_refund_blocked_while_a_payout_is_unreconciled(
    funded_round, grants, submit, direct_vm, direct_alice, direct_owner, direct_bob
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)

    direct_vm.sender = direct_owner
    grants.close_round(funded_round)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("awaiting reconciliation"):
        grants.claim_refund(funded_round)


def test_a_settle_observation_is_forgotten_when_the_value_returns(
    funded_round, grants, submit, direct_vm, direct_alice
):
    """A debit that turns out to be temporary must not survive as an observation."""
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)

    _credit(direct_vm, 900)  # looks delivered
    assert grants.confirm_payout(proposal_id) == "sent"
    assert grants.get_proposal(proposal_id)["payout_observed_at"] > 0

    _credit(direct_vm, 1000)  # the value came back
    assert grants.confirm_payout(proposal_id) == "sent"
    data = grants.get_proposal(proposal_id)
    assert data["payout_observed_at"] == 0
    assert data["status"] == "payout_pending"
    assert data["paid_atto"] == "0"
    assert grants.get_stats()["payout_in_flight"] == 1


def test_an_early_confirmation_is_reversed_when_the_transfer_bounces(
    funded_round, grants, submit, direct_vm, direct_alice, deliver_payout
):
    """Confirm first, learn about the bounce later: the settlement must not stand."""
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)
    deliver_payout(proposal_id, held=1000, amount=100)

    assert grants.get_proposal(proposal_id)["status"] == "paid"
    assert grants.get_round(funded_round)["paid_atto"] == "100"

    # The network reports that the child transfer failed and its value came back.
    _credit(direct_vm, 1000)
    direct_vm.value = 100
    grants.__on_errored_message__()
    direct_vm.value = 0

    data = grants.get_proposal(proposal_id)
    assert data["status"] == "payout_pending"
    assert data["payout_state"] == "owed"
    assert data["paid_atto"] == "0"

    round_data = grants.get_round(funded_round)
    assert round_data["paid_atto"] == "0"
    assert round_data["reserved_atto"] == "100"
    assert round_data["available_atto"] == "900"

    stats = grants.get_stats()
    assert stats["total_paid_atto"] == "0"
    assert stats["total_reserved_atto"] == "100"
    assert stats["payout_in_flight"] == 0
    assert stats["bounced_payouts"] == 1
    assert stats["bounced_payout_atto"] == "100"

    # The grant is payable again on the same reservation.
    _disburse(grants, direct_vm, proposal_id, direct_alice)
    assert grants.get_proposal(proposal_id)["payout_attempts"] == 2


def test_a_bounce_is_reversed_even_after_another_payout_started(
    funded_round, grants, submit, direct_vm, direct_alice, direct_bob, deliver_payout
):
    """A later payout must not erase the watch record of an earlier one.

    Every confirmed payout stays watched until the reversal window expires, so a
    bounce reported after the next payout was started still finds its record.
    """
    first = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    second = submit(funded_round, direct_bob, requested=100)
    direct_vm.mock_web(
        r"https://example\.com/proposal",
        {"status": 200, "body": EVIDENCE_TEXT},
    )
    direct_vm.mock_llm(r"(?s).*independent grant evaluator.*", llm_payload())
    grants.evaluate_proposal(second)

    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, first, direct_alice)
    deliver_payout(first, held=1000, amount=100, at="2026-01-01T00:02:00Z")
    assert grants.get_proposal(first)["status"] == "paid"

    # The next payout starts, and only afterwards is the first one reported as
    # bounced. Both are 100 atto, so the hook has to find the right record.
    direct_vm.deal(direct_vm._contract_address, 900)
    _disburse(grants, direct_vm, second, direct_bob)

    _credit(direct_vm, 1000)
    direct_vm.value = 100
    grants.__on_errored_message__()
    direct_vm.value = 0

    reversed_one = grants.get_proposal(first)
    other = grants.get_proposal(second)
    assert reversed_one["status"] == "payout_pending"
    assert reversed_one["payout_state"] == "owed"
    assert reversed_one["paid_atto"] == "0"
    assert grants.get_stats()["total_paid_atto"] == "0"
    assert grants.get_round(funded_round)["reserved_atto"] == "200"
    # Exactly one payout was reversed; the other keeps its own state.
    assert other["status"] == "payout_pending"
    assert sum(
        1
        for pid in (first, second)
        if grants.get_proposal(pid)["payout_state"] == "owed"
    ) == 1


def test_a_bounce_of_an_unrelated_payout_value_is_ignored(
    funded_round, grants, submit, direct_vm, direct_alice, deliver_payout
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)
    deliver_payout(proposal_id, held=1000, amount=100)

    direct_vm.value = 7
    grants.__on_errored_message__()
    direct_vm.value = 0

    assert grants.get_proposal(proposal_id)["status"] == "paid"
    assert grants.get_stats()["bounced_payouts"] == 0


def test_a_confirmed_payout_is_reversed_when_the_value_returns(
    funded_round, grants, submit, direct_vm, direct_alice, deliver_payout
):
    """The hook is not guaranteed to fire; the returned value is the signal.

    StudioNet never invoked `__on_errored_message__` for a failed child transfer,
    so a bounce is detected from the contract's own balance instead: funding minus
    the ledger cannot explain the surplus.
    """
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)
    deliver_payout(proposal_id, held=1000, amount=100)
    assert grants.get_proposal(proposal_id)["status"] == "paid"
    assert grants.get_stats()["returned_surplus_atto"] == "0"

    _credit(direct_vm, 1000)  # the value came back without a hook
    assert grants.get_stats()["returned_surplus_atto"] == "100"

    assert grants.reconcile_payout(proposal_id) == "owed"
    data = grants.get_proposal(proposal_id)
    assert data["status"] == "payout_pending"
    assert data["payout_state"] == "owed"
    assert data["paid_atto"] == "0"
    assert grants.get_round(funded_round)["paid_atto"] == "0"
    assert grants.get_round(funded_round)["reserved_atto"] == "100"
    assert grants.get_stats()["total_paid_atto"] == "0"
    assert grants.get_stats()["bounced_payouts"] == 1
    # The surplus was consumed by the reversal, so it is not reported twice.
    assert grants.get_stats()["returned_surplus_atto"] == "0"

    # The grant is payable again on the same reservation.
    _disburse(grants, direct_vm, proposal_id, direct_alice)
    assert grants.get_proposal(proposal_id)["payout_attempts"] == 2


def test_reconcile_payout_refuses_without_a_returned_transfer(
    funded_round, grants, submit, direct_vm, direct_alice, deliver_payout
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)
    deliver_payout(proposal_id, held=1000, amount=100)

    with direct_vm.expect_revert("no returned transfer covers this payout"):
        grants.reconcile_payout(proposal_id)
    assert grants.get_proposal(proposal_id)["status"] == "paid"


def test_reconcile_payout_refuses_while_the_transfer_is_in_flight(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)
    _credit(direct_vm, 900)  # the emit deducted the value; nothing is settled

    with direct_vm.expect_revert("not settled yet"):
        grants.reconcile_payout(proposal_id)


def test_reconcile_refund_releases_a_settled_claim_whose_value_returned(
    funded_round, grants, submit, claim_refund, deliver_refund, direct_vm,
    direct_alice, direct_owner, direct_bob,
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    direct_vm.sender = direct_owner
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)
    deliver_refund(funded_round, held=1000, amount=900)
    assert grants.get_round(funded_round)["refunded_atto"] == "900"

    _credit(direct_vm, 1000)  # the refund value came back
    assert grants.get_stats()["returned_surplus_atto"] == "900"

    assert grants.reconcile_refund(funded_round) == "owed"
    data = grants.get_round(funded_round)
    assert data["refunded_atto"] == "0"
    # The approved grant is still reserved, so only the rest is claimable.
    assert data["available_atto"] == "900"

    quote = grants.get_refund(funded_round, direct_bob)
    assert quote["claimed_atto"] == "0"
    assert quote["claimable_atto"] == "900"
    assert quote["refund_state"] == "owed"
    assert grants.get_stats()["total_refunded_atto"] == "0"
    assert grants.get_stats()["refund_in_flight"] == 0
    assert grants.get_stats()["returned_surplus_atto"] == "0"

    # The payout is no longer held up by the refund leg.
    _disburse(grants, direct_vm, proposal_id, direct_alice)
    assert grants.get_proposal(proposal_id)["status"] == "payout_pending"


def test_payout_cannot_start_while_a_refund_is_unresolved(
    funded_round, grants, submit, claim_refund, deliver_refund, direct_vm,
    direct_alice, direct_owner, direct_bob,
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)

    direct_vm.sender = direct_owner
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("refund is awaiting reconciliation"):
        grants.disburse(proposal_id)
    assert grants.get_proposal(proposal_id)["status"] == "approved"

    # Once the refund is reconciled the same payout is allowed, so the block is
    # a sequencing rule rather than a dead end.
    deliver_refund(funded_round, held=1000, amount=900)
    assert grants.get_stats()["refund_in_flight"] == 0

    _disburse(grants, direct_vm, proposal_id, direct_alice)
    assert grants.get_proposal(proposal_id)["status"] == "payout_pending"


def test_refund_after_payout_keeps_committed_funds(
    funded_round, grants, submit, direct_vm, direct_alice, direct_owner, direct_bob,
    deliver_payout,
):
    proposal_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, proposal_id, direct_alice)
    deliver_payout(proposal_id, held=1000, amount=100, at="2026-01-01T00:02:00Z")

    direct_vm.sender = direct_owner
    grants.close_round(funded_round)
    direct_vm.sender = direct_bob
    grants.claim_refund(funded_round)
    _credit(direct_vm, 0)  # the 900 atto refund left the contract
    assert grants.confirm_refund(funded_round) == "sent"  # observation
    direct_vm.warp("2026-01-01T00:10:00Z")
    assert grants.confirm_refund(funded_round) == "delivered"

    round_data = grants.get_round(funded_round)
    assert round_data["funded_atto"] == "1000"
    assert round_data["paid_atto"] == "100"
    assert round_data["refunded_atto"] == "900"
    assert round_data["available_atto"] == "0"
    # The applicant's 100 atto never entered the refund pool.
    assert grants.get_refund(funded_round, direct_bob)["claimed_atto"] == "900"


def test_fund_conservation_across_payouts(
    funded_round, grants, submit, direct_vm, direct_alice, direct_bob, deliver_payout
):
    """funded == reserved + paid + refunded + available, before and after settlement."""
    paid_id = _approved(funded_round, grants, submit, direct_vm, direct_alice)
    _credit(direct_vm, 1000)
    _disburse(grants, direct_vm, paid_id, direct_alice)
    deliver_payout(paid_id, held=1000, amount=100)
    assert grants.get_proposal(paid_id)["status"] == "paid"

    # A second proposal is approved but deliberately left unpaid.
    pending_id = submit(funded_round, direct_bob, requested=100)
    direct_vm.mock_web(
        r"https://example\.com/proposal",
        {"status": 200, "body": EVIDENCE_TEXT},
    )
    direct_vm.mock_llm(r"(?s).*independent grant evaluator.*", llm_payload())
    grants.evaluate_proposal(pending_id)

    round_data = grants.get_round(funded_round)
    stats = grants.get_stats()
    assert int(round_data["funded_atto"]) == (
        int(round_data["reserved_atto"])
        + int(round_data["paid_atto"])
        + int(round_data["refunded_atto"])
        + int(round_data["available_atto"])
    )
    assert int(stats["total_funded_atto"]) == (
        int(stats["total_reserved_atto"])
        + int(stats["total_paid_atto"])
        + int(stats["total_refunded_atto"])
        + sum(int(item["available_atto"]) for item in grants.list_rounds())
    )
    # The real balance equals the money that was funded minus what was paid.
    assert int(stats["balance_atto"]) == 900
    assert int(stats["balance_atto"]) == (
        int(stats["total_funded_atto"])
        - int(stats["total_paid_atto"])
        - int(stats["total_refunded_atto"])
    )

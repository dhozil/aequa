import json

from conftest import RUBRIC


def test_owner_can_create_round(grants, make_round):
    round_id = make_round()
    assert round_id == "r0001"

    data = grants.get_round(round_id)
    assert data["id"] == round_id
    assert data["title"] == "Community tooling round"
    assert data["budget_atto"] == "1000"
    assert data["max_grant_atto"] == "500"
    assert data["min_score"] == 60
    assert data["status"] == "open"
    assert data["rubric"] == RUBRIC
    assert data["proposal_count"] == 0


def test_only_owner_can_create_round(grants, rubric, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("only the owner"):
        grants.create_round(
            "Rogue round",
            "desc",
            json.dumps(rubric),
            1000,
            500,
            60,
            "2026-12-31T23:59:59Z",
        )


def test_rejects_rubric_with_wrong_weight_sum(grants, direct_vm):
    bad = json.loads(json.dumps(RUBRIC))
    bad["criteria"][0]["weight"] = 20
    with direct_vm.expect_revert("weights must sum to 100"):
        grants.create_round("Bad", "desc", json.dumps(bad), 1000, 500, 60, "2026-12-31T23:59:59Z")


def test_rejects_duplicate_criterion_ids(grants, direct_vm):
    bad = json.loads(json.dumps(RUBRIC))
    bad["criteria"][1]["id"] = bad["criteria"][0]["id"]
    with direct_vm.expect_revert("duplicate criterion id"):
        grants.create_round("Bad", "desc", json.dumps(bad), 1000, 500, 60, "2026-12-31T23:59:59Z")


def test_rejects_past_deadline(grants, rubric, direct_vm):
    with direct_vm.expect_revert("deadline must be in the future"):
        grants.create_round("Late", "desc", json.dumps(rubric), 1000, 500, 60, "2025-12-31T23:59:59Z")


def test_rejects_deadline_without_timezone(grants, rubric, direct_vm):
    with direct_vm.expect_revert("timezone"):
        grants.create_round("Late", "desc", json.dumps(rubric), 1000, 500, 60, "2026-12-31T23:59:59")


def test_rejects_max_grant_above_budget(grants, rubric, direct_vm):
    with direct_vm.expect_revert("invalid max grant"):
        grants.create_round("Bad", "desc", json.dumps(rubric), 1000, 1500, 60, "2026-12-31T23:59:59Z")


def test_rejects_min_score_above_100(grants, rubric, direct_vm):
    with direct_vm.expect_revert("min score"):
        grants.create_round("Bad", "desc", json.dumps(rubric), 1000, 500, 101, "2026-12-31T23:59:59Z")


def test_funding_is_tracked_per_round(grants, make_round, direct_vm, direct_bob):
    round_id = make_round()

    direct_vm.sender = direct_bob
    direct_vm.value = 400
    grants.fund_round(round_id)
    direct_vm.value = 0

    data = grants.get_round(round_id)
    assert data["funded_atto"] == "400"
    assert data["available_atto"] == "400"

    stats = grants.get_stats()
    assert stats["total_funded_atto"] == "400"


def test_funding_requires_value(grants, make_round, direct_vm, direct_bob):
    round_id = make_round()
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("send some GEN"):
        grants.fund_round(round_id)


def test_closed_round_cannot_be_funded(grants, make_round, direct_vm, direct_bob):
    round_id = make_round()
    grants.close_round(round_id)

    direct_vm.sender = direct_bob
    direct_vm.value = 100
    with direct_vm.expect_revert("round is closed"):
        grants.fund_round(round_id)
    direct_vm.value = 0


def test_refund_is_pending_until_the_balance_proves_delivery(
    funded_round, grants, claim_refund, deliver_refund, direct_bob
):
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)

    # The child transaction exists, not resolved: nothing is refunded yet.
    data = grants.get_round(funded_round)
    assert data["funded_atto"] == "1000"
    assert data["refunded_atto"] == "0"
    assert data["available_atto"] == "1000"
    assert grants.get_stats()["total_refunded_atto"] == "0"
    assert grants.get_stats()["refund_in_flight"] == 1

    quote = grants.get_refund(funded_round, direct_bob)
    assert quote["claimable_atto"] == "1000"
    assert quote["pending_atto"] == "1000"
    assert quote["refund_state"] == "sent"
    assert quote["refund_attempts"] == 1
    assert quote["ready"] is False
    assert "awaiting confirmation" in quote["blocked_reason"]

    deliver_refund(funded_round, held=1000, amount=1000)

    data = grants.get_round(funded_round)
    # `funded_atto` stays gross: it records what came in, not what is left.
    assert data["refunded_atto"] == "1000"
    assert data["available_atto"] == "0"
    assert grants.get_stats()["total_refunded_atto"] == "1000"
    assert grants.get_stats()["refund_in_flight"] == 0

    quote = grants.get_refund(funded_round, direct_bob)
    assert quote["deposit_atto"] == "1000"
    assert quote["claimed_atto"] == "1000"
    assert quote["claimable_atto"] == "0"
    assert quote["pending_atto"] == "0"
    assert quote["refund_state"] == ""
    assert quote["ready"] is False


def test_refund_quote_accepts_any_address_casing(
    funded_round, grants, direct_vm, direct_bob
):
    """The deposit ledger is keyed by hex, so reads must not depend on casing."""
    lower = direct_bob.as_hex.lower()
    upper = "0x" + direct_bob.as_hex[2:].upper()
    assert grants.get_refund(funded_round, lower)["deposit_atto"] == "1000"
    assert grants.get_refund(funded_round, upper)["deposit_atto"] == "1000"
    assert grants.get_refund(funded_round, lower)["funder"] == lower


def test_refund_quote_rejects_a_malformed_address(funded_round, grants, direct_vm):
    with direct_vm.expect_revert("invalid funder address"):
        grants.get_refund(funded_round, "0xnot-an-address")


def test_refund_requires_closed_round(funded_round, grants, direct_vm, direct_bob):
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("close the round first"):
        grants.claim_refund(funded_round)


def test_only_a_funder_can_claim(funded_round, grants, direct_vm, direct_alice):
    grants.close_round(funded_round)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("only funders"):
        grants.claim_refund(funded_round)


def test_owner_cannot_sweep_community_funds(
    funded_round, grants, direct_vm, direct_owner
):
    """The owner has no path to money it did not deposit itself."""
    grants.close_round(funded_round)
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("only funders"):
        grants.claim_refund(funded_round)
    assert grants.get_round(funded_round)["refunded_atto"] == "0"


def test_double_claim_is_rejected(
    funded_round, grants, claim_refund, deliver_refund, direct_vm, direct_bob
):
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)

    # While the first claim is un-reconciled it cannot be counted again.
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("awaiting confirmation"):
        grants.claim_refund(funded_round)

    deliver_refund(funded_round, held=1000, amount=1000)
    with direct_vm.expect_revert("nothing to refund"):
        grants.claim_refund(funded_round)
    assert grants.get_round(funded_round)["refunded_atto"] == "1000"


def test_refund_is_blocked_while_a_proposal_is_unevaluated(
    funded_round, grants, submit, direct_vm, direct_alice, direct_bob, direct_owner
):
    """A refund would shrink the pool an unevaluated proposal is scored against.

    Without the guard the proposal would later be rejected with
    `budget_exhausted` through no fault of the applicant, so every proposal has
    to reach a decision before any funder can take money back.
    """
    submit(funded_round, direct_alice, requested=100)
    direct_vm.sender = direct_owner
    grants.close_round(funded_round)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("evaluate every proposal"):
        grants.claim_refund(funded_round)

    # Funding is untouched.
    assert grants.get_round(funded_round)["refunded_atto"] == "0"


def test_refund_is_allowed_once_every_proposal_is_decided(
    funded_round, grants, submit, claim_refund, deliver_refund, direct_vm, direct_alice, direct_bob, direct_owner
):
    from conftest import EVIDENCE_TEXT, llm_payload

    proposal_id = submit(funded_round, direct_alice, requested=100)
    direct_vm.mock_web(
        r"https://example\.com/proposal",
        {"status": 200, "body": EVIDENCE_TEXT},
    )
    direct_vm.mock_llm(r"(?s).*independent grant evaluator.*", llm_payload())
    grants.evaluate_proposal(proposal_id)

    direct_vm.sender = direct_owner
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)
    deliver_refund(funded_round, held=1000, amount=900)

    # The approved proposal keeps its reservation; only the remainder is refunded.
    data = grants.get_round(funded_round)
    assert data["funded_atto"] == "1000"
    assert data["reserved_atto"] == "100"
    assert data["refunded_atto"] == "900"
    assert data["available_atto"] == "0"


def test_refund_is_pro_rata_across_funders(
    grants, make_round, direct_vm, direct_alice, direct_bob, direct_owner
):
    round_id = make_round(budget=2000, max_grant=1000)

    direct_vm.sender = direct_bob
    direct_vm.value = 1500
    grants.fund_round(round_id)
    direct_vm.sender = direct_alice
    direct_vm.value = 500
    grants.fund_round(round_id)
    direct_vm.value = 0

    direct_vm.sender = direct_owner
    grants.close_round(round_id)

    direct_vm.sender = direct_bob
    direct_vm.deal(direct_vm._contract_address, 2000)
    grants.claim_refund(round_id)
    direct_vm.deal(direct_vm._contract_address, 500)
    assert grants.confirm_refund(round_id) == "sent"
    direct_vm.warp("2026-01-01T00:05:00Z")
    assert grants.confirm_refund(round_id) == "delivered"

    direct_vm.sender = direct_alice
    grants.claim_refund(round_id)
    direct_vm.deal(direct_vm._contract_address, 0)
    assert grants.confirm_refund(round_id) == "sent"
    direct_vm.warp("2026-01-01T00:10:00Z")
    assert grants.confirm_refund(round_id) == "delivered"

    assert grants.get_refund(round_id, direct_bob)["claimed_atto"] == "1500"
    assert grants.get_refund(round_id, direct_alice)["claimed_atto"] == "500"
    data = grants.get_round(round_id)
    assert data["refunded_atto"] == "2000"
    assert data["available_atto"] == "0"


def test_refund_rounding_never_overpays(
    grants, make_round, submit, direct_vm, direct_alice, direct_bob, direct_charlie, direct_owner
):
    """Three equal funders of 2 atto, 2 reserved: each gets 1, dust stays put.

    Floor division means the sum of every claim can never exceed the pool, so a
    funder cannot take another funder's share by claiming first.
    """
    from conftest import EVIDENCE_TEXT, llm_payload

    round_id = make_round(budget=6, max_grant=2, min_score=0)
    for funder in (direct_alice, direct_bob, direct_charlie):
        direct_vm.sender = funder
        direct_vm.value = 2
        grants.fund_round(round_id)
    direct_vm.value = 0

    proposal_id = submit(round_id, direct_alice, requested=2)
    direct_vm.mock_web(
        r"https://example\.com/proposal",
        {"status": 200, "body": EVIDENCE_TEXT},
    )
    direct_vm.mock_llm(r"(?s).*independent grant evaluator.*", llm_payload())
    grants.evaluate_proposal(proposal_id)

    direct_vm.sender = direct_owner
    grants.close_round(round_id)

    direct_vm.deal(direct_vm._contract_address, 6)
    for index, funder in enumerate((direct_alice, direct_bob, direct_charlie)):
        direct_vm.sender = funder
        grants.claim_refund(round_id)
        direct_vm.deal(direct_vm._contract_address, 6 - (1 + index))
        assert grants.confirm_refund(round_id) == "sent"
        direct_vm.warp(f"2026-01-01T00:0{5 + index * 2}:00Z")
        assert grants.confirm_refund(round_id) == "delivered"

    data = grants.get_round(round_id)
    assert data["reserved_atto"] == "2"
    assert data["refunded_atto"] == "3"
    # 1 atto of rounding dust stays in the contract, not with the last claimer.
    assert data["available_atto"] == "1"


def test_pause_blocks_new_work(grants, make_round, funded_round, submit, direct_vm, direct_alice, direct_owner, direct_bob):
    grants.set_paused(True)
    assert grants.get_stats()["paused"] is True

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("paused"):
        grants.submit_proposal(
            funded_round,
            "Paused",
            "Should not pass",
            ["https://example.com/proposal"],
            10,
        )

    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("paused"):
        grants.create_round("Paused", "desc", json.dumps(RUBRIC), 1000, 500, 60, "2026-12-31T23:59:59Z")

    # Money cannot come in either, so a pause cannot silently take contributions
    # for work that is stopped.
    direct_vm.sender = direct_bob
    direct_vm.value = 100
    with direct_vm.expect_revert("paused"):
        grants.fund_round(funded_round)
    direct_vm.value = 0

    direct_vm.sender = direct_owner
    grants.set_paused(False)
    assert grants.get_stats()["paused"] is False


def test_pause_does_not_block_refunds(
    funded_round, grants, claim_refund, deliver_refund, direct_bob
):
    """A pause stops work, never the exit. Funds already in must be refundable."""
    grants.set_paused(True)
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)
    deliver_refund(funded_round, held=1000, amount=1000)

    data = grants.get_round(funded_round)
    assert data["refunded_atto"] == "1000"
    assert data["available_atto"] == "0"


# -- refund reconciliation --------------------------------------------------


def test_confirm_refund_is_a_noop_while_the_transfer_is_unresolved(
    funded_round, grants, claim_refund, direct_bob
):
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)

    # Balance unchanged: still in flight or bounced. Never count it as returned.
    assert grants.confirm_refund(funded_round) == "sent"
    assert grants.get_round(funded_round)["refunded_atto"] == "0"
    assert grants.get_refund(funded_round, direct_bob)["claimed_atto"] == "0"
    assert grants.get_stats()["refund_in_flight"] == 1


def test_confirm_refund_waits_for_the_settle_window(
    funded_round, grants, claim_refund, direct_vm, direct_bob
):
    """One low balance reading is not proof: a bouncing transfer debits first."""
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)
    direct_vm.deal(direct_vm._contract_address, 0)

    # Observation only: the ledger must not move yet.
    assert grants.confirm_refund(funded_round) == "sent"
    quote = grants.get_refund(funded_round, direct_bob)
    assert quote["refund_observed_at"] > 0
    assert quote["refund_confirm_after"] == (
        quote["refund_observed_at"] + quote["refund_settle_seconds"]
    )
    assert grants.get_round(funded_round)["refunded_atto"] == "0"

    # Still inside the window: nothing is recorded.
    assert grants.confirm_refund(funded_round) == "sent"
    assert grants.get_round(funded_round)["refunded_atto"] == "0"

    direct_vm.warp("2026-01-01T00:05:00Z")
    assert grants.confirm_refund(funded_round) == "delivered"
    assert grants.get_round(funded_round)["refunded_atto"] == "1000"


def test_confirm_refund_forgets_an_observation_that_bounced(
    funded_round, grants, claim_refund, direct_vm, direct_bob
):
    """If the value comes back, the earlier observation no longer counts."""
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)

    direct_vm.deal(direct_vm._contract_address, 0)  # looks delivered
    assert grants.confirm_refund(funded_round) == "sent"
    assert grants.get_refund(funded_round, direct_bob)["refund_observed_at"] > 0

    direct_vm.deal(direct_vm._contract_address, 1000)  # the transfer bounced
    assert grants.confirm_refund(funded_round) == "sent"
    quote = grants.get_refund(funded_round, direct_bob)
    assert quote["refund_observed_at"] == 0
    assert quote["pending_atto"] == "1000"
    assert grants.get_round(funded_round)["refunded_atto"] == "0"


def test_confirm_refund_is_idempotent(
    funded_round, grants, claim_refund, deliver_refund, direct_bob
):
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)
    deliver_refund(funded_round, held=1000, amount=1000)

    assert grants.confirm_refund(funded_round) == "delivered"
    assert grants.get_stats()["total_refunded_atto"] == "1000"
    assert grants.get_stats()["refund_in_flight"] == 0


def test_only_one_refund_can_be_in_flight(
    grants, make_round, claim_refund, direct_vm, direct_alice, direct_bob, direct_owner
):
    round_id = make_round(budget=2000, max_grant=1000)
    for funder, amount in ((direct_bob, 1500), (direct_alice, 500)):
        direct_vm.sender = funder
        direct_vm.value = amount
        grants.fund_round(round_id)
    direct_vm.value = 0
    direct_vm.sender = direct_owner
    grants.close_round(round_id)

    claim_refund(round_id, direct_bob, held=2000)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("awaiting confirmation"):
        grants.claim_refund(round_id)


def test_recover_refund_requires_the_grace_period(
    funded_round, grants, claim_refund, direct_vm, direct_bob
):
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)

    with direct_vm.expect_revert("before recovering"):
        grants.recover_refund(funded_round)


def test_recover_refund_returns_the_claim_for_a_retry(
    funded_round, grants, claim_refund, deliver_refund, direct_vm, direct_bob
):
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)

    direct_vm.warp("2026-01-01T01:00:01Z")
    assert grants.recover_refund(funded_round) == "owed"

    # Nothing was written to the ledger: the funder's claim is simply back.
    assert grants.get_round(funded_round)["refunded_atto"] == "0"
    assert grants.get_stats()["refund_in_flight"] == 0
    quote = grants.get_refund(funded_round, direct_bob)
    assert quote["claimable_atto"] == "1000"
    assert quote["pending_atto"] == "0"
    assert quote["refund_attempts"] == 1

    # Retry and deliver.
    direct_vm.sender = direct_bob
    grants.claim_refund(funded_round)
    assert grants.get_refund(funded_round, direct_bob)["refund_attempts"] == 2
    deliver_refund(
        funded_round, held=1000, amount=1000, at="2026-01-01T01:05:00Z"
    )
    assert grants.get_round(funded_round)["refunded_atto"] == "1000"


def test_a_bounced_transfer_releases_the_claim_immediately(
    funded_round, grants, claim_refund, direct_vm, direct_bob
):
    """GenVM reports a failed child transfer, so no grace period is needed."""
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)

    # The errored message hands the value back through gl.message.value.
    direct_vm.value = 1000
    grants.__on_errored_message__()
    direct_vm.value = 0

    stats = grants.get_stats()
    assert stats["refund_in_flight"] == 0
    assert stats["bounced_refunds"] == 1
    assert stats["bounced_atto"] == "1000"
    assert stats["total_refunded_atto"] == "0"

    quote = grants.get_refund(funded_round, direct_bob)
    assert quote["refund_state"] == "owed"
    assert quote["pending_atto"] == "0"
    assert quote["claimable_atto"] == "1000"
    assert quote["ready"] is True

    # The retry is allowed at once: the bounce, not the clock, is the signal.
    direct_vm.sender = direct_bob
    grants.claim_refund(funded_round)
    assert grants.get_refund(funded_round, direct_bob)["refund_attempts"] == 2
    assert grants.get_stats()["refund_in_flight"] == 1


def test_a_bounce_after_confirmation_reverses_the_ledger(
    funded_round, grants, claim_refund, deliver_refund, direct_vm, direct_bob
):
    """A balance reading can be fooled; the hook is the authority."""
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)
    deliver_refund(funded_round, held=1000, amount=1000)
    assert grants.get_round(funded_round)["refunded_atto"] == "1000"

    direct_vm.deal(direct_vm._contract_address, 1000)  # value came back
    direct_vm.value = 1000
    grants.__on_errored_message__()
    direct_vm.value = 0

    data = grants.get_round(funded_round)
    assert data["refunded_atto"] == "0"
    assert data["available_atto"] == "1000"

    quote = grants.get_refund(funded_round, direct_bob)
    assert quote["claimed_atto"] == "0"
    assert quote["claimable_atto"] == "1000"
    assert quote["refund_state"] == "owed"
    assert grants.get_stats()["total_refunded_atto"] == "0"
    assert grants.get_stats()["refund_in_flight"] == 0


def test_a_bounce_of_an_unrelated_value_is_ignored(
    funded_round, grants, claim_refund, direct_vm, direct_bob
):
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)

    direct_vm.value = 7
    grants.__on_errored_message__()
    direct_vm.value = 0

    stats = grants.get_stats()
    assert stats["bounced_refunds"] == 0
    assert stats["refund_in_flight"] == 1
    assert grants.get_refund(funded_round, direct_bob)["refund_state"] == "sent"


def test_recover_refund_refuses_when_it_was_delivered(
    funded_round, grants, claim_refund, deliver_refund, direct_vm, direct_bob
):
    grants.close_round(funded_round)
    claim_refund(funded_round, direct_bob, held=1000)
    deliver_refund(funded_round, held=1000, amount=1000)

    direct_vm.warp("2026-01-01T01:00:01Z")
    with direct_vm.expect_revert("no refund awaiting recovery"):
        grants.recover_refund(funded_round)


def test_only_owner_can_pause(grants, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("only the owner"):
        grants.set_paused(True)


def test_ownership_can_be_transferred(grants, direct_vm, direct_alice):
    grants.transfer_ownership(direct_alice)
    assert grants.get_stats()["owner"].lower() == direct_alice.as_hex.lower()

    with direct_vm.expect_revert("only the owner"):
        grants.set_paused(True)


def test_ownership_accepts_the_hex_string_the_runner_sends(
    grants, direct_vm, direct_bob, direct_alice
):
    """On-chain the address argument arrives as a hex string, not an Address."""
    grants.transfer_ownership(direct_alice.as_hex)
    assert grants.get_stats()["owner"].lower() == direct_alice.as_hex.lower()

    direct_vm.sender = direct_alice
    grants.transfer_ownership(direct_bob)
    assert grants.get_stats()["owner"].lower() == direct_bob.as_hex.lower()


def test_ownership_rejects_a_malformed_address(grants, direct_vm):
    with direct_vm.expect_revert("invalid funder address"):
        grants.transfer_ownership("not-an-address")

    assert grants.get_stats()["owner"].lower() != "not-an-address"


def test_rejects_oversized_rubric(grants, rubric, direct_vm):
    oversized = json.loads(json.dumps(rubric))
    oversized["criteria"][0]["question"] = "x" * 9000
    with direct_vm.expect_revert("rubric is too large"):
        grants.create_round("Big", "desc", json.dumps(oversized), 1000, 500, 60, "2026-12-31T23:59:59Z")


def test_funding_above_budget_cannot_overspend_the_cap(
    grants, make_round, submit, direct_vm, direct_alice, direct_bob, direct_charlie, direct_owner
):
    round_id = make_round(budget=1000, max_grant=500)

    direct_vm.sender = direct_bob
    direct_vm.value = 2000
    grants.fund_round(round_id)
    direct_vm.value = 0

    direct_vm.mock_web(
        r"https://example\.com/proposal",
        {"status": 200, "body": "A public proposal with strong evidence. " * 10},
    )
    from conftest import llm_payload

    direct_vm.mock_llm(r"(?s).*independent grant evaluator.*", llm_payload())

    first = submit(round_id, direct_alice, requested=500)
    second = submit(round_id, direct_bob, requested=500)
    third = submit(round_id, direct_charlie, requested=100)

    grants.evaluate_proposal(first)
    grants.evaluate_proposal(second)
    grants.evaluate_proposal(third)

    assert grants.get_proposal(first)["status"] == "approved"
    assert grants.get_proposal(second)["status"] == "approved"
    assert grants.get_proposal(third)["status"] == "rejected"
    assert grants.get_proposal(third)["decision_reason"] == "budget_exhausted"
    assert grants.get_round(round_id)["reserved_atto"] == "1000"


def test_rejects_oversized_url(funded_round, submit, direct_vm, direct_alice):
    long_url = "https://example.com/" + ("a" * 500)
    with direct_vm.expect_revert("evidence URL is too long"):
        submit(funded_round, direct_alice, urls=[long_url])


def test_accepts_json_prefixed_rubric(grants, rubric):
    round_id = grants.create_round(
        "Prefixed",
        "desc",
        "json:" + json.dumps(rubric),
        1000,
        500,
        60,
        "2026-12-31T23:59:59Z",
    )
    assert grants.get_round(round_id)["rubric"] == rubric


def test_rejects_malformed_rubric_json(grants, direct_vm):
    with direct_vm.expect_revert("rubric is not valid JSON"):
        grants.create_round(
            "Bad",
            "desc",
            "{criteria: not json}",
            1000,
            500,
            60,
            "2026-12-31T23:59:59Z",
        )


def test_rejects_rubric_that_is_not_an_object(grants, direct_vm):
    with direct_vm.expect_revert("rubric must be a JSON object"):
        grants.create_round(
            "Bad",
            "desc",
            "[1, 2, 3]",
            1000,
            500,
            60,
            "2026-12-31T23:59:59Z",
        )

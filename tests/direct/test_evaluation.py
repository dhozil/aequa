import json

import pytest

from conftest import EVIDENCE_TEXT, EVIDENCE_URL, llm_payload


def _prepare(
    funded_round,
    submit,
    direct_vm,
    direct_alice,
    payload=None,
    requested=100,
    with_web=True,
):
    proposal_id = submit(funded_round, direct_alice, requested=requested)
    if with_web:
        direct_vm.mock_web(
            r"https://example\.com/proposal",
            {"status": 200, "body": EVIDENCE_TEXT},
        )
    direct_vm.mock_llm(r"(?s).*independent grant evaluator.*", payload or llm_payload())
    direct_vm.sender = direct_alice
    return proposal_id


def test_evaluation_approves_a_strong_proposal(funded_round, grants, submit, direct_vm, direct_alice):
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice)

    grants.evaluate_proposal(proposal_id)

    data = grants.get_proposal(proposal_id)
    assert data["status"] == "approved"
    assert data["decision"] == "approve"
    assert data["decision_reason"] == "approved"
    assert data["score"] == 78
    assert data["gates"] == {
        "public_evidence": True,
        "original_work": True,
        "scope_match": True,
    }
    assert len(data["criteria"]) == 5
    assert data["rationale"]

    round_data = grants.get_round(funded_round)
    assert round_data["reserved_atto"] == "100"
    assert round_data["available_atto"] == "900"

    stats = grants.get_stats()
    assert stats["total_reserved_atto"] == "100"


def test_total_score_is_computed_from_weights(funded_round, grants, submit, direct_vm, direct_alice):
    payload = llm_payload(
        scores={"impact": 5, "feasibility": 5, "team": 5, "budget": 5, "alignment": 5}
    )
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice, payload=payload)

    grants.evaluate_proposal(proposal_id)
    assert grants.get_proposal(proposal_id)["score"] == 100


def test_failed_gate_forces_rejection(funded_round, grants, submit, direct_vm, direct_alice):
    payload = llm_payload(
        gates={"public_evidence": False, "original_work": True, "scope_match": True}
    )
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice, payload=payload)

    grants.evaluate_proposal(proposal_id)

    data = grants.get_proposal(proposal_id)
    assert data["status"] == "rejected"
    assert data["decision"] == "reject"
    assert data["decision_reason"] == "gate_failed:public_evidence"
    assert grants.get_round(funded_round)["reserved_atto"] == "0"


def test_low_score_is_rejected(funded_round, grants, submit, direct_vm, direct_alice):
    payload = llm_payload(
        scores={"impact": 1, "feasibility": 1, "team": 1, "budget": 1, "alignment": 1}
    )
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice, payload=payload)

    grants.evaluate_proposal(proposal_id)

    data = grants.get_proposal(proposal_id)
    assert data["status"] == "rejected"
    assert data["decision_reason"] == "score_below_threshold"
    assert data["score"] == 20


def test_budget_exhaustion_is_rejected(
    grants, make_round, submit, direct_vm, direct_alice, direct_bob
):
    round_id = make_round()
    direct_vm.sender = direct_bob
    direct_vm.value = 50
    grants.fund_round(round_id)
    direct_vm.value = 0

    payload = llm_payload()  # would score 78
    proposal_id = _prepare(round_id, submit, direct_vm, direct_alice, payload=payload)

    grants.evaluate_proposal(proposal_id)

    data = grants.get_proposal(proposal_id)
    assert data["status"] == "rejected"
    assert data["decision_reason"] == "budget_exhausted"


def test_proposal_can_only_be_evaluated_once(funded_round, grants, submit, direct_vm, direct_alice):
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice)
    grants.evaluate_proposal(proposal_id)

    with direct_vm.expect_revert("already evaluated"):
        grants.evaluate_proposal(proposal_id)


def test_unfetchable_evidence_aborts_evaluation(funded_round, grants, submit, direct_vm, direct_alice):
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice, with_web=False)

    with direct_vm.expect_revert("[EXTERNAL]"):
        grants.evaluate_proposal(proposal_id)


def test_malformed_llm_output_aborts_evaluation(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _prepare(
        funded_round, submit, direct_vm, direct_alice, payload="this is not json"
    )

    with direct_vm.expect_revert("[LLM_ERROR]"):
        grants.evaluate_proposal(proposal_id)


def test_missing_criterion_aborts_evaluation(
    funded_round, grants, submit, direct_vm, direct_alice
):
    broken = json.loads(llm_payload())
    broken["criteria"] = broken["criteria"][:4]
    proposal_id = _prepare(
        funded_round, submit, direct_vm, direct_alice, payload=json.dumps(broken)
    )

    with direct_vm.expect_revert("missing criterion"):
        grants.evaluate_proposal(proposal_id)


def test_missing_gate_aborts_evaluation(funded_round, grants, submit, direct_vm, direct_alice):
    broken = json.loads(llm_payload())
    del broken["gates"]["scope_match"]
    proposal_id = _prepare(
        funded_round, submit, direct_vm, direct_alice, payload=json.dumps(broken)
    )

    with direct_vm.expect_revert("missing gate"):
        grants.evaluate_proposal(proposal_id)


def test_out_of_range_score_aborts_evaluation(
    funded_round, grants, submit, direct_vm, direct_alice
):
    broken = json.loads(llm_payload())
    broken["criteria"][0]["score"] = 9
    proposal_id = _prepare(
        funded_round, submit, direct_vm, direct_alice, payload=json.dumps(broken)
    )

    with direct_vm.expect_revert("score out of range"):
        grants.evaluate_proposal(proposal_id)


# -- validator behaviour ----------------------------------------------------


def test_validator_accepts_an_independent_identical_result(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice)
    grants.evaluate_proposal(proposal_id)

    assert direct_vm.run_validator() is True


def test_validator_accepts_scores_within_tolerance(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice)
    grants.evaluate_proposal(proposal_id)

    direct_vm.clear_mocks()
    direct_vm.mock_web(r"https://example\.com/proposal", {"status": 200, "body": EVIDENCE_TEXT})
    direct_vm.mock_llm(
        r"(?s).*independent grant evaluator.*",
        llm_payload(
            scores={"impact": 3, "feasibility": 4, "team": 3, "budget": 4, "alignment": 5}
        ),
    )

    assert direct_vm.run_validator() is True


def test_validator_accepts_a_full_one_point_shift(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice)
    grants.evaluate_proposal(proposal_id)

    direct_vm.clear_mocks()
    direct_vm.mock_web(r"https://example\.com/proposal", {"status": 200, "body": EVIDENCE_TEXT})
    direct_vm.mock_llm(
        r"(?s).*independent grant evaluator.*",
        llm_payload(
            scores={"impact": 5, "feasibility": 5, "team": 4, "budget": 5, "alignment": 5}
        ),
    )

    assert direct_vm.run_validator() is True


def test_validator_accepts_score_drift_when_the_decision_matches(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice)
    grants.evaluate_proposal(proposal_id)

    direct_vm.clear_mocks()
    direct_vm.mock_web(r"https://example\.com/proposal", {"status": 200, "body": EVIDENCE_TEXT})
    direct_vm.mock_llm(
        r"(?s).*independent grant evaluator.*",
        llm_payload(
            scores={"impact": 1, "feasibility": 4, "team": 4, "budget": 5, "alignment": 5}
        ),
    )

    # 67/100 instead of 78/100: independent samples, same funding outcome.
    assert direct_vm.run_validator() is True


def test_validator_accepts_a_different_rejection_reason(
    funded_round, grants, submit, direct_vm, direct_alice
):
    payload = llm_payload(
        scores={"impact": 1, "feasibility": 1, "team": 1, "budget": 1, "alignment": 1}
    )
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice, payload=payload)
    grants.evaluate_proposal(proposal_id)
    assert grants.get_proposal(proposal_id)["decision_reason"] == "score_below_threshold"

    direct_vm.clear_mocks()
    direct_vm.mock_web(r"https://example\.com/proposal", {"status": 200, "body": EVIDENCE_TEXT})
    direct_vm.mock_llm(
        r"(?s).*independent grant evaluator.*",
        llm_payload(gates={"public_evidence": False, "original_work": True, "scope_match": True}),
    )

    # Both runs reject, so the treasury is untouched either way.
    assert direct_vm.run_validator() is True


def test_validator_rejects_a_different_gate_result(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice)
    grants.evaluate_proposal(proposal_id)

    direct_vm.clear_mocks()
    direct_vm.mock_web(r"https://example\.com/proposal", {"status": 200, "body": EVIDENCE_TEXT})
    direct_vm.mock_llm(
        r"(?s).*independent grant evaluator.*",
        llm_payload(gates={"public_evidence": False, "original_work": True, "scope_match": True}),
    )

    assert direct_vm.run_validator() is False


def test_validator_rejects_a_different_decision(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice)
    grants.evaluate_proposal(proposal_id)

    direct_vm.clear_mocks()
    direct_vm.mock_web(r"https://example\.com/proposal", {"status": 200, "body": EVIDENCE_TEXT})
    direct_vm.mock_llm(
        r"(?s).*independent grant evaluator.*",
        llm_payload(
            scores={"impact": 1, "feasibility": 1, "team": 1, "budget": 1, "alignment": 1}
        ),
    )

    assert direct_vm.run_validator() is False


# -- deterministic score parsing --------------------------------------------


def test_scores_are_parsed_without_float_arithmetic(
    funded_round, grants, submit, direct_vm, direct_alice
):
    payload = llm_payload(
        scores={
            "impact": "4.4",
            "feasibility": "3.6",
            "team": "3.4",
            "budget": "4.5",
            "alignment": "2.49",
        }
    )
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice, payload=payload)

    grants.evaluate_proposal(proposal_id)

    data = grants.get_proposal(proposal_id)
    scores = {item["id"]: item["score"] for item in data["criteria"]}
    # Half away from zero, decided by the first fractional digit.
    assert scores == {
        "impact": 4,
        "feasibility": 4,
        "team": 3,
        "budget": 5,
        "alignment": 2,
    }
    assert data["score"] == 75


def test_integer_scores_are_accepted(funded_round, grants, submit, direct_vm, direct_alice):
    payload = llm_payload(
        scores={"impact": 5, "feasibility": 4, "team": 3, "budget": 2, "alignment": 1}
    )
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice, payload=payload)

    grants.evaluate_proposal(proposal_id)
    scores = {item["id"]: item["score"] for item in grants.get_proposal(proposal_id)["criteria"]}
    assert scores == {"impact": 5, "feasibility": 4, "team": 3, "budget": 2, "alignment": 1}


@pytest.mark.parametrize("bad", ["four", "4,5", "4.5.6", "4.", ""])
def test_non_numeric_scores_abort_evaluation(
    funded_round, grants, submit, direct_vm, direct_alice, bad
):
    broken = json.loads(llm_payload())
    broken["criteria"][0]["score"] = bad
    proposal_id = _prepare(
        funded_round, submit, direct_vm, direct_alice, payload=json.dumps(broken)
    )

    with direct_vm.expect_revert("[LLM_ERROR]"):
        grants.evaluate_proposal(proposal_id)


def test_boolean_score_is_rejected(funded_round, grants, submit, direct_vm, direct_alice):
    broken = json.loads(llm_payload())
    broken["criteria"][0]["score"] = True
    proposal_id = _prepare(
        funded_round, submit, direct_vm, direct_alice, payload=json.dumps(broken)
    )

    with direct_vm.expect_revert("score is boolean"):
        grants.evaluate_proposal(proposal_id)


# -- evidence binding -------------------------------------------------------


def test_quote_must_appear_in_the_fetched_evidence(
    funded_round, grants, submit, direct_vm, direct_alice
):
    broken = json.loads(llm_payload())
    for item in broken["criteria"]:
        item["quote"] = "a quantum leap in fundraising that never happened"
    proposal_id = _prepare(
        funded_round, submit, direct_vm, direct_alice, payload=json.dumps(broken)
    )

    grants.evaluate_proposal(proposal_id)

    criteria = grants.get_proposal(proposal_id)["criteria"]
    # An invented citation is never presented as evidence.
    assert all(item["quote"] == "" for item in criteria)
    assert all(item["quote_verified"] is False for item in criteria)


def test_verified_quote_is_kept_and_flagged(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice)

    grants.evaluate_proposal(proposal_id)

    criteria = grants.get_proposal(proposal_id)["criteria"]
    assert all(item["quote"] for item in criteria)
    assert all(item["quote_verified"] is True for item in criteria)


def test_evaluation_records_source_fingerprints(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = _prepare(funded_round, submit, direct_vm, direct_alice)

    grants.evaluate_proposal(proposal_id)

    data = grants.get_proposal(proposal_id)
    assert data["evaluated_at"] > 0
    assert len(data["sources"]) == 1
    source = data["sources"][0]
    assert source["url"] == EVIDENCE_URL
    assert source["status"] == "ok"
    assert source["chars"] >= len(EVIDENCE_TEXT.strip())
    assert len(source["fingerprint"]) == 16


def test_unreachable_source_is_recorded_but_does_not_block(
    funded_round, grants, submit, direct_vm, direct_alice
):
    proposal_id = submit(
        funded_round,
        direct_alice,
        urls=[EVIDENCE_URL, "https://example.com/second"],
    )
    direct_vm.mock_web(
        r"https://example\.com/proposal$",
        {"status": 200, "body": EVIDENCE_TEXT},
    )
    direct_vm.mock_llm(r"(?s).*independent grant evaluator.*", llm_payload())

    grants.evaluate_proposal(proposal_id)

    sources = {item["url"]: item for item in grants.get_proposal(proposal_id)["sources"]}
    assert sources[EVIDENCE_URL]["status"] == "ok"
    assert sources["https://example.com/second"]["status"] == "failed"
    assert sources["https://example.com/second"]["fingerprint"] == ""

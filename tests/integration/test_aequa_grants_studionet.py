"""End-to-end smoke test for Aequa Grants on a real GenLayer network.

Flow: (deploy or attach) -> create round -> fund -> submit -> evaluate (real LLM +
web evidence) -> disburse -> confirm_payout -> close -> claim_refund.

By default the test deploys a fresh contract. Set ``AEQUA_GRANTS_ADDRESS`` to run
the same flow against an existing deployment; the configured owner account must
own that contract.

    gltest tests/integration -v -s --network studionet

    $env:AEQUA_GRANTS_ADDRESS = "0x..."
    gltest tests/integration -v -s --network studionet
"""

import datetime as dt
import json
import os
import time

import pytest

from gltest import get_accounts, get_contract_factory
from gltest.assertions import tx_execution_failed, tx_execution_succeeded

pytestmark = pytest.mark.integration

GEN = 10**18
BUDGET = 5 * GEN
MAX_GRANT = 2 * GEN
REQUESTED = 2 * GEN
MIN_SCORE = 40

EVIDENCE_URL = "https://raw.githubusercontent.com/genlayerlabs/genlayer-js/main/README.md"

RUBRIC = {
    "criteria": [
        {
            "id": "impact",
            "weight": 30,
            "question": "Does this create real value for the GenLayer developer community?",
        },
        {
            "id": "feasibility",
            "weight": 25,
            "question": "Is the plan concrete and achievable with the evidence shown?",
        },
        {
            "id": "team",
            "weight": 20,
            "question": "Is there public evidence the team can deliver?",
        },
        {
            "id": "budget",
            "weight": 15,
            "question": "Is the requested budget reasonable for the described work?",
        },
        {
            "id": "alignment",
            "weight": 10,
            "question": "Does it align with open-source values?",
        },
    ],
    "gates": [
        {"id": "public_evidence", "question": "Is the evidence reachable on the public web?"},
        {"id": "original_work", "question": "Is this original work rather than plagiarism?"},
        {
            "id": "scope_match",
            "question": "Is this open-source developer tooling for the GenLayer ecosystem?",
        },
    ],
}

PROPOSAL_TITLE = "GenLayerJS onboarding kit"
PROPOSAL_SUMMARY = (
    "We will publish an onboarding kit for GenLayerJS: a short tutorial, three runnable "
    "examples (deploy, write, read) and a troubleshooting guide, so new developers can go "
    "from zero to a working intelligent contract in under an hour. The evidence URL points "
    "to the official GenLayerJS repository, which shows the SDK surface we would document. "
    "Budget covers writing, example maintenance for one release, and review."
)


def _deadline_iso() -> str:
    deadline = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7)
    return deadline.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _load_contract(owner):
    """Deploy a fresh contract, or attach to ``AEQUA_GRANTS_ADDRESS``."""
    factory = get_contract_factory("AequaGrants")
    address = os.environ.get("AEQUA_GRANTS_ADDRESS", "").strip()
    if not address:
        contract = factory.deploy(args=[], account=owner)
        print(f"\ndeployed: {contract.address}")
        return contract, True

    contract = factory.build_contract(contract_address=address, account=owner)
    print(f"\nattached: {address}")
    return contract, False


def test_round_from_funding_to_disbursement():
    owner, applicant = get_accounts()[:2]
    contract, fresh = _load_contract(owner)

    stats_before = contract.get_stats().call()
    if not fresh:
        assert stats_before["owner"].lower() == owner.address.lower(), (
            "AEQUA_GRANTS_ADDRESS is not owned by the configured owner account"
        )
    rounds_before = stats_before["round_count"]
    paid_before = int(stats_before["total_paid_atto"])
    funded_before = int(stats_before["total_funded_atto"])
    proposals_before = stats_before["proposal_count"]

    receipt = contract.create_round(
        args=[
            "Open-source tooling round",
            "A community round funding open-source developer tooling for the GenLayer ecosystem.",
            json.dumps(RUBRIC),
            BUDGET,
            MAX_GRANT,
            MIN_SCORE,
            _deadline_iso(),
        ]
    ).transact()
    assert tx_execution_succeeded(receipt), receipt

    rounds = contract.list_rounds().call()
    assert len(rounds) == rounds_before + 1
    created = rounds[-1]
    round_id = created["id"]
    assert created["rubric"] == RUBRIC
    assert created["budget_atto"] == str(BUDGET)
    assert created["max_grant_atto"] == str(MAX_GRANT)
    assert created["min_score"] == MIN_SCORE
    assert created["status"] == "open"
    assert created["proposal_count"] == 0

    receipt = contract.fund_round(args=[round_id]).transact(value=BUDGET)
    assert tx_execution_succeeded(receipt), receipt
    funded = contract.get_round(args=[round_id]).call()
    assert funded["funded_atto"] == str(BUDGET)
    assert funded["available_atto"] == str(BUDGET)

    applicant_contract = contract.connect(applicant)
    receipt = applicant_contract.submit_proposal(
        args=[
            round_id,
            PROPOSAL_TITLE,
            PROPOSAL_SUMMARY,
            [EVIDENCE_URL],
            REQUESTED,
        ]
    ).transact()
    assert tx_execution_succeeded(receipt), receipt

    proposals = contract.list_round_proposals(args=[round_id]).call()
    assert len(proposals) == 1
    proposal_id = proposals[0]["id"]
    assert proposals[0]["applicant"].lower() == applicant.address.lower()
    assert proposals[0]["status"] == "submitted"
    assert contract.get_round(args=[round_id]).call()["proposal_count"] == 1

    # Evaluation is permissionless and re-runs the LLM/web work on every validator.
    receipt = applicant_contract.evaluate_proposal(args=[proposal_id]).transact()
    assert tx_execution_succeeded(receipt), receipt

    proposal = contract.get_proposal(args=[proposal_id]).call()
    print("\nevaluation:", json.dumps(proposal, indent=2, sort_keys=True))

    assert proposal["status"] in ("approved", "rejected")
    assert proposal["decision"] == ("approve" if proposal["status"] == "approved" else "reject")
    assert proposal["decision_reason"]
    assert 0 <= proposal["score"] <= 100
    assert set(proposal["gates"]) == {gate["id"] for gate in RUBRIC["gates"]}
    assert {item["id"] for item in proposal["criteria"]} == {
        criterion["id"] for criterion in RUBRIC["criteria"]
    }

    if proposal["status"] != "approved":
        # Rejected: the round can be closed and the funder takes the full
        # unallocated deposit back through the pull-based refund.
        receipt = contract.close_round(args=[round_id]).transact()
        assert tx_execution_succeeded(receipt), receipt

        refund = contract.get_refund(args=[round_id, owner.address]).call()
        assert refund["blocked_reason"] == ""
        assert int(refund["claimable_atto"]) == int(BUDGET)

        receipt = contract.claim_refund(args=[round_id]).transact()
        assert tx_execution_succeeded(receipt), receipt

        round_after = contract.get_round(args=[round_id]).call()
        assert round_after["refunded_atto"] == str(BUDGET)
        assert round_after["available_atto"] == "0"
        stats_after = contract.get_stats().call()
        assert stats_after["total_paid_atto"] == str(paid_before)
        assert stats_after["total_refunded_atto"] == str(funded_before + BUDGET)
        assert stats_after["round_count"] == rounds_before + 1
        assert stats_after["proposal_count"] == proposals_before + 1
        return

    assert proposal["decision_reason"] == "approved"
    assert contract.get_round(args=[round_id]).call()["reserved_atto"] == str(REQUESTED)

    # Two-phase payout: disburse records the send as pending delivery; the
    # reservation only moves to paid in confirm_payout once delivery is observed.
    receipt = contract.disburse(args=[proposal_id]).transact()
    assert tx_execution_succeeded(receipt), receipt

    pending = contract.get_proposal(args=[proposal_id]).call()
    assert pending["status"] == "payout_pending"
    assert pending["payout_state"] == "sent"
    assert pending["payout_attempts"] == 1
    assert int(contract.get_round(args=[round_id]).call()["reserved_atto"]) == int(REQUESTED)

    # Close first so the funder's refund quote becomes reachable; the open
    # payout must be reconciled before the unallocated pool can be claimed.
    receipt = contract.close_round(args=[round_id]).transact()
    assert tx_execution_succeeded(receipt), receipt

    refund = contract.get_refund(args=[round_id, owner.address]).call()
    assert refund["blocked_reason"] != ""
    assert "awaiting reconciliation" in refund["blocked_reason"]
    receipt = contract.claim_refund(args=[round_id]).transact()
    assert tx_execution_failed(receipt), receipt

    confirmed = False
    for _ in range(12):
        result = contract.confirm_payout(args=[proposal_id]).transact()
        assert tx_execution_succeeded(result), result
        if contract.get_proposal(args=[proposal_id]).call()["status"] == "paid":
            confirmed = True
            break
        time.sleep(5)
    assert confirmed, "confirm_payout did not reach paid after disburse"

    paid = contract.get_proposal(args=[proposal_id]).call()
    assert paid["status"] == "paid"
    assert paid["paid_atto"] == str(REQUESTED)

    final_round = contract.get_round(args=[round_id]).call()
    assert final_round["reserved_atto"] == "0"
    assert final_round["paid_atto"] == str(REQUESTED)
    assert final_round["available_atto"] == str(BUDGET - REQUESTED)

    stats_after = contract.get_stats().call()
    assert stats_after["total_reserved_atto"] == "0"
    assert stats_after["total_paid_atto"] == str(paid_before + REQUESTED)
    assert stats_after["total_funded_atto"] == str(funded_before + BUDGET)
    assert stats_after["round_count"] == rounds_before + 1
    assert stats_after["proposal_count"] == proposals_before + 1

    # Pull-based refund: the funder (owner, who funded BUDGET) claims its pro-rata
    # share of what no proposal consumed, then cannot claim twice.
    refund = contract.get_refund(args=[round_id, owner.address]).call()
    assert refund["blocked_reason"] == ""
    assert int(refund["claimable_atto"]) == int(BUDGET - REQUESTED)

    receipt = contract.claim_refund(args=[round_id]).transact()
    assert tx_execution_succeeded(receipt), receipt

    final_round = contract.get_round(args=[round_id]).call()
    assert final_round["refunded_atto"] == str(BUDGET - REQUESTED)
    assert final_round["available_atto"] == "0"
    stats_after = contract.get_stats().call()
    assert stats_after["total_refunded_atto"] == str(BUDGET - REQUESTED)

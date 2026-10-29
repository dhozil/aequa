import json

import pytest

RUBRIC = {
    "criteria": [
        {"id": "impact", "weight": 30, "question": "Does this create real value for the community?"},
        {"id": "feasibility", "weight": 25, "question": "Is the plan concrete and achievable?"},
        {"id": "team", "weight": 20, "question": "Is there evidence the team can deliver?"},
        {"id": "budget", "weight": 15, "question": "Is the budget efficient and justified?"},
        {"id": "alignment", "weight": 10, "question": "Does it align with community values?"},
    ],
    "gates": [
        {"id": "public_evidence", "question": "Can the evidence be accessed publicly?"},
        {"id": "original_work", "question": "Is this original work rather than plagiarism?"},
        {"id": "scope_match", "question": "Does the proposal match the round scope?"},
    ],
}

EVIDENCE_URL = "https://example.com/proposal"
EVIDENCE_TEXT = (
    "Aequa Grants proposal: a community dashboard that tracks grant milestones, "
    "publishes every score, and lets any member audit the evidence. "
    "The team has shipped two open-source tools and provides a public roadmap. "
) * 3


def llm_payload(gates=None, scores=None, summary="Evidence supports this proposal.", confidence=85):
    if gates is None:
        gates = {"public_evidence": True, "original_work": True, "scope_match": True}
    if scores is None:
        scores = {"impact": 4, "feasibility": 4, "team": 3, "budget": 4, "alignment": 5}
    criteria = [
        {
            "id": cid,
            "score": score,
            "quote": "shipped two open-source tools",
            "reason": "Directly supported by the evidence.",
        }
        for cid, score in scores.items()
    ]
    return json.dumps(
        {
            "gates": gates,
            "criteria": criteria,
            "summary": summary,
            "confidence": confidence,
        }
    )


@pytest.fixture
def rubric():
    return RUBRIC


@pytest.fixture
def rubric_json():
    return json.dumps(RUBRIC)


@pytest.fixture
def grants(direct_vm, direct_deploy, direct_owner):
    direct_vm.sender = direct_owner
    direct_vm.warp("2026-01-01T00:00:00Z")
    return direct_deploy("contracts/aequa_grants.py")


@pytest.fixture
def make_round(grants, rubric):
    def _make(
        title="Community tooling round",
        budget=1000,
        max_grant=500,
        min_score=60,
        deadline="2026-12-31T23:59:59Z",
        rubric_obj=None,
    ):
        return grants.create_round(
            title,
            "A round for public-good tooling.",
            json.dumps(rubric_obj if rubric_obj is not None else rubric),
            budget,
            max_grant,
            min_score,
            deadline,
        )

    return _make


@pytest.fixture
def submit(grants, direct_vm):
    def _submit(round_id, applicant, requested=100, urls=None):
        direct_vm.sender = applicant
        return grants.submit_proposal(
            round_id,
            "Grant application",
            "We will build an open dashboard for grant transparency.",
            urls or [EVIDENCE_URL],
            requested,
        )

    return _submit


@pytest.fixture
def claim_refund(grants, direct_vm):
    """Claim a refund the way the chain does, leaving it pending.

    Direct mode never credits the contract when `fund_round` receives value, so
    the balance a claim snapshots is dealt by hand. `deliver_refund` lowers it
    again to prove the child transfer left.
    """

    def _claim(round_id, funder, held):
        direct_vm.sender = funder
        direct_vm.deal(direct_vm._contract_address, held)
        grants.claim_refund(round_id)

    return _claim


@pytest.fixture
def deliver_refund(grants, direct_vm):
    """Simulate the child transfer landing, then reconcile it.

    Delivery is observed first and only finalised after the settle window, so
    the helper warps past it. Tests that already moved the clock forward pass a
    later `at`.
    """

    def _deliver(round_id, held, amount, at="2026-01-01T00:05:00Z"):
        direct_vm.deal(direct_vm._contract_address, held - amount)
        assert grants.confirm_refund(round_id) == "sent"
        direct_vm.warp(at)
        assert grants.confirm_refund(round_id) == "delivered"

    return _deliver


@pytest.fixture
def funded_round(grants, make_round, direct_vm, direct_bob, direct_owner):
    round_id = make_round()

    def _fund(amount=1000):
        direct_vm.sender = direct_bob
        direct_vm.value = amount
        grants.fund_round(round_id)
        direct_vm.value = 0
        direct_vm.sender = direct_owner

    _fund()
    return round_id

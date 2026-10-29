"""End-to-end surface test for Aequa Grants on a real GenLayer network.

Covers every public method (11 write, 8 view), the payout/refund lifecycle,
the exact JSON shape the Next.js frontend decodes, and adversarial calls from a
third wallet that owns nothing.

Deploys a fresh contract by default; set ``AEQUA_GRANTS_ADDRESS`` to attach the
same suite to an existing deployment instead.

    gltest tests/integration/test_aequa_full_surface.py -v -s --network studionet

Accounts come from ``gltest.config.yaml`` in order: owner, applicant, outsider.
"""

import datetime as dt
import json
import os
import time
from types import SimpleNamespace

import pytest

from genlayer_py.types import TransactionStatus
from gltest import get_accounts, get_contract_factory
from gltest.assertions import tx_execution_failed, tx_execution_succeeded

pytestmark = pytest.mark.integration

GEN = 10**18

ROUND_BUDGET = 5 * GEN
MAX_GRANT = 2 * GEN
REQUESTED = 2 * GEN

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
        {
            "id": "public_evidence",
            "question": "Is the evidence reachable on the public web?",
        },
        {
            "id": "scope_match",
            "question": "Is this open-source developer tooling for the GenLayer ecosystem?",
        },
    ],
}

# Round B is built to fail: an unreachable gate plus an impossible threshold.
STRICT_RUBRIC = {
    "criteria": [
        {"id": "rigor", "weight": 60, "question": "Is the work rigorously validated?"},
        {"id": "impact", "weight": 40, "question": "Is the impact demonstrated?"},
    ],
    "gates": [
        {
            "id": "peer_reviewed",
            "question": "Does the evidence show a peer-reviewed academic publication with a DOI?",
        }
    ],
}

SUMMARY = (
    "We will publish an onboarding kit for GenLayerJS: a short tutorial, three runnable "
    "examples (deploy, write, read) and a troubleshooting guide, so new developers can go "
    "from zero to a working intelligent contract in under an hour. The evidence URL points "
    "to the official GenLayerJS repository, which shows the SDK surface we would document. "
    "Budget covers writing, example maintenance for one release, and review."
)

# The exact key sets the frontend decoders in frontend/lib/types.ts read.
FRONTEND_STATS_KEYS = {
    "owner",
    "paused",
    "balance_atto",
    "total_funded_atto",
    "total_reserved_atto",
    "total_paid_atto",
    "total_refunded_atto",
    "total_received_atto",
    "payout_in_flight",
    "refund_in_flight",
    "bounced_refunds",
    "bounced_atto",
    "round_count",
    "proposal_count",
}
FRONTEND_ROUND_KEYS = {
    "id",
    "title",
    "description",
    "rubric",
    "budget_atto",
    "funded_atto",
    "reserved_atto",
    "paid_atto",
    "refunded_atto",
    "available_atto",
    "max_grant_atto",
    "min_score",
    "deadline_iso",
    "status",
    "created_by",
    "proposal_count",
}
FRONTEND_PROPOSAL_KEYS = {
    "id",
    "round_id",
    "applicant",
    "title",
    "summary",
    "evidence_urls",
    "requested_atto",
    "status",
    "score",
    "decision",
    "decision_reason",
    "gates",
    "criteria",
    "rationale",
    "paid_atto",
    "created_at",
    "evaluated_at",
    "sources",
    "payout_state",
    "payout_sent_at",
    "payout_attempts",
}
FRONTEND_REFUND_KEYS = {
    "round_id",
    "funder",
    "deposit_atto",
    "entitled_atto",
    "claimed_atto",
    "claimable_atto",
    "pending_atto",
    "refund_state",
    "refund_sent_at",
    "refund_attempts",
    "refund_observed_at",
    "refund_confirm_after",
    "refund_settle_seconds",
    "refund_pool_atto",
    "ready",
    "blocked_reason",
}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _deadline(days: int = 7) -> str:
    when = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=days)
    return when.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _stderr(receipt) -> str:
    try:
        leader = receipt["consensus_data"]["leader_receipt"][0]
        return json.dumps(leader.get("genvm_result", {}), indent=2)[:1200]
    except Exception:  # pragma: no cover - diagnostics only
        return str(receipt)[:1200]


def _ok(receipt, label: str):
    print(f"  ok      {label}")
    assert tx_execution_succeeded(receipt), f"{label} failed:\n{_stderr(receipt)}"
    return receipt


def _denied(receipt, label: str):
    print(f"  denied  {label}")
    assert tx_execution_failed(receipt), f"{label}: expected a rejection, got success"
    return receipt


def _tx(fn, label: str, **kwargs):
    """Submit with a small pause so a 50-method run stays under RPC limits."""
    time.sleep(2.0)
    return _ok(fn.transact(**kwargs), label)


def _deny(fn, label: str, **kwargs):
    time.sleep(2.0)
    return _denied(fn.transact(**kwargs), label)


TRANSIENT_READ_MARKERS = ("502", "Bad gateway", "429", "invalid JSON", "Timed out")


def _read(fn, label: str, attempts: int = 4):
    """Read with backoff: Studionet occasionally answers 502 mid-run."""
    # Accept either a built ContractFunction or the generated bound method.
    method = fn() if callable(fn) else fn
    for attempt in range(1, attempts + 1):
        time.sleep(0.4)
        try:
            value = method.call()
        except Exception as error:  # noqa: BLE001 - transport errors are retried
            message = str(error)
            transient = any(marker in message for marker in TRANSIENT_READ_MARKERS)
            if attempt == attempts or not transient:
                raise
            print(f"  retry   {label} (attempt {attempt}: {message.splitlines()[0][:90]})")
            time.sleep(6)
            continue
        print(f"  read    {label}")
        return value
    raise RuntimeError(f"unreachable read state for {label}")


def _assert_frontend_shape(obj: dict, keys: set, label: str) -> None:
    assert set(obj) == keys, f"{label} keys drifted: {sorted(set(obj) ^ keys)}"


def _assert_atto(value, label: str) -> None:
    # The frontend converts these with BigInt(...); a float or hex string breaks it.
    assert isinstance(value, str) and value.isdigit(), f"{label} is not a decimal atto string"


@pytest.fixture(scope="module")
def env():
    accounts = get_accounts()
    assert len(accounts) >= 3, "need owner, applicant and outsider in gltest.config.yaml"
    owner, applicant, outsider = accounts[:3]

    factory = get_contract_factory("AequaGrants")
    attached = os.environ.get("AEQUA_GRANTS_ADDRESS", "").strip()
    if attached:
        contract = factory.build_contract(contract_address=attached, account=owner)
        print(f"\nattached: {attached}")
    else:
        contract = factory.deploy(args=[], account=owner)
        print(f"\ndeployed: {contract.address}")

    print(f"owner:     {owner.address}")
    print(f"applicant: {applicant.address}")
    print(f"outsider:  {outsider.address}")

    return SimpleNamespace(
        contract=contract,
        owner=contract,
        applicant=contract.connect(applicant),
        outsider=contract.connect(outsider),
        owner_account=owner,
        applicant_account=applicant,
        outsider_account=outsider,
        state={},
    )


# ---------------------------------------------------------------------------
# 1. admin surface + validation guards
# ---------------------------------------------------------------------------


def test_01_admin_surface_and_validation(env):
    print("\n[1] admin surface, validation, owner-only guards")
    contract = env.contract
    before = _read(contract.get_stats, "get_stats")
    assert before["owner"].lower() == env.owner_account.address.lower()
    assert before["paused"] is False
    rounds_before = before["round_count"]
    proposals_before = before["proposal_count"]
    paid_before = int(before["total_paid_atto"])
    funded_before = int(before["total_funded_atto"])
    refunded_before = int(before["total_refunded_atto"])

    # Non-owner cannot create a round.
    _deny(
        env.outsider.create_round(
            args=[
                "Hostile round",
                "Created by a wallet that does not own the contract.",
                json.dumps(RUBRIC),
                ROUND_BUDGET,
                MAX_GRANT,
                0,
                _deadline(),
            ]
        ),
        "outsider create_round",
    )

    # Rubric weights must total 100.
    broken = json.loads(json.dumps(RUBRIC))
    broken["criteria"][0]["weight"] = 25
    _deny(
        contract.create_round(
            args=["Bad weights", "Weights do not sum to 100.", json.dumps(broken), GEN, GEN, 0, _deadline()]
        ),
        "create_round weights != 100",
    )

    # Duplicate criterion ids are rejected.
    duplicated = json.loads(json.dumps(RUBRIC))
    duplicated["criteria"][1]["id"] = duplicated["criteria"][0]["id"]
    _deny(
        contract.create_round(
            args=["Duplicate ids", "Two criteria share an id.", json.dumps(duplicated), GEN, GEN, 0, _deadline()]
        ),
        "create_round duplicate criterion id",
    )

    # A deadline in the past is rejected.
    _deny(
        contract.create_round(
            args=["Past deadline", "Deadline already elapsed.", json.dumps(RUBRIC), GEN, GEN, 0, "2020-01-01T00:00:00Z"]
        ),
        "create_round past deadline",
    )

    # max_grant may not exceed the budget.
    _deny(
        contract.create_round(
            args=["Over cap", "Max grant above budget.", json.dumps(RUBRIC), GEN, 2 * GEN, 0, _deadline()]
        ),
        "create_round max_grant > budget",
    )

    # Valid round: lenient threshold so the payout leg is reachable.
    _tx(
        contract.create_round(
            args=[
                "Open-source tooling round",
                "A community round funding open-source developer tooling for GenLayer.",
                json.dumps(RUBRIC),
                ROUND_BUDGET,
                MAX_GRANT,
                0,
                _deadline(),
            ]
        ),
        "create_round (valid)",
    )

    rounds = _read(contract.list_rounds, "list_rounds")
    assert len(rounds) == rounds_before + 1
    created = rounds[-1]
    _assert_frontend_shape(created, FRONTEND_ROUND_KEYS, "round")
    assert created["rubric"] == RUBRIC
    assert created["budget_atto"] == str(ROUND_BUDGET)
    assert created["max_grant_atto"] == str(MAX_GRANT)
    assert created["min_score"] == 0
    assert created["status"] == "open"
    assert created["proposal_count"] == 0
    assert created["created_by"].lower() == env.owner_account.address.lower()
    _assert_atto(created["available_atto"], "round.available_atto")

    round_id = created["id"]
    by_id = _read(lambda: contract.get_round(args=[round_id]), "get_round")
    assert by_id == created

    # Unknown ids are a UserError, not an empty object.
    with pytest.raises(Exception):
        contract.get_round(args=["r9999"]).call()

    _deny(env.outsider.set_paused(args=[True]), "outsider set_paused")
    _deny(env.outsider.close_round(args=[round_id]), "outsider close_round")
    _deny(
        env.outsider.transfer_ownership(args=[env.outsider_account.address]),
        "outsider transfer_ownership",
    )
    _deny(contract.close_round(args=["r9999"]), "close_round unknown round")

    env.state.update(
        round_id=round_id,
        rounds_before=rounds_before,
        proposals_before=proposals_before,
        paid_before=paid_before,
        funded_before=funded_before,
        refunded_before=refunded_before,
    )


# ---------------------------------------------------------------------------
# 2. funding ledger + refund guards
# ---------------------------------------------------------------------------


def test_02_funding_ledger_and_refund_guards(env):
    print("\n[2] fund_round ledger and refund guards")
    contract = env.contract
    round_id = env.state["round_id"]

    _tx(contract.fund_round(args=[round_id]), "owner fund_round 5 GEN", value=ROUND_BUDGET)
    _tx(
        env.outsider.fund_round(args=[round_id]),
        "outsider fund_round 1 GEN",
        value=GEN,
    )

    funded = _read(lambda: contract.get_round(args=[round_id]), "get_round")
    assert funded["funded_atto"] == str(ROUND_BUDGET + GEN)
    assert funded["available_atto"] == str(ROUND_BUDGET + GEN)

    _deny(contract.fund_round(args=[round_id]), "fund_round with 0 GEN", value=0)
    _deny(contract.fund_round(args=["r9999"]), "fund_round unknown round", value=GEN)

    # Refunds stay locked until the round is closed.
    quote = _read(
        lambda: contract.get_refund(args=[round_id, env.owner_account.address]),
        "get_refund (open round)",
    )
    _assert_frontend_shape(quote, FRONTEND_REFUND_KEYS, "refund")
    assert quote["ready"] is False
    assert quote["blocked_reason"] == "close the round first"
    assert quote["deposit_atto"] == str(ROUND_BUDGET)
    assert quote["claimable_atto"] == str(ROUND_BUDGET)

    funders = _read(
        lambda: contract.list_round_funders(args=[round_id]), "list_round_funders"
    )
    assert len(funders) == 2
    ledger = {item["funder"].lower(): int(item["deposit_atto"]) for item in funders}
    assert ledger[env.owner_account.address.lower()] == ROUND_BUDGET
    assert ledger[env.outsider_account.address.lower()] == GEN
    assert {item["funder"] for item in funders} == set(ledger)

    _deny(
        contract.claim_refund(args=["r9999"]),
        "claim_refund unknown round",
        wait_retries=60,
    )
    _deny(
        contract.claim_refund(args=[round_id]),
        "claim_refund before close",
        wait_retries=60,
    )

    with pytest.raises(Exception):
        contract.get_refund(args=[round_id, "not-an-address"]).call()


# ---------------------------------------------------------------------------
# 3. submission surface + adversarial input
# ---------------------------------------------------------------------------


def test_03_submission_surface_and_guards(env):
    print("\n[3] submit_proposal and adversarial input")
    contract = env.contract
    round_id = env.state["round_id"]

    _tx(
        env.applicant.submit_proposal(
            args=[round_id, "GenLayerJS onboarding kit", SUMMARY, [EVIDENCE_URL], REQUESTED]
        ),
        "applicant submit_proposal",
    )

    proposals = _read(
        lambda: contract.list_round_proposals(args=[round_id]), "list_round_proposals"
    )
    assert len(proposals) == 1
    proposal = proposals[0]
    _assert_frontend_shape(proposal, FRONTEND_PROPOSAL_KEYS, "proposal")
    assert proposal["applicant"].lower() == env.applicant_account.address.lower()
    assert proposal["status"] == "submitted"
    assert proposal["evidence_urls"] == [EVIDENCE_URL]
    assert proposal["requested_atto"] == str(REQUESTED)
    assert proposal["score"] == 0
    assert proposal["gates"] == {}
    assert proposal["criteria"] == []
    assert proposal["sources"] == []
    _assert_atto(proposal["requested_atto"], "proposal.requested_atto")
    assert contract.get_round(args=[round_id]).call()["proposal_count"] == 1

    # One proposal per address per round.
    _deny(
        env.applicant.submit_proposal(
            args=[round_id, "Second try", SUMMARY, [EVIDENCE_URL], REQUESTED]
        ),
        "duplicate proposal from the same wallet",
    )

    # Only public https URLs.
    _deny(
        env.outsider.submit_proposal(
            args=[round_id, "Plain http", SUMMARY, ["http://example.com/evidence"], REQUESTED]
        ),
        "submit_proposal http URL",
    )
    _deny(
        env.outsider.submit_proposal(
            args=[round_id, "Localhost", SUMMARY, ["https://localhost/evidence"], REQUESTED]
        ),
        "submit_proposal localhost URL",
    )
    _deny(
        env.outsider.submit_proposal(
            args=[round_id, "Four urls", SUMMARY, [EVIDENCE_URL] * 4, REQUESTED]
        ),
        "submit_proposal 4 evidence URLs",
    )
    _deny(
        env.outsider.submit_proposal(
            args=[round_id, "Too greedy", SUMMARY, [EVIDENCE_URL], MAX_GRANT + 1]
        ),
        "submit_proposal above round cap",
    )
    _deny(
        env.outsider.submit_proposal(
            args=["r9999", "Unknown round", SUMMARY, [EVIDENCE_URL], REQUESTED]
        ),
        "submit_proposal unknown round",
    )

    env.state["proposal_id"] = proposal["id"]


# ---------------------------------------------------------------------------
# 4. evaluation -> payout -> refund lifecycle
# ---------------------------------------------------------------------------


def test_04_evaluation_payout_and_refund(env):
    print("\n[4] evaluation, payout reconciliation, refunds")
    contract = env.contract
    round_id = env.state["round_id"]
    proposal_id = env.state["proposal_id"]
    reserved_before = int(contract.get_stats().call()["total_reserved_atto"])

    # Evaluation is permissionless and expensive: long wait window.
    _tx(
        env.outsider.evaluate_proposal(args=[proposal_id]),
        "evaluate_proposal (outsider, real LLM + web)",
        wait_interval=5_000,
        wait_retries=240,
    )

    proposal = _read(
        lambda: contract.get_proposal(args=[proposal_id]), "get_proposal"
    )
    print(f"  result  status={proposal['status']} score={proposal['score']} "
          f"reason={proposal['decision_reason']} gates={proposal['gates']}")
    _assert_frontend_shape(proposal, FRONTEND_PROPOSAL_KEYS, "evaluated proposal")
    assert proposal["status"] in ("approved", "rejected")
    assert proposal["decision"] == (
        "approve" if proposal["status"] == "approved" else "reject"
    )
    assert proposal["decision_reason"]
    assert 0 <= proposal["score"] <= 100
    assert set(proposal["gates"]) == {g["id"] for g in RUBRIC["gates"]}
    assert {c["id"] for c in proposal["criteria"]} == {
        c["id"] for c in RUBRIC["criteria"]
    }
    assert isinstance(proposal["sources"], list) and proposal["sources"]
    assert {s["url"] for s in proposal["sources"]} <= {EVIDENCE_URL}

    # Evaluation runs exactly once per proposal.
    _deny(
        contract.evaluate_proposal(args=[proposal_id]),
        "re-evaluate the same proposal",
        wait_retries=60,
    )

    if proposal["status"] == "approved":
        print("\n[4a] payout lifecycle")
        reserved = _read(
            lambda: contract.get_round(args=[round_id]), "get_round (reserved)"
        )
        assert reserved["reserved_atto"] == str(REQUESTED)
        stats = _read(contract.get_stats, "get_stats (reserved)")
        assert stats["total_reserved_atto"] == str(reserved_before + REQUESTED)
        assert stats["payout_in_flight"] == 0

        _deny(
            env.outsider.disburse(args=[proposal_id]),
            "outsider disburse (not owner/applicant)",
        )

        _tx(
            env.applicant.disburse(args=[proposal_id]),
            "applicant disburse (approved)",
            wait_triggered_transactions=True,
            wait_triggered_transactions_status=TransactionStatus.FINALIZED,
        )

        pending = _read(
            lambda: contract.get_proposal(args=[proposal_id]), "get_proposal (pending)"
        )
        assert pending["status"] == "payout_pending"
        assert pending["payout_state"] == "sent"
        assert pending["payout_attempts"] == 1
        assert pending["paid_atto"] == "0"
        stats = _read(contract.get_stats, "get_stats (in flight)")
        assert stats["payout_in_flight"] == 1
        assert stats["total_paid_atto"] == "0"

        round_pending = contract.get_round(args=[round_id]).call()
        assert round_pending["reserved_atto"] == str(REQUESTED)
        assert round_pending["paid_atto"] == "0"

        # One un-reconciled payout at a time.
        _deny(
            env.applicant.disburse(args=[proposal_id]),
            "second disburse while a payout is in flight",
        )
        # Recovery cannot run before the grace window.
        _deny(
            env.outsider.recover_payout(args=[proposal_id]),
            "recover_payout before the grace period",
        )

        paid = False
        for attempt in range(3):
            _tx(
                env.outsider.confirm_payout(args=[proposal_id]),
                f"confirm_payout (permissionless, attempt {attempt + 1})",
            )
            if contract.get_proposal(args=[proposal_id]).call()["status"] == "paid":
                paid = True
                break
            time.sleep(5)
        assert paid, "confirm_payout never observed the transfer"

        settled = contract.get_proposal(args=[proposal_id]).call()
        assert settled["paid_atto"] == str(REQUESTED)
        assert settled["payout_state"] == "delivered"
        assert settled["payout_attempts"] == 1

        final_round = contract.get_round(args=[round_id]).call()
        assert final_round["reserved_atto"] == "0"
        assert final_round["paid_atto"] == str(REQUESTED)
        assert final_round["available_atto"] == str(ROUND_BUDGET + GEN - REQUESTED)
        stats = contract.get_stats().call()
        assert stats["payout_in_flight"] == 0
        assert stats["total_paid_atto"] == str(env.state["paid_before"] + REQUESTED)

        # confirm_payout is idempotent.
        _tx(
            env.outsider.confirm_payout(args=[proposal_id]),
            "confirm_payout again (idempotent)",
        )

    else:
        print("\n[4b] rejected: full refund path")
        refund = _read(
            lambda: contract.get_refund(args=[round_id, env.owner_account.address]),
            "get_refund (rejected proposal)",
        )
        assert refund["ready"] is False

    print("\n[4c] close + pull-based pro-rata refunds")
    _deny(
        env.outsider.close_round(args=[round_id]),
        "outsider close_round (after evaluation)",
    )
    _tx(contract.close_round(args=[round_id]), "owner close_round")
    assert contract.get_round(args=[round_id]).call()["status"] == "closed"

    total_funded = int(contract.get_round(args=[round_id]).call()["funded_atto"])
    if proposal["status"] == "approved":
        pool = total_funded - REQUESTED
    else:
        pool = total_funded

    owner_expected = ROUND_BUDGET * pool // total_funded
    outsider_expected = GEN * pool // total_funded

    owner_quote = _read(
        lambda: contract.get_refund(args=[round_id, env.owner_account.address]),
        "get_refund (owner, closed)",
    )
    assert owner_quote["ready"] is True
    assert owner_quote["blocked_reason"] == ""
    assert int(owner_quote["claimable_atto"]) == owner_expected
    assert owner_quote["refund_pool_atto"] == str(pool)

    # A pause must never trap money already in the contract: claiming and
    # confirming both stay open while the contract is paused.
    _tx(contract.set_paused(args=[True]), "set_paused(true)")
    stats = contract.get_stats().call()
    assert stats["paused"] is True

    refunded_before_claim = int(
        contract.get_round(args=[round_id]).call()["refunded_atto"]
    )
    _tx(
        env.outsider.claim_refund(args=[round_id]),
        "outsider claim_refund while paused",
        wait_triggered_transactions=True,
        wait_triggered_transactions_status=TransactionStatus.FINALIZED,
    )

    # A claim is not a refund yet: the ledger waits for the balance to prove it.
    pending_quote = _read(
        lambda: contract.get_refund(args=[round_id, env.outsider_account.address]),
        "get_refund (pending claim)",
    )
    assert pending_quote["refund_state"] == "sent"
    assert int(pending_quote["pending_atto"]) == outsider_expected
    assert int(pending_quote["claimed_atto"]) == 0
    assert int(contract.get_round(args=[round_id]).call()["refunded_atto"]) == refunded_before_claim
    assert contract.get_stats().call()["refund_in_flight"] == 1

    # One un-reconciled refund at a time, and recovery waits for the grace period.
    _deny(
        env.outsider.claim_refund(args=[round_id]),
        "second claim_refund while the first is unconfirmed",
        wait_retries=60,
    )
    _deny(
        contract.claim_refund(args=[round_id]),
        "other funder claim while a refund is in flight",
        wait_retries=60,
    )
    _deny(
        env.outsider.recover_refund(args=[round_id]),
        "recover_refund before the grace period",
        wait_retries=60,
    )

    delivered = False
    for attempt in range(8):
        _tx(
            env.outsider.confirm_refund(args=[round_id]),
            f"confirm_refund (permissionless, attempt {attempt + 1})",
        )
        quote_now = contract.get_refund(
            args=[round_id, env.outsider_account.address]
        ).call()
        if int(quote_now["claimed_atto"]) == outsider_expected:
            delivered = True
            break
        # Delivery is only trusted after the balance has stayed down for the
        # settle window; wait it out instead of polling in a tight loop.
        wait_for = int(quote_now["refund_confirm_after"]) - int(time.time()) + 2
        time.sleep(max(3, min(wait_for, 100)))
    assert delivered, "the refund child transfer never delivered within the window"

    stats = contract.get_stats().call()
    assert stats["refund_in_flight"] == 0
    settled_quote = contract.get_refund(
        args=[round_id, env.outsider_account.address]
    ).call()
    assert settled_quote["refund_state"] == ""
    assert settled_quote["pending_atto"] == "0"
    assert settled_quote["refund_attempts"] == 1
    assert settled_quote["claimable_atto"] == "0"

    # confirm_refund is idempotent once the claim was settled.
    _tx(
        env.outsider.confirm_refund(args=[round_id]),
        "confirm_refund again (idempotent)",
    )

    _tx(
        contract.claim_refund(args=[round_id]),
        "owner claim_refund while paused",
        wait_triggered_transactions=True,
        wait_triggered_transactions_status=TransactionStatus.FINALIZED,
    )
    owner_delivered = False
    for attempt in range(8):
        _tx(
            env.outsider.confirm_refund(args=[round_id]),
            f"confirm_refund for the owner claim (attempt {attempt + 1})",
        )
        quote_now = contract.get_refund(
            args=[round_id, env.owner_account.address]
        ).call()
        if int(quote_now["claimed_atto"]) == owner_expected:
            owner_delivered = True
            break
        wait_for = int(quote_now["refund_confirm_after"]) - int(time.time()) + 2
        time.sleep(max(3, min(wait_for, 100)))
    assert owner_delivered, "the owner refund never confirmed within the window"

    _deny(
        contract.claim_refund(args=[round_id]),
        "owner double claim_refund",
        wait_retries=60,
    )
    _tx(contract.set_paused(args=[False]), "set_paused(false)")

    closed_round = contract.get_round(args=[round_id]).call()
    expected_refunded = owner_expected + outsider_expected
    assert int(closed_round["refunded_atto"]) == expected_refunded
    assert int(closed_round["available_atto"]) <= 1
    stats = contract.get_stats().call()
    assert int(stats["total_refunded_atto"]) == env.state["refunded_before"] + expected_refunded

    env.state["approved"] = proposal["status"] == "approved"


# ---------------------------------------------------------------------------
# 5. pause / closed-round guards, rejection path, ownership
# ---------------------------------------------------------------------------


def test_05_pause_closed_round_and_ownership(env):
    print("\n[5] pause guards, closed round, rejection, ownership transfer")
    contract = env.contract
    baseline = _read(contract.get_stats, "get_stats (baseline)")
    rounds_before = baseline["round_count"]
    proposals_before = baseline["proposal_count"]
    funded_before = int(baseline["total_funded_atto"])
    paid_before = int(baseline["total_paid_atto"])
    refunded_before = int(baseline["total_refunded_atto"])

    _tx(
        contract.create_round(
            args=[
                "Documentation round",
                "Developer documentation for the GenLayer ecosystem.",
                json.dumps(STRICT_RUBRIC),
                2 * GEN,
                GEN,
                100,
                _deadline(),
            ]
        ),
        "create_round (strict, round B)",
    )
    strict_round = _read(contract.list_rounds, "list_rounds (round B)")[-1]["id"]
    assert _read(contract.get_stats, "get_stats (round B)")["round_count"] == rounds_before + 1

    # Paused blocks new work and new money, but never blocks payouts/refunds.
    _tx(contract.set_paused(args=[True]), "set_paused(true) for guards")
    _deny(
        contract.fund_round(args=[strict_round]),
        "fund_round while paused",
        value=GEN,
    )
    _deny(
        env.outsider.submit_proposal(
            args=[strict_round, "While paused", SUMMARY, [EVIDENCE_URL], GEN]
        ),
        "submit_proposal while paused",
    )
    _deny(
        contract.create_round(
            args=["Paused round", "Should not exist.", json.dumps(RUBRIC), GEN, GEN, 0, _deadline()]
        ),
        "create_round while paused",
    )
    _tx(contract.set_paused(args=[False]), "set_paused(false)")

    _tx(contract.fund_round(args=[strict_round]), "fund round B", value=2 * GEN)
    _tx(
        env.outsider.submit_proposal(
            args=[strict_round, "Unlikely grant", SUMMARY, [EVIDENCE_URL], GEN]
        ),
        "outsider submit_proposal (round B)",
    )
    proposals = _read(
        lambda: contract.list_round_proposals(args=[strict_round]),
        "list_round_proposals (round B)",
    )
    assert len(proposals) == 1
    strict_proposal = proposals[0]["id"]

    _deny(
        env.outsider.close_round(args=[strict_round]),
        "outsider close_round (round B)",
    )
    _tx(contract.close_round(args=[strict_round]), "close round B")

    _deny(
        env.applicant.submit_proposal(
            args=[strict_round, "Too late", SUMMARY, [EVIDENCE_URL], GEN]
        ),
        "submit_proposal into a closed round",
    )
    _deny(
        env.outsider.fund_round(args=[strict_round]),
        "fund_round into a closed round",
        value=GEN,
    )

    quote = _read(
        lambda: contract.get_refund(args=[strict_round, env.owner_account.address]),
        "get_refund (unevaluated proposal)",
    )
    assert quote["ready"] is False
    assert "evaluate every proposal" in quote["blocked_reason"]
    _deny(
        contract.claim_refund(args=[strict_round]),
        "claim_refund while a proposal is unevaluated",
        wait_retries=60,
    )

    # Rejection path: a gate the evidence cannot satisfy plus a 100 threshold.
    _tx(
        env.owner.evaluate_proposal(args=[strict_proposal]),
        "evaluate_proposal (round B, strict)",
        wait_interval=5_000,
        wait_retries=240,
    )
    evaluated = _read(
        lambda: contract.get_proposal(args=[strict_proposal]),
        "get_proposal (round B)",
    )
    print(f"  result  status={evaluated['status']} score={evaluated['score']} "
          f"reason={evaluated['decision_reason']}")
    assert evaluated["status"] == "rejected"
    assert evaluated["decision"] == "reject"
    assert evaluated["decision_reason"] in (
        "gate_failed:peer_reviewed",
        "score_below_threshold",
    )
    assert _read(
        lambda: contract.get_round(args=[strict_round]), "get_round (round B)"
    )["reserved_atto"] == "0"

    quote = _read(
        lambda: contract.get_refund(args=[strict_round, env.owner_account.address]),
        "get_refund (rejected round)",
    )
    assert quote["ready"] is True
    assert quote["claimable_atto"] == str(2 * GEN)
    _tx(
        contract.claim_refund(args=[strict_round]),
        "claim_refund (rejected round, full deposit)",
        wait_triggered_transactions=True,
        wait_triggered_transactions_status=TransactionStatus.FINALIZED,
    )
    refunded = False
    for attempt in range(8):
        _tx(
            env.outsider.confirm_refund(args=[strict_round]),
            f"confirm_refund (rejected round, attempt {attempt + 1})",
        )
        if int(contract.get_round(args=[strict_round]).call()["refunded_atto"]) == 2 * GEN:
            refunded = True
            break
        quote_now = contract.get_refund(
            args=[strict_round, env.owner_account.address]
        ).call()
        wait_for = int(quote_now["refund_confirm_after"]) - int(time.time()) + 2
        time.sleep(max(3, min(wait_for, 100)))
    assert refunded, "the rejected round refund never confirmed"
    final = _read(lambda: contract.get_round(args=[strict_round]), "get_round (refunded)")
    assert final["refunded_atto"] == str(2 * GEN)
    assert final["available_atto"] == "0"

    # transfer_ownership actually moves the admin role.
    _tx(
        contract.transfer_ownership(args=[env.outsider_account.address]),
        "owner transfer_ownership -> outsider",
    )
    assert _read(contract.get_stats, "get_stats (transferred)")["owner"].lower() == env.outsider_account.address.lower()
    _deny(
        contract.create_round(
            args=["Old owner round", "Old owner lost the role.", json.dumps(RUBRIC), GEN, GEN, 0, _deadline()]
        ),
        "former owner create_round after transfer",
    )
    _tx(
        env.outsider.transfer_ownership(args=[env.owner_account.address]),
        "new owner transfers ownership back",
    )
    assert _read(contract.get_stats, "get_stats (restored)")["owner"].lower() == env.owner_account.address.lower()

    # Final accounting invariants, measured against this test's own baseline so
    # the test can be re-run against the same deployment.
    stats = _read(contract.get_stats, "get_stats (final)")
    _assert_frontend_shape(stats, FRONTEND_STATS_KEYS, "stats")
    assert stats["total_funded_atto"] == str(funded_before + 2 * GEN)
    assert stats["round_count"] == rounds_before + 1
    assert stats["proposal_count"] == proposals_before + 1
    assert stats["payout_in_flight"] == 0
    assert int(stats["total_paid_atto"]) == paid_before
    assert int(stats["total_refunded_atto"]) == refunded_before + 2 * GEN
    assert int(stats["balance_atto"]) >= 0

    # list_proposals is the frontend's global feed.
    all_proposals = _read(contract.list_proposals, "list_proposals")
    assert {p["round_id"] for p in all_proposals} >= {strict_round}
    for item in all_proposals:
        _assert_frontend_shape(item, FRONTEND_PROPOSAL_KEYS, "list_proposals item")

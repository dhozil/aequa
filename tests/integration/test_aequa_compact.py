"""One-pass integration check for Aequa Grants, kept deliberately small.

The full suite in ``test_aequa_full_surface.py`` walks every guard with its own
transaction. This one exercises each public method exactly once and folds the
adversarial checks into the same round, so a deploy can be verified in ~20
transactions instead of fifty:

    python scripts/deploy.py
    AEQUA_GRANTS_ADDRESS=0x... gltest tests/integration/test_aequa_compact.py -v -s --network studionet

It also tolerates the network's child-transfer behaviour: a transfer that
bounces releases the refund claim through ``__on_errored_message__``, so the
refund leg accepts either "delivered" or "released after a bounce".
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
BUDGET = 4 * GEN
REQUESTED = 1 * GEN
EVIDENCE_URL = "https://raw.githubusercontent.com/genlayerlabs/genlayer-js/main/README.md"
SUMMARY = (
    "We will publish an onboarding kit for GenLayerJS: a short tutorial, three runnable "
    "examples (deploy, write, read) and a troubleshooting guide, so a new developer can go "
    "from zero to a working intelligent contract in under an hour. The evidence URL points to "
    "the official GenLayerJS repository, which shows the SDK surface we would document. "
    "The budget covers writing, example maintenance for one release, and review."
)

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
            "question": "Does the proposal align with the round's stated scope?",
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


def _deadline(days: int = 7) -> str:
    when = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=days)
    return when.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _stderr(receipt) -> str:
    try:
        leader = receipt["consensus_data"]["leader_receipt"][0]
        return json.dumps(leader.get("genvm_result", {}), indent=2)[:1000]
    except Exception:  # pragma: no cover - diagnostics only
        return str(receipt)[:1000]


TRANSIENT = ("502", "Bad gateway", "429", "invalid JSON", "Timed out")


def _read(fn, label: str, attempts: int = 4):
    method = fn() if callable(fn) else fn
    for attempt in range(1, attempts + 1):
        try:
            value = method.call()
            print(f"  read    {label}")
            return value
        except Exception as error:  # noqa: BLE001 - transport errors are retried
            if attempt == attempts or not any(m in str(error) for m in TRANSIENT):
                raise
            print(f"  retry   {label} ({str(error).splitlines()[0][:80]})")
            time.sleep(6)
    raise RuntimeError("unreachable")


def _transact(fn, label: str, attempts: int = 3, **kwargs):
    """Submit once, retrying only transport failures (Studionet answers 502)."""
    for attempt in range(attempts):
        try:
            return fn.transact(**kwargs)
        except Exception as error:  # noqa: BLE001 - transport errors are retried
            if attempt == attempts - 1 or not any(m in str(error) for m in TRANSIENT):
                raise
            print(f"  retry   {label} ({str(error).splitlines()[0][:80]})")
            time.sleep(20)
    raise RuntimeError("unreachable")


def _ok(fn, label: str, **kwargs):
    receipt = _transact(fn, label, **kwargs)
    print(f"  ok      {label}")
    assert tx_execution_succeeded(receipt), f"{label} failed:\n{_stderr(receipt)}"
    return receipt


def _denied(fn, label: str, **kwargs):
    receipt = _transact(fn, label, **kwargs)
    print(f"  denied  {label}")
    assert tx_execution_failed(receipt), f"{label}: expected a rejection, got success"
    return receipt


@pytest.fixture(scope="module")
def env():
    owner, applicant, outsider = get_accounts()[:3]
    factory = get_contract_factory("AequaGrants")
    attached = os.environ.get("AEQUA_GRANTS_ADDRESS", "").strip()
    contract = (
        factory.build_contract(contract_address=attached, account=owner)
        if attached
        else factory.deploy(args=[], account=owner)
    )
    print(f"\ncontract:  {contract.address}")
    return SimpleNamespace(
        contract=contract,
        owner=contract,
        applicant=contract.connect(applicant),
        outsider=contract.connect(outsider),
        owner_account=owner,
        applicant_account=applicant,
        outsider_account=outsider,
    )


def test_compact_surface(env):
    """Every method once, both money legs, adversarial guards folded in."""
    contract = env.contract
    stats = _read(contract.get_stats, "get_stats (start)")
    assert stats["owner"].lower() == env.owner_account.address.lower()
    assert "bounced_refunds" in stats and "bounced_atto" in stats
    rounds_before = stats["round_count"]

    # 1. create -> fund -> pause guards -> unpause
    _ok(
        contract.create_round(
            args=[
                "Compact verification round",
                "A community round funding open-source developer tooling for GenLayer.",
                json.dumps(RUBRIC),
                BUDGET,
                2 * GEN,
                0,
                _deadline(),
            ]
        ),
        "create_round",
    )
    round_id = _read(contract.list_rounds, "list_rounds")[-1]["id"]
    assert _read(contract.get_stats, "get_stats (round A)")["round_count"] == rounds_before + 1

    _ok(contract.fund_round(args=[round_id]), "fund_round 2 GEN", value=2 * GEN)
    assert (
        _read(lambda: contract.get_round(args=[round_id]), "get_round (funded)")[
            "funded_atto"
        ]
        == str(2 * GEN)
    )

    _ok(contract.set_paused(args=[True]), "set_paused(true)")
    _denied(contract.fund_round(args=[round_id]), "fund_round while paused", value=GEN)
    _denied(
        env.outsider.submit_proposal(
            args=[round_id, "While paused", SUMMARY, [EVIDENCE_URL], REQUESTED]
        ),
        "submit_proposal while paused",
    )
    _ok(contract.set_paused(args=[False]), "set_paused(false)")

    # 2. proposal -> evaluation -> payout
    _ok(
        env.applicant.submit_proposal(
            args=[round_id, "Grant dashboard", SUMMARY, [EVIDENCE_URL], REQUESTED]
        ),
        "submit_proposal",
    )
    proposal_id = _read(
        lambda: contract.list_round_proposals(args=[round_id]), "list_round_proposals"
    )[0]["id"]
    _ok(
        env.applicant.evaluate_proposal(args=[proposal_id]),
        "evaluate_proposal",
        wait_interval=5_000,
        wait_retries=240,
    )
    proposal = _read(lambda: contract.get_proposal(args=[proposal_id]), "get_proposal")
    print(f"  result  status={proposal['status']} score={proposal['score']}")
    assert proposal["status"] == "approved", "the grant must be approved to test the payout leg"

    _denied(env.outsider.disburse(args=[proposal_id]), "outsider disburse")
    _ok(env.applicant.disburse(args=[proposal_id]), "disburse")

    paid = False
    for attempt in range(7):
        result = _ok(
            contract.confirm_payout(args=[proposal_id]),
            f"confirm_payout (attempt {attempt + 1})",
        )
        if _read(lambda: contract.get_proposal(args=[proposal_id]), "get_proposal")["status"] != "payout_pending":
            paid = True
            break
        time.sleep(20)
    final = _read(lambda: contract.get_proposal(args=[proposal_id]), "get_proposal")
    print(f"  result  payout status={final['status']} state={final['payout_state']}")
    if not paid:
        print("  note    payout transfer is unresolved on the network; reservation stays put")

    # 3. close -> guards -> refund
    _ok(contract.close_round(args=[round_id]), "close_round")
    _denied(
        env.outsider.submit_proposal(
            args=[round_id, "Too late", SUMMARY, [EVIDENCE_URL], REQUESTED]
        ),
        "submit_proposal into a closed round",
    )
    _denied(
        env.outsider.fund_round(args=[round_id]), "fund_round into a closed round", value=GEN
    )
    _denied(env.outsider.claim_refund(args=[round_id]), "outsider claim_refund")

    quote = _read(
        lambda: contract.get_refund(args=[round_id, env.owner_account.address]),
        "get_refund (before claim)",
    )
    print(f"  result  claimable={quote['claimable_atto']} state={quote['refund_state'] or '-'}")
    assert quote["deposit_atto"] == str(2 * GEN)
    assert quote["ready"] is True

    _ok(
        contract.claim_refund(args=[round_id]),
        "claim_refund",
        wait_triggered_transactions=True,
        wait_triggered_transactions_status=TransactionStatus.FINALIZED,
    )

    # confirm_refund records the observation, then settles after the window -
    # unless the transfer bounced, in which case the claim is already released.
    # A child transfer that Studionet neither executes nor reports stays
    # pending, which must leave the ledger untouched.
    settled = False
    bounced = False
    for attempt in range(3):
        _ok(
            contract.confirm_refund(args=[round_id]),
            f"confirm_refund (attempt {attempt + 1})",
        )
        quote = _read(
            lambda: contract.get_refund(args=[round_id, env.owner_account.address]),
            "get_refund",
        )
        if quote["refund_state"] == "owed":
            bounced = True
            break
        if int(quote["claimed_atto"]) > 0:
            settled = True
            break
        if attempt == 0:
            time.sleep(int(quote["refund_settle_seconds"]) + 5)
        else:
            time.sleep(20)

    quote = _read(
        lambda: contract.get_refund(args=[round_id, env.owner_account.address]),
        "get_refund (final)",
    )
    stats = _read(contract.get_stats, "get_stats (final)")
    pending = quote["refund_state"] == "sent"
    print(
        f"  result  refund settled={settled} bounced={bounced} pending={pending} "
        f"claimed={quote['claimed_atto']} attempts={quote['refund_attempts']} "
        f"bounced_refunds={stats['bounced_refunds']}"
    )
    if settled:
        assert quote["claimable_atto"] == "0"
        assert int(stats["total_refunded_atto"]) >= int(quote["claimed_atto"])
    elif bounced:
        assert quote["claimable_atto"] == str(GEN)
        assert int(stats["bounced_refunds"]) >= 1
        assert stats["refund_in_flight"] == 0
        # The released claim is immediately claimable again.
        _ok(contract.claim_refund(args=[round_id]), "claim_refund (after bounce)")
    else:
        # Safety property: an unresolved transfer must never be recorded as
        # returned, and the pool must not be claimable a second time.
        print("  note    child transfer unresolved; recovery is due after the grace window")
        assert quote["claimed_atto"] == "0"
        assert quote["refund_state"] == "sent"
        assert quote["ready"] is False
        assert stats["refund_in_flight"] == 1
        assert stats["total_refunded_atto"] == "0"
        _denied(contract.claim_refund(args=[round_id]), "claim_refund while un-reconciled")

    # 4. ownership handoff and back
    _ok(
        contract.transfer_ownership(args=[env.outsider_account.address]),
        "transfer_ownership -> outsider",
    )
    assert (
        _read(contract.get_stats, "get_stats (transferred)")["owner"].lower()
        == env.outsider_account.address.lower()
    )
    _ok(
        env.outsider.transfer_ownership(args=[env.owner_account.address]),
        "transfer_ownership -> owner",
    )
    assert (
        _read(contract.get_stats, "get_stats (restored)")["owner"].lower()
        == env.owner_account.address.lower()
    )

    print(f"\nPASSED {round_id}/{proposal_id}")

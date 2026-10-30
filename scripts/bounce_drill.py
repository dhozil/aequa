"""On-chain drill for the steward's payout-reconciliation requirements.

Runs against a live StudioNet deployment of `contracts/aequa_grants.py` plus
`tests/integration/bounce_sink.py` (a recipient that rejects every transfer, so
`emit_transfer` bounces for real instead of being simulated).

The proposal's evidence must be a public https URL the validators can actually
fetch, and its subject must look like in-scope developer tooling; the GitHub
README and placeholder pages are rejected by `gate_failed:public_evidence`.

Steps: propose -> evaluate (consensus allocates) -> `disburse` (transfer
pending) -> `confirm_payout` before delivery -> observe bounce ->
`recover_payout` -> confirm again -> attempt a refund while another payout is
pending -> observe the rejection. Every response is dumped to
`docs/bounce-drill.json` and the receipt hashes are linked from
`information_needed.md`.

    python scripts/bounce_drill.py

Edit CONTRACT/SINK/ROUND if you re-run against a fresh instance.
"""

import datetime as dt
import json
import os
import pathlib
import time

from dotenv import load_dotenv
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEN = 10**18
RPC = "https://studio.genlayer.com/api"
CONTRACT = "0x0aE0139DBD00DB704Ac27Eb45492FD1A73a33Ae8"
SINK = "0xaa5c7cbEb2AA514F2F1b918c017ED209BfCf1e81"
ROUND = "r0003"
EVIDENCE = "https://aequa-grant.vercel.app"
OUT = ROOT / "docs" / "bounce-drill.json"
WAIT = {"retries": 240, "interval": 5000}
RUBRIC = ROOT / "scripts" / "rubric.json"


def log(step, payload=None):
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%H:%M:%S")
    print(f"[{stamp}] {step}", flush=True)
    if payload is not None:
        print(json.dumps(payload, indent=2, default=str)[:3000], flush=True)


def leader_error(receipt):
    leader = (receipt.get("consensus_data") or {}).get("leader_receipt") or []
    if not leader:
        return ""
    if leader[0].get("execution_result") == "SUCCESS":
        return ""
    result = leader[0].get("result") or {}
    payload = result.get("payload") if isinstance(result, dict) else None
    if isinstance(payload, dict):
        return str(payload.get("readable") or payload)
    return str(result or leader[0])[:2000]


def retry(fn, label, attempts=5, pause=10):
    last = None
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as error:
            last = error
            log(f"{label}: retry {attempt + 1}/{attempts}", {"error": str(error)[:250]})
            time.sleep(pause)
    raise SystemExit(f"{label} kept failing: {last}")


class Drill:
    def __init__(self):
        load_dotenv(ROOT / ".env")
        self.account = create_account(os.environ["ACCOUNT_PRIVATE_KEY"].strip())
        self.client = create_client(chain=studionet, account=self.account, endpoint=RPC)
        self.steps = []
        self.state = {"owner": self.account.address, "contract": CONTRACT, "sink": SINK, "round": ROUND}

    def read(self, method, address=CONTRACT, args=None):
        return retry(
            lambda: self.client.read_contract(address=address, function_name=method, args=args or []),
            f"read {method}",
        )

    def write(self, method, args, value=0, address=CONTRACT):
        def call():
            tx = self.client.write_contract(
                address=address, function_name=method, args=args, value=value
            )
            receipt = self.client.wait_for_transaction_receipt(
                transaction_hash=tx,
                status=TransactionStatus.FINALIZED,
                retries=WAIT["retries"],
                interval=WAIT["interval"],
            )
            return {"tx": tx, "receipt": receipt}

        result = retry(call, f"write {method}")
        entry = {
            "step": method,
            "tx": result["tx"],
            "result": result["receipt"].get("result_name"),
            "error": leader_error(result["receipt"]),
        }
        self.steps.append(entry)
        log(method, {k: v for k, v in entry.items() if k != "error"}
            | ({"error": entry["error"][:250]} if entry["error"] else {}))
        result["ok"] = entry["result"] in ("MAJORITY_AGREE", "AGREE") and not entry["error"]
        result["error"] = entry["error"]
        return result


def wait_for(fn, predicate, timeout=900, interval=15, label=""):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = fn()
        if predicate(last):
            return last
        log(f"{label}: waiting", {"probe": last})
        time.sleep(interval)
    return last


def main():
    drill = Drill()
    rubric = json.dumps(json.loads(RUBRIC.read_text(encoding="utf-8")), separators=(",", ":"))
    deadline = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7)).replace(
        microsecond=0
    ).isoformat().replace("+00:00", "Z")

    drill.write(
        "create_round",
        ["Bounce drill 3", "Third attempt with the live app as evidence.", rubric, GEN, GEN, 0, deadline],
    )
    drill.write("fund_round", [ROUND], value=GEN)
    drill.write(
        "apply",
        [
            CONTRACT,
            ROUND,
            "Aequa Grants transparency dashboard",
            "We maintain the live Aequa Grants dashboard at https://aequa-grant.vercel.app. It "
            "publishes every grant score and lets any community member audit the evidence behind "
            "each decision. The work is ours, public, and documented in the same repository, so a "
            "developer new to GenLayer can see how grant evaluation works end to end.",
            [EVIDENCE],
            GEN // 2,
        ],
        address=SINK,
    )

    proposals = wait_for(
        lambda: drill.read("list_round_proposals", args=[ROUND]),
        lambda items: bool(items),
        timeout=420,
        label="proposal",
    )
    if not proposals:
        raise SystemExit("the sink never submitted a proposal")
    proposal_id = proposals[0]["id"]
    drill.state["proposal"] = proposal_id
    log("proposal created", {"id": proposal_id, "applicant": proposals[0]["applicant"]})

    drill.write("evaluate_proposal", [proposal_id])
    proposal = wait_for(
        lambda: drill.read("get_proposal", args=[proposal_id]),
        lambda item: item["status"] != "submitted",
        timeout=1200,
        interval=20,
        label="evaluation",
    )
    drill.state["evaluation"] = {
        "status": proposal["status"],
        "score": proposal["score"],
        "decision": proposal["decision"],
        "gates": proposal["gates"],
        "reason": proposal["decision_reason"],
    }
    log("evaluation", drill.state["evaluation"])
    if proposal["status"] != "approved":
        OUT.write_text(json.dumps({"state": drill.state, "steps": drill.steps}, indent=2))
        raise SystemExit("proposal was not approved")

    drill.write("close_round", [ROUND])
    drill.write("claim_refund", [ROUND])
    refund = drill.read("get_refund", args=[ROUND, drill.account.address])
    drill.state["refund_claim"] = {
        "state": refund["refund_state"],
        "pending": refund["pending_atto"],
        "claimable": refund["claimable_atto"],
    }
    log("refund claim", drill.state["refund_claim"])

    blocked = drill.write("disburse", [proposal_id])
    refused = "refund is awaiting reconciliation" in json.dumps(blocked["receipt"])
    drill.steps[-1]["refused"] = refused
    drill.state["overlap_check"] = {
        "refused": refused,
        "reason": blocked["error"][:400],
        "tx": blocked["tx"],
    }
    log("overlap check", drill.state["overlap_check"])
    if not refused:
        OUT.write_text(json.dumps({"state": drill.state, "steps": drill.steps}, indent=2))
        raise SystemExit("disburse was not refused while the refund was unresolved")

    drill.write("confirm_refund", [ROUND])
    time.sleep(95)
    drill.write("confirm_refund", [ROUND])
    settled = wait_for(
        lambda: drill.read("get_stats"),
        lambda stats: stats["refund_in_flight"] == 0,
        timeout=600,
        label="refund settlement",
    )
    refund = drill.read("get_refund", args=[ROUND, drill.account.address])
    drill.state["refund_settled"] = {
        "in_flight": settled["refund_in_flight"],
        "claimed": refund["claimed_atto"],
        "surplus": settled["returned_surplus_atto"],
    }
    log("refund settled", drill.state["refund_settled"])
    if settled["refund_in_flight"] != 0:
        OUT.write_text(json.dumps({"state": drill.state, "steps": drill.steps}, indent=2))
        raise SystemExit("the refund never settled; stopping before the payout leg")

    payout = drill.write("disburse", [proposal_id])
    if not payout["ok"]:
        drill.state["aborted"] = "disburse still failed after the refund settled"
        OUT.write_text(json.dumps({"state": drill.state, "steps": drill.steps}, indent=2))
        raise SystemExit(drill.state["aborted"])
    pending = drill.read("get_proposal", args=[proposal_id])
    drill.state["after_disburse"] = {
        "status": pending["status"],
        "state": pending["payout_state"],
        "attempts": pending["payout_attempts"],
        "tx": payout["tx"],
    }
    log("after disburse", drill.state["after_disburse"])

    drill.write("confirm_payout", [proposal_id])
    first = drill.read("get_proposal", args=[proposal_id])
    drill.state["confirm_first"] = {
        "status": first["status"],
        "state": first["payout_state"],
        "observed_at": first["payout_observed_at"],
        "confirm_after": first["payout_confirm_after"],
    }
    log("first confirmation", drill.state["confirm_first"])

    time.sleep(95)
    drill.write("confirm_payout", [proposal_id])
    second = drill.read("get_proposal", args=[proposal_id])
    drill.state["confirm_second"] = {
        "status": second["status"],
        "state": second["payout_state"],
        "paid_atto": second["paid_atto"],
    }
    log("second confirmation", drill.state["confirm_second"])

    bounced = wait_for(
        lambda: drill.read("get_stats"),
        lambda stats: int(stats["returned_surplus_atto"]) > 0,
        timeout=900,
        interval=20,
        label="returned value",
    )
    drill.state["surplus_after_bounce"] = bounced["returned_surplus_atto"]
    log("returned value", {"surplus_atto": bounced["returned_surplus_atto"]})

    if int(bounced["returned_surplus_atto"]) > 0 and second["payout_state"] == "delivered":
        reconcile = drill.write("reconcile_payout", [proposal_id])
        final = drill.read("get_proposal", args=[proposal_id])
        stats = drill.read("get_stats")
        round_after = drill.read("get_round", args=[ROUND])
        drill.state["after_reconcile"] = {
            "ok": reconcile["ok"],
            "status": final["status"],
            "state": final["payout_state"],
            "paid_atto": final["paid_atto"],
            "total_paid_atto": stats["total_paid_atto"],
            "reserved_atto": round_after["reserved_atto"],
            "bounced_payouts": stats["bounced_payouts"],
            "surplus": stats["returned_surplus_atto"],
            "tx": reconcile["tx"],
        }
        log("after reconcile", drill.state["after_reconcile"])
    else:
        drill.state["note"] = (
            "The transfer bounced before the payout settled, so the settle window prevented the bad "
            "state instead of the reversal path being exercised."
        )
        log("bounce arrived before settlement", {"state": second["payout_state"]})

    OUT.write_text(json.dumps({"state": drill.state, "steps": drill.steps}, indent=2))
    log("wrote", {"path": str(OUT)})


if __name__ == "__main__":
    main()

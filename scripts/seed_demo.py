"""Seed a fresh Aequa Grants deployment with demo state for the frontend.

Creates three rounds so the UI shows different lifecycle states at once:

* ``r0001`` — open and funded, two proposals, both evaluated
* ``r0002`` — open but unfunded, so the funding flow is visible
* ``r0003`` — funded, then closed, with one evaluated proposal

Every step is recorded in ``docs/seed-state.json`` under the contract it ran
against, so the script can be re-run after a failure and skips what already
happened (a fresh deploy clears the state by itself).

    python scripts/seed_demo.py
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
EVIDENCE = "https://aequa-grant.vercel.app"
RUBRIC = ROOT / "scripts" / "rubric.json"
STATE = ROOT / "docs" / "seed-state.json"
WAIT = {"retries": 240, "interval": 5000}


def log(step, payload=None):
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%H:%M:%S")
    print(f"[{stamp}] {step}", flush=True)
    if payload is not None:
        print(json.dumps(payload, indent=2, default=str)[:2500], flush=True)


def leader_error(receipt):
    leader = (receipt.get("consensus_data") or {}).get("leader_receipt") or []
    if not leader or leader[0].get("execution_result") == "SUCCESS":
        return ""
    result = leader[0].get("result") or {}
    payload = result.get("payload") if isinstance(result, dict) else None
    if isinstance(payload, dict):
        return str(payload.get("readable") or payload)
    return str(result or leader[0])[:1500]


def retry(fn, label, attempts=5, pause=15):
    last = None
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as error:
            last = error
            log(f"{label}: retry {attempt + 1}/{attempts}", {"error": str(error)[:250]})
            time.sleep(pause)
    raise SystemExit(f"{label} kept failing: {last}")


class Seed:
    def __init__(self):
        load_dotenv(ROOT / ".env")
        self.owner = create_account(os.environ["ACCOUNT_PRIVATE_KEY"].strip())
        self.applicant = create_account(os.environ["APPLICANT_PRIVATE_KEY"].strip())
        self.owner_client = create_client(chain=studionet, account=self.owner, endpoint=RPC)
        self.applicant_client = create_client(
            chain=studionet, account=self.applicant, endpoint=RPC
        )
        self.state = {"steps": {}}
        if STATE.is_file():
            saved = json.loads(STATE.read_text(encoding="utf-8"))
            if saved.get("contract"):
                self.state = {
                    "contract": saved["contract"],
                    "steps": saved.get("steps") or {},
                }

    def save(self):
        STATE.write_text(json.dumps(self.state, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    def done(self, name):
        return name in self.state["steps"]

    def write(self, name, method, args, value=0, client=None):
        if self.done(name):
            log(f"{name}: already done ({self.state['steps'][name]['tx']})")
            return
        client = client or self.owner_client

        def call():
            tx = client.write_contract(
                address=self.state["contract"], function_name=method, args=args, value=value
            )
            receipt = client.wait_for_transaction_receipt(
                transaction_hash=tx,
                status=TransactionStatus.FINALIZED,
                retries=WAIT["retries"],
                interval=WAIT["interval"],
            )
            return tx, receipt

        tx, receipt = retry(call, name)
        entry = {
            "method": method,
            "tx": str(tx),
            "result": receipt.get("result_name"),
            "error": leader_error(receipt),
        }
        if entry["error"] or entry["result"] not in ("MAJORITY_AGREE", "AGREE"):
            raise SystemExit(f"{name} failed: {entry['result']} {entry['error']}")
        self.state["steps"][name] = entry
        self.save()
        log(name, entry)

    def read(self, method, args=None, client=None):
        client = client or self.owner_client
        return retry(
            lambda: client.read_contract(
                address=self.state["contract"], function_name=method, args=args or []
            ),
            f"read {method}",
        )


def main():
    seed = Seed()
    if "contract" not in seed.state:
        raise SystemExit("set seed.state['contract'] first (see docs/seed-state.json)")

    rubric = json.dumps(json.loads(RUBRIC.read_text(encoding="utf-8")), separators=(",", ":"))

    def deadline(days):
        return (
            (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=days))
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z")
        )

    # r0001 — open and funded
    seed.write(
        "create r0001",
        "create_round",
        [
            "Community tooling round",
            "Funding for tools, dashboards and docs that make public grant evaluation "
            "easier to audit on GenLayer. Proposals must ship something usable and link "
            "public evidence for every claim.",
            rubric,
            5 * GEN,
            2 * GEN,
            0,
            deadline(14),
        ],
    )
    seed.write("fund r0001", "fund_round", ["r0001"], value=5 * GEN)

    # r0002 — open, waiting for funds
    seed.write(
        "create r0002",
        "create_round",
        [
            "Public goods micro-grants",
            "Small, fast grants for public goods: open data, reproducibility tooling and "
            "community infrastructure. Funding opens once the round is topped up.",
            rubric,
            1 * GEN,
            GEN // 2,
            0,
            deadline(30),
        ],
    )

    # r0003 — funded, then closed
    seed.write(
        "create r0003",
        "create_round",
        [
            "Builder sprint round",
            "A short sprint round for teams that already shipped a working demo. Closed to "
            "new proposals after the sprint window.",
            rubric,
            2 * GEN,
            1 * GEN,
            0,
            deadline(7),
        ],
    )
    seed.write("fund r0003", "fund_round", ["r0003"], value=2 * GEN)

    # proposals must be submitted while the round is still open
    seed.write(
        "submit r0001 owner",
        "submit_proposal",
        [
            "r0001",
            "Aequa transparency dashboard",
            "We maintain the live Aequa Grants dashboard at https://aequa-grant.vercel.app. "
            "It publishes every grant score and lets any community member audit the evidence "
            "behind each decision. A developer new to GenLayer can follow grant evaluation "
            "end to end, from rubric to funded proposal.",
            [EVIDENCE],
            GEN,
        ],
    )
    seed.write(
        "submit r0001 applicant",
        "submit_proposal",
        [
            "r0001",
            "Evidence toolkit for grant reviewers",
            "A small library that checks whether a proposal's public evidence is reachable "
            "and quotes the passage that supports each claim, so reviewers spend their time "
            "judging quality instead of hunting links. The toolkit runs against the same "
            "public dashboard the round uses for its own evidence.",
            [EVIDENCE],
            (3 * GEN) // 4,
        ],
        client=seed.applicant_client,
    )
    seed.write(
        "submit r0003 owner",
        "submit_proposal",
        [
            "r0003",
            "Replicable grant evaluation playbook",
            "A step-by-step playbook describing how a closed round was evaluated: rubric "
            "design, evidence requirements, gate checks and the resulting scores. The "
            "outcome is documented on the public dashboard so other communities can reuse it.",
            [EVIDENCE],
            GEN // 2,
        ],
    )

    seed.write("close r0003", "close_round", ["r0003"])

    for step, proposal in (
        ("evaluate p1", "p00000001"),
        ("evaluate p2", "p00000002"),
        ("evaluate p3", "p00000003"),
    ):
        seed.write(step, "evaluate_proposal", [proposal])

    log("state", seed.read("get_stats"))
    log("rounds", seed.read("list_rounds"))
    log("proposals", seed.read("list_proposals"))


if __name__ == "__main__":
    main()

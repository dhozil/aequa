"""Operator CLI for the Aequa Grants contract.

The GenLayer JS CLI sends ``value: 0`` on every write and mangles quoted JSON
arguments on Windows shells, so this helper talks to the contract through
``genlayer-py`` instead. Every command prints the resulting on-chain state.

Examples are in README.md.
"""

import argparse
import datetime as dt
import json
import os
import pathlib
import sys
from decimal import Decimal

from dotenv import load_dotenv
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEN = 10**18
DEFAULT_RPC = "https://studio.genlayer.com/api"
DEFAULT_RUBRIC = ROOT / "scripts" / "rubric.json"
WAIT = {"retries": 120, "interval": 5000}


def _gen(value: str) -> int:
    return int(Decimal(value) * GEN)


def _iso_deadline(value: str) -> str:
    if value:
        return value
    deadline = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=14)
    return deadline.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _client(args):
    load_dotenv(ROOT / ".env")
    key = os.environ.get(args.key_env, "")
    if not key:
        raise SystemExit(f"{args.key_env} is not set (check .env)")
    return create_client(
        chain=studionet,
        account=create_account(key),
        endpoint=args.rpc,
    )


def _leader_payload(receipt):
    leader = (receipt.get("consensus_data") or {}).get("leader_receipt") or []
    if not leader:
        return None
    if leader[0].get("execution_result") == "SUCCESS":
        return None
    result = leader[0].get("result") or {}
    return result.get("payload") or leader[0].get("genvm_result") or receipt


def _write(client, address, method, params, value=0):
    tx_hash = client.write_contract(
        address=address,
        function_name=method,
        args=params,
        value=value,
    )
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        # FINALIZED, not ACCEPTED: accepted only means the leader proposed it.
        status=TransactionStatus.FINALIZED,
        retries=WAIT["retries"],
        interval=WAIT["interval"],
    )
    outcome = receipt.get("result_name")
    if outcome not in ("MAJORITY_AGREE", "AGREE"):
        raise SystemExit(f"{method} did not reach consensus: {outcome}")
    failure = _leader_payload(receipt)
    if failure is not None:
        raise SystemExit(f"{method} failed: {failure}")
    print(f"{method}: {tx_hash} ({outcome})")
    return receipt


def _read(client, address, method, params=None):
    return client.read_contract(address=address, function_name=method, args=params or [])


def _print(value):
    print(json.dumps(value, indent=2, sort_keys=True))


def cmd_list(args):
    client = _client(args)
    _print(
        {
            "stats": _read(client, args.contract, "get_stats"),
            "rounds": _read(client, args.contract, "list_rounds"),
            "proposals": _read(client, args.contract, "list_proposals"),
        }
    )


def cmd_create_round(args):
    client = _client(args)
    rubric = json.loads(pathlib.Path(args.rubric).read_text(encoding="utf-8"))
    rubric_json = json.dumps(rubric, separators=(",", ":"))

    _write(
        client,
        args.contract,
        "create_round",
        [
            args.title,
            args.description,
            rubric_json,
            _gen(args.budget),
            _gen(args.max_grant),
            args.min_score,
            _iso_deadline(args.deadline),
        ],
    )
    rounds = _read(client, args.contract, "list_rounds")
    _print(rounds[-1])


def cmd_fund(args):
    client = _client(args)
    _write(client, args.contract, "fund_round", [args.round_id], value=_gen(args.gen))
    _print(_read(client, args.contract, "get_round", [args.round_id]))


def cmd_submit(args):
    client = _client(args)
    _write(
        client,
        args.contract,
        "submit_proposal",
        [
            args.round_id,
            args.title,
            args.summary,
            args.evidence,
            _gen(args.request),
        ],
    )
    proposals = _read(client, args.contract, "list_round_proposals", [args.round_id])
    _print(proposals[-1])


def cmd_evaluate(args):
    client = _client(args)
    _write(client, args.contract, "evaluate_proposal", [args.proposal_id])
    _print(_read(client, args.contract, "get_proposal", [args.proposal_id]))


def cmd_disburse(args):
    client = _client(args)
    _write(client, args.contract, "disburse", [args.proposal_id])
    _print(_read(client, args.contract, "get_proposal", [args.proposal_id]))
    _print(_read(client, args.contract, "get_stats"))


def cmd_confirm_payout(args):
    client = _client(args)
    _write(client, args.contract, "confirm_payout", [args.proposal_id])
    _print(_read(client, args.contract, "get_proposal", [args.proposal_id]))
    _print(_read(client, args.contract, "get_stats"))


def cmd_recover_payout(args):
    client = _client(args)
    _write(client, args.contract, "recover_payout", [args.proposal_id])
    _print(_read(client, args.contract, "get_proposal", [args.proposal_id]))
    _print(_read(client, args.contract, "get_stats"))


def cmd_close_round(args):
    client = _client(args)
    _write(client, args.contract, "close_round", [args.round_id])
    _print(_read(client, args.contract, "get_round", [args.round_id]))


def cmd_claim_refund(args):
    """Pull this signer's own pro-rata refund. There is no owner sweep.

    The claim stays pending until `confirm-refund` observes that the transfer
    left the contract; a claim that never arrives can be retried after the
    `recover-refund` grace period.
    """
    client = _client(args)
    funder = client.local_account.address
    _write(client, args.contract, "claim_refund", [args.round_id])
    _print(_read(client, args.contract, "get_refund", [args.round_id, funder]))
    _print(_read(client, args.contract, "get_round", [args.round_id]))


def cmd_confirm_refund(args):
    """Record a claimed refund once the balance proves it was delivered."""
    client = _client(args)
    funder = args.funder or client.local_account.address
    _write(client, args.contract, "confirm_refund", [args.round_id])
    _print(_read(client, args.contract, "get_refund", [args.round_id, funder]))
    _print(_read(client, args.contract, "get_round", [args.round_id]))


def cmd_recover_refund(args):
    """Discard an undelivered refund claim after the grace period so it can be retried."""
    client = _client(args)
    funder = args.funder or client.local_account.address
    _write(client, args.contract, "recover_refund", [args.round_id])
    _print(_read(client, args.contract, "get_refund", [args.round_id, funder]))


def build_parser():
    parser = argparse.ArgumentParser(description="Aequa Grants operator CLI")
    parser.add_argument("--contract", required=True, help="Aequa Grants contract address")
    parser.add_argument("--rpc", default=DEFAULT_RPC, help=f"RPC endpoint (default: {DEFAULT_RPC})")
    parser.add_argument(
        "--key-env",
        default="ACCOUNT_PRIVATE_KEY",
        help="Environment variable holding the signing key (default: ACCOUNT_PRIVATE_KEY)",
    )
    parser.add_argument(
        "--wait-retries",
        type=int,
        default=WAIT["retries"],
        help="Receipt polls before giving up (default: 120)",
    )
    parser.add_argument(
        "--wait-interval",
        type=int,
        default=WAIT["interval"],
        help="Milliseconds between receipt polls (default: 5000)",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    sub = commands.add_parser("list", help="Print stats, rounds and proposals")
    sub.set_defaults(func=cmd_list)

    sub = commands.add_parser("create-round", help="Create a round (owner only)")
    sub.add_argument("--title", required=True)
    sub.add_argument("--description", default="")
    sub.add_argument("--rubric", default=str(DEFAULT_RUBRIC))
    sub.add_argument("--budget", required=True, help="Round budget in GEN")
    sub.add_argument("--max-grant", required=True, help="Per-proposal cap in GEN")
    sub.add_argument("--min-score", type=int, default=60)
    sub.add_argument("--deadline", default="", help="ISO-8601 deadline (default: now + 14 days)")
    sub.set_defaults(func=cmd_create_round)

    sub = commands.add_parser("fund", help="Fund a round with GEN")
    sub.add_argument("--round-id", required=True)
    sub.add_argument("--gen", required=True, help="Amount in GEN")
    sub.set_defaults(func=cmd_fund)

    sub = commands.add_parser("submit", help="Submit a proposal")
    sub.add_argument("--round-id", required=True)
    sub.add_argument("--title", required=True)
    sub.add_argument("--summary", required=True)
    sub.add_argument("--evidence", nargs="+", required=True, help="Public https URLs")
    sub.add_argument("--request", required=True, help="Requested amount in GEN")
    sub.set_defaults(func=cmd_submit)

    sub = commands.add_parser("evaluate", help="Run the AI evaluation for a proposal")
    sub.add_argument("--proposal-id", required=True)
    sub.set_defaults(func=cmd_evaluate)

    sub = commands.add_parser("disburse", help="Send an approved grant (payout pending)")
    sub.add_argument("--proposal-id", required=True)
    sub.set_defaults(func=cmd_disburse)

    sub = commands.add_parser(
        "confirm-payout", help="Record delivery once the transfer has left the contract"
    )
    sub.add_argument("--proposal-id", required=True)
    sub.set_defaults(func=cmd_confirm_payout)

    sub = commands.add_parser(
        "recover-payout", help="Return a bounced payout for retry after the grace period"
    )
    sub.add_argument("--proposal-id", required=True)
    sub.set_defaults(func=cmd_recover_payout)

    sub = commands.add_parser("close-round", help="Close a round to new proposals and funding")
    sub.add_argument("--round-id", required=True)
    sub.set_defaults(func=cmd_close_round)

    sub = commands.add_parser(
        "claim-refund",
        help="Claim the signing wallet's pro-rata refund (run with --key-env for each funder)",
    )
    sub.add_argument("--round-id", required=True)
    sub.set_defaults(func=cmd_claim_refund)

    sub = commands.add_parser(
        "confirm-refund", help="Record a claimed refund once delivery is observed"
    )
    sub.add_argument("--round-id", required=True)
    sub.add_argument(
        "--funder",
        default="",
        help="Funder address to print (default: the signing wallet)",
    )
    sub.set_defaults(func=cmd_confirm_refund)

    sub = commands.add_parser(
        "recover-refund",
        help="Discard an undelivered refund claim after the grace period so it can be retried",
    )
    sub.add_argument("--round-id", required=True)
    sub.add_argument(
        "--funder",
        default="",
        help="Funder address to print (default: the signing wallet)",
    )
    sub.set_defaults(func=cmd_recover_refund)

    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    WAIT["retries"] = args.wait_retries
    WAIT["interval"] = args.wait_interval
    args.func(args)


if __name__ == "__main__":
    sys.exit(main())

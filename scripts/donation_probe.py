"""Prove that a bare GEN transfer looks like a returned child transfer.

`reconcile_payout` / `reconcile_refund` detect a bounce through
`balance - accounted`, so anything that raises the balance without a call looks
identical. This sends 0.001 GEN to the contract with no calldata, then reads
`get_stats`: `returned_surplus_atto` moves by exactly the donated amount.

Run it against a contract whose reconcile is still permissionless to see the
reversal succeed, or against the current one to see it refuse a third party.

    python scripts/donation_probe.py
"""

import json
import os
import pathlib
import sys
from decimal import Decimal

import requests

from dotenv import load_dotenv
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEN = 10**18
RPC = "https://studio.genlayer.com/api"
CONTRACT = "0x0aE0139DBD00DB704Ac27Eb45492FD1A73a33Ae8"
AMOUNT = Decimal("0.001")


def main() -> int:
    load_dotenv(ROOT / ".env")
    key = os.environ.get("ACCOUNT_PRIVATE_KEY", "")
    if not key:
        raise SystemExit("ACCOUNT_PRIVATE_KEY is not set (check .env)")
    client = create_client(chain=studionet, account=create_account(key), endpoint=RPC)

    before = client.read_contract(address=CONTRACT, function_name="get_stats", args=[])
    print("before:", json.dumps(before, indent=2, sort_keys=True))

    # StudioNet rejects eth_sendTransaction, so sign the bare value transfer
    # locally and broadcast it as a raw transaction (no calldata, no method).
    signed = client.local_account.sign_transaction(
        {
            "to": CONTRACT,
            "value": int(AMOUNT * GEN),
            "gas": 21000,
            "gasPrice": client.w3.eth.gas_price,
            "nonce": client.w3.eth.get_transaction_count(client.local_account.address),
            "chainId": client.w3.eth.chain_id,
        }
    )
    raw = signed.raw_transaction
    # The packaged provider cannot serialise HexBytes, so broadcast over plain
    # JSON-RPC; the payload is the same `eth_sendRawTransaction` call.
    response = requests.post(
        RPC,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_sendRawTransaction",
            "params": ["0x" + raw.hex().removeprefix("0x")],
        },
        timeout=30,
    )
    body = response.json()
    if "error" in body:
        raise SystemExit(f"eth_sendRawTransaction failed: {body['error']}")
    tx = body["result"]
    print("transfer tx:", tx)
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx,
        status=TransactionStatus.FINALIZED,
        retries=120,
        interval=5000,
    )
    print("transfer status:", receipt.get("status_name") or receipt.get("status"))

    after = client.read_contract(address=CONTRACT, function_name="get_stats", args=[])
    print("after:", json.dumps(after, indent=2, sort_keys=True))
    surplus = int(after.get("returned_surplus_atto", 0)) - int(
        before.get("returned_surplus_atto", 0)
    )
    print(f"surplus delta: {surplus} atto ({surplus / GEN} GEN)")

    out = ROOT / "docs" / "donation-probe.json"
    out.write_text(
        json.dumps(
            {
                "contract": CONTRACT,
                "transfer_tx": tx,
                "transfer_status": receipt.get("status_name")
                or str(receipt.get("status")),
                "amount_atto": str(int(AMOUNT * GEN)),
                "surplus_before_atto": before.get("returned_surplus_atto"),
                "surplus_after_atto": after.get("returned_surplus_atto"),
                "stats_before": before,
                "stats_after": after,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    print("written:", out)
    return 0 if surplus == int(AMOUNT * GEN) else 1


if __name__ == "__main__":
    sys.exit(main())

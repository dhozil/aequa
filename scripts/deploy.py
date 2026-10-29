"""Deploy the Aequa Grants contract with the configured account.

The GenLayer CLI deploys from its own keystore, while this project keeps the
deployer key in ``.env`` (see ``scripts/sync_wallet.py``). This helper deploys
through ``genlayer-py`` so both paths use the same wallet.

    python scripts/deploy.py
    python scripts/deploy.py --contract contracts/aequa_grants.py --rpc https://studio.genlayer.com/api
"""

import argparse
import json
import os
import pathlib

from dotenv import load_dotenv
from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_CONTRACT = ROOT / "contracts" / "aequa_grants.py"
DEFAULT_RPC = "https://studio.genlayer.com/api"


def _contract_address(receipt) -> str:
    decoded = receipt.get("tx_data_decoded") or {}
    if "contract_address" in decoded:
        return decoded["contract_address"]
    data = receipt.get("data") or {}
    if "contract_address" in data:
        return data["contract_address"]
    raise SystemExit("deploy receipt is missing the contract address")


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy Aequa Grants")
    parser.add_argument("--contract", default=str(DEFAULT_CONTRACT), help="contract source path")
    parser.add_argument("--rpc", default=DEFAULT_RPC, help="RPC endpoint")
    parser.add_argument("--key-env", default="ACCOUNT_PRIVATE_KEY", help="env var holding the deployer key")
    parser.add_argument("--retries", type=int, default=120, help="receipt polling attempts")
    parser.add_argument("--interval", type=int, default=3000, help="receipt polling interval in ms")
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")
    key = os.environ.get(args.key_env, "").strip()
    if not key:
        raise SystemExit(f"{args.key_env} is not set (run scripts/sync_wallet.py)")

    source = pathlib.Path(args.contract)
    if not source.is_file():
        raise SystemExit(f"contract not found: {source}")
    code = source.read_text(encoding="utf-8")

    account = create_account(key)
    client = create_client(chain=studionet, account=account, endpoint=args.rpc)
    print(f"deployer: {account.address}")
    print(f"contract: {source.name}")

    tx_hash = client.deploy_contract(code=code, args=[])
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        status=TransactionStatus.ACCEPTED,
        retries=args.retries,
        interval=args.interval,
    )
    address = _contract_address(receipt)

    stats = client.read_contract(
        address=address,
        function_name="get_stats",
        args=[],
    )
    print(f"tx:       {tx_hash}")
    print(f"address:  {address}")
    print(f"result:   {receipt.get('result_name')}")
    print(json.dumps({"address": address, "tx": tx_hash, "stats": stats}, indent=2))


if __name__ == "__main__":
    main()

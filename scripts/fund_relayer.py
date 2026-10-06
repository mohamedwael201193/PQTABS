"""Create a relayer key if needed and send it a small USDC gas float. Prints the address and receipt only."""

import json
import pathlib

from eth_account import Account

import stage_mainnet as stage

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY_PATH = ROOT / "pq-keys" / "relayer.json"
FLOAT = 300_000


def upsert_env(name: str, value: str) -> None:
    path = ROOT / ".env"
    lines = path.read_text(encoding="utf-8").splitlines()
    prefix = name + "="
    replaced = False
    for index, line in enumerate(lines):
        if line.startswith(prefix):
            current = line.split("=", 1)[1].strip().strip('"')
            if current:
                return
            lines[index] = prefix + value
            replaced = True
            break
    if not replaced:
        lines.append(prefix + value)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    if KEY_PATH.exists():
        stored = json.loads(KEY_PATH.read_text(encoding="utf-8"))
        account = stage.account_from_hex(stored["private_key"])
    else:
        account = Account.create()
        KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
        KEY_PATH.write_text(
            json.dumps({"address": account.address, "private_key": account.key.hex()}) + "\n",
            encoding="utf-8",
        )
    upsert_env("RELAYER_ADDRESS", account.address)
    upsert_env("RELAYER_PRIVATE_KEY", account.key.hex())
    balance = stage.usdc_balance(account.address)
    print(f"relayer {account.address} balance {balance}")
    if balance >= FLOAT:
        return
    deployer = stage.load_deployer()
    receipt = stage.send(
        deployer,
        stage.USDC,
        stage.call_data("transfer(address,uint256)", ["address", "uint256"], [account.address, FLOAT]),
    )
    stage.expect_success(receipt, "fund relayer")
    after = stage.usdc_balance(account.address)
    if after != balance + FLOAT:
        raise SystemExit(f"relayer balance {after}")
    print(f"funded {receipt['hash']} balance {after}")


if __name__ == "__main__":
    main()

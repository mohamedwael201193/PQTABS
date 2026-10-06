"""Arc mainnet staging. Disposable keys, tiny USDC, stop on the first failed receipt.

Prints addresses, hashes, balances, and revert names. Never prints private keys.
"""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
from typing import Any

from eth_abi import decode, encode
from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_utils import function_signature_to_4byte_selector, keccak, to_checksum_address

ROOT = pathlib.Path(__file__).resolve().parents[1]
RPC = "https://rpc.mainnet.arc.io"
CHAIN_ID = 5042
USDC = to_checksum_address("0x3600000000000000000000000000000000000000")
BARKEEP = to_checksum_address("0xccebC58DD1F5937B36D5f9F89f0754424f4D443c")
TAB_IMPL = to_checksum_address("0x89B63f2E43dea9014750925C01996D34856B01D2")
SIGNER = ROOT / "signer" / "target" / "release" / "pqtabs-sign.exe"
KEYS = ROOT / "pq-keys" / "staging"
OUT = ROOT / "deployments" / "staging.json"

# 6-decimal raw units. 100_000 = 0.1 USDC.
MAX_EXPOSURE = 200_000
ROOT_FUND = 150_000
TAB_CAP = 100_000
MAX_PER_CALL = 40_000
SPEND = 10_000
GAS_FLOAT = 300_000
EXPIRY_SECONDS = 300
MAX_FEE = 30 * 10**9
PRIORITY = 2 * 10**9


def log(message: str) -> None:
    print(message, flush=True)


def rpc(method: str, params: list) -> Any:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="ascii") as handle:
        handle.write(body)
        path = handle.name
    try:
        completed = subprocess.run(
            ["curl.exe", "-sS", "-A", "cast/1.8.5", "-H", "content-type: application/json", "--data-binary", f"@{path}", RPC],
            check=True,
            capture_output=True,
            text=True,
        )
    finally:
        pathlib.Path(path).unlink(missing_ok=True)
    payload = json.loads(completed.stdout)
    if "error" in payload:
        err = payload["error"]
        message = err.get("message", str(err)) if isinstance(err, dict) else str(err)
        data = err.get("data") if isinstance(err, dict) else None
        raise RuntimeError(f"{method} failed: {message} {data if data else ''}".strip())
    return payload["result"]


def selector(signature: str) -> bytes:
    return function_signature_to_4byte_selector(signature)


def call_data(signature: str, types: list[str], args: list) -> str:
    return "0x" + (selector(signature) + encode(types, args)).hex()


def eth_call(to: str, data: str) -> bytes:
    result = rpc("eth_call", [{"to": to, "data": data}, "latest"])
    return bytes.fromhex(result[2:])


def load_env(name: str) -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit(f"missing {name}")


def account_from_hex(value: str) -> Account:
    key = value if value.startswith("0x") else "0x" + value
    return Account.from_key(key)


def save_report(report: dict) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def load_report() -> dict:
    if OUT.exists():
        return json.loads(OUT.read_text(encoding="utf-8"))
    return {"network": "arc-mainnet", "chain_id": CHAIN_ID, "classification": "EXPERIMENTAL", "steps": []}


def usdc_balance(holder: str) -> int:
    raw = eth_call(USDC, call_data("balanceOf(address)", ["address"], [holder]))
    return int.from_bytes(raw, "big")


def chain_now() -> int:
    block = rpc("eth_getBlockByNumber", ["latest", False])
    return int(block["timestamp"], 16)


def send(acct: Account, to: str | None, data: str, gas: int | None = None) -> dict:
    nonce = int(rpc("eth_getTransactionCount", [acct.address, "pending"]), 16)
    estimate_tx: dict[str, Any] = {"from": acct.address, "data": data}
    if to is not None:
        estimate_tx["to"] = to
    if gas is None:
        estimated = int(rpc("eth_estimateGas", [estimate_tx]), 16)
        gas = int(estimated * 1.25) + 50_000
    tx: dict[str, Any] = {
        "chainId": CHAIN_ID,
        "nonce": nonce,
        "data": data,
        "gas": gas,
        "maxFeePerGas": MAX_FEE,
        "maxPriorityFeePerGas": PRIORITY,
        "value": 0,
        "type": 2,
    }
    if to is not None:
        tx["to"] = to
    signed = acct.sign_transaction(tx)
    raw = signed.raw_transaction.hex()
    if not raw.startswith("0x"):
        raw = "0x" + raw
    tx_hash = rpc("eth_sendRawTransaction", [raw])
    log(f"sent {tx_hash}")
    deadline = time.time() + 180
    while time.time() < deadline:
        receipt = rpc("eth_getTransactionReceipt", [tx_hash])
        if receipt is not None:
            status = int(receipt["status"], 16)
            record = {
                "hash": tx_hash,
                "status": status,
                "block": int(receipt["blockNumber"], 16),
                "gas_used": int(receipt["gasUsed"], 16),
                "contract": to_checksum_address(receipt["contractAddress"]) if receipt.get("contractAddress") else None,
            }
            log(f"receipt status={status} block={record['block']} gas={record['gas_used']}")
            return record
        time.sleep(2)
    raise RuntimeError(f"no receipt for {tx_hash}")


def expect_success(receipt: dict, label: str) -> None:
    if receipt["status"] != 1:
        raise RuntimeError(f"{label} reverted: {receipt['hash']}")


def signer(*args: str) -> str:
    completed = subprocess.run([str(SIGNER), *args], check=True, capture_output=True, text=True)
    return completed.stdout.strip()


def ensure_pq(name: str) -> str:
    path = KEYS / f"{name}.json"
    if not path.exists():
        KEYS.mkdir(parents=True, exist_ok=True)
        return signer("keygen", str(path))
    file = json.loads(path.read_text(encoding="utf-8"))
    return file["verifying_key_hex"]


def ensure_eoa(name: str) -> Account:
    path = KEYS / f"{name}.json"
    if path.exists():
        stored = json.loads(path.read_text(encoding="utf-8"))
        return account_from_hex(stored["private_key"])
    acct = Account.create()
    KEYS.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"address": acct.address, "private_key": acct.key.hex()}) + "\n", encoding="utf-8")
    return acct


def pq_execute(submitter: Account, root: str, vk_path: pathlib.Path, action: bytes, nonce: int, deadline: int) -> dict:
    digest = signer(
        "digest",
        str(CHAIN_ID),
        root,
        str(nonce),
        str(deadline),
        "0x" + action.hex(),
    )
    signature = signer("sign", str(vk_path), digest)
    data = call_data(
        "execute(bytes,uint64,uint64,bytes)",
        ["bytes", "uint64", "uint64", "bytes"],
        [action, nonce, deadline, bytes.fromhex(signature)],
    )
    return send(submitter, root, data)


def next_nonce(root: str) -> int:
    raw = eth_call(root, "0x" + selector("nextNonce()").hex())
    return int.from_bytes(raw, "big")


def preflight() -> None:
    chain = int(rpc("eth_chainId", []), 16)
    if chain != CHAIN_ID:
        raise SystemExit(f"chain id {chain}")
    impl = decode(["address"], eth_call(BARKEEP, "0x" + selector("IMPLEMENTATION()").hex()))[0]
    usdc = decode(["address"], eth_call(BARKEEP, "0x" + selector("USDC()").hex()))[0]
    if to_checksum_address(impl) != TAB_IMPL or to_checksum_address(usdc) != USDC:
        raise SystemExit("Barkeep factory does not match the pinned implementation or USDC")
    if not SIGNER.exists():
        raise SystemExit("release signer is missing")
    balance = usdc_balance(load_deployer().address)
    if balance < 2_000_000:
        raise SystemExit(f"deployer USDC balance {balance} is below the 2 USDC safety floor")
    log(f"preflight ok chain={chain} deployer_usdc={balance}")


def load_deployer() -> Account:
    expected = to_checksum_address(load_env("DEPLOYER_ADDRESS"))
    acct = account_from_hex(load_env("DEPLOYER_PRIVATE_KEY"))
    if acct.address != expected:
        raise SystemExit("deployer key does not match DEPLOYER_ADDRESS")
    return acct


def factory_bytecode() -> str:
    completed = subprocess.run(
        ["forge", "inspect", "RootFactory", "bytecode"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    bytecode = completed.stdout.strip()
    if not bytecode.startswith("0x") or len(bytecode) < 100:
        raise SystemExit("factory bytecode missing")
    return bytecode


def main() -> None:
    os.environ["PATH"] = os.path.expandvars(r"%USERPROFILE%\.foundry\bin;") + os.environ.get("PATH", "")
    preflight()
    if "--preflight" in sys.argv:
        return
    report = load_report()
    deployer = load_deployer()
    user_b = ensure_eoa("registrar-b")
    agent_a = ensure_eoa("agent-a")
    agent_b = ensure_eoa("agent-b")
    payee = ensure_eoa("payee")
    vk_a = ensure_pq("root-a")
    vk_b = ensure_pq("root-b")
    report["registrar_a"] = deployer.address
    report["registrar_b"] = user_b.address
    report["agent_a"] = agent_a.address
    report["agent_b"] = agent_b.address
    report["payee"] = payee.address
    report["vk_a"] = "0x" + vk_a.removeprefix("0x")
    report["vk_b"] = "0x" + vk_b.removeprefix("0x")
    save_report(report)

    if report.get("factory") and len(eth_call_code(report["factory"])) > 2:
        factory = report["factory"]
        log(f"reuse factory {factory}")
    else:
        before = usdc_balance(deployer.address)
        receipt = send(deployer, None, factory_bytecode())
        expect_success(receipt, "deploy factory")
        factory = receipt["contract"]
        report["factory"] = factory
        report["deploy"] = {**receipt, "deployer_usdc_before": before, "deployer_usdc_after": usdc_balance(deployer.address)}
        save_report(report)
        log(f"factory {factory}")

    if usdc_balance(user_b.address) < 100_000:
        receipt = send(deployer, USDC, call_data("transfer(address,uint256)", ["address", "uint256"], [user_b.address, GAS_FLOAT]))
        expect_success(receipt, "fund registrar B")
        report["fund_registrar_b"] = receipt
        save_report(report)

    root_a = ensure_root(report, "root_a", deployer, bytes.fromhex(vk_a.removeprefix("0x")), b"staging-a")
    root_b = ensure_root(report, "root_b", user_b, bytes.fromhex(vk_b.removeprefix("0x")), b"staging-b")
    fund_root(report, deployer, "fund_root_a", root_a)
    fund_root(report, deployer, "fund_root_b", root_b)

    expiry = chain_now() + EXPIRY_SECONDS
    report["expiry"] = expiry
    tab_a = open_tab(report, deployer, "tab_a", root_a, KEYS / "root-a.json", agent_a.address, payee.address, expiry)
    tab_b = open_tab(report, deployer, "tab_b", root_b, KEYS / "root-b.json", agent_b.address, payee.address, expiry)
    spend(report, deployer, tab_a, agent_a, payee.address, SPEND, expiry, "spend_a")
    spend(report, deployer, tab_b, agent_b, payee.address, SPEND, expiry, "spend_b")
    outsider = Account.create().address
    refused = agent_blob(agent_a, tab_a, outsider, SPEND, expiry)
    report["forbidden_payee_call"] = signature_result(tab_a, refused)
    over = agent_blob(agent_a, tab_a, payee.address, MAX_PER_CALL + 1, expiry)
    report["over_limit_call"] = signature_result(tab_a, over)
    foreign = agent_blob(agent_b, tab_a, payee.address, SPEND, expiry)
    report["agent_b_on_tab_a_call"] = signature_result(tab_a, foreign)
    save_report(report)
    if report["forbidden_payee_call"] != "0xffffffff" or report["over_limit_call"] != "0xffffffff":
        raise SystemExit("a forbidden spend was accepted by the tab")
    if report["agent_b_on_tab_a_call"] != "0xffffffff":
        raise SystemExit("agent B was accepted by tab A")

    if "forbidden_broadcast" not in report:
        receipt = send(deployer, USDC, transfer_auth_data(tab_a, outsider, SPEND, 0, expiry, refused), gas=400_000)
        if receipt["status"] != 0:
            raise SystemExit("forbidden spend was mined successfully")
        report["forbidden_broadcast"] = receipt
        save_report(report)

    cross_root(report, deployer, root_a, root_b, KEYS / "root-a.json")

    log(f"waiting until chain time passes expiry {expiry}")
    while chain_now() <= expiry:
        time.sleep(5)
    reclaim(report, deployer, "reclaim_a", root_a, tab_a)
    reclaim(report, deployer, "reclaim_b", root_b, tab_b)
    rotate_and_prove(report, deployer, root_a)
    report["final_balances"] = {
        "root_a": usdc_balance(root_a),
        "root_b": usdc_balance(root_b),
        "tab_a": usdc_balance(tab_a),
        "tab_b": usdc_balance(tab_b),
        "payee": usdc_balance(payee.address),
    }
    expected = {
        "root_a": ROOT_FUND - TAB_CAP - 1 + (TAB_CAP - SPEND) - 1,
        "root_b": ROOT_FUND - TAB_CAP + (TAB_CAP - SPEND),
        "tab_a": 0,
        "tab_b": 0,
        "payee": SPEND * 2,
    }
    if report["final_balances"] != expected:
        raise RuntimeError(f"final balances {report['final_balances']} expected {expected}")
    report["classification"] = "VERIFIED"
    save_report(report)
    log(json.dumps(report["final_balances"]))


def eth_call_code(address: str) -> str:
    return rpc("eth_getCode", [address, "latest"])


def ensure_root(report: dict, key: str, registrar: Account, vk: bytes, salt_text: bytes) -> str:
    if report.get(key):
        return report[key]["address"]
    salt = keccak(salt_text)
    native = int(rpc("eth_getBalance", [registrar.address, "latest"]), 16)
    if native < 10**16:
        raise RuntimeError(f"{key} registrar gas balance is too small to create a root")
    predicted = decode(
        ["address"],
        eth_call(report["factory"], call_data("predictRoot(address,bytes32)", ["address", "bytes32"], [registrar.address, salt])),
    )[0]
    before = usdc_balance(predicted)
    receipt = send(
        registrar,
        report["factory"],
        call_data("createRoot(bytes32,uint256,bytes32)", ["bytes32", "uint256", "bytes32"], [vk, MAX_EXPOSURE, salt]),
    )
    expect_success(receipt, key)
    created = to_checksum_address(predicted)
    if eth_call_code(created) in ("0x", "0x0"):
        raise RuntimeError(f"{key} has no code")
    report[key] = {"address": created, "tx": receipt, "usdc_before": before, "registrar": registrar.address}
    save_report(report)
    log(f"{key} {created}")
    return created


def fund_root(report: dict, deployer: Account, key: str, root: str) -> None:
    if key in report:
        return
    if usdc_balance(root) >= ROOT_FUND:
        report[key] = {"skipped": True, "balance": usdc_balance(root)}
        save_report(report)
        return
    before = usdc_balance(root)
    receipt = send(deployer, USDC, call_data("transfer(address,uint256)", ["address", "uint256"], [root, ROOT_FUND]))
    expect_success(receipt, key)
    after = usdc_balance(root)
    if after != before + ROOT_FUND:
        raise RuntimeError(f"{key} balance {after} expected {before + ROOT_FUND}")
    report[key] = {"tx": receipt, "before": before, "after": after}
    save_report(report)


def open_tab(report: dict, submitter: Account, key: str, root: str, vk_path: pathlib.Path, agent: str, payee: str, expiry: int) -> str:
    if report.get(key):
        return report[key]["address"]
    action = encode(
        ["uint8", "address", "address[]", "uint256", "uint64", "uint256"],
        [1, agent, [payee], MAX_PER_CALL, expiry, TAB_CAP],
    )
    nonce = next_nonce(root)
    deadline = chain_now() + 3600
    before_root = usdc_balance(root)
    before_exposure = int.from_bytes(eth_call(root, "0x" + selector("openExposure()").hex()), "big")
    receipt = pq_execute(submitter, root, vk_path, action, nonce, deadline)
    expect_success(receipt, key)
    # The tab is the newest code address we can read back from the open event is not required:
    # predict through the root's recorded exposure and scan is unnecessary because openTab emits
    # TabOpened from the root. Decode that log.
    tab = tab_from_receipt(receipt["hash"], root)
    after_root = usdc_balance(root)
    after_tab = usdc_balance(tab)
    exposure = int.from_bytes(eth_call(root, "0x" + selector("openExposure()").hex()), "big")
    if after_tab != TAB_CAP or exposure != before_exposure + TAB_CAP or after_root != before_root - TAB_CAP:
        raise RuntimeError(f"{key} accounting mismatch root {after_root} tab {after_tab} exposure {exposure}")
    owner = decode(["address"], eth_call(tab, "0x" + selector("owner()").hex()))[0]
    tab_agent = decode(["address"], eth_call(tab, "0x" + selector("agent()").hex()))[0]
    if to_checksum_address(owner) != to_checksum_address(root) or to_checksum_address(tab_agent) != to_checksum_address(agent):
        raise RuntimeError(f"{key} owner/agent mismatch")
    report[key] = {
        "address": tab,
        "tx": receipt,
        "root_before": before_root,
        "root_after": after_root,
        "tab_balance": after_tab,
        "exposure": exposure,
    }
    save_report(report)
    log(f"{key} {tab}")
    return tab


def tab_from_receipt(tx_hash: str, root: str) -> str:
    receipt = rpc("eth_getTransactionReceipt", [tx_hash])
    topic = "0x" + keccak(text="TabOpened(address,address,uint256,uint64,uint256)").hex()
    root_topic = "0x" + root.lower().removeprefix("0x").rjust(64, "0")
    for entry in receipt["logs"]:
        if entry["address"].lower() != root.lower():
            continue
        if entry["topics"][0].lower() != topic:
            continue
        if entry["topics"][1].lower() != "0x" + root_topic[-64:]:
            # topic1 is the tab, not the root. Fall through.
            pass
        return to_checksum_address("0x" + entry["topics"][1][-40:])
    raise RuntimeError("TabOpened log missing")


def agent_blob(agent: Account, tab: str, to: str, value: int, expiry: int) -> bytes:
    nonce = keccak(os.urandom(32))
    signable = encode_typed_data(
        full_message={
            "types": {
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"},
                    {"name": "verifyingContract", "type": "address"},
                ],
                "TransferWithAuthorization": [
                    {"name": "from", "type": "address"},
                    {"name": "to", "type": "address"},
                    {"name": "value", "type": "uint256"},
                    {"name": "validAfter", "type": "uint256"},
                    {"name": "validBefore", "type": "uint256"},
                    {"name": "nonce", "type": "bytes32"},
                ],
            },
            "primaryType": "TransferWithAuthorization",
            "domain": {"name": "USDC", "version": "2", "chainId": CHAIN_ID, "verifyingContract": USDC},
            "message": {
                "from": tab,
                "to": to,
                "value": value,
                "validAfter": 0,
                "validBefore": expiry,
                "nonce": nonce,
            },
        }
    )
    signed = Account.sign_message(signable, agent.key)
    blob = signed.signature + bytes.fromhex(to[2:]) + value.to_bytes(32, "big") + (0).to_bytes(32, "big") + expiry.to_bytes(32, "big") + nonce
    if len(blob) != 213:
        raise RuntimeError(f"blob length {len(blob)}")
    return blob


def eip712_digest(signable) -> bytes:
    return bytes(keccak(b"\x19" + signable.version + signable.header + signable.body))


def signature_result(tab: str, blob: bytes) -> str:
    digest = blob_digest(tab, blob)
    data = call_data("isValidSignature(bytes32,bytes)", ["bytes32", "bytes"], [digest, blob])
    raw = eth_call(tab, data)
    return "0x" + raw[:4].hex()


def blob_digest(tab: str, blob: bytes) -> bytes:
    to = "0x" + blob[65:85].hex()
    value = int.from_bytes(blob[85:117], "big")
    valid_after = int.from_bytes(blob[117:149], "big")
    valid_before = int.from_bytes(blob[149:181], "big")
    nonce = blob[181:213]
    signable = encode_typed_data(
        full_message={
            "types": {
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"},
                    {"name": "verifyingContract", "type": "address"},
                ],
                "TransferWithAuthorization": [
                    {"name": "from", "type": "address"},
                    {"name": "to", "type": "address"},
                    {"name": "value", "type": "uint256"},
                    {"name": "validAfter", "type": "uint256"},
                    {"name": "validBefore", "type": "uint256"},
                    {"name": "nonce", "type": "bytes32"},
                ],
            },
            "primaryType": "TransferWithAuthorization",
            "domain": {"name": "USDC", "version": "2", "chainId": CHAIN_ID, "verifyingContract": USDC},
            "message": {
                "from": tab,
                "to": to,
                "value": value,
                "validAfter": valid_after,
                "validBefore": valid_before,
                "nonce": nonce,
            },
        }
    )
    return eip712_digest(signable)


def cross_root(report: dict, submitter: Account, root_a: str, root_b: str, vk_path: pathlib.Path) -> None:
    """Execute a 1-unit transfer on A, then replay that exact payload on B.

    A consumes the nonce first, so the broadcast signature cannot be reused against A.
    """
    if "cross_root" in report:
        return
    if "cross_root_payload" in report:
        payload = report["cross_root_payload"]
        action = bytes.fromhex(payload["action"])
        nonce = payload["nonce"]
        deadline = payload["deadline"]
        signature = bytes.fromhex(payload["signature"])
        data = call_data(
            "execute(bytes,uint64,uint64,bytes)",
            ["bytes", "uint64", "uint64", "bytes"],
            [action, nonce, deadline, signature],
        )
        _replay_on_b(report, submitter, root_b, data, nonce)
        return
    action = encode(["uint8", "address", "uint256"], [3, submitter.address, 1])
    nonce = next_nonce(root_a)
    if next_nonce(root_b) != nonce:
        raise RuntimeError("cross-root test needs both roots at the same nonce")
    deadline = chain_now() + 3600
    before = usdc_balance(root_a)
    receipt_a = pq_execute(submitter, root_a, vk_path, action, nonce, deadline)
    expect_success(receipt_a, "root A transfer")
    if usdc_balance(root_a) != before - 1:
        raise RuntimeError("root A transfer did not move 1 unit")
    report["cross_root_spent_on_a"] = receipt_a
    save_report(report)
    digest = signer("digest", str(CHAIN_ID), root_a, str(nonce), str(deadline), "0x" + action.hex())
    signature = bytes.fromhex(signer("sign", str(vk_path), digest))
    report["cross_root_payload"] = {
        "action": action.hex(),
        "nonce": nonce,
        "deadline": deadline,
        "signature": signature.hex(),
    }
    save_report(report)
    data = call_data(
        "execute(bytes,uint64,uint64,bytes)",
        ["bytes", "uint64", "uint64", "bytes"],
        [action, nonce, deadline, signature],
    )
    _replay_on_b(report, submitter, root_b, data, nonce)


def _replay_on_b(report: dict, submitter: Account, root_b: str, data: str, nonce: int) -> None:
    try:
        eth_call_from(submitter.address, root_b, data)
        raise RuntimeError("cross-root replay was accepted by eth_call")
    except RuntimeError as exc:
        if invalid_signature_selector() not in str(exc).lower():
            raise RuntimeError(f"cross-root eth_call was not InvalidSignature: {exc}") from exc
    receipt = send(submitter, root_b, data, gas=2_000_000)
    if receipt["status"] != 0:
        raise RuntimeError("cross-root replay was mined successfully")
    if next_nonce(root_b) != nonce:
        raise RuntimeError("rejected cross-root replay consumed user B's nonce")
    report["cross_root"] = receipt
    save_report(report)


def invalid_signature_selector() -> str:
    return keccak(text="InvalidSignature()")[:4].hex().removeprefix("0x")


def rotate_and_prove(report: dict, submitter: Account, root: str) -> None:
    if "rotate" in report and "old_key_rejected" in report and "new_key_transfer" in report:
        return
    new_vk = ensure_pq("root-a-rotated")
    if "rotate" not in report:
        action = encode(["uint8", "bytes32"], [4, bytes.fromhex(new_vk.removeprefix("0x"))])
        nonce = next_nonce(root)
        deadline = chain_now() + 3600
        receipt = pq_execute(submitter, root, KEYS / "root-a.json", action, nonce, deadline)
        expect_success(receipt, "rotate")
        onchain = eth_call(root, "0x" + selector("pqVk()").hex())
        if onchain != bytes.fromhex(new_vk.removeprefix("0x")):
            raise RuntimeError("rotated verifying key does not match the chain")
        report["rotate"] = {"tx": receipt, "vk": "0x" + new_vk.removeprefix("0x")}
        save_report(report)
    if "old_key_rejected" not in report:
        action = encode(["uint8", "address", "uint256"], [3, submitter.address, 1])
        nonce = next_nonce(root)
        deadline = chain_now() + 3600
        digest = signer("digest", str(CHAIN_ID), root, str(nonce), str(deadline), "0x" + action.hex())
        signature = bytes.fromhex(signer("sign", str(KEYS / "root-a.json"), digest))
        data = call_data(
            "execute(bytes,uint64,uint64,bytes)",
            ["bytes", "uint64", "uint64", "bytes"],
            [action, nonce, deadline, signature],
        )
        try:
            eth_call_from(submitter.address, root, data)
            raise RuntimeError("old PQ key was accepted after rotation")
        except RuntimeError as exc:
            report["old_key_call"] = str(exc)
        receipt = send(submitter, root, data, gas=2_000_000)
        if receipt["status"] != 0:
            raise RuntimeError("old PQ key transfer was mined successfully")
        if next_nonce(root) != nonce:
            raise RuntimeError("failed old signature consumed a nonce")
        report["old_key_rejected"] = receipt
        save_report(report)
    if "new_key_transfer" not in report:
        action = encode(["uint8", "address", "uint256"], [3, submitter.address, 1])
        nonce = next_nonce(root)
        deadline = chain_now() + 3600
        before = usdc_balance(root)
        receipt = pq_execute(submitter, root, KEYS / "root-a-rotated.json", action, nonce, deadline)
        expect_success(receipt, "new key transfer")
        after = usdc_balance(root)
        if after != before - 1:
            raise RuntimeError(f"new key transfer balance {before} -> {after}")
        report["new_key_transfer"] = {"tx": receipt, "before": before, "after": after}
        save_report(report)


def eth_call_from(sender: str, to: str, data: str) -> bytes:
    result = rpc("eth_call", [{"from": sender, "to": to, "data": data}, "latest"])
    return bytes.fromhex(result[2:])


def transfer_auth_data(tab: str, to: str, value: int, valid_after: int, valid_before: int, blob: bytes) -> str:
    # The forbidden broadcast builds its own blob, so the `to` inside the blob is authoritative.
    # This helper is only used when the blob was built for `to`.
    nonce = blob[181:213]
    return call_data(
        "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)",
        ["address", "address", "uint256", "uint256", "uint256", "bytes32", "bytes"],
        [tab, to, value, valid_after, valid_before, nonce, blob],
    )


def spend(report: dict, submitter: Account, tab: str, agent: Account, payee: str, value: int, expiry: int, key: str) -> None:
    if key in report:
        return
    blob = agent_blob(agent, tab, payee, value, expiry)
    magic = signature_result(tab, blob)
    if magic != "0x1626ba7e":
        raise RuntimeError(f"{key} isValidSignature returned {magic}")
    before_tab = usdc_balance(tab)
    before_payee = usdc_balance(payee)
    receipt = send(submitter, USDC, transfer_auth_data(tab, payee, value, 0, expiry, blob))
    expect_success(receipt, key)
    after_tab = usdc_balance(tab)
    after_payee = usdc_balance(payee)
    if after_tab != before_tab - value or after_payee != before_payee + value:
        raise RuntimeError(f"{key} balance mismatch")
    report[key] = {"tx": receipt, "tab_before": before_tab, "tab_after": after_tab, "payee_after": after_payee, "magic": magic}
    save_report(report)


def reclaim(report: dict, submitter: Account, key: str, root: str, tab: str) -> None:
    if key in report:
        return
    before_root = usdc_balance(root)
    before_tab = usdc_balance(tab)
    before_exposure = int.from_bytes(eth_call(root, "0x" + selector("openExposure()").hex()), "big")
    receipt = send(submitter, root, call_data("reclaim(address)", ["address"], [tab]))
    expect_success(receipt, key)
    after_root = usdc_balance(root)
    after_tab = usdc_balance(tab)
    exposure = int.from_bytes(eth_call(root, "0x" + selector("openExposure()").hex()), "big")
    if after_tab != 0 or after_root != before_root + before_tab or exposure != before_exposure - TAB_CAP:
        raise RuntimeError(
            f"{key} mismatch root {before_root}->{after_root} tab {before_tab}->{after_tab} exposure {before_exposure}->{exposure}"
        )
    report[key] = {
        "tx": receipt,
        "root_before": before_root,
        "root_after": after_root,
        "tab_before": before_tab,
        "tab_after": after_tab,
        "exposure_after": exposure,
    }
    save_report(report)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"STOP {type(exc).__name__}: {exc}")
        raise

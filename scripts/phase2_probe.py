"""Call the live Arc SLH-DSA precompile. Prints results only, never key material."""

import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile

RPC = "https://rpc.mainnet.arc.io"
PRECOMPILE = "0x1800000000000000000000000000000000000004"
SELECTOR = bytes.fromhex("bf4db8ba")
ROOT = pathlib.Path(__file__).resolve().parents[1]
VECTORS = ROOT / "signer" / "testdata" / "pq_test_vectors.json"
OUT = ROOT / "evidence" / "phase2.json"


def word(n: int) -> bytes:
    return n.to_bytes(32, "big")


def encode_bytes(raw: bytes) -> bytes:
    pad = (32 - (len(raw) % 32)) % 32
    return word(len(raw)) + raw + (b"\x00" * pad)


def calldata(vk: bytes, message: bytes, sig: bytes) -> bytes:
    parts = [encode_bytes(vk), encode_bytes(message), encode_bytes(sig)]
    cursor = 32 * 3
    offsets = []
    for part in parts:
        offsets.append(cursor)
        cursor += len(part)
    data = SELECTOR + b"".join(word(o) for o in offsets) + b"".join(parts)
    return data


def rpc(method: str, params: list) -> dict:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="ascii") as handle:
        handle.write(body)
        path = handle.name
    try:
        completed = subprocess.run(
            [
                "curl.exe",
                "-sS",
                "-A",
                "cast/1.8.5",
                "-H",
                "content-type: application/json",
                "--data-binary",
                f"@{path}",
                RPC,
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    finally:
        pathlib.Path(path).unlink(missing_ok=True)
    return json.loads(completed.stdout)


def eth_call(data: bytes) -> dict:
    result = rpc(
        "eth_call",
        [{"to": PRECOMPILE, "data": "0x" + data.hex(), "gas": "0x200000"}, "latest"],
    )
    if "error" in result:
        err = result["error"]
        message = err.get("message", "") if isinstance(err, dict) else str(err)
        return {"ok": False, "revert": message[:180]}
    raw = bytes.fromhex(result["result"][2:])
    if len(raw) == 32:
        return {"ok": True, "valid": int.from_bytes(raw, "big") == 1}
    return {"ok": True, "raw_len": len(raw)}


def unhex(value: str) -> bytes:
    return bytes.fromhex(value[2:] if value.startswith("0x") else value)


def fresh_signature() -> dict:
    """Sign 32 zero bytes with a disposable key and ask the live precompile."""
    binary = ROOT / "signer" / "target" / "debug" / "pqtabs-sign.exe"
    key_dir = ROOT / "pq-keys"
    key_dir.mkdir(parents=True, exist_ok=True)
    key_path = key_dir / "phase2-disposable.json"
    if key_path.exists():
        key_path.unlink()
    vk = subprocess.check_output([str(binary), "keygen", str(key_path)], text=True).strip()
    digest = "00" * 32
    signature = subprocess.check_output([str(binary), "sign", str(key_path), digest], text=True).strip()
    sig = unhex(signature)
    message = bytes(32)
    result = eth_call(calldata(unhex(vk), message, sig))
    flipped = bytearray(sig)
    flipped[0] ^= 0x01
    return {
        "scheme": "SLH-DSA-SHA2-128s",
        "crate": "slh-dsa=0.2.0-rc.5",
        "context": "empty",
        "message": "0x" + digest,
        "vk": vk if vk.startswith("0x") else "0x" + vk,
        "sig_len": len(sig),
        "sig_sha256": hashlib.sha256(sig).hexdigest(),
        "eth_call": result,
        "flipped_byte": eth_call(calldata(unhex(vk), message, bytes(flipped))),
    }


def main() -> None:
    chain = int(rpc("eth_chainId", [])["result"], 16)
    vectors = json.loads(VECTORS.read_text(encoding="utf-8"))["slh_dsa_sha2_128s"]
    hello = vectors[0]
    vk = unhex(hello["verifying_key"])
    message = unhex(hello["message"])
    sig = unhex(hello["signature"])
    report = {
        "network": "arc-mainnet",
        "chain_id": chain,
        "precompile": PRECOMPILE,
        "selector": "0x" + SELECTOR.hex(),
        "vector_source": "circlefin/arc-node@6e764023ee6515fe70573e123ed2db912a7207b4 tests/helpers/pq_test_vectors.json",
        "vector0_message_utf8": message.decode(),
        "vector0_vk": hello["verifying_key"],
        "vector0_sig_len": len(sig),
        "vector0_expected_valid": hello["is_valid"],
        "vector0_eth_call": eth_call(calldata(vk, message, sig)),
    }
    flipped = bytearray(sig)
    flipped[-1] ^= 0x01
    report["vector0_flipped_byte"] = eth_call(calldata(vk, message, bytes(flipped)))
    report["vector0_truncated"] = eth_call(calldata(vk, message, sig[:-1]))
    goodbye = vectors[2]
    report["vector2_expected_valid"] = goodbye["is_valid"]
    report["vector2_eth_call"] = eth_call(
        calldata(unhex(goodbye["verifying_key"]), unhex(goodbye["message"]), unhex(goodbye["signature"]))
    )
    if "--fresh" in sys.argv:
        report["fresh_rc5"] = fresh_signature()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    public = {k: v for k, v in report.items() if k != "vector0_vk"}
    print(json.dumps(public, indent=2))


if __name__ == "__main__":
    main()

"""Submit one 1-unit PQ transfer through the live relay. Prints the hash and balances only."""

import json
import pathlib
import subprocess
import time
import urllib.request

from eth_abi import encode

ROOT = pathlib.Path(__file__).resolve().parents[1]
SIGNER = ROOT / "signer" / "target" / "release" / "pqtabs-sign.exe"
ROOT_A = "0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf"
PAYEE = "0xC485B657C140C9677846f3E9ca6a3158e5623044"
API = "https://pqtabs.onrender.com"


def signer(*args: str) -> str:
    completed = subprocess.run([str(SIGNER), *args], check=True, capture_output=True, text=True)
    return completed.stdout.strip()


def get(path: str) -> dict:
    with urllib.request.urlopen(API + path, timeout=60) as response:
        return json.load(response)


state = get(f"/v1/roots/{ROOT_A}")
nonce = state["nextNonce"]
deadline = str(int(time.time()) + 3600)
action = encode(["uint8", "address", "uint256"], [3, PAYEE, 1])
digest = signer("digest", "5042", ROOT_A, nonce, deadline, "0x" + action.hex())
signature = signer("sign", str(ROOT / "pq-keys" / "staging" / "root-a-rotated.json"), digest)
body = json.dumps(
    {
        "root": ROOT_A,
        "action": "0x" + action.hex(),
        "nonce": nonce,
        "deadline": deadline,
        "signature": "0x" + signature,
    }
).encode()
request = urllib.request.Request(
    API + "/v1/relay/execute",
    data=body,
    method="POST",
    headers={"content-type": "application/json"},
)
with urllib.request.urlopen(request, timeout=120) as response:
    result = json.load(response)
print("relay", response.status, result["hash"])
time.sleep(8)
receipt = get("/v1/tx/" + result["hash"])
after = get(f"/v1/roots/{ROOT_A}")
print("receipt", receipt["status"], receipt["block"], receipt["gasUsed"])
print("usdc", state["usdc"], after["usdc"], "nonce", state["nextNonce"], after["nextNonce"])

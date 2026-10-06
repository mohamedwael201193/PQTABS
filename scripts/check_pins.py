"""Fail if the production contracts drift from the pinned Arc and Barkeep addresses."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = (ROOT / "contracts" / "PQRoot.sol").read_text(encoding="utf-8")
MAINNET = (ROOT / "deployments" / "mainnet.json").read_text(encoding="utf-8")

REQUIRED_IN_CONTRACT = [
    "0x3600000000000000000000000000000000000000",
    "0x1800000000000000000000000000000000000004",
    "0xccebC58DD1F5937B36D5f9F89f0754424f4D443c",
    "0x89B63f2E43dea9014750925C01996D34856B01D2",
]
REQUIRED_IN_MAINNET = [
    "0x05545F026b75f03aE9Cf1eA8a8373473c94ed323",
    "5042",
]

missing = [item for item in REQUIRED_IN_CONTRACT if item not in CONTRACT]
missing += [item for item in REQUIRED_IN_MAINNET if item not in MAINNET]
if missing:
    raise SystemExit("pinned value missing: " + ", ".join(missing))
print("pins ok")

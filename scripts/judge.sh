#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
forge test
cargo test --manifest-path signer/Cargo.toml
( cd backend && npm ci && npm test && npm run lint )
python scripts/check_pins.py
python scripts/secret_scan.py
python scripts/phase2_probe.py

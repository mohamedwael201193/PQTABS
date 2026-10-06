$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
forge test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
cargo test --manifest-path signer/Cargo.toml
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Push-Location backend
npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run lint
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Pop-Location
python scripts/check_pins.py
python scripts/secret_scan.py
python scripts/phase2_probe.py

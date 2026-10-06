"""Fail if git is tracking a secret. Public verifying keys are allowed."""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRACKED = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=ROOT, text=True).splitlines()
TOKEN = re.compile(r"(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|rnd_[A-Za-z0-9]{20,})")
SIGNING_KEY = re.compile(r'"signing_key_hex"\s*:\s*"[0-9a-fA-F]{16,}"')
ENV_VALUE = re.compile(r"(?i)(PRIVATE_KEY|API_KEY|TOKEN)\s*=\s*\S+")
failures = []

for rel in TRACKED:
    if rel == ".env" or rel.startswith("pq-keys/"):
        failures.append(f"tracked secret path {rel}")
        continue
    path = ROOT / rel
    if not path.is_file():
        continue
    data = path.read_bytes()
    if b"\0" in data[:4096]:
        continue
    text = data.decode("utf-8", errors="replace")
    if TOKEN.search(text):
        failures.append(f"token prefix in {rel}")
    if SIGNING_KEY.search(text):
        failures.append(f"signing key material in {rel}")
    if rel not in {".env.example", "scripts/secret_scan.py"} and ENV_VALUE.search(text):
        failures.append(f"secret assignment in {rel}")

if failures:
    print("\n".join(failures), file=sys.stderr)
    raise SystemExit(1)
print(f"secret scan ok ({len(TRACKED)} tracked files)")

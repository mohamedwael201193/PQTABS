"""Trigger a deploy and print status only."""

import json
import pathlib
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SERVICE = "srv-db2mqpvavr4c73elkt60"


def env(name: str) -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit(f"missing {name}")


def call(method: str, path: str, body: object | None = None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        "https://api.render.com/v1" + path,
        data=data,
        method=method,
        headers={
            "Authorization": "Bearer " + env("RENDER_API_KEY"),
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        raw = response.read().decode()
        return json.loads(raw) if raw else None


deadline = time.time() + 480
while time.time() < deadline:
    listing = call("GET", f"/services/{SERVICE}/deploys?limit=3")
    if not listing:
        print("no deploys yet")
        time.sleep(15)
        continue
    first = listing[0]
    item = first.get("deploy", first) if isinstance(first, dict) else first
    status = item.get("status") if isinstance(item, dict) else None
    if status is None:
        print("keys", sorted(first.keys()) if isinstance(first, dict) else type(first).__name__)
        break
    print("status", status, item.get("id"))
    if status in {"live", "build_failed", "update_failed", "canceled", "deactivated"}:
        break
    time.sleep(15)

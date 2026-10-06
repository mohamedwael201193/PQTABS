"""Create the PQTABS Render web service. Prints ids and URLs, never credentials."""

import json
import pathlib
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OWNER = "tea-da7j3urm6pss73ftp830"


def env(name: str) -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit(f"missing {name}")


def redact(text: str) -> str:
    secret = env("RENDER_API_KEY")
    relayer = env("RELAYER_PRIVATE_KEY")
    return text.replace(secret, "[redacted]").replace(relayer, "[redacted]")


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
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        detail = redact(error.read().decode(errors="replace")[:800])
        raise SystemExit(f"{method} {path} {error.code} {detail}") from error


payload = {
    "type": "web_service",
    "name": "pqtabs",
    "ownerId": OWNER,
    "repo": "https://github.com/mohamedwael201193/PQTABS",
    "autoDeploy": "yes",
    "branch": "main",
    "rootDir": "backend",
    "serviceDetails": {
        "runtime": "node",
        "plan": "free",
        "region": "frankfurt",
        "healthCheckPath": "/health",
        "envSpecificDetails": {
            "buildCommand": "npm ci && npm run build",
            "startCommand": "npm start",
        },
    },
}
status, created = call("POST", "/services", payload)
service = created.get("service", created)
service_id = service["id"]
print("created", status, service_id, service.get("serviceDetails", {}).get("url") or service.get("url"))

env_body = [
    {"key": "ARC_RPC_URL", "value": "https://rpc.mainnet.arc.io"},
    {"key": "FACTORY_ADDRESS", "value": "0x05545F026b75f03aE9Cf1eA8a8373473c94ed323"},
    {"key": "RELAYER_PRIVATE_KEY", "value": env("RELAYER_PRIVATE_KEY")},
    {"key": "NODE_VERSION", "value": "22.14.0"},
]
env_status, _env_result = call("PUT", f"/services/{service_id}/env-vars", env_body)
print("env", env_status)

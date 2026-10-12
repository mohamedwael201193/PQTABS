import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadClients } from "../src/chain.js";
import { createApp } from "../src/server.js";

describe("http boundary", () => {
  it("answers health and rejects a relay that is not an address", async () => {
    const app = createApp(loadClients({ ARC_RPC_URL: "https://rpc.mainnet.arc.io" }));
    const health = await app.request("/health");
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.ok, true);

    const rejected = await app.request("/v1/relay/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root: "not-an-address", action: "0x01", nonce: "0", deadline: "1", signature: "0x11" }),
    });
    assert.equal(rejected.status, 400);
    const error = await rejected.json();
    assert.equal(error.error, "bad_address");
  });

  it("rejects an oversized relay body before it touches a key", async () => {
    const app = createApp(loadClients({ ARC_RPC_URL: "https://rpc.mainnet.arc.io" }));
    const rejected = await app.request("/v1/relay/reclaim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"root":"0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf","tab":"${"a".repeat(70_000)}"}`,
    });
    assert.equal(rejected.status, 413);
  });

  it("keeps a relay open when the same client has been reading heavily, and explains a refused read", async () => {
    const app = createApp(loadClients({ ARC_RPC_URL: "https://rpc.mainnet.arc.io" }));
    const client = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < 300; i++) await app.request("/v1/config", { headers: client });

    const refused = await app.request("/v1/config", { headers: client });
    assert.equal(refused.status, 429);
    assert.ok(Number(refused.headers.get("retry-after")) >= 1);
    const refusedBody = await refused.json();
    assert.equal(refusedBody.error, "rate_limited");
    assert.match(refusedBody.detail, /Too many requests.*Nothing was sent/);

    const relay = await app.request("/v1/relay/execute", {
      method: "POST",
      headers: { "content-type": "application/json", ...client },
      body: JSON.stringify({ root: "not-an-address", action: "0x01", nonce: "0", deadline: "1", signature: "0x11" }),
    });
    assert.equal(relay.status, 400);
    assert.equal((await relay.json()).error, "bad_address");
  });
});

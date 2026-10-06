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
});

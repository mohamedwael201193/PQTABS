import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadClients, readPortfolio, rootAbi, usdcAbi } from "../src/chain.js";
import { CHAIN_ID, USDC } from "../src/constants.js";

const ROOT_A = "0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf" as const;

describe("arc mainnet reads", () => {
  it("sees chain 5042, the factory bytecode, and root A exposure at zero", async () => {
    const clients = loadClients({ ARC_RPC_URL: "https://rpc.mainnet.arc.io" });
    const chainId = await clients.public.getChainId();
    const code = await clients.public.getCode({ address: clients.factory });
    const exposure = await clients.public.readContract({
      address: ROOT_A,
      abi: rootAbi,
      functionName: "openExposure",
    });
    assert.equal(chainId, CHAIN_ID);
    assert.equal(typeof code === "string" && code.length > 2, true);
    assert.equal(exposure, 0n);
    const balance = await clients.public.readContract({
      address: USDC,
      abi: usdcAbi,
      functionName: "balanceOf",
      args: [ROOT_A],
    });
    assert.equal(balance, 139994n);
    const portfolio = await readPortfolio(clients, ROOT_A);
    const tab = portfolio.tabs.find((row) => row.tab.toLowerCase() === "0xe3051e8173fdbec33b826352cb177a306b9d5109");
    assert.ok(tab);
    assert.equal(tab.open, false);
    assert.equal(tab.owner.toLowerCase(), ROOT_A.toLowerCase());
    assert.ok(portfolio.activity.some((event) => event.kind === "spend"));
  });
});

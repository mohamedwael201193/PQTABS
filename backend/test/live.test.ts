import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type Address, decodeEventLog, type Hex } from "viem";
import { factoryAbi, loadClients, rootAbi, tabAbi, usdcAbi } from "../src/chain.js";
import { CHAIN_ID, FACTORY, USDC } from "../src/constants.js";
import { erc20SpendRaw } from "../src/index/usdc-event.js";

const IMPLEMENTATION = "0xb147Ec122E0b8F91dC4398dD0746372fdC22A894" as Address;
const ROOT = "0x2d0FdFafCC7E46226D3db00Ae976aA8F53996b95" as Address;
const CAPABILITY = "0x586E42Da69529A4665D4644e6FDe5fdAa4aeA321" as Address;
const PAYEE = "0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9" as Address;
const RECEIPT = "0x1352cc1963ee0e62c0c04ff634412c4257327755a9d5cf58eefe113d14b2e4a5" as Hex;
const BLOCK = 25_501_796n;

const transferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
} as const;

describe("arc mainnet reads", () => {
  it("reads chain 5042 and the settled 32-raw payment", { timeout: 20_000 }, async (t) => {
    const clients = loadClients({ ARC_RPC_URL: "https://rpc.mainnet.arc.io" }, t.signal);
    try {
      const chainId = await clients.public.getChainId();
      assert.equal(chainId, CHAIN_ID);
      assert.equal(clients.factory.toLowerCase(), FACTORY.toLowerCase());
      const code = await clients.public.getCode({ address: clients.factory });
      assert.equal(typeof code === "string" && code.length > 2, true);
      const implementation = await clients.public.readContract({
        address: clients.factory,
        abi: factoryAbi,
        functionName: "implementation",
      });
      assert.equal(String(implementation).toLowerCase(), IMPLEMENTATION.toLowerCase());

      const receipt = await clients.public.getTransactionReceipt({ hash: RECEIPT });
      assert.equal(receipt.status, "success");
      assert.equal(receipt.blockNumber, BLOCK);
      const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      const spends = receipt.logs.flatMap((log) => {
        if (log.address.toLowerCase() !== USDC.toLowerCase()) return [];
        if (log.topics[0]?.toLowerCase() !== transferTopic) return [];
        const decoded = decodeEventLog({
          abi: [transferEvent],
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName !== "Transfer") return [];
        const raw = erc20SpendRaw(log.address, decoded.args.value);
        if (raw == null) return [];
        return [{ from: decoded.args.from, to: decoded.args.to, raw }];
      });
      assert.equal(spends.length, 1);
      assert.equal(spends[0].from.toLowerCase(), CAPABILITY.toLowerCase());
      assert.equal(spends[0].to.toLowerCase(), PAYEE.toLowerCase());
      assert.equal(spends[0].raw, "32");

      const [balance, exposure, rootUsdc, payees, tab] = await Promise.all([
        // Balances move with every later spend, so these are read at the receipt's block to stay a fixed historical check.
        clients.public.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [CAPABILITY], blockNumber: BLOCK }),
        clients.public.readContract({ address: ROOT, abi: rootAbi, functionName: "openExposure", blockNumber: BLOCK }),
        clients.public.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [ROOT], blockNumber: BLOCK }),
        clients.public.readContract({ address: CAPABILITY, abi: tabAbi, functionName: "payees", blockNumber: BLOCK }),
        clients.public.readContract({ address: ROOT, abi: rootAbi, functionName: "tabs", args: [CAPABILITY], blockNumber: BLOCK }),
      ]);
      assert.equal(balance, 9968n);
      assert.equal(exposure, 10000n);
      assert.equal(rootUsdc, 0n);
      assert.deepEqual(
        (payees as readonly Address[]).map((item) => item.toLowerCase()),
        [PAYEE.toLowerCase()],
      );
      assert.equal(tab[2], true);
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (/429|rate limit|aborted|AbortError/i.test(message)) assert.fail(`BLOCKED: ${message}`);
      throw error;
    }
  });
});

// Read-only example. It calls the live PQTABS backend and the Arc RPC. It moves no money and needs no keys.
// Run it from the package directory after `npm run build`:  node examples/read-only.mjs
import { PqtabsClient } from "pqtabs-sdk";

// The PQTABS root whose capabilities you want to inspect. Replace it with your own root address.
const ROOT = process.env.PQTABS_ROOT ?? "0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf";

const pqtabs = new PqtabsClient();

const ready = await pqtabs.read.ready();
const config = await pqtabs.read.config();
const rpcChainId = await pqtabs.read.rpcChainId();
const portfolio = await pqtabs.read.portfolio(ROOT);

console.log("backend ok:", ready.ok, "| relayer configured:", ready.relayer);
console.log("backend chain:", config.chainId, "| RPC chain:", rpcChainId);
console.log(`root ${portfolio.root}: ${portfolio.tabs.length} capabilities, ${portfolio.tabs.filter((tab) => tab.open).length} open`);

for (const tab of portfolio.tabs.filter((item) => item.open)) {
  console.log(`- ${tab.tab} cap=${tab.cap} balance=${tab.usdc} maxPerCall=${tab.maxPerCall} payees=${tab.payees.join(",")}`);
}

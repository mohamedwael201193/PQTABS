// Reads measured gas costs for known Arc Mainnet transactions over raw JSON-RPC.
// Read-only. No keys, no signing, no writes. Native gas on Arc is USDC: the
// 18-decimal native view is the same pool as the 6-decimal ERC-20 view, so
// USDC cost = wei / 1e18 (equivalently raw6 = wei / 1e12).
const RPC = process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io";

const TXS = [
  { kind: "capability_open", label: "Capability open (first)", hash: "0xc4a85cd1ed2bef62694ac83bf57f854a774ebe3795b619e536d8c2b982d6b363" },
  { kind: "capability_close", label: "Capability close (first)", hash: "0x365405cfb63e70eec08cafd046d474ed901ff12d568811affd53619c7b66f746" },
  { kind: "capability_open", label: "Capability open (session agent)", hash: "0x313b912a0f8eccc4d3f082f344520076541fced85060a7e26f49f09c21e3accd" },
  { kind: "capability_close", label: "Capability close (session agent)", hash: "0xf0b5fa82775ce8f49a1b49ba14291fe4186e2c8c379d7f813ee939872dd616f3" },
  { kind: "capability_open", label: "Capability open (earlier)", hash: "0x2c44da611a7ea7ebd2e4dffbf6cf0a13c8ddffd482048132da078b459d4ea216" },
  { kind: "capability_close", label: "Capability close (earlier)", hash: "0x95b41eb8129d75b7d0092e0f54916622514f8b6a4ecc130eb29cb8068e4b80fa" },
  { kind: "capability_open", label: "Capability open (0x2E93 tab)", hash: "0xdf1c71c2464540f0b035a3631d0860adea078c7e27a813b576ec22585277bf14" },
  { kind: "capability_open", label: "Capability open (0x74EB tab, live)", hash: "0x680367023ae14224ee137f58c7d419decdcfb5204055432e318ab308ef664688" },
  { kind: "relayed_spend_1raw", label: "1-raw relayed payment", hash: "0x0d17b53c3d249eb680c8a868c26d5ae8fbf041b034f946ff92bfb61e8b97b3b2" },
  { kind: "relayed_spend_1raw", label: "1-raw relayed payment (session agent)", hash: "0xfcbbe662e18c9f726381e90067ebd40df0c1d739407dccbf481d6cad8315b2cf" },
  { kind: "research_spend_360raw", label: "Research payment 360 raw (tab 0x7D62)", hash: "0x74ce7b557f8e5156af8fca701b40d833651ff1d206442f0a3ef4c801698f1b15" },
  { kind: "research_spend_360raw", label: "Research payment 360 raw (tab 0x2E93)", hash: "0x41496d2663c553f4948680b24f9de159026c2e2212514b44ffb60eda237076ae" },
  { kind: "relayed_transfer_1raw", label: "Relayed 1-raw transfer", hash: "0x205114d24dcb3c894aa82a394d3709f26c07ffb3ea6dcb40a465546a091db33d" },
  { kind: "arcrouter_settlement", label: "ArcRouter settlement (historical)", hash: "0x1352cc1963ee0e62c0c04ff634412c4257327755a9d5cf58eefe113d14b2e4a5" },
  { kind: "root_factory_deploy", label: "RootFactory deploy", hash: "0xfade67cbf64d0869dbd33f53bd48844f0b3b4399d2c54b68c36a0b07ba30c916" },
];

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method} HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`${method} ${body.error.code}: ${body.error.message}`);
  return body.result;
}

const rows = [];
for (const t of TXS) {
  const [receipt, tx] = await Promise.all([
    rpc("eth_getTransactionReceipt", [t.hash]),
    rpc("eth_getTransactionByHash", [t.hash]),
  ]);
  if (!receipt) {
    rows.push({ ...t, status: "no_receipt" });
    continue;
  }
  const gasUsed = BigInt(receipt.gasUsed);
  const price = BigInt(receipt.effectiveGasPrice);
  const costWei = gasUsed * price;
  rows.push({
    kind: t.kind,
    label: t.label,
    hash: t.hash,
    status: receipt.status === "0x1" ? "success" : "reverted",
    block: Number(BigInt(receipt.blockNumber)),
    from: receipt.from,
    to: receipt.to,
    gasUsed: gasUsed.toString(),
    effectiveGasPriceGwei: (Number(price) / 1e9).toFixed(4),
    costUsdc: (Number(costWei) / 1e18).toFixed(9),
    costUsdcRaw6: (costWei / 10n ** 12n).toString(),
    inputBytes: tx ? (tx.input.length - 2) / 2 : null,
  });
}

console.log(JSON.stringify(rows, null, 2));

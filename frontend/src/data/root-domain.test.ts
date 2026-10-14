import assert from "node:assert/strict";
import test from "node:test";
import {
  DOMAIN_V2,
  DOMAIN_V3,
  LEGACY_FACTORY,
  NEXT_FACTORY,
  digestFor,
  domainForFactory,
  encodeOpen,
} from "./actions.ts";

const ROOT = "0x11e59501646E90E0FA2A7189431A96429D966fe7";
const AGENT = "0x9a153327F29bD6d248cCCF398B14554669c0Cb00";
const PAYEE = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";

test("a new root signs PQTABS_V3 and a legacy root signs PQTABS_V2", () => {
  assert.equal(domainForFactory(NEXT_FACTORY), DOMAIN_V3);
  assert.equal(domainForFactory(LEGACY_FACTORY), DOMAIN_V2);
  assert.notEqual(DOMAIN_V2, DOMAIN_V3);
  assert.throws(() => domainForFactory("0x0000000000000000000000000000000000000001"), /Nothing was signed/);
});

test("the reverted mainnet open matches the legacy digest and not the next-root digest", () => {
  const action = encodeOpen(AGENT, [PAYEE], 360n, 1792261409n, 360n);
  const legacy = digestFor(ROOT, 0n, 1792005809n, action, DOMAIN_V2);
  const next = digestFor(ROOT, 0n, 1792005809n, action, domainForFactory(NEXT_FACTORY));
  assert.notEqual(legacy, next);
  assert.equal(next, digestFor(ROOT, 0n, 1792005809n, action, DOMAIN_V3));
});

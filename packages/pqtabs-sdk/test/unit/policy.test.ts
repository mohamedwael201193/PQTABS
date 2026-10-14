/** MOCKED unit tests for quote validation, decision checks, and the signature deadline. No network. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { PolicyRefusedError, PqtabsError } from "../../src/errors.js";
import { evaluateDecision, parseBarkeepQuote, paymentDeadline } from "../../src/policy.js";
import { decideBody, PAYEE, paymentRequired, TAB, testSigner } from "../helpers.js";

const MAX = 1_000n;

test("a valid Barkeep quote parses and keeps its quote id, price, and payee", () => {
  const quote = parseBarkeepQuote(paymentRequired("360"), MAX);
  assert.equal(quote.price, 360n);
  assert.equal(quote.payee, PAYEE);
  assert.equal(quote.lifetimeSeconds, 600);
  assert.equal(quote.model, "openai/gpt-oss-120b");
});

test("a quote above the caller's price cap is refused before any signing", () => {
  assert.throws(
    () => parseBarkeepQuote(paymentRequired("2000"), MAX),
    (error: unknown) => error instanceof PolicyRefusedError && error.reasons[0] === "exceeds_max_price",
  );
});

test("a quote on another network is refused as invalid", () => {
  const bad = { ...paymentRequired("360"), accepts: [{ ...paymentRequired("360").accepts[0], network: "eip155:1" }] };
  assert.throws(() => parseBarkeepQuote(bad, MAX), (error: unknown) => error instanceof PqtabsError && error.code === "quote_invalid");
});

test("a zero-price quote is refused", () => {
  assert.throws(() => parseBarkeepQuote(paymentRequired("0"), MAX), (error: unknown) => error instanceof PqtabsError && error.code === "quote_invalid");
});

test("a matching exact row beside the Arc Research price still parses the research price", () => {
  const base = paymentRequired("360");
  const research = base.accepts[0];
  if (!research) throw new Error("fixture missing");
  const withExact = {
    ...base,
    accepts: [
      research,
      {
        scheme: "exact",
        network: research.network,
        asset: research.asset,
        amount: research.amount,
        payTo: research.payTo,
        maxTimeoutSeconds: 600,
        extra: { name: "USDC", version: "2", quoteId: research.extra.quoteId, bodyHash: research.extra.bodyHash, assetTransferMethod: "eip3009" },
      },
    ],
  };
  const quote = parseBarkeepQuote(withExact, MAX);
  assert.equal(quote.price, 360n);
  assert.equal(quote.payee, research.payTo);
});

test("an exact row with a different price is refused", () => {
  const base = paymentRequired("360");
  const research = base.accepts[0];
  if (!research) throw new Error("fixture missing");
  const mismatched = {
    ...base,
    accepts: [
      research,
      {
        scheme: "exact",
        network: research.network,
        asset: research.asset,
        amount: "361",
        payTo: research.payTo,
        maxTimeoutSeconds: 600,
        extra: { name: "USDC", version: "2", quoteId: research.extra.quoteId, bodyHash: research.extra.bodyHash, assetTransferMethod: "eip3009" },
      },
    ],
  };
  assert.throws(() => parseBarkeepQuote(mismatched, MAX), (error: unknown) => error instanceof PqtabsError && error.code === "quote_invalid");
});

test("a quote that is not the Barkeep scheme (for example an exact row) is refused", () => {
  const exact = { ...paymentRequired("360"), scheme: "exact", standardExact: true };
  assert.throws(() => parseBarkeepQuote(exact, MAX), (error: unknown) => error instanceof PqtabsError && error.code === "quote_invalid");
});

test("a backend REFUSE carries the backend's own reasons", () => {
  const quote = parseBarkeepQuote(paymentRequired("360"), MAX);
  const decision = decideBody({ decision: "REFUSE", reason: ["balance", "expired"] });
  assert.throws(
    () => evaluateDecision(decision as never, { tab: TAB, quote, signerAddress: testSigner().address }),
    (error: unknown) => error instanceof PolicyRefusedError && error.reasons.join() === "balance,expired",
  );
});

test("a decision for another capability is refused", () => {
  const quote = parseBarkeepQuote(paymentRequired("360"), MAX);
  const decision = decideBody({ capability: "0x0000000000000000000000000000000000000002" });
  assert.throws(
    () => evaluateDecision(decision as never, { tab: TAB, quote, signerAddress: testSigner().address }),
    (error: unknown) => error instanceof PolicyRefusedError && error.reasons[0] === "capability_mismatch",
  );
});

test("a decision that pays a different payee or amount than the quote is refused", () => {
  const quote = parseBarkeepQuote(paymentRequired("360"), MAX);
  const wrongPayee = decideBody({ payee: "0x0000000000000000000000000000000000000003" });
  assert.throws(
    () => evaluateDecision(wrongPayee as never, { tab: TAB, quote, signerAddress: testSigner().address }),
    (error: unknown) => error instanceof PolicyRefusedError && error.reasons[0] === "wrong_payee",
  );
  const wrongPrice = decideBody({ price: "359" });
  assert.throws(
    () => evaluateDecision(wrongPrice as never, { tab: TAB, quote, signerAddress: testSigner().address }),
    (error: unknown) => error instanceof PolicyRefusedError && error.reasons[0] === "quote_mismatch",
  );
});

test("a signer that is not the capability agent is refused before signing", () => {
  const quote = parseBarkeepQuote(paymentRequired("360"), MAX);
  const decision = decideBody({ agent: "0x0000000000000000000000000000000000000004" });
  assert.throws(
    () => evaluateDecision(decision as never, { tab: TAB, quote, signerAddress: testSigner().address }),
    (error: unknown) => error instanceof PqtabsError && error.code === "signer_mismatch",
  );
});

test("an ALLOW decision for this quote, capability, payee, and agent passes", () => {
  const quote = parseBarkeepQuote(paymentRequired("360"), MAX);
  const verdict = evaluateDecision(decideBody() as never, { tab: TAB, quote, signerAddress: testSigner().address });
  assert.equal(verdict.price, 360n);
  assert.equal(verdict.payee, PAYEE);
});

test("the authorization deadline is the earlier of the capability expiry and the quote window", () => {
  assert.equal(paymentDeadline(1000n, 5000n, 600), 1600n);
  assert.equal(paymentDeadline(1000n, 1300n, 600), 1300n);
});

test("an authorization that would expire within the clock margin is refused", () => {
  assert.throws(() => paymentDeadline(1000n, 1003n, 600), (error: unknown) => error instanceof PqtabsError && error.code === "authorization_expired");
});

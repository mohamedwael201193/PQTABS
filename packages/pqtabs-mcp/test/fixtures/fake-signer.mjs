// Test double for the pqtabs-signer CLI. It speaks the same protocol as `pqtabs-signer sign --agent <addr>`:
// reads one JSON authorization on stdin, writes {"ok":true,"agent","signature"} on stdout, and refuses with
// {"ok":false,"code","message"} on stderr and exit code 1. It holds no key. The expected signature is passed in.
import process from "node:process";

const mode = process.env.FAKE_MODE ?? "sign";
const agent = process.env.FAKE_AGENT ?? "";
const expectFrom = process.env.FAKE_EXPECT_FROM ?? "";
const signature = process.env.FAKE_SIGNATURE ?? "";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  if (process.argv[2] !== "sign" || process.argv[3] !== "--agent" || process.argv[4] !== agent) {
    process.stderr.write(JSON.stringify({ ok: false, code: "bad_args", message: "unexpected arguments" }));
    process.exit(2);
  }
  if (mode === "hang") {
    // Never answer, and stay alive. The caller must time out and kill this process.
    setInterval(() => {}, 1_000);
    return;
  }

  if (mode === "refuse") {
    process.stderr.write(JSON.stringify({ ok: false, code: "refused_chain", message: "Only Arc mainnet (5042) can be signed." }));
    process.exit(1);
  }
  if (mode === "garbage") {
    process.stderr.write(`crash at 0x${"ab".repeat(32)}\n`);
    process.exit(1);
  }

  let auth;
  try {
    auth = JSON.parse(input);
  } catch {
    process.stderr.write(JSON.stringify({ ok: false, code: "bad_authorization", message: "not json" }));
    process.exit(1);
  }
  if (expectFrom && auth.from.toLowerCase() !== expectFrom.toLowerCase()) {
    process.stderr.write(JSON.stringify({ ok: false, code: "refused_address", message: "wrong capability" }));
    process.exit(1);
  }
  if (mode === "wrong_agent") {
    process.stdout.write(JSON.stringify({ ok: true, agent: "0x0000000000000000000000000000000000000001", signature }));
    return;
  }
  process.stdout.write(JSON.stringify({ ok: true, agent, signature }));
});

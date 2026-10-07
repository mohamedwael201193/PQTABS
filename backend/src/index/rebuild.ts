import { loadClients } from "../chain.js";
import { FACTORY_BLOCK } from "../constants.js";
import { readCursor, resetIndex } from "./apply.js";
import { indexWindow } from "./ingest.js";
import { openIndex } from "./sql.js";

const PAGE = 2_000n;

/** Deletes derived rows and replays Arc logs into the same database. */
export async function rebuildFromZero(): Promise<{ indexedThrough: string; head: string }> {
  const sql = await openIndex();
  const clients = loadClients();
  await resetIndex(sql);
  const times = new Map<string, string>();
  let head = 0n;
  for (;;) {
    const block = await clients.public.getBlock({ blockTag: "latest" });
    if (block.number == null) throw new Error("Arc did not return a block number.");
    head = block.number;
    const cursor = await readCursor(sql);
    const from = cursor == null ? FACTORY_BLOCK : cursor + 1n;
    if (from > head) break;
    const to = from + PAGE - 1n > head ? head : from + PAGE - 1n;
    await indexWindow(sql, clients.public, clients.factory, from, to, times);
  }
  const through = await readCursor(sql);
  await sql.close();
  return { indexedThrough: (through ?? 0n).toString(), head: head.toString() };
}

function redact(error: unknown): string {
  const message = error instanceof Error ? error.message : "rebuild failed";
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://redacted");
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("/index/rebuild.js")) {
  rebuildFromZero()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(`${redact(error)}\n`);
      process.exit(1);
    });
}

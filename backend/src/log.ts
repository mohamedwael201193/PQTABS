const LONG_BLOB = /0x[0-9a-fA-F]{200,}/g;

export function log(fields: Record<string, unknown>): void {
  const safe: Record<string, unknown> = { ts: new Date().toISOString() };
  for (const [key, value] of Object.entries(fields)) {
    if (key === "signature" || key === "authorization" || key === "privateKey") continue;
    if (typeof value === "string") {
      safe[key] = value.replace(LONG_BLOB, "0x[redacted]");
    } else {
      safe[key] = value;
    }
  }
  console.log(JSON.stringify(safe));
}

export function httpToWebSocket(rpc: string): string {
  if (rpc.startsWith("https://")) return `wss://${rpc.slice("https://".length)}`;
  if (rpc.startsWith("http://")) return `ws://${rpc.slice("http://".length)}`;
  return rpc;
}

export function headFromSubscription(payload: string): { number: bigint; timestamp: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const result = (parsed as { params?: { result?: { number?: unknown; timestamp?: unknown } } }).params?.result;
  if (!result || typeof result.number !== "string" || !/^0x[0-9a-fA-F]+$/.test(result.number)) return null;
  const timestamp =
    typeof result.timestamp === "string" && /^0x[0-9a-fA-F]+$/.test(result.timestamp) ? BigInt(result.timestamp).toString() : "";
  return { number: BigInt(result.number), timestamp };
}

let connected = false;

export function headSocketOpen(): boolean {
  return connected;
}

/** Subscribes to Arc newHeads. The ingest loop remains the only log reader. */
export function startHeadFeed(rpc: string, onHead: (number: bigint, timestamp: string) => void): void {
  const url = httpToWebSocket(rpc);
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    connected = false;
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 5_000);
  };
  const connect = () => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      schedule();
      return;
    }
    socket.addEventListener("open", () => {
      connected = true;
      socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["newHeads"] }));
    });
    socket.addEventListener("message", (event) => {
      const head = headFromSubscription(String(event.data));
      if (head) onHead(head.number, head.timestamp);
    });
    socket.addEventListener("close", schedule);
    socket.addEventListener("error", () => socket.close());
  };
  connect();
}

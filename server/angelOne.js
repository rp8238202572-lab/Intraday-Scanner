import WebSocket from "ws";

export function createAngelOneStream({ clientCode, feedToken, apiKey, onTick, onStatus }) {
  if (!clientCode || !feedToken || !apiKey) throw new Error("Angel One credentials are not configured");

  const url = "wss://smartapisocket.angelone.in/smart-stream"
    + "?clientCode=" + encodeURIComponent(clientCode)
    + "&feedToken=" + encodeURIComponent(feedToken)
    + "&apiKey=" + encodeURIComponent(apiKey);

  const ws = new WebSocket(url);
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send("ping");
  }, 30000);

  ws.on("open", () => onStatus?.("connected"));
  ws.on("close", () => { clearInterval(heartbeat); onStatus?.("closed"); });
  ws.on("error", err => onStatus?.("error:" + err.message));

  ws.on("message", data => {
    const b = Buffer.from(data);
    if (b.length < 51) return;
    const mode = b.readInt8(0);
    const exchangeType = b.readInt8(1);
    const token = b.subarray(2, 27).toString("utf8").replace(/\0/g, "");
    const sequence = b.readBigInt64LE(27).toString();
    const exchangeTimestamp = Number(b.readBigInt64LE(35));
    const ltp = b.readInt32LE(43) / 100;
    onTick?.({
      broker: "angelOne", raw: data, mode, exchangeType, token, sequence,
      timestamp: exchangeTimestamp, ltp
    });
  });

  return {
    subscribe: payload => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(payload)),
    close: () => { clearInterval(heartbeat); ws.close(); }
  };
}

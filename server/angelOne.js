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
    // Smart Stream returns binary packets. Decoding is isolated here so the
    // scanner engine remains broker-agnostic.
    onTick?.({ broker: "angelOne", raw: data });
  });

  return {
    subscribe: payload => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(payload)),
    close: () => { clearInterval(heartbeat); ws.close(); }
  };
}

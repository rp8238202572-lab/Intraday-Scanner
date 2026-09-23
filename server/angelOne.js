import WebSocket from "ws";

export function createAngelOneStream({
  clientCode,
  feedToken,
  apiKey,
  authToken,
  onTick,
  onStatus
}) {
  if (!clientCode || !feedToken || !apiKey || !authToken) {
    throw new Error("Angel One credentials are not configured");
  }

  const url = "wss://smartapisocket.angelone.in/smart-stream";
  const ws = new WebSocket(url, {
    headers: {
      Authorization: "Bearer " + authToken,
      "x-api-key": apiKey,
      "x-client-code": clientCode,
      "x-feed-token": feedToken
    }
  });

  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send("ping");
  }, 10000);

  ws.on("open", () => {
    onStatus?.("connected");
    onStatus?.("ready_for_subscription");
  });

  ws.on("close", () => {
    clearInterval(heartbeat);
    onStatus?.("closed");
  });

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
      broker: "angelOne",
      raw: data,
      mode,
      exchangeType,
      token,
      sequence,
      timestamp: exchangeTimestamp,
      ltp
    });
  });

  return {
    subscribe: ({ tokens, mode = 1, correlationID = "scanner01" } = {}) => {
      if (
        ws.readyState !== WebSocket.OPEN ||
        !Array.isArray(tokens) ||
        !tokens.length
      ) return false;

      const payload = {
        correlationID,
        action: 1,
        params: {
          mode,
          tokenList: [
            { exchangeType: 1, tokens: tokens.map(String) }
          ]
        }
      };

      ws.send(JSON.stringify(payload));
      return true;
    },

    close: () => {
      clearInterval(heartbeat);
      ws.close();
    }
  };
}

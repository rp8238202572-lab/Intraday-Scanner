import WebSocket from "ws";
import { decodeUpstoxFeed } from "./upstoxDecoder.js";

export async function createUpstoxStream({ accessToken, authorizeUrl, onTick, onStatus, instrumentKeys = [], mode = "ltpc" }) {
  if (!accessToken) throw new Error("Upstox access token is not configured");

  const authEndpoint = authorizeUrl || "https://api.upstox.com/v3/feed/market-data-feed/authorize";
  const response = await fetch(authEndpoint, {
    headers: { Authorization: "Bearer " + accessToken, Accept: "application/json" }
  });
  if (!response.ok) throw new Error("Upstox feed authorization failed: HTTP " + response.status);

  const body = await response.json();
  const wsUrl = body?.data?.authorized_redirect_uri ?? body?.data?.authorizedRedirectUri;
  if (!wsUrl) throw new Error("Upstox authorization response did not contain a WebSocket URL");

  const ws = new WebSocket(wsUrl, {
    headers: { Authorization: "Bearer " + accessToken, Accept: "*/*" },
    followRedirects: true
  });

  const subscribe = ({ instrumentKeys: keys, mode: subMode = "ltpc", guid = "scanner01" } = {}) => {
    if (ws.readyState !== WebSocket.OPEN || !Array.isArray(keys) || !keys.length) return false;
    const payload = { guid, method: "sub", data: { mode: subMode, instrumentKeys: keys } };
    ws.send(Buffer.from(JSON.stringify(payload)));
    return true;
  };

  ws.on("open", () => {
    onStatus?.("connected");
    const subscribed = subscribe({ instrumentKeys, mode });
    onStatus?.(subscribed ? "subscribed" : "ready_for_subscription");
  });
  ws.on("close", () => onStatus?.("closed"));
  ws.on("error", err => onStatus?.("error:" + err.message));
  ws.on("message", async data => {
    try {
      const ticks = await decodeUpstoxFeed(Buffer.from(data));
      for (const tick of ticks) onTick?.(tick);
    } catch (err) {
      onStatus?.("decode_error:" + err.message);
    }
  });

  return {
    subscribe,
    close: () => ws.close()
  };
}

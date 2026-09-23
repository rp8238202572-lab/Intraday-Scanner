import protobuf from "protobufjs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const protoPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "MarketDataFeedV3.proto");
let rootPromise;

export function loadUpstoxProto() {
  if (!rootPromise) rootPromise = protobuf.load(protoPath);
  return rootPromise;
}

export async function decodeUpstoxFeed(buffer) {
  const root = await loadUpstoxProto();
  const FeedResponse = root.lookupType("FeedResponse");
  const message = FeedResponse.decode(buffer);
  const feeds = message.feeds || {};
  const out = [];

  for (const [instrumentKey, feed] of Object.entries(feeds)) {
    const ltpc =
      feed.ltpc ??
      feed.fullFeed?.marketFF?.ltpc ??
      feed.fullFeed?.indexFF?.ltpc ??
      feed.firstLevelWithGreeks?.ltpc;

    if (!ltpc || ltpc.ltp == null) continue;

    const full = feed.fullFeed?.marketFF;
    const firstLevel = feed.firstLevelWithGreeks;
    const currentTs = message.currentTs ? Number(message.currentTs) : Date.now();
    const timestamp = ltpc.ltt ? Number(ltpc.ltt) : currentTs;
    const volumeToday =
      full?.vtt != null ? Number(full.vtt) :
      firstLevel?.vtt != null ? Number(firstLevel.vtt) : null;

    out.push({
      broker: "upstox",
      instrumentKey,
      ltp: Number(ltpc.ltp),
      timestamp,
      volume: volumeToday,
      volumeDelta: ltpc.ltq != null ? Number(ltpc.ltq) : null,
      feedMode: full ? "full_d5" : (firstLevel ? "first_level_greeks" : "ltpc")
    });
  }
  return out;
}

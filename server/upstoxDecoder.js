import protobuf from "protobufjs";

let rootPromise;

export function loadUpstoxProto(protoPath="./upstox.proto"){
  if(!rootPromise) rootPromise=protobuf.load(protoPath);
  return rootPromise;
}

export async function decodeUpstoxFeed(buffer, protoPath="./upstox.proto"){
  const root=await loadUpstoxProto(protoPath);
  const FeedResponse=root.lookupType("FeedResponse");
  const message=FeedResponse.decode(buffer);
  const feeds=message.feeds || {};
  const out=[];
  for(const [instrumentKey, feed] of Object.entries(feeds)){
    const ltpc=feed.ltpc;
    if(!ltpc || ltpc.ltp==null) continue;
    out.push({
      broker:"upstox",
      instrumentKey,
      ltp:Number(ltpc.ltp),
      timestamp:ltpc.ltt ? Number(ltpc.ltt) : Date.now(),
      volume:ltpc.ltq!=null ? Number(ltpc.ltq) : null
    });
  }
  return out;
}

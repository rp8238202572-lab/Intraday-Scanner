import { gunzipSync } from "node:zlib";

const WATCH=["RELIANCE","HDFCBANK","ICICIBANK","SBIN","INFY","TCS","BHARTIARTL","LT","AXISBANK","KOTAKBANK","ITC","MARUTI","M&M","SUNPHARMA","TATAMOTORS","TATASTEEL","ADANIENT","NTPC","POWERGRID","BEL","HINDUNILVR","BAJFINANCE","HCLTECH","WIPRO","TECHM","ULTRACEMCO","ASIANPAINT","TITAN","COALINDIA","ONGC"];

export async function loadAngelOneInstruments(url="https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json"){
  const r=await fetch(url); if(!r.ok) throw new Error("Angel instrument master HTTP "+r.status);
  const rows=await r.json();
  const map=new Map();
  for(const x of rows){
    if(x.exch_seg!=="nse_cm" || x.instrumenttype || !String(x.symbol||"").endsWith("-EQ")) continue;
    const name=String(x.name||"").toUpperCase();
    if(WATCH.includes(name) && !map.has(name)) map.set(name,{exchangeType:1,token:String(x.token),tradingsymbol:x.symbol});
  }
  return Object.fromEntries(map);
}

export async function loadUpstoxInstruments(url="https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz"){
  const r=await fetch(url); if(!r.ok) throw new Error("Upstox instrument master HTTP "+r.status);
  const compressed=Buffer.from(await r.arrayBuffer());
  const rows=JSON.parse(gunzipSync(compressed).toString("utf8"));
  const map=new Map();
  for(const x of rows){
    if(x.segment!=="NSE_EQ" || x.instrument_type!=="EQ") continue;
    const symbol=String(x.trading_symbol||"").toUpperCase();
    if(WATCH.includes(symbol) && !map.has(symbol)) map.set(symbol,String(x.instrument_key));
  }
  return Object.fromEntries(map);
}

export {WATCH};

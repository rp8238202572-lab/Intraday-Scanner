export async function fetchUpstoxCandles({accessToken,instrumentKey,fromDate,toDate,interval=5}){
  if(!accessToken) throw new Error("Upstox access token is not configured");
  if(!instrumentKey) throw new Error("instrumentKey is required");
  const to=toDate || new Date().toISOString().slice(0,10);
  const from=fromDate || to;
  const url="https://api.upstox.com/v3/historical-candle/"+encodeURIComponent(instrumentKey)+"/minutes/"+encodeURIComponent(String(interval))+"/"+to+"/"+from;
  const r=await fetch(url,{headers:{Accept:"application/json",Authorization:"Bearer "+accessToken}});
  if(!r.ok) throw new Error("Upstox historical candle HTTP "+r.status);
  const body=await r.json();
  const rows=body?.data?.candles;
  if(!Array.isArray(rows)) return [];
  return rows.map(row=>({
    instrumentKey,
    timestamp:Date.parse(row[0]),
    open:Number(row[1]),
    high:Number(row[2]),
    low:Number(row[3]),
    close:Number(row[4]),
    volume:Number(row[5])||0,
    complete:true
  })).filter(x=>Number.isFinite(x.timestamp)&&[x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((a,b)=>a.timestamp-b.timestamp);
}

const BASE_URL = "https://api.groww.in/v1";

function token(){
  return String(process.env.GROWW_ACCESS_TOKEN || "").trim();
}

export function growwConfigured(){
  return Boolean(token());
}

async function request(path, {method="GET", query={}}={}){
  if(!token()) throw new Error("Groww access token is not configured");
  const url=new URL(BASE_URL+path);
  for(const [key,value] of Object.entries(query)){
    if(value !== undefined && value !== null && value !== "") url.searchParams.set(key,String(value));
  }
  const response=await fetch(url,{method,headers:{
    Accept:"application/json",
    Authorization:"Bearer "+token(),
    "X-API-VERSION":"1.0"
  }});
  const text=await response.text();
  let data;
  try{data=JSON.parse(text);}catch{data={raw:text};}
  if(!response.ok) throw new Error(data?.error?.message || data?.message || data?.payload?.message || ("Groww API HTTP "+response.status));
  if(data?.status==="FAILURE") throw new Error(data?.message || data?.payload?.message || "Groww API request failed");
  return data?.payload ?? data;
}

export function growwGetQuote({exchange="NSE",segment="CASH",tradingSymbol}){
  return request("/live-data/quote",{query:{exchange,segment,trading_symbol:tradingSymbol}});
}

export function growwGetLtp({segment="CASH",exchangeSymbols=[]}){
  return request("/live-data/ltp",{query:{segment,exchange_symbols:exchangeSymbols.join(",")}});
}

export function growwGetHistoricalCandles({exchange="NSE",segment="CASH",tradingSymbol,startTime,endTime,interval=5}){
  return request("/historical/candle/range",{query:{
    exchange,segment,trading_symbol:tradingSymbol,start_time:startTime,end_time:endTime,interval_in_minutes:interval
  }});
}

export function growwGetOptionChain({exchange="NSE",underlying,expiryDate}){
  return request("/option-chain/exchange/"+encodeURIComponent(exchange)+"/underlying/"+encodeURIComponent(underlying),{query:{expiry_date:expiryDate}});
}

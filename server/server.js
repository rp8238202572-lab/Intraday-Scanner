import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import { CandleBuilder } from "./candleBuilder.js";
import { normalizeTick } from "./marketData.js";
import { calculateSignal } from "./signalEngine.js";
import { fetchUpstoxCandles } from "./upstoxHistorical.js";
import { growwConfigured, growwGetQuote, growwGetLtp, growwGetHistoricalCandles, growwGetOptionChain } from "./groww.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(serverDir, "..");
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());
app.use(express.static(webRoot));

app.get("/", (_req, res) => res.sendFile(path.join(webRoot, "index.html")));

app.get("/health", (_req,res) => res.json({
  ok:true,
  service:"intraday-scanner-broker-gateway",
  time:new Date().toISOString(),
  brokers:{
    angelOne:Boolean(process.env.ANGEL_API_KEY && process.env.ANGEL_CLIENT_CODE && process.env.ANGEL_FEED_TOKEN && process.env.ANGEL_AUTH_TOKEN),
    upstox:Boolean(process.env.UPSTOX_ACCESS_TOKEN),
    groww:growwConfigured()
  },
  trading:{enabled:false}
}));

const streamState={angelOne:"disabled",upstox:"disabled"};
const activeStreams={angelOne:null,upstox:null};
const lastTickAt={angelOne:null,upstox:null};
const tickCounts={angelOne:0,upstox:0};

const candleBuilders=new Map();
function candleKey(t){ return String(t?.instrumentKey ?? t?.symbol ?? t?.token ?? "unknown"); }

function getBuilder(key){
  if(!candleBuilders.has(key)) candleBuilders.set(key,new CandleBuilder(300000,500));
  return candleBuilders.get(key);
}

function pushLiveTick(rawTick){
  const tick=normalizeTick(rawTick);
  if(!tick) return null;
  const broker=String(tick.broker||"unknown");
  if(broker in lastTickAt){
    lastTickAt[broker]=new Date(Number(tick.timestamp)||Date.now()).toISOString();
    tickCounts[broker]++;
  }
  return getBuilder(candleKey(tick)).update(tick);
}

async function seedUpstoxHistory(instruments){
  const entries=Object.entries(instruments||{});
  if(!entries.length) return;
  const now=Date.now();
  const toDate=new Date(now-24*60*60*1000).toISOString().slice(0,10);
  const fromDate=new Date(now-10*24*60*60*1000).toISOString().slice(0,10);
  let loaded=0;

  for(const [symbol,instrumentKey] of entries){
    try{
      const candles=await fetchUpstoxCandles({
        accessToken:process.env.UPSTOX_ACCESS_TOKEN,
        instrumentKey,
        fromDate,
        toDate,
        interval:5
      });
      getBuilder(instrumentKey).seed(candles);
      if(candles.length) loaded++;
      console.log(`Upstox history: ${symbol} ${candles.length} candles`);
    }catch(e){
      console.error(`Upstox history ${symbol}:`,e.message);
    }
  }

  console.log(`Upstox history seed complete: ${loaded}/${entries.length} symbols loaded`);
}

async function startConfiguredStreams(){
  if(process.env.UPSTOX_ACCESS_TOKEN){
    try{
      const {createUpstoxStream}=await import("./upstox.js");
      const {loadUpstoxInstruments}=await import("./instruments.js");
      const instruments=await loadUpstoxInstruments();
      const keys=Object.values(instruments);
      activeStreams.upstox=await createUpstoxStream({
        accessToken:process.env.UPSTOX_ACCESS_TOKEN,
        instrumentKeys:keys,
        mode:"full",
        onStatus:s=>{streamState.upstox=s; console.log("Upstox:",s);},
        onTick:pushLiveTick
      });
      seedUpstoxHistory(instruments).catch(e=>console.error("Upstox history seed:",e.message));
    }catch(e){
      streamState.upstox="error:"+e.message;
      console.error("Upstox stream:",e.message);
    }
  }

  const angelConfigured =
    process.env.ANGEL_API_KEY &&
    process.env.ANGEL_CLIENT_CODE &&
    process.env.ANGEL_FEED_TOKEN &&
    process.env.ANGEL_AUTH_TOKEN;

  if(angelConfigured){
    try{
      const {createAngelOneStream}=await import("./angelOne.js");
      const {loadAngelOneInstruments}=await import("./instruments.js");
      const instruments=await loadAngelOneInstruments();

      activeStreams.angelOne=await createAngelOneStream({
        apiKey:process.env.ANGEL_API_KEY,
        clientCode:process.env.ANGEL_CLIENT_CODE,
        feedToken:process.env.ANGEL_FEED_TOKEN,
        authToken:process.env.ANGEL_AUTH_TOKEN,
        onStatus:s=>{streamState.angelOne=s; console.log("Angel One:",s);},
        onTick:pushLiveTick
      });

      activeStreams.angelOne.subscribe({
        tokens:Object.values(instruments).map(x=>x.token),
        mode:1
      });
    }catch(e){
      streamState.angelOne="error:"+e.message;
      console.error("Angel One stream:",e.message);
    }
  }
}

app.get("/api/angelone/callback",(req,res)=>{
  const authToken=String(req.query.auth_token||"");
  const feedToken=String(req.query.feed_token||"");
  if(!authToken && !feedToken){
    return res.status(400).send("Angel One callback received without auth_token/feed_token.");
  }
  res.send("Angel One authentication callback received. You can return to Intraday Scanner.");
});

app.get("/api/streams",(_req,res)=>res.json({
  ok:true,
  streams:streamState,
  live:Object.values(activeStreams).some(Boolean),
  lastTickAt,
  tickCounts
}));

app.get("/api/status",(_req,res)=>{
  const builders=[...candleBuilders.entries()].map(([key,builder])=>({
    instrumentKey:key,
    candles:builder.getCandles().length,
    current:builder.snapshot().at(-1)?.close ?? null
  }));
  res.json({
    ok:true,
    time:new Date().toISOString(),
    streams:streamState,
    brokers:{
      angelOne:Boolean(process.env.ANGEL_API_KEY && process.env.ANGEL_CLIENT_CODE && process.env.ANGEL_FEED_TOKEN && process.env.ANGEL_AUTH_TOKEN),
      upstox:Boolean(process.env.UPSTOX_ACCESS_TOKEN),
      groww:growwConfigured()
    },
    lastTickAt,
    tickCounts,
    instrumentCount:builders.length,
    readyCandles:builders.filter(x=>x.candles>=50).length,
    interval:"5m",
    tradingEnabled:false
  });
});

app.get("/api/candles",(_req,res)=>{
  res.json({
    ok:true,
    interval:"5m",
    candles:[...candleBuilders.values()].flatMap(x=>x.snapshot())
  });
});

app.post("/api/tick",(req,res)=>{
  const completed=pushLiveTick(req.body);
  res.json({ok:true,completed});
});

app.post("/api/history/upstox",async(req,res)=>{
  try{
    const {instrumentKey,fromDate,toDate,interval=5}=req.body||{};
    const candles=await fetchUpstoxCandles({
      accessToken:process.env.UPSTOX_ACCESS_TOKEN,
      instrumentKey,fromDate,toDate,interval
    });
    const builder=getBuilder(String(instrumentKey));
    builder.seed(candles);
    res.json({ok:true,instrumentKey,count:candles.length,candles});
  }catch(e){
    res.status(400).json({ok:false,error:e.message});
  }
});

app.get("/api/instruments/upstox",async(_req,res)=>{
  try{
    const {loadUpstoxInstruments}=await import("./instruments.js");
    const instruments=await loadUpstoxInstruments();
    res.json({ok:true,instruments});
  }catch(e){
    res.status(503).json({ok:false,error:e.message});
  }
});

app.get("/api/groww/status",(_req,res)=>res.json({
  ok:true,
  configured:growwConfigured(),
  tradingEnabled:false,
  message:growwConfigured() ? "Groww access token configured" : "Add GROWW_ACCESS_TOKEN in Render to enable Groww API"
}));

app.get("/api/groww/quote",async(req,res)=>{
  try{
    const exchange=String(req.query.exchange||"NSE");
    const segment=String(req.query.segment||"CASH");
    const tradingSymbol=String(req.query.trading_symbol||"");
    if(!tradingSymbol) return res.status(400).json({ok:false,error:"trading_symbol is required"});
    const quote=await growwGetQuote({exchange,segment,tradingSymbol});
    res.json({ok:true,quote});
  }catch(e){res.status(400).json({ok:false,error:e.message});}
});

app.get("/api/groww/ltp",async(req,res)=>{
  try{
    const segment=String(req.query.segment||"CASH");
    const exchangeSymbols=String(req.query.exchange_symbols||"").split(",").map(x=>x.trim()).filter(Boolean).slice(0,50);
    if(!exchangeSymbols.length) return res.status(400).json({ok:false,error:"exchange_symbols is required"});
    const ltp=await growwGetLtp({segment,exchangeSymbols});
    res.json({ok:true,ltp});
  }catch(e){res.status(400).json({ok:false,error:e.message});}
});

app.get("/api/groww/history",async(req,res)=>{
  try{
    const candles=await growwGetHistoricalCandles({
      exchange:String(req.query.exchange||"NSE"),
      segment:String(req.query.segment||"CASH"),
      tradingSymbol:String(req.query.trading_symbol||""),
      startTime:String(req.query.start_time||""),
      endTime:String(req.query.end_time||""),
      interval:Number(req.query.interval||5)
    });
    res.json({ok:true,candles});
  }catch(e){res.status(400).json({ok:false,error:e.message});}
});

app.get("/api/groww/option-chain",async(req,res)=>{
  try{
    const exchange=String(req.query.exchange||"NSE");
    const underlying=String(req.query.underlying||"");
    const expiryDate=String(req.query.expiry_date||"");
    if(!underlying || !expiryDate) return res.status(400).json({ok:false,error:"underlying and expiry_date are required"});
    const optionChain=await growwGetOptionChain({exchange,underlying,expiryDate});
    res.json({ok:true,optionChain});
  }catch(e){res.status(400).json({ok:false,error:e.message});}
});

app.get("/api/signal/:instrumentKey",(req,res)=>{
  const key=String(req.params.instrumentKey);
  const candles=getBuilder(key).snapshot();
  const signal=calculateSignal(candles,{
    capital:Number(req.query.capital)||2000,
    riskPct:Number(req.query.risk)||1,
    minScore:Number(req.query.minScore)||65
  });
  res.json({ok:true,instrumentKey:key,candleCount:candles.length,signal,diagnostics:signal?.diagnostics||null});
});

app.get("/api/config",(_req,res)=>res.json({
  marketData:{
    angelOne:Boolean(
      process.env.ANGEL_API_KEY &&
      process.env.ANGEL_CLIENT_CODE &&
      process.env.ANGEL_FEED_TOKEN &&
      process.env.ANGEL_AUTH_TOKEN
    ),
    upstox:Boolean(process.env.UPSTOX_ACCESS_TOKEN),
    groww:growwConfigured()
  },
  trading:{enabled:false},
  interval:"5m"
}));

const server=app.listen(port,"0.0.0.0",async()=>{
  console.log("Intraday Scanner broker gateway listening on "+port);
  await startConfiguredStreams();
});

function shutdown(signal){
  console.log("Shutting down on "+signal);
  for(const stream of Object.values(activeStreams)){
    try{stream?.close?.();}catch{}
  }
  server.close(()=>process.exit(0));
}
process.once("SIGTERM",()=>shutdown("SIGTERM"));
process.once("SIGINT",()=>shutdown("SIGINT"));

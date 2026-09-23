import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import { CandleBuilder } from "./candleBuilder.js";
import { normalizeTick } from "./marketData.js";
import { calculateSignal } from "./signalEngine.js";
import { fetchUpstoxCandles } from "./upstoxHistorical.js";

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
  ok:true, service:"intraday-scanner-broker-gateway", time:new Date().toISOString(),
  brokers:{angelOne:Boolean(process.env.ANGEL_API_KEY),upstox:Boolean(process.env.UPSTOX_ACCESS_TOKEN)},
  trading:{enabled:false}
}));

const streamState={angelOne:"disabled",upstox:"disabled"};
const activeStreams={angelOne:null,upstox:null};

const candleBuilders=new Map();
function candleKey(t){ return String(t?.instrumentKey ?? t?.symbol ?? t?.token ?? "unknown"); }

function getBuilder(key){
  if(!candleBuilders.has(key)) candleBuilders.set(key,new CandleBuilder(300000,500));
  return candleBuilders.get(key);
}

function pushLiveTick(rawTick){
  const tick=normalizeTick(rawTick);
  if(!tick) return null;
  return getBuilder(candleKey(tick)).update(tick);
}

async function seedUpstoxHistory(instruments){
  const entries=Object.entries(instruments||{});
  if(!entries.length) return;
  // Use completed trading days for the historical seed. Querying "today" too
  // early in the session can return little/no completed 5-minute history.
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
        mode:"ltpc",
        onStatus:s=>{streamState.upstox=s; console.log("Upstox:",s);},
        onTick:pushLiveTick
      });

      // Seed enough recent 5-minute candles so the signal engine is ready
      // immediately after a deploy/restart instead of waiting for 50 live candles.
      seedUpstoxHistory(instruments).catch(e=>console.error("Upstox history seed:",e.message));
    }catch(e){streamState.upstox="error:"+e.message;console.error("Upstox stream:",e.message);}
  }
  if(process.env.ANGEL_API_KEY && process.env.ANGEL_CLIENT_CODE && process.env.ANGEL_FEED_TOKEN){
    try{
      const {createAngelOneStream}=await import("./angelOne.js");
      const {loadAngelOneInstruments}=await import("./instruments.js");
      const instruments=await loadAngelOneInstruments();
      activeStreams.angelOne=await createAngelOneStream({
        apiKey:process.env.ANGEL_API_KEY,
        clientCode:process.env.ANGEL_CLIENT_CODE,
        feedToken:process.env.ANGEL_FEED_TOKEN,
        onStatus:s=>{streamState.angelOne=s; console.log("Angel One:",s);},
        onTick:pushLiveTick
      });
      activeStreams.angelOne.subscribe({tokens:Object.values(instruments).map(x=>x.token),mode:1});
    }catch(e){streamState.angelOne="error:"+e.message;console.error("Angel One stream:",e.message);}
  }
}

app.get("/api/streams",(_req,res)=>res.json({ok:true,streams:streamState,live:Object.values(activeStreams).some(Boolean)}));

app.get("/api/candles",(_req,res)=>{
  res.json({ok:true,interval:"5m",candles:[...candleBuilders.values()].flatMap(x=>x.snapshot())});
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
  }catch(e){res.status(503).json({ok:false,error:e.message});}
});

app.get("/api/signal/:instrumentKey",(req,res)=>{
  const key=String(req.params.instrumentKey);
  const candles=getBuilder(key).snapshot();
  const signal=calculateSignal(candles,{
    capital:Number(req.query.capital)||2000,
    riskPct:Number(req.query.risk)||1,
    minScore:Number(req.query.minScore)||65
  });
  res.json({ok:true,instrumentKey:key,candleCount:candles.length,signal});
});

app.get("/api/config",(_req,res)=>res.json({
  marketData:{angelOne:Boolean(process.env.ANGEL_API_KEY),upstox:Boolean(process.env.UPSTOX_ACCESS_TOKEN)},
  trading:{enabled:false},interval:"5m"
}));

app.listen(port,"0.0.0.0",async()=>{
  console.log("Intraday Scanner broker gateway listening on "+port);
  await startConfiguredStreams();
});

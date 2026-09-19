import express from "express";
import cors from "cors";
import { CandleBuilder } from "./candleBuilder.js";
import { normalizeTick } from "./marketData.js";
import { calculateSignal } from "./signalEngine.js";
import { fetchUpstoxCandles } from "./upstoxHistorical.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

app.get("/health", (_req,res) => res.json({
  ok:true, service:"intraday-scanner-broker-gateway", time:new Date().toISOString(),
  brokers:{angelOne:Boolean(process.env.ANGEL_API_KEY),upstox:Boolean(process.env.UPSTOX_ACCESS_TOKEN)},
  trading:{enabled:false}
}));

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

app.listen(port,()=>console.log("Intraday Scanner broker gateway listening on "+port));

import express from "express";
import cors from "cors";
import { CandleBuilder } from "./candleBuilder.js";
import { normalizeTick } from "./marketData.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";

app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "intraday-scanner-broker-gateway",
    time: new Date().toISOString(),
    brokers: {
      angelOne: Boolean(process.env.ANGEL_API_KEY),
      upstox: Boolean(process.env.UPSTOX_ACCESS_TOKEN)
    }
  });
});

// Deliberately no broker secrets or order endpoints are exposed here yet.
// Phase 1 is read-only market data. Order execution will remain a separate,
 // explicitly enabled phase with additional safety controls.
const candleBuilders = new Map();
function candleKey(t){ return String(t?.instrumentKey ?? t?.symbol ?? t?.token ?? "unknown"); }
function pushLiveTick(rawTick){
  const tick=normalizeTick(rawTick);
  if(!tick) return null;
  const key=candleKey(tick);
  if(!candleBuilders.has(key)) candleBuilders.set(key,new CandleBuilder(300000));
  return candleBuilders.get(key).update(tick);
}

app.get("/api/candles", (_req,res) => {
  res.json({ok:true, interval:"5m", candles:[...candleBuilders.values()].flatMap(x=>x.snapshot())});
});

app.post("/api/tick", (req,res) => {
  const completed=pushLiveTick(req.body);
  res.json({ok:true, completed});
});

app.get("/api/config", (_req, res) => {
  res.json({
    marketData: {
      angelOne: Boolean(process.env.ANGEL_API_KEY),
      upstox: Boolean(process.env.UPSTOX_ACCESS_TOKEN)
    },
    trading: { enabled: false }
  });
});

app.listen(port, () => {
  console.log("Intraday Scanner broker gateway listening on " + port);
});

import express from "express";
import cors from "cors";

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

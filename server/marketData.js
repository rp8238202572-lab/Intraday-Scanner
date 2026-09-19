export function normalizeTick(tick) {
  if (!tick?.broker) return null;
  const ltp=Number(tick.ltp);
  if (!Number.isFinite(ltp)||ltp<=0) return null;
  return {
    broker: tick.broker,
    instrumentKey: tick.instrumentKey ?? tick.symbol ?? tick.token ?? null,
    symbol: tick.symbol ?? null,
    ltp,
    volume: Number.isFinite(Number(tick.volume)) ? Number(tick.volume) : null,
    volumeDelta: Number.isFinite(Number(tick.volumeDelta)) ? Number(tick.volumeDelta) : null,
    timestamp: Number.isFinite(Number(tick.timestamp)) ? Number(tick.timestamp) : Date.now()
  };
}

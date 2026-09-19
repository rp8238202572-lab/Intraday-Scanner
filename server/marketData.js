export function normalizeTick(tick) {
  if (!tick?.broker) return null;
  // Common shape consumed by the scanner. Broker-specific adapters can fill
  // these fields as their binary/JSON payload decoders are enabled.
  return {
    broker: tick.broker,
    instrumentKey: tick.instrumentKey ?? null,
    symbol: tick.symbol ?? null,
    ltp: Number.isFinite(Number(tick.ltp)) ? Number(tick.ltp) : null,
    volume: Number.isFinite(Number(tick.volume)) ? Number(tick.volume) : null,
    timestamp: tick.timestamp ?? Date.now()
  };
}

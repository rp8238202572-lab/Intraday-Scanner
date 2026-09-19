# Intraday Scanner Broker Gateway

Read-only market-data gateway for the Intraday Scanner.

## Current phase
- Angel One SmartAPI WebSocket adapter scaffold
- Upstox Market Data Feed V3 authorization/WebSocket adapter scaffold
- Broker-agnostic normalized tick model
- Trading/order execution remains disabled

## Security
Never commit API keys, client secrets, PINs, TOTP values, access tokens, or feed tokens.
Use environment variables on the server.

## Next implementation
1. Add official Angel One binary packet decoder.
2. Add Upstox V3 protobuf decoder and instrument-key mapping.
3. Build 5-minute candle aggregation from live ticks.
4. Feed completed candles into the existing EMA/RSI/VWAP/ATR engine.

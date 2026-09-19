# Intraday Scanner Broker Gateway

Read-only market-data gateway for the Intraday Scanner.

## Current implementation
- Angel One SmartAPI market-stream adapter with binary LTP decoding.
- Upstox Market Data Feed V3 authorization and WebSocket adapter.
- Upstox V3 protobuf decoder and instrument mapping.
- Upstox historical 5-minute candle adapter.
- Broker-agnostic normalized tick model.
- Live 5-minute candle aggregation.
- EMA 9/21, RSI 14, VWAP, volume and ATR signal engine.
- Risk-based position sizing.
- Health, candle, signal, instrument and stream-status API endpoints.
- Configured broker streams start automatically when required environment variables are present.
- Trading/order execution remains disabled.

## Data flow
`Broker feed -> normalized tick -> 5-minute candle builder -> indicators -> signal engine -> scanner API`

GitHub Pages hosts the static frontend. The Node.js broker gateway must run on a separate server so broker credentials stay private.

## Security
Never commit API keys, client secrets, PINs, TOTP values, access tokens, or feed tokens. Set them as backend environment variables.

## Deployment
A separate Node hosting service is required for the broker gateway. The repository frontend can remain on GitHub Pages.

## Safety
The scanner is read-only and does not place orders. Yahoo/CORS data is only a fallback/development source, not exchange-grade live data.

import test from "node:test";
import assert from "node:assert/strict";
import { calculateSignal, detectCandlestickPattern } from "./signalEngine.js";

function candles(){
  const out=[];
  let p=100;
  for(let i=0;i<60;i++){
    p += i<40 ? 0.15 : 0.45;
    out.push({open:p-0.1,high:p+0.2,low:p-0.2,close:p,volume:1000+(i===59?800:0),timestamp:Date.now()+i*300000});
  }
  return out;
}

test("insufficient candles fail closed",()=>{
  const s=calculateSignal(candles().slice(0,20));
  assert.equal(s.signal,"NO_TRADE");
  assert.equal(s.diagnostics.reasonCode,"INSUFFICIENT_CANDLES");
});

test("valid candle history returns a structured signal",()=>{
  const s=calculateSignal(candles(),{capital:2000,riskPct:1,minScore:65});
  assert.ok(s);
  assert.ok(["BUY_SETUP","SELL_SETUP","NO_TRADE"].includes(s.signal));
  assert.equal(typeof s.score,"number");
  assert.equal(typeof s.price,"number");
  assert.equal(typeof s.candlestickPattern,"string");
});

test("risk sizing never exceeds affordable quantity",()=>{
  const s=calculateSignal(candles(),{capital:2000,riskPct:1,minScore:0});
  if(s?.quantity!=null) assert.ok(s.quantity<=Math.floor(2000/s.price));
});

function candle(open,high,low,close){
  return {open,high,low,close,volume:1000,complete:true,timestamp:Date.now()};
}

test("bullish engulfing is detected after a bearish candle",()=>{
  const xs=[
    candle(105,106,99,100),
    candle(100,101,98,99),
    candle(99,100,98.5,99.2),
    candle(99.5,100,97,98),
    candle(97.5,102,97,101.5)
  ];
  const p=detectCandlestickPattern(xs);
  assert.equal(p.name,"Bullish Engulfing");
  assert.equal(p.direction,"BULLISH");
  assert.equal(p.confirmed,true);
});

test("doji is treated as neutral rather than a trade direction",()=>{
  const xs=[
    candle(100,101,99,100.2),
    candle(100.2,101,99.2,100),
    candle(100,100.8,99.4,100.1),
    candle(100.1,101,99.5,100.05),
    candle(100.05,101.2,98.9,100.06)
  ];
  const p=detectCandlestickPattern(xs);
  assert.equal(p.name,"Doji");
  assert.equal(p.direction,"NEUTRAL");
  assert.equal(p.confirmed,false);
});

test("hammer is detected in a declining context",()=>{
  const xs=[
    candle(105,106,103,104),
    candle(104,105,101,102),
    candle(102,103,99,100),
    candle(100,101,96,97),
    candle(97.8,98.2,92,97.5)
  ];
  const p=detectCandlestickPattern(xs);
  assert.equal(p.name,"Hammer");
  assert.equal(p.direction,"BULLISH");
  assert.equal(p.confirmed,true);
});

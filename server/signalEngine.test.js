import test from "node:test";
import assert from "node:assert/strict";
import { calculateSignal } from "./signalEngine.js";

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
  assert.equal(calculateSignal(candles().slice(0,20)),null);
});

test("valid candle history returns a structured signal",()=>{
  const s=calculateSignal(candles(),{capital:2000,riskPct:1,minScore:65});
  assert.ok(s);
  assert.ok(["BUY_SETUP","SELL_SETUP","NO_TRADE"].includes(s.signal));
  assert.equal(typeof s.score,"number");
  assert.equal(typeof s.price,"number");
});

test("risk sizing never exceeds affordable quantity",()=>{
  const s=calculateSignal(candles(),{capital:2000,riskPct:1,minScore:0});
  if(s?.quantity!=null) assert.ok(s.quantity<=Math.floor(2000/s.price));
});

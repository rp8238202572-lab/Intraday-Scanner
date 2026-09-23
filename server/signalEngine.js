export function ema(values,n){
  if(values.length<n)return null;
  const k=2/(n+1);
  let e=values.slice(0,n).reduce((a,b)=>a+b,0)/n;
  for(let i=n;i<values.length;i++) e=values[i]*k+e*(1-k);
  return e;
}
export function rsi(values,n=14){
  if(values.length<=n)return 50;
  let g=0,l=0;
  for(let i=1;i<=n;i++){const d=values[i]-values[i-1];g+=Math.max(d,0);l+=Math.max(-d,0);}
  let ag=g/n,al=l/n;
  for(let i=n+1;i<values.length;i++){const d=values[i]-values[i-1];ag=(ag*(n-1)+Math.max(d,0))/n;al=(al*(n-1)+Math.max(-d,0))/n;}
  return al===0?100:100-(100/(1+ag/al));
}
export function atr(candles,n=14){
  if(candles.length<=n)return 0;
  const tr=[];
  for(let i=1;i<candles.length;i++){
    const x=candles[i],p=candles[i-1].close;
    tr.push(Math.max(x.high-x.low,Math.abs(x.high-p),Math.abs(x.low-p)));
  }
  return tr.slice(-n).reduce((a,b)=>a+b,0)/n;
}
export function vwap(candles){
  let pv=0,v=0;
  for(const x of candles){const vol=Number(x.volume)||0;pv+=((x.high+x.low+x.close)/3)*vol;v+=vol;}
  return v?pv/v:candles.at(-1)?.close;
}

export function calculateSignal(candles,{capital=2000,riskPct=1,minScore=65}={}){
  if(!Array.isArray(candles))return null;

  // Never calculate a signal from an unfinished 5-minute candle.
  // The current candle is still useful as the live entry reference,
  // but indicators/volume confirmation must come from completed candles.
  const completed=candles.filter(x=>x?.complete!==false);
  const current=candles.at(-1)?.complete===false?candles.at(-1):null;
  if(completed.length<50)return null;

  const closes=completed.map(x=>Number(x.close));
  const e9=ema(closes,9),e21=ema(closes,21),rv=rsi(closes),a=atr(completed),vw=vwap(completed);
  const price=Number(current?.close)>0?Number(current.close):closes.at(-1);
  if(![e9,e21,rv,a,vw,price].every(Number.isFinite)||a<=0)return null;

  const prev=closes.at(-1);
  const prior=closes.slice(-21,-1);
  const high20=Math.max(...prior),low20=Math.min(...prior);
  const avgVol=completed.slice(-21,-1).reduce((s,x)=>s+(Number(x.volume)||0),0)/20;
  const latestCompletedVolume=Number(completed.at(-1)?.volume)||0;
  const volumeReady=avgVol>0&&latestCompletedVolume>0;
  const volRatio=volumeReady?latestCompletedVolume/avgVol:0;
  const previousE9=ema(closes.slice(0,-1),9);
  const slope=Number.isFinite(previousE9)?e9-previousE9:0;

  let long=0,short=0;
  if(price>e21)long+=20;if(e9>e21)long+=20;if(price>vw)long+=20;if(rv>=55&&rv<=72)long+=15;if(volRatio>=1.2)long+=10;if(price>high20)long+=10;if(slope>0&&price>prev)long+=5;
  if(price<e21)short+=20;if(e9<e21)short+=20;if(price<vw)short+=20;if(rv<=45&&rv>=28)short+=15;if(volRatio>=1.2)short+=10;if(price<low20)short+=10;if(slope<0&&price<prev)short+=5;

  const side=long>=short?"LONG":"SHORT",score=Math.max(long,short);\n  const checks=side==="LONG"?{trend:price>e21&&e9>e21,vwap:price>vw,momentum:rv>=55&&rv<=72,volume:volRatio>=1.2,breakout:price>high20}:{trend:price<e21&&e9<e21,vwap:price<vw,momentum:rv<=45&&rv>=28,volume:volRatio>=1.2,breakout:price<low20};\n  const reasons=[];\n  if(checks.trend) reasons.push("Trend");\n  if(checks.vwap) reasons.push("VWAP");\n  if(checks.momentum) reasons.push("RSI");\n  if(checks.volume) reasons.push("Volume");\n  if(checks.breakout) reasons.push("Breakout");
  if(!volumeReady)return {
    signal:"NO_TRADE",score:0,price,side,
    reason:"Volume data is not ready for the latest completed 5-minute candle."
  };
  if(score<minScore)return {signal:"NO_TRADE",score,price,side,checks,reasons,reason:"Setup score is below the selected minimum."};

  const stopDist=Math.max(a*1.1,price*.004),riskMoney=capital*riskPct/100;
  const qty=Math.max(0,Math.min(Math.floor(riskMoney/stopDist),Math.floor(capital/price)));
  if(qty<1)return {signal:"NO_TRADE",score,price,side,reason:"quantity=0"};

  return {
    signal:side==="LONG"?"BUY_SETUP":"SELL_SETUP",side,score,price,
    stop:side==="LONG"?price-stopDist:price+stopDist,
    target:side==="LONG"?price+stopDist*1.8:price-stopDist*1.8,
    quantity:qty,rsi:rv,vwap:vw,atr:a,volumeRatio:volRatio,
    signalCandleStart:Number(completed.at(-1)?.start||completed.at(-1)?.timestamp||0)
  };
}

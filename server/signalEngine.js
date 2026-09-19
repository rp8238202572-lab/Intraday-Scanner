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
  if(!Array.isArray(candles)||candles.length<50)return null;
  const closes=candles.map(x=>Number(x.close));
  const e9=ema(closes,9),e21=ema(closes,21),rv=rsi(closes),a=atr(candles),vw=vwap(candles);
  const price=closes.at(-1);
  if(![e9,e21,rv,a,vw,price].every(Number.isFinite)||a<=0)return null;
  const prev=closes.at(-2), prior=closes.slice(-21,-1);
  const high20=Math.max(...prior),low20=Math.min(...prior);
  const avgVol=candles.slice(-21,-1).reduce((s,x)=>s+(Number(x.volume)||0),0)/20;
  const volRatio=avgVol?(Number(candles.at(-1).volume)||0)/avgVol:0;
  const slope=e9-ema(closes.slice(0,-1),9);
  let long=0,short=0;
  if(price>e21)long+=20;if(e9>e21)long+=20;if(price>vw)long+=20;if(rv>=55&&rv<=72)long+=15;if(volRatio>=1.2)long+=10;if(price>high20)long+=10;if(slope>0&&price>prev)long+=5;
  if(price<e21)short+=20;if(e9<e21)short+=20;if(price<vw)short+=20;if(rv<=45&&rv>=28)short+=15;if(volRatio>=1.2)short+=10;if(price<low20)short+=10;if(slope<0&&price<prev)short+=5;
  const side=long>=short?"LONG":"SHORT",score=Math.max(long,short);
  if(score<minScore)return {signal:"NO_TRADE",score,price,side};
  const stopDist=Math.max(a*1.1,price*.004),riskMoney=capital*riskPct/100;
  const qty=Math.max(0,Math.min(Math.floor(riskMoney/stopDist),Math.floor(capital/price)));
  if(qty<1)return {signal:"NO_TRADE",score,price,side,reason:"quantity=0"};
  return {
    signal:side==="LONG"?"BUY_SETUP":"SELL_SETUP",side,score,price,
    stop:side==="LONG"?price-stopDist:price+stopDist,
    target:side==="LONG"?price+stopDist*1.8:price-stopDist*1.8,
    quantity:qty,rsi:rv,vwap:vw,atr:a,volumeRatio:volRatio
  };
}

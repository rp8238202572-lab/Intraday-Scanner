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
  for(let i=1;i<candles.length;i++){const x=candles[i],p=candles[i-1].close;tr.push(Math.max(x.high-x.low,Math.abs(x.high-p),Math.abs(x.low-p)));}
  return tr.slice(-n).reduce((a,b)=>a+b,0)/n;
}
export function vwap(candles){
  let pv=0,v=0;
  for(const x of candles){const vol=Number(x.volume)||0;pv+=((x.high+x.low+x.close)/3)*vol;v+=vol;}
  return v?pv/v:candles.at(-1)?.close;
}
function diag(reasonCode,reason,extra={}){return {reasonCode,reason,...extra};}

function candleShape(c){
  const o=Number(c?.open),h=Number(c?.high),l=Number(c?.low),cl=Number(c?.close);
  if(![o,h,l,cl].every(Number.isFinite)||h<l)return null;
  const range=Math.max(h-l,0),body=Math.abs(cl-o),upper=h-Math.max(o,cl),lower=Math.min(o,cl)-l;
  return {o,h,l,cl,range,body,upper,lower,bull:cl>o,bear:cl<o};
}

function bullishEngulfing(a,b){
  return a?.bear&&b?.bull&&b.o<=a.cl&&b.cl>=a.o&&b.body>a.body;
}
function bearishEngulfing(a,b){
  return a?.bull&&b?.bear&&b.o>=a.cl&&b.cl<=a.o&&b.body>a.body;
}

export function detectCandlestickPattern(candles){
  if(!Array.isArray(candles)||candles.length<5)return {name:"None",direction:"NEUTRAL",confirmed:false};
  const n=candles.length, c1=candleShape(candles[n-1]), c2=candleShape(candles[n-2]), c3=candleShape(candles[n-3]);
  if(!c1||!c2||!c3)return {name:"None",direction:"NEUTRAL",confirmed:false};

  const recentCloses=candles.slice(Math.max(0,n-7),n-1).map(x=>Number(x.close)).filter(Number.isFinite);
  const downContext=recentCloses.length>=4&&recentCloses.at(-1)<recentCloses[0];
  const upContext=recentCloses.length>=4&&recentCloses.at(-1)>recentCloses[0];

  const doji=c1.range>0&&c1.body<=c1.range*0.10;
  if(doji)return {name:"Doji",direction:"NEUTRAL",confirmed:false,kind:"indecision"};

  const spinning=c1.range>0&&c1.body<=c1.range*0.30&&c1.upper>=c1.body&&c1.lower>=c1.body;
  if(spinning)return {name:"Spinning Top",direction:"NEUTRAL",confirmed:false,kind:"indecision"};

  const hammer=c1.range>0&&c1.lower>=Math.max(c1.body*2,Number.EPSILON)&&c1.upper<=Math.max(c1.body*0.75,Number.EPSILON)&&c1.body/c1.range<=0.45;
  if(hammer&&downContext)return {name:"Hammer",direction:"BULLISH",confirmed:true,kind:"reversal"};

  const inverted=c1.range>0&&c1.upper>=Math.max(c1.body*2,Number.EPSILON)&&c1.lower<=Math.max(c1.body*0.75,Number.EPSILON)&&c1.body/c1.range<=0.45;
  if(inverted&&downContext)return {name:"Inverted Hammer",direction:"BULLISH",confirmed:true,kind:"reversal"};

  const shootingStar=inverted&&upContext;
  if(shootingStar)return {name:"Shooting Star",direction:"BEARISH",confirmed:true,kind:"reversal"};

  const hangingMan=hammer&&upContext;
  if(hangingMan)return {name:"Hanging Man",direction:"BEARISH",confirmed:true,kind:"reversal"};

  if(bullishEngulfing(c2,c1))return {name:"Bullish Engulfing",direction:"BULLISH",confirmed:true,kind:"reversal"};
  if(bearishEngulfing(c2,c1))return {name:"Bearish Engulfing",direction:"BEARISH",confirmed:true,kind:"reversal"};

  const piercing=c2.bear&&c1.bull&&c1.o<c2.cl&&c1.cl>(c2.o+c2.cl)/2&&c1.cl<c2.o;
  if(piercing)return {name:"Piercing Line",direction:"BULLISH",confirmed:true,kind:"reversal"};

  const darkCloud=c2.bull&&c1.bear&&c1.o>c2.cl&&c1.cl<(c2.o+c2.cl)/2&&c1.cl>c2.o;
  if(darkCloud)return {name:"Dark Cloud Cover",direction:"BEARISH",confirmed:true,kind:"reversal"};

  const morningStar=c3.bear&&c3.body>c3.range*0.45&&c2.body<=c3.body*0.5&&c1.bull&&c1.cl>(c3.o+c3.cl)/2;
  if(morningStar)return {name:"Morning Star",direction:"BULLISH",confirmed:true,kind:"reversal"};

  const eveningStar=c3.bull&&c3.body>c3.range*0.45&&c2.body<=c3.body*0.5&&c1.bear&&c1.cl<(c3.o+c3.cl)/2;
  if(eveningStar)return {name:"Evening Star",direction:"BEARISH",confirmed:true,kind:"reversal"};

  const last3=candles.slice(-3).map(candleShape);
  const threeWhite=last3.every(x=>x?.bull)&&last3[0].cl<last3[1].cl&&last3[1].cl<last3[2].cl&&last3.every(x=>x.body>=x.range*0.45);
  if(threeWhite)return {name:"Three White Soldiers",direction:"BULLISH",confirmed:true,kind:"continuation"};

  const threeBlack=last3.every(x=>x?.bear)&&last3[0].cl>last3[1].cl&&last3[1].cl>last3[2].cl&&last3.every(x=>x.body>=x.range*0.45);
  if(threeBlack)return {name:"Three Black Crows",direction:"BEARISH",confirmed:true,kind:"continuation"};

  return {name:"None",direction:"NEUTRAL",confirmed:false};
}

export function calculateSignal(candles,{capital=2000,riskPct=1,minScore=65}={}){
  if(!Array.isArray(candles))return {signal:"NO_TRADE",score:0,side:null,diagnostics:diag("INVALID_CANDLES","Candle data is unavailable or invalid.")};
  const completed=candles.filter(x=>x?.complete!==false);
  const current=candles.at(-1)?.complete===false?candles.at(-1):null;
  if(completed.length<50)return {signal:"NO_TRADE",score:0,side:null,diagnostics:diag("INSUFFICIENT_CANDLES","Need 50 completed candles; only "+completed.length+" are ready.",{completedCandles:completed.length,requiredCandles:50})};
  const closes=completed.map(x=>Number(x.close));
  const e9=ema(closes,9),e21=ema(closes,21),rv=rsi(closes),a=atr(completed),vw=vwap(completed);
  const price=Number(current?.close)>0?Number(current.close):closes.at(-1);
  if(![e9,e21,rv,a,vw,price].every(Number.isFinite)||a<=0)return {signal:"NO_TRADE",score:0,side:null,diagnostics:diag("INDICATOR_DATA","One or more indicators are not ready/valid.",{price,e9,e21,rsi:rv,atr:a,vwap:vw})};

  const prev=closes.at(-1),prior=closes.slice(-21,-1),high20=Math.max(...prior),low20=Math.min(...prior);
  const avgVol=completed.slice(-21,-1).reduce((s,x)=>s+(Number(x.volume)||0),0)/20;
  const latestCompletedVolume=Number(completed.at(-1)?.volume)||0;
  const volumeReady=avgVol>0&&latestCompletedVolume>0,volRatio=volumeReady?latestCompletedVolume/avgVol:0;
  const previousE9=ema(closes.slice(0,-1),9),slope=Number.isFinite(previousE9)?e9-previousE9:0;

  let long=0,short=0;
  if(price>e21)long+=20;if(e9>e21)long+=20;if(price>vw)long+=20;if(rv>=55&&rv<=72)long+=15;if(volRatio>=1.2)long+=15;if(price>high20)long+=10;if(slope>0&&price>prev)long+=5;
  if(price<e21)short+=20;if(e9<e21)short+=20;if(price<vw)short+=20;if(rv<=45&&rv>=28)short+=15;if(volRatio>=1.2)short+=15;if(price<low20)short+=10;if(slope<0&&price<prev)short+=5;

  const side=long>=short?"LONG":"SHORT",scoreBase=Math.max(long,short);
  const pattern=detectCandlestickPattern(completed);
  const candleConfirmation=side==="LONG"?pattern.direction==="BULLISH"&&pattern.confirmed:pattern.direction==="BEARISH"&&pattern.confirmed;
  const patternScore=candleConfirmation?15:0;
  const score=Math.min(100,scoreBase+patternScore);

  const checks=side==="LONG"
    ?{trend:price>e21&&e9>e21,vwap:price>vw,momentum:rv>=55&&rv<=72,volume:volRatio>=1.2,breakout:price>high20,candlestick:candleConfirmation}
    :{trend:price<e21&&e9<e21,vwap:price<vw,momentum:rv<=45&&rv>=28,volume:volRatio>=1.2,breakout:price<low20,candlestick:candleConfirmation};

  const reasons=[];
  if(checks.trend)reasons.push("Trend");
  if(checks.vwap)reasons.push("VWAP");
  if(checks.momentum)reasons.push("RSI");
  if(checks.volume)reasons.push("Volume");
  if(checks.breakout)reasons.push("Breakout");
  if(candleConfirmation)reasons.push(pattern.name);

  const diagnosticsBase={
    completedCandles:completed.length,price,e9,e21,rsi:rv,atr:a,vwap:vw,volumeRatio:volRatio,avgVolume:avgVol,
    latestCompletedVolume,high20,low20,slope,longScore:long,shortScore:short,checks,reasons,
    candlestickPattern:pattern.name,candlestickDirection:pattern.direction,candleConfirmation
  };

  if(!volumeReady)return {signal:"NO_TRADE",score,price,side,checks,reasons,candlestickPattern:pattern.name,diagnostics:diag("VOLUME_NOT_READY","Volume data is not ready for the latest completed 5-minute candle.",diagnosticsBase)};
  if(score<minScore)return {signal:"NO_TRADE",score,price,side,checks,reasons,candlestickPattern:pattern.name,diagnostics:diag("SCORE_BELOW_MIN","Best score "+score+" is below the selected minimum "+minScore+".",diagnosticsBase)};

  const coreConfirmations=[checks.trend,checks.vwap,checks.momentum,checks.volume].filter(Boolean).length;
  const directionalCandle=side==="LONG"?price>=prev:price<=prev;
  const qualityGate=coreConfirmations>=4&&directionalCandle&&(checks.candlestick||checks.breakout);
  diagnosticsBase.coreConfirmations=coreConfirmations;
  diagnosticsBase.directionalCandle=directionalCandle;
  diagnosticsBase.qualityGate=qualityGate;

  if(!qualityGate)return {signal:"NO_TRADE",score,price,side,checks,reasons,candlestickPattern:pattern.name,diagnostics:diag("QUALITY_GATE","Core confirmations passed, but a breakout or matching candlestick confirmation is not aligned.",diagnosticsBase)};

  const stopDist=Math.max(a*1.1,price*.004),riskMoney=capital*riskPct/100;
  const qty=Math.max(0,Math.min(Math.floor(riskMoney/stopDist),Math.floor(capital/price)));
  if(qty<1)return {signal:"NO_TRADE",score,price,side,checks,reasons,candlestickPattern:pattern.name,diagnostics:diag("QUANTITY_ZERO","Capital/risk settings produce quantity 0.",{...diagnosticsBase,stopDistance:stopDist,riskMoney})};

  return {
    signal:side==="LONG"?"BUY_SETUP":"SELL_SETUP",side,score,price,
    stop:side==="LONG"?price-stopDist:price+stopDist,
    target:side==="LONG"?price+stopDist*1.8:price-stopDist*1.8,
    quantity:qty,rsi:rv,vwap:vw,atr:a,volumeRatio:volRatio,checks,reasons,
    candlestickPattern:pattern.name,candlestickDirection:pattern.direction,
    signalCandleStart:Number(completed.at(-1)?.start||completed.at(-1)?.timestamp||0),
    diagnostics:diag("VALID","All configured signal requirements passed.",diagnosticsBase)
  };
}

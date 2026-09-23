const WATCH=["RELIANCE","HDFCBANK","ICICIBANK","SBIN","INFY","TCS","BHARTIARTL","LT","AXISBANK","KOTAKBANK","ITC","MARUTI","M&M","SUNPHARMA","TATAMOTORS","TATASTEEL","ADANIENT","NTPC","POWERGRID","BEL","HINDUNILVR","BAJFINANCE","HCLTECH","WIPRO","TECHM","ULTRACEMCO","ASIANPAINT","TITAN","COALINDIA","ONGC"];
let refreshTimer=null,lastScanAt=0,instrumentsCache=null;

function round2(x){return Math.round(Number(x)*100)/100}
function money(x){return "₹"+round2(x).toLocaleString("en-IN")}
function nowIST(){return new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"}))}
function dateKey(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function marketInfo(){
 const d=nowIST(),day=d.getDay(),m=d.getHours()*60+d.getMinutes();
 const holiday=false;
 const open=!holiday&&day>=1&&day<=5&&m>=555&&m<930;
 return {d,open,holiday};
}
function marketStatus(){
 const x=marketInfo(),d=x.d,b=document.getElementById("marketBadge");
 b.textContent=x.open?"MARKET OPEN":"MARKET CLOSED";b.className="pill "+(x.open?"open":"closed");
 document.getElementById("marketTime").textContent=d.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})+" IST • NSE regular session 9:15–15:30";
}
function setStatus(t){document.getElementById("status").textContent=t}
async function loadInstruments(){
 if(instrumentsCache)return instrumentsCache;
 const r=await fetch("/api/instruments/upstox",{cache:"no-store"});
 if(!r.ok)throw Error("Instrument list unavailable");
 const body=await r.json();
 if(!body.ok)throw Error(body.error||"Instrument list unavailable");
 instrumentsCache=body.instruments||{};
 return instrumentsCache;
}
async function getSignal(symbol,capital,risk,minScore,instruments){
 const key=instruments[symbol];
 if(!key)throw Error("Instrument not found");
 const url="/api/signal/"+encodeURIComponent(key)+"?capital="+encodeURIComponent(capital)+"&risk="+encodeURIComponent(risk)+"&minScore="+encodeURIComponent(minScore);
 const r=await fetch(url,{cache:"no-store"});
 if(!r.ok)throw Error("Signal HTTP "+r.status);
 const body=await r.json();
 if(!body.ok)throw Error(body.error||"Signal unavailable");
 if(!body.signal)return {symbol,candleCount:body.candleCount,signal:null};
 return {symbol,candleCount:body.candleCount,signal:body.signal};
}
async function scan(){
 const btn=document.getElementById("scan"),out=document.getElementById("results"),mi=marketInfo();
 const capital=Number(document.getElementById("capital").value),risk=Number(document.getElementById("risk").value),minScore=Number(document.getElementById("minScore").value),maxTrades=Number(document.getElementById("maxTrades").value);
 if(!Number.isFinite(capital)||capital<500||!Number.isFinite(risk)||risk<=0||risk>5){setStatus("Enter valid capital and risk (0.25%–5%).");return}
 btn.disabled=true;out.innerHTML="";let done=0,errors=0;
 try{
   const instruments=await loadInstruments();
   setStatus("Loading live/historical broker signals for "+WATCH.length+" stocks…");
   const results=await Promise.all(WATCH.map(async s=>{try{return await getSignal(s,capital,risk,minScore,instruments)}catch(e){errors++;return {symbol:s,error:e.message,candleCount:0,signal:null,unavailable:true}}finally{done++;setStatus("Scanning… "+done+"/"+WATCH.length)}}));
   const ready=results.filter(x=>x&&Number(x.candleCount)>=50);
   const noSignal=ready.filter(x=>!x.signal);
   const signalReady=ready.filter(x=>x.signal);
   const quantityReady=signalReady.filter(x=>Number(x.signal.quantity)>0);
   const belowScore=quantityReady.filter(x=>Number(x.signal.score)<minScore);
   const candidates=quantityReady.filter(x=>Number(x.signal.score)>=minScore);
   const found=candidates.sort((a,b)=>Number(b.signal.score)-Number(a.signal.score)).slice(0,maxTrades);
   const unavailableDetails=results.filter(x=>x&&x.unavailable).map(x=>x.symbol+" ("+x.error+")").join(", ") || "None";
   const diagnostics='<div class="card"><div class="row"><span>Market scan diagnostics</span><b class="blue">'+WATCH.length+' stocks</b></div>'+
     '<div class="row"><span>History ready (50+ candles)</span><b class="green">'+ready.length+'</b></div>'+
     '<div class="row"><span>Signal calculated</span><b>'+signalReady.length+'</b></div>'+
     '<div class="row"><span>No setup from rules</span><b>'+noSignal.length+'</b></div>'+
     '<div class="row"><span>Score below '+minScore+'</span><b class="yellow">'+belowScore.length+'</b></div>'+
     '<div class="row"><span>Valid signals</span><b class="green">'+candidates.length+'</b></div>'+
     '<div class="row"><span>Unavailable / request error</span><b class="red">'+errors+'</b></div>'+
     '<div class="tiny">Unavailable stocks: '+unavailableDetails+'</div>'+
     '<div class="tiny" style="margin-top:8px">A stock is shown only when history is ready, a signal is calculated, quantity is above zero, and its score meets the selected minimum.</div></div>';
   if(!found.length){
     out.innerHTML=diagnostics+'<div class="card"><div class="stocktop"><b>NO TRADE</b><span class="badge wait">WAIT</span></div><div class="reason">'+(mi.open?"No stock currently passes the configured score/risk rules. Do not force a trade.":"Market is closed. Historical broker candles are loaded, but live entries should be evaluated during the regular session.")+'</div><div class="tiny" style="margin-top:7px">Unavailable: '+errors+' • Valid signals: '+candidates.length+' • Minimum candles: 50</div></div>';
   }else{
     out.innerHTML=diagnostics+'<div class="card"><div class="market"><b>'+found.length+' setup(s) found</b><span class="pill open">BROKER DATA</span></div><div class="tiny" style="margin-top:5px">Signals are calculated by the backend from Upstox 5-minute candles.</div></div>'+found.map(x=>card(x,capital,risk)).join("");
   }
   lastScanAt=Date.now();
   setStatus("Scan complete • "+found.length+" setup(s) shown • "+errors+" unavailable");
 }catch(e){
   out.innerHTML='<div class="card"><div class="stocktop"><b>SCANNER ERROR</b><span class="badge avoid">CHECK DATA</span></div><div class="reason">'+e.message+'</div></div>';
   setStatus("Scanner stopped safely");
 }finally{btn.disabled=false}
}
function card(x,capital,risk){
 const s=x.signal,side=s.side||"";
 const cls=side==="LONG"?"buy":"avoid";
 const riskAmt=Math.abs(Number(s.price)-Number(s.stop))*Number(s.quantity),reward=Math.abs(Number(s.target)-Number(s.price))*Number(s.quantity);
 return '<div class="stock"><div class="stocktop"><div><div class="sym">'+x.symbol+'</div><div class="tiny">'+money(s.price)+' • '+x.candleCount+' candles</div></div><div class="badge '+cls+'">'+s.signal+' • '+s.score+'/100</div></div>'+
 '<div class="meta"><div><small>ENTRY</small><b>'+money(s.price)+'</b></div><div><small>STOP</small><b>'+money(s.stop)+'</b></div><div><small>TARGET</small><b>'+money(s.target)+'</b></div><div><small>QTY</small><b>'+s.quantity+'</b></div><div><small>RISK</small><b>'+money(riskAmt)+'</b></div><div><small>R:R</small><b>1 : 1.8</b></div><div><small>RSI</small><b>'+round2(s.rsi)+'</b></div><div><small>VOL / AVG</small><b>'+Number(s.volumeRatio).toFixed(1)+'×</b></div><div><small>VWAP</small><b>'+money(s.vwap)+'</b></div></div>'+
 '<div class="confidence"><i style="width:'+Math.min(100,Number(s.score))+'%"></i></div><div class="reason">'+(s.side==="LONG"?"Bullish":"Bearish")+' setup • score '+s.score+' • ATR '+round2(s.atr)+'</div><div class="tiny" style="margin-top:7px">Capital '+money(capital)+' • planned risk '+risk+'% • estimated reward '+money(reward)+' • trading execution is disabled</div></div>';
}
async function loadRuntimeStatus(){
 try{
  const r=await fetch("/api/status",{cache:"no-store"});
  if(!r.ok)throw Error("status "+r.status);
  const s=await r.json();
  const configured=[];
  if(s.brokers?.upstox)configured.push("Upstox");
  if(s.brokers?.angelOne)configured.push("Angel One");
  if(s.brokers?.groww)configured.push("Groww API");
  const states=Object.values(s.streams||{}).filter(Boolean);
  const live=states.some(x=>x==="connected"||x==="subscribed"||x==="ready_for_subscription");
  const last=Object.values(s.lastTickAt||{}).filter(Boolean).sort().at(-1);
  const brokerEl=document.getElementById("brokerStatus");
  const tickEl=document.getElementById("tickStatus");
  const candleEl=document.getElementById("candleStatus");
  const lastEl=document.getElementById("lastDataStatus");
  if(brokerEl){brokerEl.textContent=configured.length?(live?configured.join(" + ")+" • LIVE":configured.join(" + ")+" • CONFIGURED"):"NO BROKER";brokerEl.className=live?"green":(configured.length?"yellow":"red");}
  if(tickEl)tickEl.textContent=(Number(s.tickCounts?.upstox||0)+Number(s.tickCounts?.angelOne||0)).toLocaleString("en-IN");
  if(candleEl)candleEl.textContent=String(s.readyCandles||0)+" / "+String(s.instrumentCount||0);
  if(lastEl)lastEl.textContent=last?new Date(last).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"})+" IST":"Waiting for ticks";
 }catch(e){
  const el=document.getElementById("brokerStatus");
  if(el){el.textContent="STATUS UNAVAILABLE";el.className="red";}
 }
}
function updateAutoRefresh(){
 clearInterval(refreshTimer);refreshTimer=null;
 if(document.getElementById("autoRefresh")?.checked)refreshTimer=setInterval(()=>{
   if(marketInfo().open)scan();
   else setStatus("Auto refresh paused because NSE market is closed.");
 },300000);
}
document.getElementById("autoRefresh")?.addEventListener("change",updateAutoRefresh);
marketStatus();setInterval(marketStatus,30000);loadRuntimeStatus();setInterval(loadRuntimeStatus,15000);

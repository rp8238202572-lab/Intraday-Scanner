const WATCH=["RELIANCE","HDFCBANK","ICICIBANK","SBIN","INFY","TCS","BHARTIARTL","LT","AXISBANK","KOTAKBANK","ITC","MARUTI","M&M","SUNPHARMA","TATAMOTORS","TATASTEEL","ADANIENT","NTPC","POWERGRID","BEL","HINDUNILVR","BAJFINANCE","HCLTECH","WIPRO","TECHM","ULTRACEMCO","ASIANPAINT","TITAN","COALINDIA","ONGC"];
let refreshTimer=null,liveSetupTimer=null,lastScanAt=0,instrumentsCache=null,activeSetups=[],scanBusy=false;

function round2(x){return Math.round(Number(x)*100)/100}
function money(x){return "₹"+round2(x).toLocaleString("en-IN")}
function nowIST(){return new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"}))}
function dateKey(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
const NSE_HOLIDAYS_2026={
 "2026-01-15":"Municipal Corporation Election in Maharashtra",
 "2026-01-26":"Republic Day",
 "2026-02-19":"Chhatrapati Shivaji Maharaj Jayanti",
 "2026-03-03":"Holi",
 "2026-03-19":"Gudhi Padwa",
 "2026-03-26":"Ram Navami",
 "2026-03-31":"Mahavir Jayanti",
 "2026-04-01":"Annual Bank Closing",
 "2026-04-03":"Good Friday",
 "2026-04-14":"Dr. Babasaheb Ambedkar Jayanti",
 "2026-05-01":"Maharashtra Din / Buddha Pournima",
 "2026-05-28":"Bakri Id",
 "2026-06-26":"Muharram",
 "2026-08-26":"Id-E-Milad",
 "2026-09-14":"Ganesh Chaturthi",
 "2026-10-02":"Mahatma Gandhi Jayanti",
 "2026-10-20":"Dussehra",
 "2026-11-10":"Diwali (Bali Pratipada)",
 "2026-11-24":"Guru Nanak Jayanti",
 "2026-12-25":"Christmas"
};
function marketInfo(){
 const d=nowIST(),day=d.getDay(),m=d.getHours()*60+d.getMinutes(),key=dateKey(d);
 const holiday=Boolean(NSE_HOLIDAYS_2026[key]);
 const open=!holiday&&day>=1&&day<=5&&m>=555&&m<930;
 return {d,open,holiday,holidayName:NSE_HOLIDAYS_2026[key]||""};
}
function marketStatus(){
 const x=marketInfo(),d=x.d,b=document.getElementById("marketBadge");
 b.textContent=x.open?"MARKET OPEN":"MARKET CLOSED";b.className="pill "+(x.open?"open":"closed");
 document.getElementById("marketTime").textContent=d.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})+" IST • NSE regular session 9:15–15:30"+(x.holiday?" • Holiday: "+x.holidayName:"");
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
 if(scanBusy)return;
 scanBusy=true;
 const btn=document.getElementById("scan"),out=document.getElementById("results"),mi=marketInfo();
 const capital=Number(document.getElementById("capital").value),risk=Number(document.getElementById("risk").value),minScore=Number(document.getElementById("minScore").value),maxTrades=Number(document.getElementById("maxTrades").value);
 if(!Number.isFinite(capital)||capital<500||!Number.isFinite(risk)||risk<=0||risk>5){setStatus("Enter valid capital and risk (0.25%–5%).");return}
 btn.disabled=true;out.innerHTML="";
 try{
   const instruments=await loadInstruments();setStatus("Loading live/historical broker signals for "+WATCH.length+" stocks…");
   let done=0,errors=0;
   const results=await Promise.all(WATCH.map(async s=>{try{return await getSignal(s,capital,risk,minScore,instruments)}catch(e){errors++;return {symbol:s,error:e.message,candleCount:0,signal:null,unavailable:true}}finally{done++;setStatus("Scanning… "+done+"/"+WATCH.length)}}));
   const ready=results.filter(x=>x&&!x.unavailable&&Number(x.candleCount)>=50);
   const signalCalculated=results.filter(x=>x&&!x.unavailable&&x.signal);
   const noSetup=signalCalculated.filter(x=>x.signal.signal==="NO_TRADE"&&x.signal.diagnostics?.reasonCode==="NO_SETUP");
   const belowScore=signalCalculated.filter(x=>x.signal.diagnostics?.reasonCode==="SCORE_BELOW_MIN");
   const volumeNotReady=signalCalculated.filter(x=>x.signal.diagnostics?.reasonCode==="VOLUME_NOT_READY");
   const qtyZero=signalCalculated.filter(x=>x.signal.diagnostics?.reasonCode==="QUANTITY_ZERO");
   const candidates=signalCalculated.filter(x=>x.signal.signal!=="NO_TRADE"&&Number(x.signal.quantity)>0&&Number(x.signal.score)>=minScore);
   const found=candidates.sort((a,b)=>Number(b.signal.score)-Number(a.signal.score)).slice(0,maxTrades);
   const reasonMap={};
   for(const x of signalCalculated){const d=x.signal.diagnostics;if(d?.reasonCode&&d.reasonCode!=="VALID")reasonMap[d.reasonCode]=(reasonMap[d.reasonCode]||0)+1;}
   for(const x of results.filter(x=>x?.unavailable))reasonMap.REQUEST_ERROR=(reasonMap.REQUEST_ERROR||0)+1;
   const labels={SCORE_BELOW_MIN:"Score below minimum",VOLUME_NOT_READY:"Volume data not ready",QUANTITY_ZERO:"Quantity = 0",QUALITY_GATE:"Core confirmation gate",INSUFFICIENT_CANDLES:"Insufficient candles",INDICATOR_DATA:"Indicator data invalid",INVALID_CANDLES:"Invalid candle data",NO_SETUP:"No setup conditions met",REQUEST_ERROR:"Request / data error"};
   const topReasons=Object.entries(reasonMap).sort((a,b)=>b[1]-a[1]).map(([k,v])=>'<span class="diagreason"><b>'+v+'×</b> '+(labels[k]||k)+'</span>').join('')||'<span class="diagreason"><b>0×</b> No rejection reasons</span>';
   const unavailableDetails=results.filter(x=>x&&x.unavailable).map(x=>x.symbol+" ("+x.error+")").join(", ")||"None";
   const diagnostics='<div class="card"><div class="row"><span>Market scan diagnostics</span><b class="blue">'+WATCH.length+' stocks</b></div><div class="row"><span>History ready (50+ candles)</span><b class="green">'+ready.length+'</b></div><div class="row"><span>Signal calculated</span><b>'+signalCalculated.length+'</b></div><div class="row"><span>No setup from rules</span><b>'+noSetup.length+'</b></div><div class="row"><span>Score below '+minScore+'</span><b class="yellow">'+belowScore.length+'</b></div><div class="row"><span>Volume not ready</span><b class="yellow">'+volumeNotReady.length+'</b></div><div class="row"><span>Quantity = 0</span><b class="yellow">'+qtyZero.length+'</b></div><div class="row"><span>Valid signals</span><b class="green">'+candidates.length+'</b></div><div class="row"><span>Unavailable / request error</span><b class="red">'+errors+'</b></div><div class="tiny" style="margin-top:8px"><b>Top rejection reasons</b></div><div class="diagreasons">'+topReasons+'</div><div class="tiny" style="margin-top:8px">Unavailable stocks: '+unavailableDetails+'</div><div class="tiny" style="margin-top:8px">Each stock now returns its exact rejection reason plus price, EMA, RSI, VWAP, volume ratio, score and checklist values. Trading execution is disabled.</div></div>';
   activeSetups=found.map(x=>({symbol:x.symbol,candleCount:x.candleCount,signal:x.signal}));
   if(!found.length){
     const detail=signalCalculated.map(x=>{const d=x.signal?.diagnostics;return d?.reason?x.symbol+": "+d.reason:null}).filter(Boolean).slice(0,6).join(" • ");
     out.innerHTML=diagnostics+'<div class="card"><div class="stocktop"><b>NO TRADE</b><span class="badge wait">WAIT</span></div><div class="reason">'+(mi.open?"No stock currently passes the configured score/risk rules. Do not force a trade.":"Market is closed. Historical broker candles are loaded, but live entries should be evaluated during the regular session.")+'</div><div class="tiny" style="margin-top:7px">Unavailable: '+errors+' • Valid signals: '+candidates.length+' • Minimum candles: 50</div>'+(detail?'<div class="tiny" style="margin-top:7px"><b>Examples:</b> '+detail+'</div>':'')+'</div>';
   }else{
     out.innerHTML=diagnostics+renderSetupSection(found,capital,risk);
   }
   lastScanAt=Date.now();setStatus("Scan complete • "+found.length+" setup(s) shown • "+errors+" unavailable");
 }catch(e){out.innerHTML='<div class="card"><div class="stocktop"><b>SCANNER ERROR</b><span class="badge avoid">CHECK DATA</span></div><div class="reason">'+e.message+'</div></div>';setStatus("Scanner stopped safely");}finally{btn.disabled=false}
}
function renderSetupSection(found,capital,risk){
 return '<div id="liveSetups"><div class="card"><div class="market"><b>'+found.length+' setup(s) found</b><span class="pill open">LIVE DATA</span></div><div class="tiny" style="margin-top:5px">Live setup values refresh every 15 seconds while the NSE market is open.</div></div>'+found.map(x=>card(x,capital,risk)).join('')+'</div>';
}
async function refreshLiveSetups(){
 if(scanBusy||!activeSetups.length||!marketInfo().open)return;
 try{
   const capital=Number(document.getElementById("capital").value),risk=Number(document.getElementById("risk").value),minScore=Number(document.getElementById("minScore").value);
   const instruments=await loadInstruments();
   const refreshed=await Promise.all(activeSetups.map(async x=>{
     try{
       const r=await getSignal(x.symbol,capital,risk,minScore,instruments);
       const s=r.signal;
       const valid=s&&s.signal!=="NO_TRADE"&&Number(s.quantity)>0&&Number(s.score)>=minScore;
       return valid?{symbol:x.symbol,candleCount:r.candleCount,signal:s}:null;
     }catch{return null}
   }));
   const valid=refreshed.filter(Boolean);
   if(valid.length!==activeSetups.length){
     activeSetups=valid;
     setStatus("A setup changed or became invalid • rescanning market…");
     await scan();
     return;
   }
   activeSetups=valid;
   const holder=document.getElementById("liveSetups");
   if(holder){
     holder.outerHTML=renderSetupSection(valid,capital,risk);
     setStatus("Live setup values updated • "+new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"})+" IST");
   }
 }catch(e){
   setStatus("Live refresh waiting for broker data…");
 }
}
function updateLiveSetupTimer(){
 clearInterval(liveSetupTimer);liveSetupTimer=null;
 if(marketInfo().open&&activeSetups.length)liveSetupTimer=setInterval(refreshLiveSetups,15000);
}
function card(x,capital,risk){
 const s=x.signal,side=s.side||"";
 const cls=side==="LONG"?"buy":"avoid";
 const riskAmt=Math.abs(Number(s.price)-Number(s.stop))*Number(s.quantity),reward=Math.abs(Number(s.target)-Number(s.price))*Number(s.quantity),rr=riskAmt>0?reward/riskAmt:0;
 return '<div class="stock"><div class="stocktop"><div><div class="sym">'+x.symbol+'</div><div class="tiny">'+money(s.price)+' • '+x.candleCount+' candles</div></div><div class="badge '+cls+'">'+s.signal+' • '+s.score+'/100</div></div>'+
 '<div class="tradeplan"><div><small>ENTRY</small><b>'+money(s.price)+'</b></div><div><small>STOP LOSS</small><b>'+money(s.stop)+'</b></div><div><small>TARGET</small><b>'+money(s.target)+'</b></div></div><div class="meta"><div><small>QTY</small><b>'+s.quantity+'</b></div><div><small>RISK</small><b>'+money(riskAmt)+'</b></div><div><small>R:R</small><b>1 : '+round2(rr)+'</b></div><div><small>RSI</small><b>'+round2(s.rsi)+'</b></div><div><small>VOL / AVG</small><b>'+Number(s.volumeRatio).toFixed(1)+'×</b></div><div><small>VWAP</small><b>'+money(s.vwap)+'</b></div></div>'+
 '<div class="confidence"><i style="width:'+Math.min(100,Number(s.score))+'%"></i></div><div class="why"><b>💡 Why this setup?</b><span>'+((s.reasons||[]).join(' • ')||'Rules aligned')+'</span></div><div class="reason">'+(s.side==="LONG"?"Bullish":"Bearish")+' setup • score '+s.score+' • ATR '+round2(s.atr)+'</div><div class="checks">'+['trend','vwap','momentum','volume','breakout'].map(k=>'<span class="'+(s.checks?.[k]?'check-on':'check-off')+'">'+(s.checks?.[k]?'✓ ':'• ')+k.toUpperCase()+'</span>').join('')+'</div><div class="tiny" style="margin-top:7px">Confirmed: '+((s.reasons||[]).join(', ')||'none')+' • Capital '+money(capital)+' • planned risk '+risk+'% • estimated reward '+money(reward)+' • trading execution is disabled</div></div>';
}
async function loadGrowwStatus(){
 try{
  const r=await fetch("/api/groww/status",{cache:"no-store"});
  const s=await r.json();
  const el=document.getElementById("growwStatus");
  if(!el)return;
  el.textContent=s.configured?"CONFIGURED":"NOT CONNECTED";
  el.className=s.configured?"green":"yellow";
 }catch(e){
  const el=document.getElementById("growwStatus");
  if(el){el.textContent="CHECK FAILED";el.className="red";}
 }
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
marketStatus();setInterval(()=>{marketStatus();updateLiveSetupTimer()},30000);loadRuntimeStatus();loadGrowwStatus();setInterval(loadRuntimeStatus,15000);setInterval(loadGrowwStatus,30000);

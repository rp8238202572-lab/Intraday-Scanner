function bucketStart(tsMs, intervalMs=300000){
  return Math.floor(tsMs/intervalMs)*intervalMs;
}

export class CandleBuilder {
  constructor(intervalMs=300000, maxCandles=500){
    this.intervalMs=intervalMs;
    this.maxCandles=maxCandles;
    this.buckets=new Map();
    this.history=[];
    this.lastTimestamp=0;
    this.lastCumulativeVolume=new Map();
  }

  seed(candles=[]){
    const incoming=new Map();
    for(const x of candles){
      if(!x || !Number.isFinite(Number(x.timestamp))) continue;
      const c={
        instrumentKey:x.instrumentKey,
        start:Number(x.timestamp),
        open:Number(x.open), high:Number(x.high),
        low:Number(x.low), close:Number(x.close),
        volume:Number(x.volume)||0, complete:true
      };
      if([c.open,c.high,c.low,c.close].every(Number.isFinite)) incoming.set(c.start,c);
    }
    const merged=new Map(this.history.map(c=>[c.start,c]));
    for(const c of incoming.values()) merged.set(c.start,c);
    this.history=[...merged.values()].sort((a,b)=>a.start-b.start).slice(-this.maxCandles);
  }

  update(tick){
    const price=Number(tick?.ltp);
    const ts=Number(tick?.timestamp ?? Date.now());
    if(!Number.isFinite(price)||price<=0||!Number.isFinite(ts)) return null;
    if(ts < this.lastTimestamp) return null;
    this.lastTimestamp=ts;

    const key=tick.instrumentKey ?? tick.symbol ?? tick.token;
    if(!key) return null;

    const start=bucketStart(ts,this.intervalMs);
    const mapKey=String(key);
    let c=this.buckets.get(mapKey);

    if(!c || c.start!==start){
      const completed=c ? {...c, complete:true, timestamp:c.start} : null;
      if(completed) this._addCompleted(completed);
      c={instrumentKey:key,start,open:price,high:price,low:price,close:price,
         volume:0};
      const initialCumulative=Number(tick.volume);
      if(Number.isFinite(initialCumulative) && initialCumulative>=0){
        const previous=this.lastCumulativeVolume.get(mapKey);
        const delta=Number.isFinite(previous) && initialCumulative>=previous ? initialCumulative-previous : 0;
        this.lastCumulativeVolume.set(mapKey,initialCumulative);
        c.volume=Math.max(0,delta);
      }else{
        c.volume=Number(tick.volumeDelta ?? 0)||0;
      }
      this.buckets.set(mapKey,c);
      return completed;
    }

    c.high=Math.max(c.high,price);
    c.low=Math.min(c.low,price);
    c.close=price;

    // Upstox full-feed volume is cumulative for the trading day.
    // Convert it to a per-tick delta so the live 5m candle volume
    // remains comparable with historical candle volume.
    const cumulative=Number(tick.volume);
    if(Number.isFinite(cumulative) && cumulative>=0){
      const previous=this.lastCumulativeVolume.get(mapKey);
      const delta=Number.isFinite(previous) && cumulative>=previous
        ? cumulative-previous
        : cumulative;
      this.lastCumulativeVolume.set(mapKey,cumulative);
      c.volume+=Math.max(0,delta);
    }else if(Number.isFinite(Number(tick.volumeDelta))){
      c.volume+=Math.max(0,Number(tick.volumeDelta));
    }
    return null;
  }

  _addCompleted(c){
    this.history.push(c);
    this.history=this.history.slice(-this.maxCandles);
  }

  getCandles(){
    return [...this.history].sort((a,b)=>a.start-b.start);
  }

  snapshot(){
    return [...this.history, ...[...this.buckets.values()].map(c=>({...c,complete:false,timestamp:c.start}))].sort((a,b)=>a.start-b.start);
  }
}

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
  }

  seed(candles=[]){
    for(const x of candles){
      if(!x || !Number.isFinite(Number(x.timestamp))) continue;
      const c={
        instrumentKey:x.instrumentKey,
        start:Number(x.timestamp),
        open:Number(x.open), high:Number(x.high),
        low:Number(x.low), close:Number(x.close),
        volume:Number(x.volume)||0, complete:true
      };
      if([c.open,c.high,c.low,c.close].every(Number.isFinite)) this.history.push(c);
    }
    this.history.sort((a,b)=>a.start-b.start);
    this.history=this.history.slice(-this.maxCandles);
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
         volume:Number(tick.volumeDelta ?? 0)||0};
      this.buckets.set(mapKey,c);
      return completed;
    }

    c.high=Math.max(c.high,price);
    c.low=Math.min(c.low,price);
    c.close=price;
    if(Number.isFinite(Number(tick.volumeDelta))) c.volume+=Number(tick.volumeDelta);
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

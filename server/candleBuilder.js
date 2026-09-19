function bucketStart(tsMs, intervalMs=300000){
  return Math.floor(tsMs/intervalMs)*intervalMs;
}

export class CandleBuilder {
  constructor(intervalMs=300000){
    this.intervalMs=intervalMs;
    this.buckets=new Map();
  }

  update(tick){
    const price=Number(tick?.ltp);
    const ts=Number(tick?.timestamp ?? Date.now());
    if(!Number.isFinite(price)||price<=0||!Number.isFinite(ts)) return null;

    const key=tick.instrumentKey ?? tick.symbol ?? tick.token;
    if(!key) return null;

    const start=bucketStart(ts,this.intervalMs);
    const mapKey=String(key);
    let c=this.buckets.get(mapKey);

    if(!c || c.start!==start){
      const completed=c ? {...c, complete:true, timestamp:c.start+this.intervalMs} : null;
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

  snapshot(){
    return [...this.buckets.values()].map(c=>({...c,complete:false}));
  }
}

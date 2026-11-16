/** Bound network work across overlapping tab loads, sharing identical in-flight index requests. */
export class CompendiumIndexLoader {
  constructor(concurrency=4){this.concurrency=concurrency;this.active=0;this.queue=[];this.pending=new WeakMap();}
  index(pack,fields) {
    let requests=this.pending.get(pack);
    if(!requests){requests=new Map();this.pending.set(pack,requests);}
    const key=JSON.stringify([...fields].sort());
    if(requests.has(key))return requests.get(key);
    const work=new Promise((resolve,reject)=>{this.queue.push({run:()=>pack.getIndex({fields}),resolve,reject});this._drain();}).finally(()=>{
      if(requests.get(key)===work)requests.delete(key);
      if(!requests.size&&this.pending.get(pack)===requests)this.pending.delete(pack);
    });
    requests.set(key,work);return work;
  }
  _drain() {
    while(this.active<this.concurrency&&this.queue.length){
      const job=this.queue.shift();this.active++;
      Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(()=>{this.active--;this._drain();});
    }
  }
  load(packs,fields) {
    return Promise.all(Array.from(packs,async pack=>{
      try{return {pack,index:await this.index(pack,fields)};}catch(_error){return {pack,index:[]};}
    }));
  }
}
export const compendiumIndexLoader=new CompendiumIndexLoader();

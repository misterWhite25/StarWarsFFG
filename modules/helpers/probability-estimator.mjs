import {setbackAfterRemovals} from './setback-removal.mjs';

export const SIMULATION_ITERATIONS=10000;
export const simulationVisible=(setting,isGM)=>setting==='All'||setting==='GM'&&isGM;
const number=value=>Number.isFinite(Number(value))?Number(value):0;

export function probabilityOptions(pool) {
  return {dicePool:{abilityDice:number(pool.ability),difficultyDice:number(pool.difficulty),proficiencyDice:number(pool.proficiency),challengeDice:number(pool.challenge),boostDice:number(pool.boost),setbackDice:setbackAfterRemovals(pool)},
    iterations:SIMULATION_ITERATIONS,runSimulate:false,
    modifiers:{automaticSuccesses:number(pool.success),automaticFailures:number(pool.failure),automaticAdvantages:number(pool.advantage),automaticThreats:number(pool.threat),automaticTriumphs:number(pool.triumph),automaticDespairs:number(pool.despair)}};
}

async function computeProbability(options) {
  const {MonteCarlo}=await import('../../lib/@swrpg-online/monte-carlo/dist/index.esm.js');
  return new MonteCarlo(options).simulate().successProbability;
}

/** One lazily started worker and a bounded cache shared by all local roll windows. */
export class ProbabilityEstimator {
  constructor({compute=computeProbability,createWorker=()=>typeof Worker==='undefined'?null:new Worker(new URL('../dice/probability-worker.mjs',import.meta.url),{type:'module',name:'starwarsffg-probability'}),maxEntries=64}={}) {
    this.compute=compute;this.createWorker=createWorker;this.maxEntries=maxEntries;
    this.cache=new Map();this.pending=new Map();this.nextId=0;this.worker=null;this.workerUnavailable=false;
  }
  estimate(options) {
    const key=JSON.stringify(options),cached=this.cache.get(key);
    if(cached){this.cache.delete(key);this.cache.set(key,cached);return cached;}
    const work=this._calculate(options).then(value=>{
      if(!Number.isFinite(value)||value<0||value>1)throw Error('Invalid probability estimate');
      return value;
    }).catch(error=>{if(this.cache.get(key)===work)this.cache.delete(key);throw error;});
    this.cache.set(key,work);
    while(this.cache.size>this.maxEntries)this.cache.delete(this.cache.keys().next().value);
    return work;
  }
  _worker() {
    if(this.workerUnavailable)return null;
    if(this.worker)return this.worker;
    try {
      const worker=this.createWorker();
      if(!worker){this.workerUnavailable=true;return null;}
      worker.addEventListener('message',event=>{
        const job=this.pending.get(event.data.id);if(!job)return;
        this.pending.delete(event.data.id);
        if(event.data.error)job.reject(Error(event.data.error));else job.resolve(event.data.probability);
      });
      worker.addEventListener('error',event=>{event.preventDefault?.();this._disableWorker(Error(event.message||'Probability worker unavailable'));});
      this.worker=worker;return worker;
    }catch(_error){this.workerUnavailable=true;return null;}
  }
  _disableWorker(error) {
    this.workerUnavailable=true;this.worker?.terminate();this.worker=null;
    for(const job of this.pending.values())job.reject(error);
    this.pending.clear();
  }
  async _calculate(options) {
    const worker=this._worker();
    if(worker){
      try{return await new Promise((resolve,reject)=>{
        const id=++this.nextId;this.pending.set(id,{resolve,reject});
        try{worker.postMessage({id,options});}catch(error){this._disableWorker(error);}
      });}catch(_error){return this.compute(options);}
    }
    return this.compute(options);
  }
}

export const probabilityEstimator=new ProbabilityEstimator();

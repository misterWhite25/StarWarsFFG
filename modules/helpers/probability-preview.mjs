import {probabilityEstimator} from './probability-estimator.mjs';

/** Debounce optional estimates and discard results after edits, hiding or closing. */
export class ProbabilityPreview {
  constructor({estimate=options=>probabilityEstimator.estimate(options),delay=75,schedule=(callback,ms)=>setTimeout(callback,ms),cancel=id=>clearTimeout(id)}={}) {
    this.estimate=estimate;this.delay=delay;this.schedule=schedule;this.cancelTimer=cancel;
    this.version=0;this.timer=null;this.key=null;this.target=null;
  }
  cancel() {
    this.version++;if(this.timer!==null)this.cancelTimer(this.timer);
    this.timer=null;this.key=null;this.target=null;
  }
  update(options,{target,show,isCurrent=()=>true,format=value=>String(value)}={}) {
    if(!show||!target){this.cancel();return;}
    const key=JSON.stringify(options);
    if(this.key===key&&this.target===target)return;
    this.cancel();this.key=key;this.target=target;
    const version=this.version;
    target.textContent='…';target.classList.remove('likely','unlikely');
    this.timer=this.schedule(async()=>{
      this.timer=null;
      try {
        const value=await this.estimate(options);
        if(version!==this.version||!isCurrent())return;
        target.textContent=format(value);
        target.classList.toggle('unlikely',value<.25);target.classList.toggle('likely',value>.75);
      }catch(_error){
        if(version===this.version&&isCurrent()){this.key=null;target.textContent='-';}
      }
    },this.delay);
  }
}

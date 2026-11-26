import {groundRangeValues} from './ground-range-values.mjs';
// Range bands are rules; all metric thresholds are explicitly table conventions.
export const modes={none:"SWFFG.UI.Ground.ModeNone",narrative:"SWFFG.UI.Ground.ModeNarrative",battlemap:"SWFFG.UI.Ground.ModeBattlemap"};
export const bands=["SWFFG.UI.Ground.BandEngaged","SWFFG.UI.Ground.BandShort","SWFFG.UI.Ground.BandMedium","SWFFG.UI.Ground.BandLong","SWFFG.UI.Ground.BandExtreme"];
export function calibration(scene){
 const raw=scene?.getFlag?.('starwarsffg','groundMovement')??{};
 const step=Number(scene?.grid?.distance)||1,positive=(value,fallback)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;
 const movement=positive(raw.movement,step*3);
 const defaults=groundRangeValues(),factor=['ft','foot','feet','pied','pieds',"'",'′'].includes(String(scene?.grid?.units??'m').trim().toLowerCase().replace(/\.$/,''))?0.3048:1;
 return {movement,...Object.fromEntries(['short','medium','long','extreme'].map(key=>[key,defaults[key]/factor]))};
}
export function validateCalibration(config){
 if(!Number.isFinite(Number(config.movement))||Number(config.movement)<=0)throw Error(game.i18n.localize("SWFFG.UI.Ground.PositiveDistancesRequired"));
 return config;
}
export function bandForDistance(distance,config){
 if(!Number.isFinite(distance)||distance<0)return null;
 for(const [index,key] of ['short','medium','long','extreme'].entries())if(distance<=config[key]+1e-7)return index+1;
 return 5;
}
export function movementQuote(state,config){
 const total=Math.ceil(Math.max(0,state.distance-1e-7)/config.movement);
 return {total,additional:Math.max(0,total-state.movePaid)};
}
export function spend(state,count,payment){
 if(!Number.isInteger(count)||count<1||state.used+count>2)throw Error(game.i18n.localize("SWFFG.UI.Ground.TwoManeuverLimitGM"));
 const needsSecond=state.used+count===2&&state.used<2;
 if(needsSecond&&!['action','strain'].includes(payment))throw Error(game.i18n.localize("SWFFG.UI.Ground.ChooseSecondPayment"));
 return {...state,used:state.used+count,actionUsed:state.actionUsed||needsSecond&&payment==='action',strainCost:needsSecond&&payment==='strain'?2:0};
}
export function narrativeStep(relation,direction){
 if(!Number.isInteger(relation?.band)||relation.band<0||relation.band>4)throw Error(game.i18n.localize("SWFFG.UI.Ground.RangeMustBeSet"));
 if(![-1,1].includes(direction))throw Error(game.i18n.localize("SWFFG.UI.Ground.InvalidDirection"));
 if(relation.progress){
  if(relation.direction!==direction)return {band:relation.band,progress:0};
  return {band:relation.band+direction,progress:0};
 }
 const next=relation.band+direction;
 if(next<0||next>4)throw Error(game.i18n.localize("SWFFG.UI.Ground.RangeLimitReached"));
 const total=Math.max(next,relation.band)>=3?2:1;
 return total===2?{band:relation.band,progress:1,direction,to:next}:{band:next,progress:0};
}
export function cleanState(raw,context){
 const same=raw?.context===context;
 return {context,revision:Number(raw?.revision)||0,used:same?Number(raw.used)||0:0,movePaid:same?Number(raw.movePaid)||0:0,distance:same?Number(raw.distance)||0:0,paidDistance:same?Number(raw.paidDistance)||0:0,actionUsed:same&&!!raw.actionUsed,tracking:!!raw?.tracking,prone:!!raw?.prone,receipts:same?(raw.receipts??[]).slice(-60):[]};
}

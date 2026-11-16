const feet=new Set(['ft','foot','feet','pied','pieds',"'",'′']);
const metres=new Set(['m','meter','meters','metre','metres','mètre','mètres']);
const unitOf=scene=>String(typeof scene==='string'?scene:scene?.grid?.units??scene?.units??'m').trim();
const normalized=scene=>unitOf(scene).toLowerCase().replace(/\.$/,'');
export const metricFactor=scene=>feet.has(normalized(scene))?0.3048:1;
export const metricUnit=scene=>feet.has(normalized(scene))||metres.has(normalized(scene))?'m':unitOf(scene);
export const toMetric=(value,scene)=>Number(value)*metricFactor(scene);
export const fromMetric=(value,scene)=>Number(value)/metricFactor(scene);
export function metricValue(value,scene,{signed=false}={}){
 const converted=toMetric(value,scene);
 if(!Number.isFinite(converted))return converted===Infinity?'∞':converted===-Infinity?'-∞':'-';
 const label=converted.toLocaleString(globalThis.game?.i18n?.lang,{maximumFractionDigits:2});return signed&&converted>0?'+'+label:label;
}
export const metricDistance=(value,scene)=>metricValue(value,scene)+' '+metricUnit(scene);
export const hasDualUnits=scene=>feet.has(normalized(scene))||metres.has(normalized(scene));
const displayNumber=(value,{signed=false}={})=>{
 if(!Number.isFinite(value))return value===Infinity?'∞':value===-Infinity?'-∞':'-';
 return (signed&&value>0?'+':'')+value.toLocaleString(globalThis.game?.i18n?.lang,{maximumFractionDigits:2});
};
export const feetDistance=(value,scene,options)=>displayNumber(toMetric(value,scene)/0.3048,options)+' ft';
export function dualDistance(value,scene,options={}){
 if(!hasDualUnits(scene))return metricDistance(value,scene);
 const metric=metricValue(value,scene,options)+' m',imperial=feetDistance(value,scene,options);
 return metricFactor(scene)!==1?imperial+' ('+metric+')':metric+' ('+imperial+')';
}


/** Convert only the label context; native measurements and movement costs keep their scene units. */
export function metricRulerContext(context,waypoint,scene,{previousElevation,elevationBase=0}={}){
 if(!context||!hasDualUnits(scene))return context;
 context.units='';
 if(context.distance){
  context.distance.total=dualDistance(waypoint.measurement.distance,scene);
  if(context.distance.delta!==undefined)context.distance.delta=dualDistance(waypoint.measurement.backward.distance,scene,{signed:true});
 }
 if(context.cost){
  context.cost.total=dualDistance(waypoint.measurement.cost,scene);context.cost.units='';
  if(context.cost.delta!==undefined)context.cost.delta=dualDistance(waypoint.cost,scene,{signed:true});
 }
 if(context.elevation){
  const elevation=waypoint.elevation-elevationBase;context.elevation.total=dualDistance(elevation,scene,{signed:true});
  const prior=Number.isFinite(previousElevation)?previousElevation:waypoint.previous?.elevation-elevationBase;
  if(context.elevation.delta!==undefined&&Number.isFinite(prior))context.elevation.delta=dualDistance(elevation-prior,scene,{signed:true});
 }
 return context;
}

export function useMetricSceneDefaults(){
 const grid=game.system.grid;
 if(metricFactor(grid)!==1){grid.distance=toMetric(grid.distance,grid);grid.units='m';}
 else if(metricUnit(grid)==='m')grid.units='m';
}
Hooks.once('init',()=>{
 useMetricSceneDefaults();
 const Base=CONFIG.Canvas.rulerClass;
 CONFIG.Canvas.rulerClass=class SteelersMetricRuler extends Base{
  _getWaypointLabelContext(waypoint,state){
   const previousElevation=state.previousElevation;
   return metricRulerContext(super._getWaypointLabelContext(waypoint,state),waypoint,canvas.scene,{previousElevation});
  }
 };
});

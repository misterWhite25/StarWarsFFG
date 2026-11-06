// Reviewed by Antoine, 1 November 2026. Effects are derived, never persisted.
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
export const reviewedPassives=[
 {id:'physical-training',names:['physicaltraining','entrainementphysique'],paths:['system.skills.Athletics.boost','system.skills.Resilience.boost']},
 {id:'stalker',names:['stalker','filature'],paths:['system.skills.Coordination.boost','system.skills.Stealth.boost']},
 {id:'grit',names:['grit','robustesse'],paths:['system.stats.strain.max']},
 {id:'toughened',names:['toughened','endurci'],paths:['system.stats.wounds.max']}
];
export function reviewedPassiveSources(item){
 if(item.system?.active===false)return [];
 const nodes=item.type==='talent'?[{...item.system,name:item.name,rank:item.system?.ranks?.ranked?item.system.ranks.current:1}]:item.type==='specialization'?Object.values(item.system?.talents??{}).filter(t=>t.islearned===true).map(t=>({...t,rank:t.isRanked?Number(t.rank??1):1})):[];
 return reviewedPassives.flatMap(rule=>{const owned=nodes.filter(t=>rule.names.includes(norm(t.name))),rank=owned.reduce((n,t)=>n+Math.max(0,Number(t.rank)||0),0);return rank?[{rule,rank,nodes:owned}]:[];});
}
export function reviewedPassiveEffects(actor,EffectClass){
 return Array.from(actor.items??[]).flatMap(item=>reviewedPassiveSources(item).map(({rule,rank})=>new EffectClass({name:'Reviewed: '+rule.id,type:'base',transfer:true,disabled:false,flags:{starwarsffg:{reviewedPassive:rule.id}},system:{changes:rule.paths.map(key=>({key,value:rank,type:'add',phase:'initial',priority:20}))}},{parent:item})));
}
export function withoutReviewedChanges(effect){
 const item=effect.parent;if(!item||effect.flags?.starwarsffg?.reviewedPassive)return null;
 const sources=reviewedPassiveSources(item);if(!sources.length)return null;
 const attrs=[...(item.flags?.starwarsffg?.reviewedPassiveLegacyAttributes??[]),...sources.flatMap(s=>s.nodes.flatMap(n=>Object.keys(n.attributes??{})))];
 // Only replace effects belonging to the reviewed talent's attributes.
 const owned=item.type==='talent'||attrs.some(k=>effect.name===k||effect.name?.endsWith('.'+k));
 if(!owned)return null;
 const paths=new Set(sources.flatMap(s=>s.rule.paths));
 const changes=effect.system?.changes??[];return changes.some(c=>paths.has(c.key))?changes.filter(c=>!paths.has(c.key)):null;
}

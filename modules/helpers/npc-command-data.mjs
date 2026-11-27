import {localizeSystem} from "./system-localization.mjs";
const catalogueCache=new WeakMap();
export function invalidateNpcCatalogue(actor) {if(actor)catalogueCache.delete(actor);}
function cachedCatalogue(actor) {
  const cached=catalogueCache.get(actor);
  return cached?.items===actor.items&&cached?.talents===actor.talentList?cached:null;
}
if(typeof Hooks!=='undefined') {
  Hooks.on('updateActor',invalidateNpcCatalogue);
  Hooks.on('updateToken',token=>invalidateNpcCatalogue(token.actor));
  for(const hook of ['createItem','updateItem','deleteItem','createActiveEffect','updateActiveEffect','deleteActiveEffect'])Hooks.on(hook,document=>{
    const parent=document.parent;invalidateNpcCatalogue(parent?.documentName==='Actor'?parent:parent?.parent);
  });
}
export const normalizeNpc=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function npcCatalogue(actor) {
  const cached=cachedCatalogue(actor);if(cached)return cached.catalogue;
  const result=[],seen=new Set(),items=Array.from(actor.items??[]),itemIds=new Set(items.map(item=>item.id)),talentNames=new Set();
  const add=(key,name,type,system,source,itemId=null)=>{if(seen.has(key)||!name)return;seen.add(key);const ownedId=itemId&&itemIds.has(itemId)?itemId:null;result.push({key,name,type,system:system??{},source,itemId:ownedId});if(type==='talent')talentNames.add(normalizeNpc(name));};
  const nested=(system,parent,path,depth=0)=>{
    if(depth>8)return;
    for(const field of ['adjusteditemmodifier','itemmodifier','itemattachment'])for(const [index,node] of Object.entries(system?.[field]??{})){
      if(!node?.name)continue;const type=field==='itemattachment'?'attachment':'itemmodifier',key=path+':'+type+':'+normalizeNpc(node.name),data=node.system??node;
      add(key,node.name,type,data,parent);nested(data,node.name,key+':'+index,depth+1);
    }
  };
  for(const item of items) {
    add('item:'+item.id,item.name,item.type,item.system,localizeSystem("SWFFG.UI.Operations.NpcSheet"),item.id);
    nested(item.system,item.name,item.id);
    if(['specialization','forcepower','signatureability','species'].includes(item.type)){
      for(const field of ['talents','upgrades','abilities'])for(const [key,node] of Object.entries(item.system?.[field]??{})){
        if(!node?.name)continue;
        if(field!=='abilities'&&node.islearned!==true&&node.isLearned!==true)continue;
        add(item.id+':'+key,node.name,field==='upgrades'?'force-upgrade':field==='abilities'?'ability':'talent',node,item.name,node.itemId??null);
      }
    }
  }
  for(const [index,talent] of Object.entries(actor.talentList??{})){
    if(!talent?.name)continue;
    if(talent.itemId&&seen.has('item:'+talent.itemId))continue;
    if(talentNames.has(normalizeNpc(talent.name)))continue;
    add('derived:'+index,talent.name,'talent',talent,localizeSystem("SWFFG.UI.Operations.AcquiredTalents"),talent.itemId??null);
  }
  if(actor.documentName==='Actor')catalogueCache.set(actor,{items:actor.items,talents:actor.talentList,catalogue:result,ranks:new Map()});
  return result;
}
export function npcAbilityKind(entry) {
  const activation=entry.system.activation;
  const value=normalizeNpc((typeof activation==='object'?activation?.value:activation)??entry.system.activationLabel??'');
  if(value.includes('passive')||value.includes('passif'))return 'passive';
  if(value.includes('maneuver')||value.includes('manoeuvre'))return 'maneuver';
  if(value.includes('incidental')||value.includes('broutille')||value.includes('reaction'))return 'reaction';
  if(value.includes('action'))return 'action';
  return 'manual';
}
// Read acquired talents, without counting the derived talent list a second time.
export function npcAdversaryRank(actor,configuredName='Adversary') {
  const catalogue=npcCatalogue(actor),cached=cachedCatalogue(actor),key=normalizeNpc(configuredName);
  if(cached?.ranks.has(key))return cached.ranks.get(key);
  const names=new Set(['adversary','adversaire','adversite',normalizeNpc(configuredName)].filter(Boolean));
  const total=catalogue.reduce((total,entry)=>{
    if(entry.type!=='talent'||entry.system.active===false||!names.has(normalizeNpc(entry.name)))return total;
    const raw=entry.system.ranks?.current??entry.system.rank??1;
    const rank=Number(raw?.value??raw);
    return total+(Number.isFinite(rank)?Math.max(0,Math.floor(rank)):0);
  },0);
  cached?.ranks.set(key,total);return total;
}

// This only trims the GM's quick commands; the full skill and its ranks remain intact.
export function npcSkillVisible(actor,key,isNpc=['minion','rival','nemesis'].includes(actor?.type)){
  if(!isNpc||!['lightsaber','sabrelaser'].includes(normalizeNpc(key)))return true;
  if(Number(actor.system?.stats?.forcePool?.max)>0)return true;
  return Array.from(actor.items??[]).some(item=>{
    if(item.type==='forcepower')return true;
    if(item.type!=='weapon')return false;
    const quantity=item.system?.quantity;
    if(Number(quantity?.value??quantity??1)<=0)return false;
    const skill=item.system?.skill;
    return ['lightsaber','sabrelaser'].includes(normalizeNpc(skill?.value??skill));
  });
}

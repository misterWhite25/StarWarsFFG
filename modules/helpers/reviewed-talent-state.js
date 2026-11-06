// User-reviewed choices and equipment bonuses. Source statistics are never changed.
export const normalizeTalent = s => String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
export const choiceKinds = {wellRounded:['wellrounded','accompli'],smoothTalker:['smoothtalker','beauparleur'],knowledgeSpecialization:['knowledgespecialization','connaissancesspecialisees'],dedication:['dedication','entrainement']};
const juryNames=['juryrigged','bidouillage'];
export const normalizeJuryQuality=name=>normalizeTalent(String(name??'').replace(/\s+quality(?:\s+\d+)?$/i,''));
export const juryQualityNames=['autofire','automatique','tirautomatique','linked','lie','liee','blast','souffle','explosion','burn','brulure','incendiaire','concussive','choc','concussion','disorient','desorientation','ensnare','immobilisation','entrave','knockdown','renversement','sunder','destruction','fracassage','stun','etourdissement','guided','guide','guidage'];
function itemTalentSources(item, names) {
  if (!item || item.system?.active === false) return [];
  const nodes = item.type === 'talent' ? [['_self', {...item.system, name:item.name, islearned:true,
    isRanked:item.system?.ranks?.ranked, rank:item.system?.ranks?.current}]]
    : item.type === 'specialization' ? Object.entries(item.system?.talents ?? {}) : [];
  return nodes.filter(([, node]) => node.islearned === true && names.includes(normalizeTalent(node.name)))
    .map(([slot, node]) => ({item, slot, node, rank:node.isRanked ? Math.max(0, Number(node.rank ?? 1) || 0) : 1,
      choice:item.flags?.starwarsffg?.reviewedTalentChoices?.[slot]}));
}
export function ownedTalentSources(actor, names) {
  return Array.from(actor?.items?.contents ?? actor?.items ?? []).flatMap(item => itemTalentSources(item, names));
}
export function talentChoiceKind(name) {
  const key = normalizeTalent(name);
  return Object.keys(choiceKinds).find(kind => choiceKinds[kind].includes(key));
}
export function validateTalentChoice(actor,kind,skills,retainedSkills=[]){
  const wanted=kind==='wellRounded'?2:['smoothTalker','knowledgeSpecialization'].includes(kind)?1:0;
  if(!wanted||skills.length!==wanted||new Set(skills).size!==wanted)throw Error('Choix de compétences invalide.');
  for(const skill of skills){if(!actor.system?.skills?.[skill])throw Error('Compétence inconnue.');
    if(kind==='wellRounded'&&actor.system.skills[skill].careerskill&&!retainedSkills.includes(skill))throw Error('Choisissez des compétences qui ne sont pas déjà de carrière.');
    if(kind==='knowledgeSpecialization'&&!/knowledge|connaissance/i.test(actor.system.skills[skill].type??'')&&!/^(Knowledge|knowledge)/.test(skill))throw Error('Choisissez une compétence de Connaissance.');
    if(kind==='smoothTalker'&&!['Charm','Coercion','Negotiation','Deception'].includes(skill))throw Error('Cette compétence ne peut pas être liée à Beau Parleur.');}
  return {kind,skills:[...skills]};
}
export function applyReviewedActorData(actor){
  actor._reviewedTalentPaths=[];
  actor._reviewedTalentPending=[];
  if(actor.type==='vehicle'){
   const pilots=(actor.flags?.starwarsffg?.crew??[]).filter(c=>c.role==='Pilot');
   const ranks=pilots.map(c=>ownedTalentSources(game.actors?.get(c.actor_id),['defensivedriving','conduitestrategique']).reduce((n,s)=>n+s.rank,0));
   const rank=Math.max(0,...ranks);
   for(const zone of ['fore','aft','port','starboard'])if(rank&&actor.system.stats?.shields?.[zone]!==undefined){
    actor.system.stats.shields[zone]=(Number(actor.system.stats.shields[zone])||0)+rank;
    actor._reviewedTalentPaths.push('system.stats.shields.'+zone);
   }
  }
  // Derived only: preserve existing career origins and source statistics.
  if(ownedTalentSources(actor,['insight','intuition']).length)for(const [key,skill]of Object.entries(actor.system.skills??{}))if(['perception','discipline'].includes(normalizeTalent(skill.value??key))){skill.careerskill=true;actor._reviewedTalentPaths.push(`system.skills.${key}.careerskill`);}
  const armour=Array.from(actor.items??[]).filter(i=>i.type==='armour'&&i.system?.equippable?.equipped&&Number(i.system.quantity?.value??1)>0&&i.flags?.starwarsffg?.inventoryLocation!=='possession');
  for(const [names,fields,wanted]of [
   [['armormaster','maitredesarmures'],['soak.value'],armour.length?1:0],
   [['armormasterimproved','maitredesarmuresameliore'],['defence.melee','defence.ranged'],armour.some(i=>Number(i.system.soak?.adjusted??i.system.soak?.value)>=2)?1:0]
  ]){
   const sources=ownedTalentSources(actor,names);if(!sources.length)continue;
   for(const path of fields){
    const represented=Array.from(actor.allApplicableEffects?.()??[]).filter(e=>e.active!==false&&!e.disabled&&sources.some(src=>src.item===e.parent||e.origin?.endsWith('.Item.'+src.item.id))).flatMap(e=>e._source?.system?.changes??e.system?.changes??e.changes??[]).filter(c=>c.key==='system.stats.'+path&&(c.type==='add'||c.mode===2)).reduce((n,c)=>n+(Number(c.value)||0),0);
    const legacy=sources.some(src=>Object.values(src.node.attributes??{}).some(a=>a.modtype==='Stat'&&normalizeTalent(a.mod)===normalizeTalent(path==='soak.value'?'Soak':path==='defence.melee'?'Defence-Melee':'Defence-Ranged')));
    // A manual base value may already contain this legacy bonus. Its origin cannot be inferred.
    if(legacy&&!represented&&!actor.flags?.starwarsffg?.automaticStats?.enabled){actor._reviewedTalentPending??=[];actor._reviewedTalentPending.push({talent:sources[0].node.name,path,reason:'Ancien modificateur sans effet identifié ; bonus éventuellement déjà inclus dans la valeur de base.'});continue;}
    const [group,field]=path.split('.');if(actor.system.stats?.[group]){actor.system.stats[group][field]=(Number(actor.system.stats[group][field])||0)+wanted-represented;actor._reviewedTalentPaths.push('system.stats.'+path);}
   }
  }
  function increaseCharacteristic(key) {
    const stat = actor.system.characteristics?.[key];
    if (!stat) return;
    stat.value = (Number(stat.value) || 0) + 1;
    actor._reviewedTalentPaths.push('system.characteristics.' + key + '.value');
    if (key !== 'Brawn') return;
    for (const [group, field] of [['soak', 'value'], ['encumbrance', 'max']]) {
      const derived = actor.system.stats?.[group];
      if (!derived) continue;
      derived[field] = (Number(derived[field]) || 0) + 1;
      actor._reviewedTalentPaths.push('system.stats.' + group + '.' + field);
    }
  }
  if (game.combat?.started) {
    for (const bonus of actor.getFlag?.('starwarsffg', 'stimBonuses') ?? []) {
      if (!bonus.expired && bonus.encounterId === game.combat.id) increaseCharacteristic(bonus.characteristic);
    }
  }
  for (const source of ownedTalentSources(actor, choiceKinds.dedication)) {
    for (const key of (source.choice?.skills ?? []).slice(0, source.rank)) {
      if (Number(actor.system.characteristics?.[key]?.value) < 6) increaseCharacteristic(key);
    }
  }
  for(const src of ownedTalentSources(actor,choiceKinds.wellRounded))for(const skill of src.choice?.skills??[])if(actor.system?.skills?.[skill]){actor.system.skills[skill].careerskill=true;actor._reviewedTalentPaths.push(`system.skills.${skill}.careerskill`);}
  for(const {item,assignment} of activeJuryAssignments(actor)){
    if(item.type!=='armour'||Number(item.system?.quantity?.value??1)<=0||item.flags?.starwarsffg?.inventoryLocation==='possession'||!item.system?.equippable?.equipped)continue;
    if(actor.type==='character'&&actor.flags?.starwarsffg?.automaticStats?.enabled)continue;
    const field=assignment.effect==='defence-melee'?'melee':assignment.effect==='defence-ranged'?'ranged':null;
    if(field&&actor.system?.stats?.defence){actor.system.stats.defence[field]=(Number(actor.system.stats.defence[field])||0)+1;actor._reviewedTalentPaths.push(`system.stats.defence.${field}`);}
  }
}
export function juryCapacity(actor){return ownedTalentSources(actor,juryNames).reduce((n,s)=>n+s.rank,0);}
export function activeJuryAssignments(actor){
  const capacity=juryCapacity(actor);
  if (!capacity) return [];
  return Array.from(actor?.items?.contents??actor?.items??[]).filter(i=>['weapon','armour'].includes(i.type)&&i.flags?.starwarsffg?.juryRigged).sort((a,b)=>String(a.flags.starwarsffg.juryRigged.createdAt??a.id).localeCompare(String(b.flags.starwarsffg.juryRigged.createdAt??b.id))).slice(0,capacity).map(item=>({item,assignment:item.flags.starwarsffg.juryRigged}));
}
export function juryEffectChoices(item){
  return item.type==='weapon'?['damage','critical','quality','encumbrance']:item.type==='armour'?['defence-melee','defence-ranged','encumbrance']:[];
}
export function validateJuryAssignment(actor,item,effect,quality=''){
  if(!actor?.isOwner||item.parent?.uuid!==actor.uuid)throw Error('Équipement non possédé par ce personnage.');
  if(!juryEffectChoices(item).includes(effect))throw Error('Amélioration inadmissible pour cet équipement.');
  const used=Array.from(actor.items).filter(i=>i.id!==item.id&&i.flags?.starwarsffg?.juryRigged).length;
  if(used>=juryCapacity(actor))throw Error('Tous les rangs de Bidouillage sont déjà utilisés.');
  if(effect==='critical'&&!(Number(item.system?.crit?.adjusted??item.system?.crit?.value)>0))throw Error('Cette arme ne peut pas infliger de critique.');
  if(effect==='quality'&&!juryQualityNames.includes(normalizeJuryQuality(quality)))throw Error('Seules les qualités actives avec un coût connu sont automatisées.');
  if(effect==='quality'&&!Object.values(item.system?.adjusteditemmodifier??item.system?.itemmodifier??[]).some(q=>normalizeJuryQuality(q.name)===normalizeJuryQuality(quality)))throw Error('Choisissez une qualité présente sur cette arme.');
  return {effect,quality:effect==='quality'?normalizeJuryQuality(quality):null,createdAt:item.flags?.starwarsffg?.juryRigged?.createdAt??new Date().toISOString()};
}
export function applyJuryItemData(item){
  const actor=item.parent;if(!actor?.items)return;
  delete item.system.reviewedJuryRigged;
  if (!item.flags?.starwarsffg?.juryRigged) return;
  const found=activeJuryAssignments(actor).find(a=>a.item.id===item.id);
  if(!found)return;
  const {assignment}=found,data=item.system;
  data.reviewedJuryRigged={...assignment};
  const field=assignment.effect==='damage'?'damage':assignment.effect==='critical'?'crit':assignment.effect==='encumbrance'?'encumbrance':null;
  if(field&&data[field]){const before=Number(data[field].adjusted??data[field].value)||0;data[field].adjusted=assignment.effect==='damage'?before+1:Math.min(before,Math.max(1,before-(field==='encumbrance'?2:1)));}
}

export function talentChoiceStatus(actor,itemId,slot=null){
 if (!itemId) return [];
 const items = actor?.items;
 const item = typeof items?.get === 'function' ? items.get(itemId) : Array.from(items?.contents ?? items ?? []).find(i => i.id === itemId);
 const sources = Object.entries(choiceKinds).flatMap(([kind, names]) => itemTalentSources(item, names)
   .filter(source => !slot || source.slot === slot).map(source => ({...source, kind})));
 return sources.map(src=>{
  const wanted=src.kind==='dedication'?src.rank:src.kind==='wellRounded'?2:1;
  const skills=src.kind==='dedication'?(src.choice?.skills??[]).filter(k=>actor.system.characteristics?.[k]):[...new Set(src.choice?.skills??[])].filter(k=>actor.system?.skills?.[k]);
  const names = skills.map(key => game.i18n.localize(src.kind === 'dedication'
    ? 'SWFFG.Characteristic' + key : actor.system.skills?.[key]?.label ?? ('SWFFG.SkillsName' + key.replace(/[^a-zA-Z0-9]/g, ''))));
  const missing=Math.max(0,wanted-skills.length);
  if(!skills.length)return {skills,missing,text:(src.kind==='dedication'?'Caractéristique choisie':'Compétence choisie')+' : aucune.'};
  return {skills,missing,text:(src.kind==='dedication'?'Caractéristiques choisies':'Compétence'+(wanted>1?'s choisies':' choisie'))+' : '+(names.join(', ')||'aucune')+'.'+(missing?' Choix incomplet : '+missing+(src.kind==='dedication'?' rang':' compétence')+(missing>1?'s':'')+' à choisir.':'')};
 });
}
export function talentChoiceDescription(actor,itemId,slot=null){
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return talentChoiceStatus(actor,itemId,slot).map(status=>'<p class="ffg-talent-choice-description"><em>'+(status.skills.length?escape(status.text):escape(status.text).replace('aucune','<strong class="ffg-talent-choice-empty">aucune</strong>'))+'</em></p>').join('');
}

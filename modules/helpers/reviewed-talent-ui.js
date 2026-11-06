import {choiceKinds,ownedTalentSources,talentChoiceKind,validateTalentChoice,juryCapacity,juryEffectChoices,validateJuryAssignment,activeJuryAssignments} from './reviewed-talent-state.js';
const busy=new Set();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ownerOf=item=>item.parent?.documentName==='Actor'?item.parent:null;
const label=(key,actor)=>{if(actor?.system?.characteristics?.[key])return game.i18n.localize('SWFFG.Characteristic'+key);const value=actor?.system?.skills?.[key]?.label;const fallback=game.i18n.localize('SWFFG.SkillsName'+String(key).replace(/[^a-zA-Z0-9]/g,''));return value?game.i18n.localize(value):fallback.startsWith('SWFFG.')?key:fallback;};
export async function chooseTalentSkills(actor,kind,current=null,onConfirm=null){
  const previous=kind==='smoothTalker'?ownedTalentSources(actor,choiceKinds.smoothTalker).find(s=>s.choice)?.choice:null;
  if(previous)return structuredClone(previous);
  const count=kind==='wellRounded'?2:1;
  const keys=Object.keys(actor.system.skills??{}).filter(k=>kind==='wellRounded'?(!actor.system.skills[k].careerskill||current?.skills?.includes(k)):kind==='knowledgeSpecialization'?/knowledge|connaissance/i.test(actor.system.skills[k].type??'')||/^(Knowledge|knowledge)/.test(k):['Charm','Coercion','Negotiation','Deception'].includes(k));
  if(keys.length<count)throw Error('Pas assez de compétences admissibles.');
  keys.sort((a,b)=>label(a,actor).localeCompare(label(b,actor),game.i18n.lang));
  const groups=new Map();
  for(const key of keys){const type=actor.system.skills[key].type??'General';if(!groups.has(type))groups.set(type,[]);groups.get(type).push(key);}
  const order=['General','Combat','Social','Knowledge'];
  const options=selected=>[...groups].sort(([a],[b])=>(order.includes(a)?order.indexOf(a):99)-(order.includes(b)?order.indexOf(b):99)||a.localeCompare(b)).map(([type,entries])=>{
    const key='SWFFG.Skills'+type,translated=game.i18n.localize(key),title=translated===key?type:translated;
    return `<optgroup label="${esc(title)}">`+entries.map(k=>`<option value="${esc(k)}" ${(current?.skills?.[selected]?k===current.skills[selected]:k===keys[selected])?'selected':''}>${esc(label(k,actor))}</option>`).join('')+'</optgroup>';
  }).join('');
  const skills=await foundry.applications.api.DialogV2.prompt({window:{title:kind==='wellRounded'?'Accompli - compétences de carrière':kind==='knowledgeSpecialization'?'Connaissances spécialisées - compétence liée':'Beau Parleur - compétence liée'},classes:['starwarsffg','themed'],rejectClose:false,
    content:`<p>Choisissez ${count} compétence(s) distincte(s).</p>`+Array.from({length:count},(_,i)=>`<label>Compétence ${i+1}<select name="skill${i}">${options(i)}</select></label>`).join(''),
    ok:{label:'Enregistrer',callback:async(_e,button,app)=>{
      try{
      const form=button?.form??app.element;
      const values=Array.from({length:count},(_,i)=>form.querySelector(`[name=skill${i}]`).value);
      const choice=validateTalentChoice(actor,kind,values,current?.skills??[]);
      if(onConfirm)await onConfirm(choice);
      return choice;
      }catch(error){
        ui.notifications.error(error.message);
        app.element.querySelectorAll('button[data-action]').forEach(button=>button.disabled=false);
        throw error;
      }
    }}});
  return skills?.kind?skills:skills?validateTalentChoice(actor,kind,skills,current?.skills??[]):null;
}
export async function configureTalentDrop(actor,data){
  if(data.type!=='talent')return data;
  const kind=talentChoiceKind(data.name);if(!kind||kind==='dedication')return data;
  // A fresh acquisition needs a local choice, even when copied from another actor.
  const choice=await chooseTalentSkills(actor,kind);if(!choice)return null;
  const next=structuredClone(data);next.flags??={};next.flags.starwarsffg??={};next.flags.starwarsffg.reviewedTalentChoices={_self:choice};return next;
}
export async function reconcileTalentChoices(actor){
  if(!actor?.isOwner||busy.has(actor.uuid))return;
  busy.add(actor.uuid);
  try{for(const [kind,names] of Object.entries(choiceKinds))for(const src of ownedTalentSources(actor,names)){
    if(src.choice||kind==='dedication')continue;const choice=await chooseTalentSkills(actor,kind);if(!choice)continue;
    // Recheck after a modal: the talent may have been unlearned meanwhile.
    if(!ownedTalentSources(actor,names).some(s=>s.item.id===src.item.id&&s.slot===src.slot))continue;
    await src.item.update({[`flags.starwarsffg.reviewedTalentChoices.${src.slot}`]:choice});
  }}catch(error){ui.notifications.error(error.message);}finally{busy.delete(actor.uuid);}
}
export function installReviewedTalentHooks(){
  const expireStim=async combat=>{if(!game.user?.isGM)return;for(const actor of game.actors?.contents??[]){const bonuses=actor.getFlag?.('starwarsffg','stimBonuses')??[];if(bonuses.some(b=>!b.expired&&b.encounterId===combat.id))await actor.update({'flags.starwarsffg.stimBonuses':bonuses.map(b=>b.encounterId===combat.id?{...b,expired:true}:b)});}};
  Hooks.on('deleteCombat',combat=>expireStim(combat));
  Hooks.on('updateCombat',(combat,changes)=>{if(Object.hasOwn(changes,'round')&&Number(changes.round)===0)void expireStim(combat);});
  const refreshVehicles=actor=>{if(!actor)return;for(const v of game.actors?.contents??[])if(v.type==='vehicle'&&(v.flags?.starwarsffg?.crew??[]).some(c=>c.role==='Pilot'&&c.actor_id===actor.id)){v.reset?.();v.prepareData?.();v.sheet?.render(false);}};
  Hooks.on('createItem',item=>refreshVehicles(ownerOf(item)));
  Hooks.on('deleteItem',item=>refreshVehicles(ownerOf(item)));
  Hooks.on('updateItem',async(item,changes)=>{
    refreshVehicles(ownerOf(item));
    const actor=ownerOf(item);if(!actor?.isOwner)return;
    const flat=foundry.utils.flattenObject(changes);
    const choices=item.flags?.starwarsffg?.reviewedTalentChoices??{};
    for(const [slot,choice]of Object.entries(choices))if(slot!=='_self'&&flat[`system.talents.${slot}.islearned`]===false){
      await item.update({[`flags.starwarsffg.reviewedTalentChoices.-=${slot}`]:null});
      await foundry.applications.api.DialogV2.wait({window:{title:'Talent désactivé'},classes:['starwarsffg','themed'],content:`<p>${esc((choice.skills??[]).map(k=>label(k,actor)).join(', '))} : ${choice.kind==='wellRounded'?'le bonus de compétence de carrière de ce talent est retiré. Les autres sources de carrière sont conservées.':'le lien de compétence avec le talent est retiré.'}</p>`,buttons:[{action:'ok',label:'Compris'}]});
    }
    if(Object.keys(flat).some(k=>k.endsWith('.islearned')||k==='system.ranks.current'))await reconcileTalentChoices(actor);
  });
}
export async function openJuryRigging(actor,item){
  if(!actor.isOwner)return;
  const current=item.flags?.starwarsffg?.juryRigged;
  const effects=juryEffectChoices(item),labels={damage:'+1 dégât',critical:'Coût du critique -1 (minimum 1)',quality:'Coût d’une qualité -1 (minimum 1)',encumbrance:'Encombrement -2 (minimum 1)','defence-melee':'+1 défense au corps à corps','defence-ranged':'+1 défense à distance'};
  const choice=await foundry.applications.api.DialogV2.wait({window:{title:`Bidouillage - ${item.name}`},classes:['starwarsffg','themed'],content:`<p>Un équipement par rang. ${esc(current?labels[current.effect]:'Aucun bidouillage sur cet objet.')}</p><label>Amélioration<select name="effect">${effects.filter(e=>e!=='quality').map(e=>`<option value="${e}">${esc(labels[e])}</option>`).join('')}</select></label>`,buttons:[{action:'use',label:'Appliquer',callback:(_e,_b,app)=>({effect:app.element.querySelector('[name=effect]').value})},...(current?[{action:'remove',label:'Retirer le bidouillage',callback:()=>({remove:true})}]:[]),{action:'cancel',label:'Annuler'}],rejectClose:false});
  if(!choice||typeof choice!=='object')return;
  if(choice.remove)await item.update({'flags.starwarsffg.-=juryRigged':null});
  else await item.update({'flags.starwarsffg.juryRigged':validateJuryAssignment(actor,item,choice.effect,choice.quality)});
}
export function renderReviewedTalentControls(sheet){
  const root=sheet.element,actor=sheet.actor;if(!root||!actor?.isOwner)return;
  root.querySelectorAll('.ffg-reviewed-talent-control').forEach(e=>e.remove());
  for(const path of actor._reviewedTalentPaths??[]){
    if(path.startsWith('system.stats.shields.')){
      for(const input of root.querySelectorAll(`[name="${path}"], [name="${path.replace(/^system\./,'data.')}"]`)){input.disabled=true;input.title='Conduite stratégique du pilote incluse dans cette défense.';}
      continue;
    }
    if(!path.endsWith('.careerskill'))continue;
    for(const input of root.querySelectorAll(`[name="${path}"], [name="${path.replace(/^system\./,'data.')}"]`)){
      input.checked=true;input.disabled=true;input.title='Accordée par un talent acquis. Les choix éventuels se règlent depuis ce talent.';
    }
  }
  const capacity=juryCapacity(actor),assigned=Array.from(actor.items).filter(i=>i.flags?.starwarsffg?.juryRigged).length;
  const skills=root.querySelector('.skillsTablesGrid');
  if(capacity||assigned){
    const notice=document.createElement('aside');notice.className='ffg-reviewed-talent-control ffg-jury-counter';notice.setAttribute('role','note');
    const title=document.createElement('strong');title.textContent='Bidouillage';
    const text=document.createElement('span');text.textContent=` : ${assigned}/${capacity} équipement(s). ${assigned<capacity?`${capacity-assigned} équipement(s) à bidouiller.`:assigned>capacity?'Certains bidouillages sont inactifs : rang insuffisant.':''}`;
    notice.append(title,text);
    const bonuses=skills?.querySelector('.ffg-skill-modifier-summary');if(bonuses)bonuses.before(notice);else skills?.append(notice);
  }
  const applied=new Map(activeJuryAssignments(actor).map(entry=>[entry.item.id,entry.assignment]));
  const effects={damage:'+1 dégât',critical:'Coût du critique -1',quality:'Coût d’une qualité -1',encumbrance:'Encombrement -2','defence-melee':'+1 défense au corps à corps','defence-ranged':'+1 défense à distance'};
  for(const row of root.querySelectorAll('.items-list > .item[data-item-id]')){
    const item=actor.items.get(row.dataset.itemId);if(!item||!['weapon','armour'].includes(item.type)||(!capacity&&!item.flags?.starwarsffg?.juryRigged))continue;
    const controls=row.querySelector('.item-controls');if(!controls)continue;
    const assignment=applied.get(item.id),configured=item.flags?.starwarsffg?.juryRigged,active=Boolean(assignment);
    const state=active?'Bidouillé : '+(effects[assignment.effect]??'amélioration configurée')+(assignment.quality?' ('+assignment.quality+')':''):configured?'Bidouillage inactif : rangs insuffisants':'Non bidouillé';
    const button=document.createElement('button');button.type='button';button.className='item-control ffg-reviewed-talent-control ffg-jury-control'+(active?' active':'');button.dataset.juryState=active?'applied':configured?'inactive':'none';button.title=state+' - Configurer';button.setAttribute('aria-label',item.name+' : '+state);button.setAttribute('aria-pressed',String(active));
    const icon=document.createElement('span');icon.className='ffg-jury-icon';icon.setAttribute('aria-hidden','true');
    icon.innerHTML='<svg viewBox="0 0 24 24" focusable="false"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94L14.7 6.3z"/></svg>';
    button.append(icon);
    button.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();button.disabled=true;try{await openJuryRigging(actor,item);await actor.sheet?.render(false);}catch(error){ui.notifications.error(error.message);}finally{button.disabled=false;}});
    const equipped=row.querySelector('.toggle-equipped');
    (equipped?.parentElement??controls).append(button);
  }

}

export async function configureSpecificTalent(actor,itemId,slot){
 if(!actor?.isOwner||busy.has(actor.uuid))return;
 const find=()=>Object.entries(choiceKinds).flatMap(([kind,names])=>ownedTalentSources(actor,names).map(src=>({...src,kind}))).find(src=>src.item.id===itemId&&src.slot===slot);
 const src=find();if(!src)throw Error('Ce talent doit être acquis sur ce personnage pour choisir ses compétences.');
 if(src.kind==='dedication'&&Object.values(src.node.attributes??{}).some(a=>a.modtype==='Characteristic'))throw Error('Entraînement possède déjà un bonus de caractéristique configuré. Migration de ce bonus nécessaire avant reconfiguration, pour éviter un double comptage.');
 busy.add(actor.uuid);
 try{
  let saved=false;
  const persist=async choice=>{
    if(!find())throw Error('Le talent a été retiré pendant le choix.');
    const data={_id:src.item.id,[`flags.starwarsffg.reviewedTalentChoices.${slot}`]:choice};
    if(src.kind==='dedication'){
     const attrs=src.node.attributes??{},keys=Object.entries(attrs).filter(([,v])=>v.modtype==='Characteristic').map(([k])=>k);
     for(const k of keys)data[(slot==='_self'?'system.attributes.':'system.talents.'+slot+'.attributes.')+'-='+k]=null;
     const effects=Array.from(src.item.effects??[]).filter(e=>e.flags?.starwarsffg?.characteristicIncrease||keys.some(k=>e.name===k||e.name?.endsWith('.'+k)));
     if(effects.length)await src.item.updateEmbeddedDocuments('ActiveEffect',effects.map(e=>({_id:e.id,disabled:true})));
    }
    if(actor.updateEmbeddedDocuments)await actor.updateEmbeddedDocuments('Item',[data]);
    else await src.item.update({[`flags.starwarsffg.reviewedTalentChoices.${slot}`]:choice});
    const stored=find()?.choice;
    if(!stored||JSON.stringify(stored.skills)!==JSON.stringify(choice.skills))throw Error('Les compétences n’ont pas été enregistrées. Fermez puis rouvrez la fiche et réessayez.');
    saved=true;
  };
  const choice=src.kind==='dedication'?await chooseDedication(actor,src,persist):await chooseTalentSkills(actor,src.kind,src.choice,persist);if(!choice)return;
  if(!saved)await persist(choice);
  actor.reset?.();actor.prepareData?.();await actor.sheet?.render(false);
  ui.notifications.info(`${src.node.name} : ${choice.skills.map(k=>label(k,actor)).join(', ')}.`);
 }
 finally{busy.delete(actor.uuid);}
}

async function chooseDedication(actor,src,onConfirm){
 const labels={Brawn:'Vigueur',Agility:'Agilité',Intellect:'Intelligence',Cunning:'Ruse',Willpower:'Volonté',Presence:'Présence'};
 const previous=src.choice?.skills??[];
 const base=Object.fromEntries(Object.keys(labels).map(k=>[k,Number(actor.system.characteristics[k]?.value)-previous.filter(x=>x===k).length]));
 const content=Array.from({length:src.rank},(_,i)=>`<label>Rang ${i+1}<select name="characteristic${i}">${Object.entries(labels).map(([key,label])=>`<option value="${key}" ${previous[i]===key?'selected':''}>${label}</option>`).join('')}</select></label>`).join('');
 return foundry.applications.api.DialogV2.prompt({window:{title:'Entraînement - caractéristiques'},classes:['starwarsffg','themed'],content,rejectClose:false,ok:{label:'Enregistrer',callback:async(_e,button,app)=>{
  const form=button?.form??app.element,skills=Array.from({length:src.rank},(_,i)=>form.querySelector(`[name=characteristic${i}]`).value);
  for(const key of skills)if(!labels[key]||base[key]+skills.filter(k=>k===key).length>6)throw Error('Une caractéristique ne peut pas dépasser 6.');
  const choice={kind:'dedication',skills};await onConfirm(choice);return choice;
 }}});
}

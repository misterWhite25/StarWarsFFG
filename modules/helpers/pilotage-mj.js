import {matchesVitalityFilter} from './pilotage-vitality.js';
import {matchingModifiers,modifierTotals,modifierCounts} from './pilotage-core.js';

const scope='starwarsffg',flag='pilotageModifiers';
const enc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const trusted=markup=>Object.assign(document.createElement('div'),{innerHTML:markup});
let dialog,selectedUuid=null;
const vitalityFilters={players:'all',npcs:'all'};
const locks=new Map();
function serialize(actor,work){const key=actor.uuid;const promise=(locks.get(key)??Promise.resolve()).catch(()=>{}).then(work);locks.set(key,promise);return promise.finally(()=>{if(locks.get(key)===promise)locks.delete(key);});}
const tokenByUuid=uuid=>globalThis.canvas?.scene?.tokens.find(token=>token.uuid===uuid);
const entriesFor=actor=>actor?structuredClone(actor.getFlag?.(scope,flag)??[]):[];
const activeEntries=subject=>entriesFor(tokenByUuid(subject)?.actor).filter(entry=>entry.subjectUuid===subject&&entry.state==='pending');

export function preparePilotage(builder){
  const actor=builder.roll.data?.document??game.actors.get(builder.roll.data?.actor?._id);
  const tokens=globalThis.canvas?.scene?.tokens.filter(token=>token.actor?.uuid===actor?.uuid)??[];
  const selected=globalThis.canvas?.tokens?.controlled.filter(token=>token.actor?.uuid===actor?.uuid)??[];
  const explicit=tokenByUuid(builder.roll.data?.pilotageTokenUuid??builder.dicePool._pilotageSubjectUuid);
  const token=(explicit?.actor?.uuid===actor?.uuid?explicit:null)??actor?.token??(selected.length===1?selected[0].document:tokens.length===1?tokens[0]:null);
  builder.dicePool._pilotageSubjectUuid=token?.uuid??null;
  builder.dicePool._pilotageSkill=builder.roll.skillName;
  builder._pilotageCandidates=tokens;
}
export function poolModifiers(pool){return matchingModifiers(entriesFor(tokenByUuid(pool._pilotageSubjectUuid)?.actor),pool._pilotageSubjectUuid,pool._pilotageSkill);}
export function applyPilotagePool(pool){
  const result=Object.assign(Object.create(Object.getPrototypeOf(pool)),pool);
  const totals=modifierTotals(poolModifiers(pool));
  result.boost=(Number(pool.boost)||0)+totals.boost;result.setback=(Number(pool.setback)||0)+totals.setback;
  return result;
}
export function pilotageTotals(pool){return modifierTotals(poolModifiers(pool));}
export async function reservePilotage(pool,expected=poolModifiers(pool)){
  const token=tokenByUuid(pool._pilotageSubjectUuid),actor=token?.actor;
  if(!actor)return {entries:[],actor:null};
  return serialize(actor,async()=>{
    const all=entriesFor(actor),selected=matchingModifiers(all,token.uuid,pool._pilotageSkill);
    if(selected.length!==expected.length||selected.some(entry=>!expected.some(previous=>previous.id===entry.id)))throw Error('Les effets du Pilotage MJ ont changé. Vérifiez la réserve puis relancez.');
    if(!selected.length)return {entries:[],actor:null};
    if(!actor.isOwner)throw Error('Vous ne pouvez pas consommer les effets de ce personnage.');
    const transaction=foundry.utils.randomID(),ids=new Set(selected.map(entry=>entry.id));
    await actor.setFlag(scope,flag,all.map(entry=>ids.has(entry.id)?{...entry,state:'used',transaction}:entry));
    return {actor,transaction,entries:selected};
  });
}
export async function restorePilotage(transaction){
  if(!transaction?.actor)return;
  return serialize(transaction.actor,async()=>{
    const entries=entriesFor(transaction.actor);
    await transaction.actor.setFlag(scope,flag,entries.map(entry=>entry.transaction===transaction.transaction&&entry.state==='used'?{...entry,state:'pending',transaction:null}:entry));
  });
}
export function renderPilotageNotice(builder,html){
  const root=html[0];if(!root?.ownerDocument)return;let notice=root.querySelector('.pilotage-roll-notice');
  if(!notice){notice=document.createElement('div');notice.className='pilotage-roll-notice';notice.style.cssText='padding:8px;margin:6px 0;background:var(--color-bg-option);border-radius:4px';(root.querySelector('.window-content')??root).prepend(notice);}
  notice.replaceChildren();
  const subject=tokenByUuid(builder.dicePool._pilotageSubjectUuid),entries=poolModifiers(builder.dicePool);
  if(subject&&entries.length){const totals=modifierTotals(entries);notice.textContent=`Pilotage MJ · ${subject.name} [${subject.id.slice(-4)}] : +${totals.boost} Fortune, +${totals.setback} Infortune au prochain jet. ${entries.map(entry=>entry.reason).filter(Boolean).join(' · ')}`;}
  else if(!subject&&builder._pilotageCandidates?.length>1){
    const label=document.createElement('label');label.textContent='Quel token effectue ce jet ? ';
    const select=document.createElement('select');select.setAttribute('aria-label','Token effectuant le jet');
    const empty=document.createElement('option');empty.value='';empty.textContent='Choisir un token de la scène';select.append(empty);
    for(const token of builder._pilotageCandidates){const option=document.createElement('option');option.value=token.uuid;option.textContent=`${token.name} [${token.id.slice(-4)}] · ${token.x}, ${token.y}`;select.append(option);}
    select.addEventListener('change',()=>{builder.dicePool._pilotageSubjectUuid=select.value||null;builder._initializeInputs(html);renderPilotageNotice(builder,html);});
    label.append(select);notice.append(label);
  }else notice.hidden=true;
  if(notice.childNodes.length)notice.hidden=false;
}

export async function addPilotageModifier(subjectUuid,config){
  if(!game.user.isGM)throw Error('Réservé au MJ.');
  const token=tokenByUuid(subjectUuid);if(!token?.actor)throw Error('Ce token n’est plus présent sur la scène.');
  const counts=modifierCounts(config);if(!counts.boost&&!counts.setback)throw Error('Ajouter au moins un dé de Fortune ou d’Infortune.');
  return serialize(token.actor,async()=>{
    const entry={id:foundry.utils.randomID(),subjectUuid,boost:counts.boost,setback:counts.setback,skill:config.skill||null,reason:String(config.reason??'').trim().slice(0,160),state:'pending',author:game.user.id};
    await token.actor.setFlag(scope,flag,[...entriesFor(token.actor),entry]);
    return entry;
  });
}
async function removeModifier(subject,id){
  if(!game.user.isGM)return;
  const actor=tokenByUuid(subject)?.actor;if(!actor)return;
  await serialize(actor,()=>actor.setFlag(scope,flag,entriesFor(actor).filter(entry=>entry.id!==id)));
}
async function locateToken(uuid){
  const token=tokenByUuid(uuid)?.object;if(!token)throw Error('Le token n’est plus affiché.');
  canvas.tokens.activate();token.control({releaseOthers:true});
  await canvas.animatePan({x:token.center.x,y:token.center.y,duration:250});
}
function sceneRows(){
  const counts=new Map();
  const groups={players:[],npcs:[]},total={players:0,npcs:0};
  for(const token of (globalThis.canvas?.scene?.tokens.contents??[]).filter(token=>token.actor)){
    const count=(counts.get(token.name)??0)+1;counts.set(token.name,count);
    const pj=game.users.contents.some(user=>!user.isGM&&token.actor.testUserPermission(user,'OWNER'));
    const group=pj?'players':'npcs';total[group]++;
    if(!matchesVitalityFilter(token.actor,vitalityFilters[group]))continue;
    const effects=activeEntries(token.uuid);const totals=modifierTotals(effects);
    const talents=pj?[]:(token.actor.talentList??[]).filter(talent=>{
      const owned=token.actor.items?.get?.(talent.itemId);
      return !owned?.flags?.starwarsffg?.characteristicIncrease?.creationTool &&
        !['augmenter un attribut','increase a characteristic'].includes(String(talent.name??'').trim().toLowerCase());
    });
    const talentHint=talents.length?`Talents : ${talents.map(talent=>`${talent.name}${talent.isRanked&&Number(talent.rank)>0?` (rang ${talent.rank})`:''}`).join(', ')}`:'';
    const talentMarker=talents.length?`<i class="fa-solid fa-list-check pilotage-talent-marker" role="img" aria-label="${enc(talentHint)}" title="${enc(talentHint)}"></i>`:'';
    groups[pj?'players':'npcs'].push(`<button type="button" class="pilotage-token-row" data-pilotage-token="${enc(token.uuid)}" aria-pressed="${token.uuid===selectedUuid}"><img src="${enc(token.texture.src)}" alt="" width="32" height="32"><span><strong>${enc(token.name)} · ${count}</strong>${talentMarker}${token.hidden?'<small>Masqué</small>':''}</span>${effects.length?`<span class="pilotage-effect-summary">+${totals.boost} F / +${totals.setback} I</span>`:''}</button>`);
  }
  return `<div class="pilotage-token-groups">${[['players','Joueurs'],['npcs','PNJ']].map(([key,label])=>`<section data-pilotage-group="${key}" aria-label="${label}"><h4>${label} (${groups[key].length}${groups[key].length!==total[key]?` / ${total[key]}`:''})</h4><label class="pilotage-vitality-filter">État <select data-pilotage-vitality="${key}" aria-label="État des ${label}" title="Mort : blessures actuelles strictement supérieures au seuil.">${[['all','Tous'],['alive','Vivants'],['dead','Morts']].map(([value,text])=>`<option value="${value}" ${vitalityFilters[key]===value?'selected':''}>${text}</option>`).join('')}</select></label><div class="pilotage-group-list">${groups[key].join('')||`<small>${total[key]?'Aucun personnage ne correspond au filtre.':'Aucun sur cette scène.'}</small>`}</div></section>`).join('')}</div>`;
}
function renderSelected(){
  if(!dialog?.rendered)return;
  const root=dialog.element,token=tokenByUuid(selectedUuid);
  for(const row of root.querySelectorAll('[data-pilotage-token]'))row.setAttribute('aria-pressed',String(row.dataset.pilotageToken===selectedUuid));
  root.querySelector('.pilotage-target-title').textContent=token?token.name:'Choisissez un token dans la liste.';
  const list=root.querySelector('.pilotage-pending');list.replaceChildren();list.classList.remove('is-empty');
  if(!token)return;
  const effects=activeEntries(selectedUuid);
  for(const entry of effects){
    const row=document.createElement('div');row.className='pilotage-pending-effect';
    const text=document.createElement('div');text.className='pilotage-effect-body';
    const dice=document.createElement('div');dice.className='pilotage-effect-dice';
    for(const [count,color,label] of [[entry.boost,'blue','Fortune'],[entry.setback,'black','Infortune']]){
      if(!count)continue;
      const badge=document.createElement('span');badge.className='pilotage-effect-die';
      const image=document.createElement('img');image.src=`systems/starwarsffg/images/dice/starwars/${color}.png`;image.alt=label;
      badge.append(image,document.createTextNode(`+${count}`));dice.append(badge);
    }
    const skill=document.createElement('span');skill.className='pilotage-effect-skill';
    skill.textContent=({RangedLight:'Armes légères',RangedHeavy:'Armes lourdes',Melee:'Corps à corps',Brawl:'Pugilat',Gunnery:'Artillerie',Medicine:'Médecine'}[entry.skill]??entry.skill)||'Toute compétence';
    text.append(dice,skill);
    if(entry.reason){const reason=document.createElement('span');reason.className='pilotage-effect-reason';reason.textContent=entry.reason;text.append(reason);}
    const button=document.createElement('button');button.type='button';button.textContent='Retirer';
    button.addEventListener('click',async()=>{try{await removeModifier(selectedUuid,entry.id);await refreshRows();}catch(error){ui.notifications.error(error.message);}});
    row.append(text,button);list.append(row);
  }
  if(!effects.length){list.classList.add('is-empty');list.textContent='Aucun bonus ou malus en attente.';}
}
async function refreshRows(){
  if(!dialog?.rendered)return;
  const root=dialog.element;
  const scrolls=new Map(Array.from(root.querySelectorAll('[data-pilotage-group]'),group=>[group.dataset.pilotageGroup,group.querySelector('.pilotage-group-list').scrollTop]));
  root.querySelector('.pilotage-token-list').innerHTML=sceneRows();
  for(const group of root.querySelectorAll('[data-pilotage-group]'))group.querySelector('.pilotage-group-list').scrollTop=scrolls.get(group.dataset.pilotageGroup)??0;
  for(const filter of root.querySelectorAll('[data-pilotage-vitality]'))filter.addEventListener('change',async()=>{
    vitalityFilters[filter.dataset.pilotageVitality]=filter.value;
    await refreshRows();
  });
  if(selectedUuid&&!Array.from(root.querySelectorAll('[data-pilotage-token]')).some(row=>row.dataset.pilotageToken===selectedUuid))selectedUuid=null;
  for(const button of root.querySelectorAll('[data-pilotage-token]'))button.addEventListener('click',async()=>{
    selectedUuid=button.dataset.pilotageToken;renderSelected();try{await locateToken(selectedUuid);}catch(error){ui.notifications.error(error.message);}
  });
  renderSelected();
}
export async function showPilotageMJ(config,{saveDifficulty,changeDifficulty}){
  if(!game.user.isGM)return;
  if(dialog?.rendered){dialog.bringToFront();await refreshRows();return dialog;}
  const dice=[['challenge','Défi','red'],['difficulty','Difficulté','purple'],['setback','Infortune','black']];
  dialog=new foundry.applications.api.DialogV2({
    classes:['starwarsffg','themed','ffg-calculation-dialog','ffg-gm-difficulty-dialog','pilotage-mj-dialog'],
    window:{title:'Pilotage MJ',resizable:true},position:{width:Math.max(500,Math.min(720,window.innerWidth-180)),left:20,top:50},
    content:trusted(`<style>.pilotage-mj-dialog .pilotage-columns{display:grid;grid-template-columns:230px minmax(0,1fr);gap:18px}.pilotage-mj-dialog .pilotage-token-list{max-height:190px;overflow:auto}.pilotage-mj-dialog .pilotage-token-row{display:flex;gap:8px;align-items:center;text-align:left;width:100%;height:auto;white-space:normal;margin:3px 0;padding:6px}.pilotage-token-row span:nth-child(2){flex:1;min-width:0}.pilotage-token-row small{display:block}.pilotage-token-row[aria-pressed=true]{outline:2px solid var(--color-border-highlight);background:var(--color-bg-option)}.pilotage-token-row img{object-fit:contain}.pilotage-mj-dialog .pilotage-editor{margin-top:12px;padding:12px;border:1px solid #64747780;border-top:3px solid #52686b;border-radius:6px;background:rgba(255,255,255,.25);box-shadow:0 2px 5px #00000012}.pilotage-mj-dialog .pilotage-target-title{display:block;font-size:15px;padding-bottom:8px;margin-bottom:8px;border-bottom:1px solid #64747740}.pilotage-mj-dialog .pilotage-editor .pilotage-modifier-inputs{margin-bottom:8px}.pilotage-mj-dialog .pilotage-editor>label{margin-bottom:10px}.pilotage-mj-dialog .pilotage-pending:empty{display:none}.pilotage-mj-dialog .pilotage-pending.is-empty{font-size:12px;font-style:italic;opacity:.8;padding-top:8px;border-top:1px solid #64747740}.pilotage-mj-dialog .pilotage-pending-effect{display:flex;gap:10px;align-items:center;padding:9px;margin-top:8px;border:1px solid #64747750;border-radius:4px;background:rgba(255,255,255,.4)}.pilotage-mj-dialog .pilotage-effect-body{flex:1;min-width:0}.pilotage-mj-dialog .pilotage-effect-dice{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px}.pilotage-mj-dialog .pilotage-effect-die{display:inline-flex;align-items:center;gap:5px;font-weight:bold}.pilotage-mj-dialog .pilotage-effect-die img{border:0;width:20px;height:20px}.pilotage-mj-dialog .pilotage-effect-skill{display:block;font-size:12px;font-weight:bold}.pilotage-mj-dialog .pilotage-effect-reason{display:block;font-size:12px;overflow-wrap:anywhere;margin-top:3px}.pilotage-mj-dialog .pilotage-pending-effect button{flex:none;width:auto;padding:3px 8px;font-size:12px}.pilotage-mj-dialog input[type=number]{width:60px}.pilotage-mj-dialog .pilotage-editor label{display:block;margin:5px 0}.pilotage-mj-dialog .pilotage-pending{margin-top:8px}.pilotage-mj-dialog h3{margin:6px 0 10px}@media(max-width:750px){.pilotage-mj-dialog .pilotage-columns{grid-template-columns:1fr}}</style>
    <div class="pilotage-columns">
      <style>.pilotage-mj-dialog .pilotage-modifier-inputs{display:flex;flex-wrap:wrap;gap:12px}.pilotage-mj-dialog .pilotage-editor .pilotage-modifier-inputs label{display:flex;align-items:center;gap:6px;margin:5px 0}.pilotage-mj-dialog .pilotage-modifier-inputs img{object-fit:contain;flex:none;border:0}</style>
      <style>.pilotage-mj-dialog .pilotage-columns{width:100%;min-width:0;box-sizing:border-box}.pilotage-mj-dialog .pilotage-columns>section{min-width:0;max-width:100%}.pilotage-mj-dialog .dialog-content,.pilotage-mj-dialog .dialog-form{min-width:0;width:100%;box-sizing:border-box}.pilotage-mj-dialog .pilotage-columns table.gm-dice-table{width:100%;max-width:100%}.pilotage-mj-dialog .pilotage-token-row[aria-pressed=true]{color:var(--color-text-primary)}.pilotage-mj-dialog .gm-dice-table{min-width:0;width:100%;table-layout:fixed}.pilotage-mj-dialog .gm-dice-table td:first-child{width:40px}.pilotage-mj-dialog .gm-dice-table td:nth-child(2){width:52px}.pilotage-mj-dialog .gm-dice-table td:last-child{overflow-wrap:anywhere}.pilotage-mj-dialog .pilotage-token-list{max-height:none;overflow:visible}.pilotage-token-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.pilotage-group-list{height:clamp(280px,calc(100dvh - 480px),420px);overflow:auto}.pilotage-mj-dialog .pilotage-assignment-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}.pilotage-mj-dialog .pilotage-assignment-row label{min-width:0;margin:0}.pilotage-mj-dialog .pilotage-assignment-row select{width:100%;min-width:0}.pilotage-mj-dialog .pilotage-assignment-row button{height:auto;min-height:32px;white-space:normal;max-width:175px;margin:0}.pilotage-mj-dialog .window-content{overflow:auto}.pilotage-token-groups h4{margin:0 0 6px}.pilotage-token-groups .pilotage-token-row{flex-wrap:wrap;gap:6px}.pilotage-token-groups .pilotage-token-row span:nth-child(2){min-width:70px;overflow-wrap:anywhere}.pilotage-effect-summary{width:100%}@media(max-width:650px){.pilotage-token-groups{grid-template-columns:1fr}}</style>
      <section class="pilotage-difficulty-section"><h3>Difficulté</h3><div class="gm-dice-preview" aria-label="Dés préparés" aria-live="polite"></div><div class="gm-upgrade-buttons"><button type="button" data-gm-upgrade="up">Améliorer</button><button type="button" data-gm-upgrade="down">Baisser</button></div><table class="gm-dice-table"><tbody>${dice.map(([key,label,color])=>`<tr data-gm-die="${key}"><td><img src="systems/starwarsffg/images/dice/starwars/${color}.png" alt="${label}" width="28" height="28"></td><td><button type="button" data-gm-count="${key}">${config[key]}</button></td><td>${label}</td></tr>`).join('')}</tbody></table><p><small>Clic gauche : +1 ; clic droit : −1.</small></p><label><input type="checkbox" name="pilotage-enabled" ${config.enabled?'checked':''}> Utiliser pour tous les jets</label><button type="button" data-pilotage-save-difficulty style="margin-top:10px">Appliquer la difficulté</button><small><em>Les Infortunes individuelles s’ajoutent après ce réglage.</em></small></section>
      <section><h3>Personnages de la scène</h3><div class="pilotage-token-list"></div><div class="pilotage-editor"><strong class="pilotage-target-title"></strong><div class="pilotage-modifier-inputs"><label data-tooltip="Dé de Fortune (bleu)"><img src="systems/starwarsffg/images/dice/starwars/blue.png" alt="Fortune" width="26" height="26"><input type="number" name="pilotage-boost" aria-label="Dés de Fortune" min="0" max="20" value="1"></label><label data-tooltip="Dé d’Infortune (noir)"><img src="systems/starwarsffg/images/dice/starwars/black.png" alt="Infortune" width="26" height="26"><input type="number" name="pilotage-setback" aria-label="Dés d’Infortune" min="0" max="20" value="0"></label></div><label>Motif <input type="text" name="pilotage-reason" maxlength="160" placeholder="Aide, camouflage, position…"></label><div class="pilotage-assignment-row"><label>Prochain jet <select name="pilotage-skill"><option value="">Toute compétence</option><option value="RangedLight">Armes légères</option><option value="RangedHeavy">Armes lourdes</option><option value="Melee">Corps à corps</option><option value="Brawl">Pugilat</option><option value="Gunnery">Artillerie</option><option value="Medicine">Médecine</option></select></label><button type="button" data-pilotage-assign>Attribuer au prochain jet</button></div><div class="pilotage-pending" aria-live="polite"></div></div></section>
    </div>`),
    buttons:[{action:'close',label:'Fermer'}]
  });
  await dialog.render({force:true});
  const root=dialog.element;
  const update=()=>{
    const preview=root.querySelector('.gm-dice-preview');preview.replaceChildren();
    for(const [key,label,color]of dice){root.querySelector(`[data-gm-count="${key}"]`).textContent=config[key];for(let i=0;i<config[key];i++){const img=document.createElement('img');img.src=`systems/starwarsffg/images/dice/starwars/${color}.png`;img.alt=label;img.width=24;img.height=24;preview.append(img);}}
  };
  for(const row of root.querySelectorAll('[data-gm-die]')){row.addEventListener('click',event=>{event.preventDefault();config[row.dataset.gmDie]++;update();});row.addEventListener('contextmenu',event=>{event.preventDefault();config[row.dataset.gmDie]=Math.max(0,config[row.dataset.gmDie]-1);update();});}
  for(const button of root.querySelectorAll('[data-gm-upgrade]'))button.addEventListener('click',()=>{changeDifficulty(config,button.dataset.gmUpgrade==='down');update();});
  root.querySelector('[data-pilotage-save-difficulty]').addEventListener('click',async()=>{config.enabled=root.querySelector('[name=pilotage-enabled]').checked;await saveDifficulty(config);ui.notifications.info('Difficulté commune enregistrée.');});
  root.querySelector('[data-pilotage-assign]').addEventListener('click',async()=>{
    const button=root.querySelector('[data-pilotage-assign]');button.disabled=true;
    try{await addPilotageModifier(selectedUuid,{boost:root.querySelector('[name=pilotage-boost]').value,setback:root.querySelector('[name=pilotage-setback]').value,skill:root.querySelector('[name=pilotage-skill]').value,reason:root.querySelector('[name=pilotage-reason]').value});await refreshRows();ui.notifications.info('Effet attribué au prochain jet de ce token.');}
    catch(error){ui.notifications.error(error.message);}finally{button.disabled=false;}
  });
  update();await refreshRows();return dialog;
}
if(typeof Hooks!=='undefined'){
Hooks.on('updateActor',()=>{Hooks.callAll('ffgPilotageChanged');void refreshRows();});
Hooks.on('updateToken',()=>{Hooks.callAll('ffgPilotageChanged');void refreshRows();});
for(const hook of ['canvasReady','createToken','deleteToken'])Hooks.on(hook,()=>{selectedUuid=tokenByUuid(selectedUuid)?selectedUuid:null;void refreshRows();});



}

const acceptingAid = new Set();
export async function acceptPilotageAid(message,entry){
  const id = `${message.id}:${entry.id}`;
  if (acceptingAid.has(id)) return;
  acceptingAid.add(id);
  try { return await acceptPilotageAidOnce(message,entry); }
  finally { acceptingAid.delete(id); }
}
async function acceptPilotageAidOnce(message,entry){
  if(entry.recipient!==game.user.id||entry.undone)return;
  const current=structuredClone(game.user.getFlag(scope,'rollAid')??{pending:[],used:[]});
  const id=`${message.id}:${entry.id}`;
  if(current.used.includes(id)){ui.notifications.info('Cette aide a déjà été reçue.');return;}
  const candidates=(globalThis.canvas?.scene?.tokens.contents??[]).filter(token=>token.actor?.isOwner&&(game.user.isGM||token.object?.visible));
  if(!candidates.length)throw Error('Aucun personnage accessible sur la scène pour recevoir cette aide.');
  const controlled=(canvas.tokens?.controlled??[]).map(token=>token.document).filter(token=>candidates.includes(token));
  const character=candidates.filter(token=>token.actor.uuid===game.user.character?.uuid);
  let token=controlled.length===1?controlled[0]:character.length===1?character[0]:candidates.length===1?candidates[0]:null;
  if(!token){
    const uuid=await foundry.applications.api.DialogV2.wait({window:{title:'Bénéficiaire de l’aide'},content:`<label>Personnage de la scène<select name="recipient-token">${candidates.map(token=>`<option value="${enc(token.uuid)}">${enc(token.name)} [${enc(token.id.slice(-4))}] · ${token.x}, ${token.y}</option>`).join('')}</select></label>`,buttons:[{action:'accept',label:'Préparer l’aide',callback:(_event,button)=>button.form.elements['recipient-token'].value},{action:'cancel',label:'Annuler',callback:()=>null}]});
    if(!uuid)return;token=tokenByUuid(uuid);
  }
  if(!token?.actor?.isOwner)throw Error('Le bénéficiaire n’est plus accessible.');
  const fresh=game.messages.get(message.id)?.getFlag(scope,'combatActions')?.entries.find(value=>value.id===entry.id);
  if(!fresh||fresh.undone||fresh.recipient!==game.user.id)throw Error('Cette aide n’est plus disponible.');
  await serialize(token.actor,async()=>{
    const all=entriesFor(token.actor);
    if(!all.some(effect=>effect.id===id))await token.actor.setFlag(scope,flag,[...all,{id,subjectUuid:token.uuid,boost:1,setback:0,skill:null,reason:'Aide reçue d’un jet',sourceAid:{message:message.id,entry:entry.id},state:'pending',author:game.user.id}]);
  });
  current.pending=current.pending.filter(value=>value.id!==id);current.used.push(id);
  await game.user.setFlag(scope,'rollAid',current);
  ui.notifications.info(`Aide préparée pour ${token.name} ; visible dans Pilotage MJ.`);
}

import {setupPilotageAssets} from './pilotage-assets.mjs';
import {setupPilotageTabs} from "./pilotage-tabs.mjs";
import {matchingModifiers,modifierTotals,modifierCounts} from './pilotage-core.js';

const scope='starwarsffg',flag='pilotageModifiers';
const enc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const trusted=markup=>Object.assign(document.createElement('div'),{innerHTML:markup});
let dialog,selectedUuid=null;
const locks=new Map();
function serialize(document,work){const key=document.uuid;const promise=(locks.get(key)??Promise.resolve()).catch(()=>{}).then(work);locks.set(key,promise);return promise.finally(()=>{if(locks.get(key)===promise)locks.delete(key);});}
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
    if(selected.length!==expected.length||selected.some(entry=>!expected.some(previous=>previous.id===entry.id)))throw Error(game.i18n.localize("SWFFG.UI.Pilotage.PilotageEffectsChanged"));
    if(!selected.length)return {entries:[],actor:null};
    if(!actor.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.CannotConsumeEffects"));
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
  if(subject&&entries.length){const totals=modifierTotals(entries);notice.textContent=game.i18n.format("SWFFG.UI.Pilotage.PilotageRollNotice",{name:subject.name,id:subject.id.slice(-4),boost:totals.boost,setback:totals.setback,reasons:entries.map(entry=>entry.reason).filter(Boolean).join(' · ')});}
  else if(!subject&&builder._pilotageCandidates?.length>1){
    const label=document.createElement('label');label.textContent=game.i18n.localize("SWFFG.UI.Pilotage.WhichToken");
    const select=document.createElement('select');select.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Pilotage.RollingToken"));
    const empty=document.createElement('option');empty.value='';empty.textContent=game.i18n.localize("SWFFG.UI.Pilotage.ChooseSceneToken");select.append(empty);
    for(const token of builder._pilotageCandidates){const option=document.createElement('option');option.value=token.uuid;option.textContent=`${token.name} [${token.id.slice(-4)}] · ${token.x}, ${token.y}`;select.append(option);}
    select.addEventListener('change',()=>{builder.dicePool._pilotageSubjectUuid=select.value||null;builder._initializeInputs(html);renderPilotageNotice(builder,html);});
    label.append(select);notice.append(label);
  }else notice.hidden=true;
  if(notice.childNodes.length)notice.hidden=false;
}

export async function addPilotageModifier(subjectUuid,config){
  if(!game.user.isGM)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.GMOnly"));
  const token=tokenByUuid(subjectUuid);if(!token?.actor)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.TokenLeftScene"));
  const counts=modifierCounts(config);if(!counts.boost&&!counts.setback)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.AddModifierDie"));
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
function renderSelected(){
  if(!dialog?.rendered)return;
  const root=dialog.element,token=tokenByUuid(selectedUuid);
  for(const row of root.querySelectorAll('[data-pilotage-token]'))row.setAttribute('aria-pressed',String(row.dataset.pilotageToken===selectedUuid));
  root.querySelector('.pilotage-target-title').textContent=token?token.name:game.i18n.localize("SWFFG.UI.Pilotage.ChooseCharacter");
  root.querySelector('[data-pilotage-assign]').disabled=!token;
  const list=root.querySelector('.pilotage-pending');list.replaceChildren();list.classList.remove('is-empty');
  if(!token)return;
  const effects=activeEntries(selectedUuid);
  for(const entry of effects){
    const row=document.createElement('div');row.className='pilotage-pending-effect';
    const text=document.createElement('div');text.className='pilotage-effect-body';
    const dice=document.createElement('div');dice.className='pilotage-effect-dice';
    for(const [count,color,label] of [[entry.boost,'blue',game.i18n.localize("SWFFG.UI.Pilotage.Boost")],[entry.setback,'black',game.i18n.localize("SWFFG.UI.Pilotage.Setback")]]){
      if(!count)continue;
      const badge=document.createElement('span');badge.className='pilotage-effect-die';
      const image=document.createElement('img');image.src=`systems/starwarsffg/images/dice/starwars/${color}.png`;image.alt=label;
      badge.append(image,document.createTextNode(`+${count}`));dice.append(badge);
    }
    const skill=document.createElement('span');skill.className='pilotage-effect-skill';
    skill.textContent=({RangedLight:game.i18n.localize("SWFFG.UI.Pilotage.RangedLight"),RangedHeavy:game.i18n.localize("SWFFG.UI.Pilotage.RangedHeavy"),Melee:game.i18n.localize("SWFFG.UI.Pilotage.Melee"),Brawl:game.i18n.localize("SWFFG.UI.Pilotage.Brawl"),Gunnery:game.i18n.localize("SWFFG.UI.Pilotage.Gunnery"),Medicine:game.i18n.localize("SWFFG.UI.Pilotage.Medicine")}[entry.skill]??entry.skill)||game.i18n.localize("SWFFG.UI.Pilotage.AnySkill");
    text.append(dice,skill);
    if(entry.reason){const reason=document.createElement('span');reason.className='pilotage-effect-reason';reason.textContent=entry.reason;text.append(reason);}
    const button=document.createElement('button');button.type='button';button.textContent=game.i18n.localize("SWFFG.UI.Pilotage.Remove");
    button.addEventListener('click',async()=>{try{await removeModifier(selectedUuid,entry.id);await refreshRows();}catch(error){ui.notifications.error(error.message);}});
    row.append(text,button);list.append(row);
  }
  if(!effects.length){list.classList.add('is-empty');list.textContent=game.i18n.localize("SWFFG.UI.Pilotage.NoPendingEffects");}
}
async function refreshRows(){if(dialog?.rendered)renderSelected();}
function refreshDifficultyStatus(){
  if(!dialog?.rendered)return;
  const icon=dialog.element.querySelector('[data-pilotage-difficulty-status]');if(!icon)return;
  const active=game.settings.get(scope,'gmDifficulty')?.enabled===true;
  const label=active?game.i18n.localize("SWFFG.UI.Pilotage.CommonDifficultyActive"):game.i18n.localize("SWFFG.UI.Pilotage.CommonDifficultyInactive");
  icon.dataset.active=String(active);icon.setAttribute('aria-label',label);icon.title=label;icon.setAttribute('data-tooltip',label);
}
export async function showPilotageMJ(config,{saveDifficulty}){
  if(!game.user.isGM)return;
  if(dialog?.rendered){dialog.bringToFront();await refreshRows();Hooks.callAll('renderPilotageMJ',dialog);return dialog;}
  const dice=[['challenge',game.i18n.localize("SWFFG.UI.Pilotage.Challenge"),'red'],['difficulty',game.i18n.localize("SWFFG.UI.Pilotage.Difficulty"),'purple'],['setback',game.i18n.localize("SWFFG.UI.Pilotage.Setback"),'black']];
  dialog=new foundry.applications.api.DialogV2({
    classes:['starwarsffg','themed','ffg-calculation-dialog','ffg-gm-difficulty-dialog','pilotage-mj-dialog','pilotage-modern'],
    window:{title:game.i18n.localize("SWFFG.UI.Pilotage.GMControl"),resizable:true},position:{width:Math.max(320,Math.min(860,window.innerWidth-40)),height:Math.min(800,window.innerHeight-50),left:20,top:24},
    content:trusted(`<div class="pilotage-columns">
 <section class="pilotage-difficulty-section pilotage-card">
  <header class="pilotage-card-heading"><i class="fa-solid fa-dice" data-pilotage-difficulty-status role="img"></i><h3>${game.i18n.localize("SWFFG.UI.Pilotage.CommonDifficulty")}</h3></header>
  <div class="pilotage-difficulty-controls">
   <div class="pilotage-difficulty-top"><div class="gm-dice-preview" aria-label="${game.i18n.localize("SWFFG.UI.Pilotage.PreparedDice")}" aria-live="polite"></div></div>
   <table class="gm-dice-table"><tbody>${dice.map(([key,label,color])=>`<tr data-gm-die="${key}"><td class="pilotage-die-icon"><img src="systems/starwarsffg/images/dice/starwars/${color}.png" alt="${label}" width="20" height="20"></td><td class="pilotage-die-label">${label}</td><td class="pilotage-die-value"><button type="button" data-gm-count="${key}" aria-label="${game.i18n.format("SWFFG.UI.Pilotage.DiceCount",{dice:label})}">${config[key]}</button></td></tr>`).join('')}</tbody></table>
  </div>
  <p class="pilotage-note">${game.i18n.localize("SWFFG.UI.Pilotage.DiceClickHint")}</p>
  <label class="pilotage-enable"><span>${game.i18n.localize("SWFFG.UI.Pilotage.UseForAllRolls")}</span><input type="checkbox" name="pilotage-enabled" ${config.enabled?'checked':''}></label>
  <button type="button" class="pilotage-primary" data-pilotage-save-difficulty>${game.i18n.localize("SWFFG.UI.Pilotage.ApplyDifficulty")}</button>
  <p class="pilotage-note">${game.i18n.localize("SWFFG.UI.Pilotage.IndividualSetbackHint")}</p>
 </section>
 <section class="pilotage-scene-section">
  <section class="pilotage-editor pilotage-card" aria-label="${game.i18n.localize("SWFFG.UI.Pilotage.PrepareModifier")}">
   <header class="pilotage-editor-heading"><h3>${game.i18n.localize("SWFFG.UI.Pilotage.BonusesAndPenalties")}</h3><strong class="pilotage-target-title"></strong></header>
   <div class="pilotage-modifier-inputs">
    <label data-tooltip="${game.i18n.localize("SWFFG.UI.Pilotage.BoostDieHint")}"><span><img src="systems/starwarsffg/images/dice/starwars/blue.png" alt="" width="22" height="22">${game.i18n.localize("SWFFG.UI.Pilotage.Boost")}</span><input type="number" name="pilotage-boost" aria-label="${game.i18n.localize("SWFFG.UI.Pilotage.BoostDice")}" min="0" max="20" value="1"></label>
    <label data-tooltip="${game.i18n.localize("SWFFG.UI.Pilotage.SetbackDieHint")}"><span><img src="systems/starwarsffg/images/dice/starwars/black.png" alt="" width="22" height="22">${game.i18n.localize("SWFFG.UI.Pilotage.Setback")}</span><input type="number" name="pilotage-setback" aria-label="${game.i18n.localize("SWFFG.UI.Pilotage.SetbackDice")}" min="0" max="20" value="0"></label>
   </div>
   <div class="pilotage-assignment-row"><label class="pilotage-field">${game.i18n.localize("SWFFG.UI.Pilotage.Reason")} <input type="text" name="pilotage-reason" maxlength="160" placeholder="${game.i18n.localize("SWFFG.UI.Pilotage.ModifierReasonPlaceholder")}"></label>
   <label class="pilotage-field">${game.i18n.localize("SWFFG.UI.Pilotage.NextRoll")} <select name="pilotage-skill"><option value="">${game.i18n.localize("SWFFG.UI.Pilotage.AnySkill")}</option><option value="RangedLight">${game.i18n.localize("SWFFG.UI.Pilotage.RangedLight")}</option><option value="RangedHeavy">${game.i18n.localize("SWFFG.UI.Pilotage.RangedHeavy")}</option><option value="Melee">${game.i18n.localize("SWFFG.UI.Pilotage.Melee")}</option><option value="Brawl">${game.i18n.localize("SWFFG.UI.Pilotage.Brawl")}</option><option value="Gunnery">${game.i18n.localize("SWFFG.UI.Pilotage.Gunnery")}</option><option value="Medicine">${game.i18n.localize("SWFFG.UI.Pilotage.Medicine")}</option></select></label><button type="button" class="pilotage-primary" data-pilotage-assign>${game.i18n.localize("SWFFG.UI.Pilotage.AssignNextRoll")}</button></div>
   <div class="pilotage-pending" aria-live="polite"></div>
  </section>
 </section>
</div>`),
    buttons:[{action:'close',label:game.i18n.localize("SWFFG.UI.Pilotage.Close")}]
  });
  await dialog.render({force:true});
  const root=dialog.element;
  setupPilotageTabs(root,{onSelect:entry=>{selectedUuid=(entry?.token??entry?.participant?.token)?.uuid??null;renderSelected();}});
  setupPilotageAssets(root);
  const update=()=>{
    const preview=root.querySelector('.gm-dice-preview');preview.replaceChildren();
    for(const [key,label,color]of dice){root.querySelector(`[data-gm-count="${key}"]`).textContent=config[key];for(let i=0;i<config[key];i++){const img=document.createElement('img');img.src=`systems/starwarsffg/images/dice/starwars/${color}.png`;img.alt=label;img.width=24;img.height=24;preview.append(img);}}
  };
  for(const row of root.querySelectorAll('[data-gm-die]')){row.addEventListener('click',event=>{event.preventDefault();config[row.dataset.gmDie]++;update();});row.addEventListener('contextmenu',event=>{event.preventDefault();config[row.dataset.gmDie]=Math.max(0,config[row.dataset.gmDie]-1);update();});}
  root.querySelector('[data-pilotage-save-difficulty]').addEventListener('click',async()=>{config.enabled=root.querySelector('[name=pilotage-enabled]').checked;await saveDifficulty(config);refreshDifficultyStatus();ui.notifications.info(game.i18n.localize("SWFFG.UI.Pilotage.CommonDifficultySaved"));});
  root.querySelector('[data-pilotage-assign]').addEventListener('click',async()=>{
    const button=root.querySelector('[data-pilotage-assign]');button.disabled=true;
    try{await addPilotageModifier(selectedUuid,{boost:root.querySelector('[name=pilotage-boost]').value,setback:root.querySelector('[name=pilotage-setback]').value,skill:root.querySelector('[name=pilotage-skill]').value,reason:root.querySelector('[name=pilotage-reason]').value});await refreshRows();ui.notifications.info(game.i18n.localize("SWFFG.UI.Pilotage.ModifierAssigned"));}
    catch(error){ui.notifications.error(error.message);}finally{button.disabled=!tokenByUuid(selectedUuid);}
  });
  refreshDifficultyStatus();update();await refreshRows();Hooks.callAll('renderPilotageMJ',dialog);return dialog;
}
if(typeof Hooks!=='undefined'){
Hooks.on('ffgGMDifficultyChanged',refreshDifficultyStatus);
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
  if(current.used.includes(id)){ui.notifications.info(game.i18n.localize("SWFFG.UI.Pilotage.AidAlreadyReceived"));return;}
  const candidates=(globalThis.canvas?.scene?.tokens.contents??[]).filter(token=>token.actor?.isOwner&&(game.user.isGM||token.object?.visible));
  if(!candidates.length)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.NoAidRecipient"));
  const controlled=(canvas.tokens?.controlled??[]).map(token=>token.document).filter(token=>candidates.includes(token));
  const character=candidates.filter(token=>token.actor.uuid===game.user.character?.uuid);
  let token=controlled.length===1?controlled[0]:character.length===1?character[0]:candidates.length===1?candidates[0]:null;
  if(!token){
    const uuid=await foundry.applications.api.DialogV2.wait({window:{title:game.i18n.localize("SWFFG.UI.Pilotage.AidRecipient")},content:`<label>${game.i18n.localize("SWFFG.UI.Pilotage.SceneCharacter")}<select name="recipient-token">${candidates.map(token=>`<option value="${enc(token.uuid)}">${enc(token.name)} [${enc(token.id.slice(-4))}] · ${token.x}, ${token.y}</option>`).join('')}</select></label>`,buttons:[{action:'accept',label:game.i18n.localize("SWFFG.UI.Pilotage.PrepareAid"),callback:(_event,button)=>button.form.elements['recipient-token'].value},{action:'cancel',label:game.i18n.localize("SWFFG.UI.Pilotage.Cancel"),callback:()=>null}]});
    if(!uuid)return;token=tokenByUuid(uuid);
  }
  if(!token?.actor?.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.AidRecipientUnavailable"));
  const fresh=game.messages.get(message.id)?.getFlag(scope,'combatActions')?.entries.find(value=>value.id===entry.id);
  if(!fresh||fresh.undone||fresh.recipient!==game.user.id)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.AidUnavailable"));
  await serialize(token.actor,async()=>{
    const all=entriesFor(token.actor);
    if(!all.some(effect=>effect.id===id))await token.actor.setFlag(scope,flag,[...all,{id,subjectUuid:token.uuid,boost:1,setback:0,skill:null,reason:game.i18n.localize("SWFFG.UI.Pilotage.AidFromRoll"),sourceAid:{message:message.id,entry:entry.id},state:'pending',author:game.user.id}]);
  });
  await serialize(game.user,async()=>{
    const current=structuredClone(game.user.getFlag(scope,'rollAid')??{pending:[],used:[]});
    current.pending=current.pending.filter(value=>value.id!==id);
    if(!current.used.includes(id))current.used.push(id);
    await game.user.setFlag(scope,'rollAid',current);
  });
  ui.notifications.info(game.i18n.format("SWFFG.UI.Pilotage.AidPrepared",{name:token.name}));
}

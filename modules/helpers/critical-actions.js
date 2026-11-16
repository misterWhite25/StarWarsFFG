import {vehicleMinionGroup,vehicleMinionCriticalChange} from './vehicle-minion-group.mjs';
import { chooseTokenTarget } from './token-target-picker.js';
import { talentRank } from './roll-talents.js';
import { captureCriticalTarget, locateCriticalTarget, criticalItemForUndo } from './critical-target.js';

const scope='starwarsffg', key='combatActions';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const getState=message=>foundry.utils.deepClone(message.getFlag(scope,key)??{entries:[]});
const locks=new Set();
const canEdit=message=>game.user.isGM||message.author?.id===game.user.id;
const criticalType=actor=>actor.type==='vehicle'?'criticaldamage':'criticalinjury';

export function criticalModifiers(actor,attacker,item,activations=1,extra=0,useLethal=true) {
  const vehicle=actor.type==='vehicle';
  const previous=(actor.items?.contents??[]).filter(item=>item.type===criticalType(actor)&&item.getFlag?.(scope,'componentCritical')!==true).length*10;
  const qualities=Object.values(item?.system?.adjusteditemmodifier??item?.system?.itemmodifier??[]);
  const vicious=qualities.filter(q=>/^(vicious|cruel)( quality(?: \d+)?)?$/i.test(String(q?.name??'').trim()))
    .reduce((sum,q)=>sum+number(q.system?.rank_current??q.system?.rank),0)*10;
  const lethal=vehicle||!useLethal?0:10*talentRank(attacker,['Lethal Blows','Coup mortel','Coups mortels']);
  const durable=vehicle?0:-10*talentRank(actor,['Durable','Dur au Mal']);
  const additional=Math.max(0,activations-1)*10;
  const hunt=item?.flags?.starwarsffg?.hunterCritical,hunter=!vehicle&&hunt&&typeof actor.uuid==='string'&&hunt.targetUuid===actor.uuid?Math.max(0,number(hunt.amount)):0;
  return {previous,vicious,lethal,durable,additional,extra,...(hunter?{hunter}:{}),total:previous+vicious+lethal+durable+additional+extra+hunter};
}

export function criticalItemData(result,total,origin) {
  const data=result.toObject?result.toObject():result;
  const severity=number(result.getFlag?.(scope,'severity')??data.flags?.starwarsffg?.severity??data.flags?.['swffg-reference-tables-fr']?.severity);
  if(!data.name||!Number.isInteger(severity)||severity<1||severity>4) throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.ThisTableResultHasNoValidNameAnd"));
  return {name:data.name,type:origin.kind==='vehicle'?'criticaldamage':'criticalinjury',img:data.img||'icons/svg/blood.svg',
    system:{description:data.description??data.text??'',min:number(data.range?.[0]),max:number(data.range?.[1]),severity},
    flags:{starwarsffg:{criticalOrigin:{...origin,total}}}};
}

async function tablesFor(kind) {
  const options=[];
  for(const table of game.tables.contents) {
    if(table.visible!==false&&table.getFlag(scope,'criticalTable')===true&&(table.getFlag(scope,'criticalKind')??'character')===kind)
      options.push({uuid:table.uuid,name:table.name,language:table.getFlag(scope,'language'),world:true});
  }
  for(const pack of game.packs) {
    if(pack.documentName!=='RollTable'||pack.visible===false)continue;
    const index=await pack.getIndex({fields:['flags.starwarsffg']});
    for(const table of index) {
      const flags=table.flags?.starwarsffg;
      if(flags?.criticalTable===true&&(flags.criticalKind??'character')===kind)
        options.push({uuid:`Compendium.${pack.collection}.RollTable.${table._id}`,name:table.name,language:flags.language});
    }
  }
  return options.sort((a,b)=>Number(b.language===game.i18n.lang)-Number(a.language===game.i18n.lang)||Number(Boolean(b.world))-Number(Boolean(a.world)));
}
function groupEntries(message,ids) {
  const entries=getState(message).entries.filter(entry=>ids.includes(entry.id)&&entry.effect==='critical'&&!entry.undone);
  if(!entries.length||entries.length!==ids.length)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.ThisCriticalSpendingHasChanged"));
  return entries;
}
async function setResolution(message,ids,resolution) {
  const current=getState(message);
  for(const id of ids) {
    const entry=current.entries.find(entry=>entry.id===id);
    if(!entry||entry.undone)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.ThisCriticalSpendingWasUndone"));
    entry.criticalResolution=foundry.utils.deepClone(resolution);
  }
  await message.setFlag(scope,key,current);
}

async function attackingActor(message) {
  if(message.speaker?.scene&&message.speaker?.token)return (await fromUuid(`Scene.${message.speaker.scene}.Token.${message.speaker.token}`))?.actor;
  return game.actors.get(message.speaker?.actor);
}

export async function resolveCritical(message,ids) {
  if(!canEdit(message)||locks.has(message.id))return;
  locks.add(message.id);
  try {
    const entries=groupEntries(message,ids),saved=entries[0].criticalResolution;
    if(saved?.status==='applied')return;
    const item=message.rolls?.find(roll=>roll.hasFFG)?.data;
    const results=message.rolls?.find(roll=>roll.hasFFG)?.ffg;
    if(!['weapon','shipweapon'].includes(item?.type)||number(results?.success)<=0)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.ACriticalRequiresASuccessfulWeaponAttack"));
    if(saved?.status==='rolled')return await applyRolledCritical(message,ids,saved);
    const tokens=(canvas.tokens?.placeables??[]).filter(token=>token.actor&&(game.user.isGM||(token.visible&&!token.document.hidden)));
    if(!tokens.length)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.NoVisibleTargetOnTheScene"));
    const target=saved?.target??[...game.user.targets].at(-1)?.document.uuid??canvas.tokens.controlled?.at(-1)?.document.uuid??tokens[0].document.uuid;
    const choice=await chooseTokenTarget(tokens,{requested:target,title:game.i18n.localize("SWFFG.UI.Medical.CriticalActions.CriticalTarget"),confirmLabel:game.i18n.localize("SWFFG.UI.Medical.CriticalActions.Continue")});
    if(!choice)return;
    const token=await fromUuid(choice),actor=token?.actor;
    if(!actor||!tokens.some(candidate=>candidate.document.uuid===choice))throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.TargetUnavailable"));
    const targetIdentity=captureCriticalTarget(token);
    if(saved?.targetIdentity&&saved.target===choice)await locateCriticalTarget(saved.targetIdentity,fromUuid,{requireOwner:false});
    const kind=actor.type==='vehicle'?'vehicle':'character',vehicleGroup=vehicleMinionGroup(actor),minion=actor.type==='minion'||vehicleGroup.enabled;
    const tables=minion?[]:await tablesFor(kind);
    if(!minion&&!tables.length)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.NoAccessibleCompatibleCriticalTableImportTheInjury"));
    const attacker=await attackingActor(message),activations=entries.reduce((sum,entry)=>sum+Math.max(1,number(entry.quantity)),0);
    const modifiers=criticalModifiers(actor,attacker,item,activations);
    const choiceTable=saved?.table??tables[0]?.uuid;
    const priorHit=getState(message).entries.some(entry=>!entry.undone&&!ids.includes(entry.id)&&entry.effect==='critical'&&entry.criticalResolution?.target===choice&&['rolled','applied'].includes(entry.criticalResolution?.status));
    const breakdown=[["SWFFG.UI.Medical.CriticalActions.PreviousCriticals",modifiers.previous],["SWFFG.UI.Medical.CriticalActions.ExtraActivations",modifiers.additional],["SWFFG.UI.Medical.CriticalActions.Vicious",modifiers.vicious],["SWFFG.UI.Medical.CriticalActions.LethalBlows",modifiers.lethal],["SWFFG.UI.Medical.CriticalActions.CriticalResistance",modifiers.durable]]
      .filter(([,value])=>value!==0).map(([key,value])=>`${game.i18n.localize(key)} : ${value>0?'+':''}${value}`).join(' · ')||game.i18n.localize("SWFFG.UI.Medical.CriticalActions.NoAutomaticModifiers");
    const confirmed=await foundry.applications.api.DialogV2.prompt({window:{title:game.i18n.localize("SWFFG.UI.Medical.CriticalActions.ResolveCritical")},classes:['starwarsffg','themed'],position:{width:520},rejectClose:false,
      content:`<p><strong>${esc(token.name)}</strong></p>${minion?`<p>${game.i18n.localize(vehicleGroup.enabled?'SWFFG.VehicleMinion.CriticalDescription':"SWFFG.UI.Medical.CriticalActions.ACriticalDefeatsOneGroupMinionWithoutA")}</p>`:
        `<p>${esc(breakdown)}</p>${modifiers.lethal?`<label><input name="use-lethal" type="checkbox" checked> ${game.i18n.localize("SWFFG.UI.Medical.CriticalActions.UseLethalBlows")} (+${modifiers.lethal})</label>`:''}<p>1d100 ${modifiers.total>=0?'+':''}${modifiers.total} (${game.i18n.localize("SWFFG.UI.Medical.CriticalActions.Minimum")})</p><label>${game.i18n.localize("SWFFG.UI.Medical.CriticalActions.Table")}<select name="table">${tables.map(table=>`<option value="${esc(table.uuid)}" ${table.uuid===choiceTable?'selected':''}>${esc(table.name)}</option>`).join('')}</select></label><label>${game.i18n.localize("SWFFG.UI.Medical.CriticalActions.OtherModifier")}<input name="extra" type="number" step="1" value="${number(saved?.extra)}"></label>`}
        <label><input name="confirmed" type="checkbox"> ${game.i18n.localize("SWFFG.UI.Medical.CriticalActions.TheTargetTakesDamagePastSoakArmorThe")}</label>
        ${priorHit?`<label><input name="new-hit" type="checkbox"> ${game.i18n.localize("SWFFG.UI.Medical.CriticalActions.ASeparateHitFromThisAttackCausesThis")}</label>`:''}
        <p>${actor.isOwner?game.i18n.localize("SWFFG.UI.Medical.CriticalActions.TheResultWillBeAddedToTheSheet"):game.i18n.localize("SWFFG.UI.Medical.CriticalActions.TheRequestWillBeSentToTheGM")}</p>`,
      ok:{label:actor.isOwner?game.i18n.localize("SWFFG.UI.Medical.CriticalActions.RollAndApply"):game.i18n.localize("SWFFG.UI.Medical.CriticalActions.RequestGM"),callback:(_e,_b,app)=>({useLethal:app.element.querySelector('[name=use-lethal]')?.checked??false,confirmed:app.element.querySelector('[name=confirmed]').checked,newHit:app.element.querySelector('[name=new-hit]')?.checked,table:app.element.querySelector('[name=table]')?.value,extra:Number(app.element.querySelector('[name=extra]')?.value??0)})}});
    if(!confirmed)return;
    if(!confirmed.confirmed||!Number.isSafeInteger(confirmed.extra)||Math.abs(confirmed.extra)>999000)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.ConfirmTheConditionsAndEnterAValidInteger"));
    if(priorHit&&!confirmed.newHit)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.ACriticalIsAlreadyResolvedOnThisTarget"));
    groupEntries(message,ids);
    await locateCriticalTarget(targetIdentity,fromUuid,{requireOwner:false});
    if(!actor.isOwner) {await setResolution(message,ids,{status:'requested',target:choice,targetIdentity,table:confirmed.table??null,extra:confirmed.extra,useLethal:confirmed.useLethal});return;}
    if(vehicleGroup.enabled){
      const change=vehicleMinionCriticalChange(actor);
      await setResolution(message,ids,{status:'rolled',target:choice,targetIdentity,minion:true,vehicleGroup:{count:vehicleGroup.count,hullPerVehicle:vehicleGroup.hullPerVehicle},change,summary:game.i18n.localize('SWFFG.VehicleMinion.CriticalResult')});
      return await applyRolledCritical(message,ids,groupEntries(message,ids)[0].criticalResolution);
    }
    if(actor.type==='minion') {
      const unit=number(actor.system.unit_wounds?.value),before=number(actor.system.stats?.wounds?.value);
      if(unit<=0||number(actor.system.quantity?.value)<=0)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.ThisGroupHasNoLivingMinionOrIts"));
      const change={actor:actor.uuid,path:'system.stats.wounds.value',before,after:before+unit+(before===0?1:0)};
      await setResolution(message,ids,{status:'rolled',target:choice,targetIdentity,minion:true,change,summary:game.i18n.localize("SWFFG.UI.Medical.CriticalActions.OneMinionDefeated")});
      return await applyRolledCritical(message,ids,groupEntries(message,ids)[0].criticalResolution);
    }
    if(!tables.some(table=>table.uuid===confirmed.table))throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.TableUnavailable"));
    const table=await fromUuid(confirmed.table);
    const fresh=criticalModifiers(actor,attacker,item,activations,confirmed.extra,confirmed.useLethal);
    const roll=await new Roll('max(1, 1d100 + @modifier)',{modifier:fresh.total}).evaluate();
    const result=table.getResultsForRoll(roll.total)[0];
    if(!result)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.TheTableHasNoResultForThisTotal"));
    const origin={message:message.uuid,group:ids.slice().sort().join(':'),kind};
    const data=criticalItemData(result,roll.total,origin);
    const resolution={status:'rolled',target:choice,targetIdentity,data,roll:JSON.stringify(roll),table:table.uuid,extra:confirmed.extra,modifiers:fresh,summary:`${data.name} (${roll.total})`};
    await setResolution(message,ids,resolution);
    return await applyRolledCritical(message,ids,resolution);
  } finally {locks.delete(message.id);}
}

async function criticalActor(message,ids,resolution) {
  if(resolution.targetIdentity)return locateCriticalTarget(resolution.targetIdentity,fromUuid);
  const token=await fromUuid(resolution.target),actor=token?.actor;
  if(!actor?.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.TheActorOwnerOrGMMustReviewThe"));
  // Older minion rolls recorded their actor UUID on the wound change.
  if (resolution.minion && resolution.change?.actor) {
    if (resolution.change.actor !== actor.uuid) throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.TheMinionGroupActorHasChanged"));
    return actor;
  }
  const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:game.i18n.localize("SWFFG.UI.Medical.CriticalActions.ReviewAnOldCritical")},classes:['starwarsffg','themed'],rejectClose:false,
    content:`<p>${game.i18n.localize("SWFFG.UI.Medical.CriticalActions.ThisOldResultDidNotRetainItsActor")}</p><p><strong>${esc(actor.name)}</strong></p>`,
    yes:{label:game.i18n.localize("SWFFG.UI.Medical.CriticalActions.ConfirmThisActor")},no:{label:game.i18n.localize("SWFFG.UI.Medical.CriticalActions.Cancel")}});
  if(!confirmed)return null;
  resolution.targetIdentity=captureCriticalTarget(token);
  await locateCriticalTarget(resolution.targetIdentity,fromUuid);
  await setResolution(message,ids,resolution);
  return actor;
}

export async function applyRolledCritical(message,ids,resolution) {
  if(!canEdit(message)||message.isContentVisible===false)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.ThisUserCannotEditThisResult"));
  const actor=await criticalActor(message,ids,resolution);if(!actor)return;
  const token=await fromUuid(resolution.target);
  const entries=groupEntries(message,ids);
  if(entries[0].criticalResolution?.status==='applied')return entries[0].criticalResolution;
  let applied={...resolution,status:'applied'};
  if(!resolution.minion&&unstoppablePreventsCritical(actor,resolution.data?.flags?.starwarsffg?.criticalOrigin?.total)){
    applied={...applied,negated:true,summary:game.i18n.localize("SWFFG.UI.Medical.CriticalActions.UnstoppablePrevented")};await setResolution(message,ids,applied);return applied;
  }

  if(resolution.minion) {
    validateVehicleGroupCritical(actor,resolution);
    const current=number(resolution.change.path.split('.').reduce((value,key)=>value?.[key],actor));
    if(current!==resolution.change.after) {
      if(current!==resolution.change.before)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.TheGroupWoundsChangedCheckTheSheetBefore"));
      await actor.update({[resolution.change.path]:resolution.change.after});
    }
  } else {
    await locateCriticalTarget(resolution.targetIdentity,fromUuid);
    const origin=resolution.data.flags.starwarsffg.criticalOrigin;
    let injury=actor.items.contents.find(item=>item.getFlag?.(scope,'criticalOrigin')?.message===origin.message&&item.getFlag?.(scope,'criticalOrigin')?.group===origin.group);
    if(!injury) [injury]=await actor.createEmbeddedDocuments('Item',[resolution.data]);
    applied.itemId=injury.id;
    applied.snapshot={name:injury.name,system:foundry.utils.deepClone(injury.toObject().system)};
  }
  await setResolution(message,ids,applied);
  if(resolution.roll) {
    try {await ChatMessage.create({author:game.user.id,speaker:message.speaker,whisper:message.whisper??[],blind:message.blind??false,style:CONST.CHAT_MESSAGE_STYLES.ROLL,
      rolls:[Roll.fromJSON(resolution.roll)],content:`<p><strong>${esc(token?.name??actor.name)} - ${esc(resolution.summary)}</strong></p>${resolution.data.system.description}`});}
    catch {ui.notifications.warn(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.CriticalAppliedItsResultRemainsVisibleOnThe"));}
  }
  return applied;
}

export async function undoCritical(message,entry) {
  if(!canEdit(message)||message.isContentVisible===false)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.ThisUserCannotEditThisResult"));
  const resolution=entry.criticalResolution;
  const current=getState(message);
  const entries=current.entries.filter(candidate=>candidate.effect==='critical'&&!candidate.undone&&(entry.batch?candidate.batch===entry.batch:candidate.id===entry.id));
  if(resolution?.status==='applied'&&!resolution.negated) {
    const ids=entries.map(candidate=>candidate.id);
    const actor=await criticalActor(message,ids,resolution);if(!actor)return;
    if(resolution.minion) {
      validateVehicleGroupCritical(actor,resolution);
      if(number(resolution.change.path.split('.').reduce((value,key)=>value?.[key],actor))!==resolution.change.after)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalActions.WoundsChangedSinceTheCritical"));
      await actor.update({[resolution.change.path]:resolution.change.before});
    } else {
      const item=criticalItemForUndo(actor,resolution);
      if(item)await actor.deleteEmbeddedDocuments('Item',[item.id]);
    }
  }
  for(const candidate of entries)candidate.undone=true;
  await message.setFlag(scope,key,current);
}

export function unstoppablePreventsCritical(actor,total){return actor?.type!=='vehicle'&&Number(total)===1&&talentRank(actor,['Unstoppable','Même pas mal'])>0;}

function validateVehicleGroupCritical(actor,resolution){
  if(!resolution.vehicleGroup)return;
  const current=vehicleMinionGroup(actor),saved=resolution.vehicleGroup;
  if(!current.enabled||current.count!==saved.count||current.hullPerVehicle!==saved.hullPerVehicle)throw Error(game.i18n.localize('SWFFG.VehicleMinion.GroupChanged'));
}

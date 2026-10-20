import { talentRank } from './roll-talents.js';

const scope='starwarsffg', key='combatActions';
const t=(fr,en)=>game.i18n.lang==='fr'?fr:en;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const getState=message=>foundry.utils.deepClone(message.getFlag(scope,key)??{entries:[]});
const locks=new Set();
const canEdit=message=>game.user.isGM||message.author?.id===game.user.id;
const criticalType=actor=>actor.type==='vehicle'?'criticaldamage':'criticalinjury';

export function criticalModifiers(actor,attacker,item,activations=1,extra=0) {
  const vehicle=actor.type==='vehicle';
  const previous=(actor.items?.contents??[]).filter(item=>item.type===criticalType(actor)&&item.getFlag?.(scope,'componentCritical')!==true).length*10;
  const qualities=Object.values(item?.system?.adjusteditemmodifier??item?.system?.itemmodifier??[]);
  const vicious=qualities.filter(q=>/^(vicious|cruel)( quality(?: \d+)?)?$/i.test(String(q?.name??'').trim()))
    .reduce((sum,q)=>sum+number(q.system?.rank_current??q.system?.rank),0)*10;
  const lethal=vehicle?0:10*talentRank(attacker,['Lethal Blows','Coup mortel','Coups mortels']);
  const durable=vehicle?0:-10*talentRank(actor,['Durable','Dur au Mal']);
  const additional=Math.max(0,activations-1)*10;
  return {previous,vicious,lethal,durable,additional,extra,total:previous+vicious+lethal+durable+additional+extra};
}

export function criticalItemData(result,total,origin) {
  const data=result.toObject?result.toObject():result;
  const severity=number(result.getFlag?.(scope,'severity')??data.flags?.starwarsffg?.severity??data.flags?.['swffg-reference-tables-fr']?.severity);
  if(!data.name||!Number.isInteger(severity)||severity<1||severity>4) throw Error(t('Le résultat de cette table ne contient pas un nom et une gravité valides.','This table result has no valid name and severity.'));
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
  if(!entries.length||entries.length!==ids.length)throw Error(t('Cette dépense critique a changé.','This critical spending has changed.'));
  return entries;
}
async function setResolution(message,ids,resolution) {
  const current=getState(message);
  for(const id of ids) {
    const entry=current.entries.find(entry=>entry.id===id);
    if(!entry||entry.undone)throw Error(t('Cette dépense critique a été annulée.','This critical spending was undone.'));
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
    if(!['weapon','shipweapon'].includes(item?.type)||number(results?.success)<=0)throw Error(t('Un critique exige une attaque réussie avec une arme.','A critical requires a successful weapon attack.'));
    if(saved?.status==='rolled')return await applyRolledCritical(message,ids,saved);
    const tokens=(canvas.tokens?.placeables??[]).filter(token=>token.actor&&(game.user.isGM||(token.visible&&!token.document.hidden)));
    if(!tokens.length)throw Error(t('Aucune cible visible sur la scène.','No visible target on the scene.'));
    const target=saved?.target??[...game.user.targets].at(-1)?.document.uuid??canvas.tokens.controlled?.at(-1)?.document.uuid??tokens[0].document.uuid;
    const choice=await foundry.applications.api.DialogV2.prompt({window:{title:t('Cible du critique','Critical target')},classes:['starwarsffg','themed'],position:{width:440},rejectClose:false,
      content:`<label>${t('Cible','Target')}<select name="target">${tokens.map(token=>`<option value="${esc(token.document.uuid)}" ${token.document.uuid===target?'selected':''}>${esc(token.name)}</option>`).join('')}</select></label>`,
      ok:{label:t('Continuer','Continue'),callback:(_e,_b,app)=>app.element.querySelector('[name=target]').value}});
    if(!choice)return;
    const token=await fromUuid(choice),actor=token?.actor;
    if(!actor||!tokens.some(candidate=>candidate.document.uuid===choice))throw Error(t('Cible indisponible.','Target unavailable.'));
    const kind=actor.type==='vehicle'?'vehicle':'character';
    const tables=actor.type==='minion'?[]:await tablesFor(kind);
    if(actor.type!=='minion'&&!tables.length)throw Error(t('Aucune table critique compatible accessible. Importe la table de blessures ou d’avaries du compendium.','No accessible compatible critical table. Import the injury or vehicle critical table from the compendium.'));
    const attacker=await attackingActor(message),activations=entries.reduce((sum,entry)=>sum+Math.max(1,number(entry.quantity)),0);
    const modifiers=criticalModifiers(actor,attacker,item,activations);
    const choiceTable=saved?.table??tables[0]?.uuid;
    const priorHit=getState(message).entries.some(entry=>!entry.undone&&!ids.includes(entry.id)&&entry.effect==='critical'&&entry.criticalResolution?.target===choice&&['rolled','applied'].includes(entry.criticalResolution?.status));
    const breakdown=[['Critiques existants','Existing criticals',modifiers.previous],['Activations supplémentaires','Extra activations',modifiers.additional],['Cruel','Vicious',modifiers.vicious],['Coups mortels','Lethal Blows',modifiers.lethal],['Résistance aux critiques','Critical resistance',modifiers.durable]]
      .filter(([, ,value])=>value!==0).map(([fr,en,value])=>`${t(fr,en)} : ${value>0?'+':''}${value}`).join(' · ')||t('Aucun modificateur automatique.','No automatic modifiers.');
    const confirmed=await foundry.applications.api.DialogV2.prompt({window:{title:t('Résoudre le critique','Resolve critical')},classes:['starwarsffg','themed'],position:{width:520},rejectClose:false,
      content:`<p><strong>${esc(token.name)}</strong></p>${actor.type==='minion'?`<p>${t('Un critique élimine un sbire du groupe, sans tirage de table.','A critical defeats one group minion, without a table roll.')}</p>`:
        `<p>${esc(breakdown)}</p><p>1d100 ${modifiers.total>=0?'+':''}${modifiers.total} (${t('minimum 1','minimum 1')})</p><label>${t('Table','Table')}<select name="table">${tables.map(table=>`<option value="${esc(table.uuid)}" ${table.uuid===choiceTable?'selected':''}>${esc(table.name)}</option>`).join('')}</select></label><label>${t('Autre modificateur','Other modifier')}<input name="extra" type="number" step="1" value="${number(saved?.extra)}"></label>`}
        <label><input name="confirmed" type="checkbox"> ${t('La cible subit des dégâts après encaissement / blindage ; les conditions du critique sont remplies.','The target takes damage past soak / armor; the critical conditions are met.')}</label>
        ${priorHit?`<label><input name="new-hit" type="checkbox"> ${t('Une autre touche de cette attaque inflige ce critique. Les activations supplémentaires d’une même touche doivent être groupées avant le tirage.','A separate hit from this attack causes this critical. Extra activations on the same hit must be grouped before rolling.')}</label>`:''}
        <p>${actor.isOwner?t('Le résultat sera ajouté à la fiche ; ses conséquences particulières restent à résoudre.','The result will be added to the sheet; specific consequences still need resolution.'):t('La demande sera transmise au MJ pour validation.','The request will be sent to the GM for review.')}</p>`,
      ok:{label:actor.isOwner?t('Lancer et appliquer','Roll and apply'):t('Demander au MJ','Request GM'),callback:(_e,_b,app)=>({confirmed:app.element.querySelector('[name=confirmed]').checked,newHit:app.element.querySelector('[name=new-hit]')?.checked,table:app.element.querySelector('[name=table]')?.value,extra:Number(app.element.querySelector('[name=extra]')?.value??0)})}});
    if(!confirmed)return;
    if(!confirmed.confirmed||!Number.isSafeInteger(confirmed.extra)||Math.abs(confirmed.extra)>999000)throw Error(t('Confirme les conditions et saisis un modificateur entier valide.','Confirm the conditions and enter a valid integer modifier.'));
    if(priorHit&&!confirmed.newHit)throw Error(t('Un critique est déjà résolu sur cette cible : confirme une touche distincte.','A critical is already resolved on this target: confirm a separate hit.'));
    groupEntries(message,ids);
    if(!actor.isOwner) {await setResolution(message,ids,{status:'requested',target:choice,table:confirmed.table??null,extra:confirmed.extra});return;}
    if(actor.type==='minion') {
      const unit=number(actor.system.unit_wounds?.value),before=number(actor.system.stats?.wounds?.value);
      if(unit<=0||number(actor.system.quantity?.value)<=0)throw Error(t('Ce groupe ne possède aucun sbire vivant ou son seuil est incomplet.','This group has no living minion or its threshold is incomplete.'));
      const change={actor:actor.uuid,path:'system.stats.wounds.value',before,after:before+unit+(before===0?1:0)};
      await setResolution(message,ids,{status:'rolled',target:choice,minion:true,change,summary:t('Un sbire éliminé','One minion defeated')});
      return await applyRolledCritical(message,ids,groupEntries(message,ids)[0].criticalResolution);
    }
    if(!tables.some(table=>table.uuid===confirmed.table))throw Error(t('Table indisponible.','Table unavailable.'));
    const table=await fromUuid(confirmed.table);
    const fresh=criticalModifiers(actor,attacker,item,activations,confirmed.extra);
    const roll=await new Roll('max(1, 1d100 + @modifier)',{modifier:fresh.total}).evaluate();
    const result=table.getResultsForRoll(roll.total)[0];
    if(!result)throw Error(t('La table ne contient aucun résultat pour ce total.','The table has no result for this total.'));
    const origin={message:message.uuid,group:ids.slice().sort().join(':'),kind};
    const data=criticalItemData(result,roll.total,origin);
    const resolution={status:'rolled',target:choice,data,roll:JSON.stringify(roll),table:table.uuid,extra:confirmed.extra,modifiers:fresh,summary:`${data.name} (${roll.total})`};
    await setResolution(message,ids,resolution);
    return await applyRolledCritical(message,ids,resolution);
  } finally {locks.delete(message.id);}
}

export async function applyRolledCritical(message,ids,resolution) {
  if(!canEdit(message)||message.isContentVisible===false)throw Error(t('Ce résultat ne peut pas être modifié par cet utilisateur.','This user cannot edit this result.'));
  const token=await fromUuid(resolution.target),actor=token?.actor;
  if(!actor?.isOwner)throw Error(t('Le propriétaire ou le MJ doit appliquer ce critique.','The owner or GM must apply this critical.'));
  const entries=groupEntries(message,ids);
  if(entries[0].criticalResolution?.status==='applied')return entries[0].criticalResolution;
  let applied={...resolution,status:'applied'};
  if(resolution.minion) {
    const current=number(actor.system.stats.wounds.value);
    if(current!==resolution.change.after) {
      if(current!==resolution.change.before)throw Error(t('Les blessures du groupe ont changé. Vérifie la fiche avant de reprendre.','The group wounds changed. Check the sheet before resuming.'));
      await actor.update({[resolution.change.path]:resolution.change.after});
    }
  } else {
    const origin=resolution.data.flags.starwarsffg.criticalOrigin;
    let injury=actor.items.contents.find(item=>item.getFlag?.(scope,'criticalOrigin')?.message===origin.message&&item.getFlag?.(scope,'criticalOrigin')?.group===origin.group);
    if(!injury) [injury]=await actor.createEmbeddedDocuments('Item',[resolution.data]);
    applied.itemId=injury.id;
    applied.snapshot={name:injury.name,system:foundry.utils.deepClone(injury.toObject().system)};
  }
  await setResolution(message,ids,applied);
  if(resolution.roll) {
    try {await ChatMessage.create({author:game.user.id,speaker:message.speaker,whisper:message.whisper??[],blind:message.blind??false,style:CONST.CHAT_MESSAGE_STYLES.ROLL,
      rolls:[Roll.fromJSON(resolution.roll)],content:`<p><strong>${esc(token.name)} — ${esc(resolution.summary)}</strong></p>${resolution.data.system.description}`});}
    catch {ui.notifications.warn(t('Critique appliqué ; son résultat reste visible sur le jet d’origine.','Critical applied; its result remains visible on the original roll.'));}
  }
  return applied;
}

export async function undoCritical(message,entry) {
  const resolution=entry.criticalResolution;
  const current=getState(message);
  const entries=current.entries.filter(candidate=>candidate.effect==='critical'&&!candidate.undone&&(entry.batch?candidate.batch===entry.batch:candidate.id===entry.id));
  if(resolution?.status==='applied') {
    const actor=(await fromUuid(resolution.target))?.actor;
    if(!actor?.isOwner)throw Error(t('Le propriétaire ou le MJ doit annuler ce critique.','The owner or GM must undo this critical.'));
    if(resolution.minion) {
      if(number(actor.system.stats.wounds.value)!==resolution.change.after)throw Error(t('Les blessures ont changé depuis le critique.','Wounds changed since the critical.'));
      await actor.update({[resolution.change.path]:resolution.change.before});
    } else {
      const item=actor.items.get(resolution.itemId);
      if(item&&(item.name!==resolution.snapshot.name||JSON.stringify(item.toObject().system)!==JSON.stringify(resolution.snapshot.system)))
        throw Error(t('La blessure critique a été modifiée depuis. Vérifie la fiche avant d’annuler.','The critical injury was changed. Check the sheet before undoing.'));
      if(item)await actor.deleteEmbeddedDocuments('Item',[item.id]);
    }
  }
  for(const candidate of entries)candidate.undone=true;
  await message.setFlag(scope,key,current);
}

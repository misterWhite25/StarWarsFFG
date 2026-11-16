import {initiativeContext} from '../space-combat/initiative.mjs';
const scope='starwarsffg',queues=new Map(),waiting=new Map();
const flag=(combat,key)=>combat?.getFlag(scope,key);
const serial=(combat,fn)=>{const next=(queues.get(combat.id)??Promise.resolve()).catch(()=>{}).then(fn);queues.set(combat.id,next);return next;};
export function seedClaims(turns,claims={},seeded=[]) {
  const next={...claims},done=new Set(seeded),used=new Set(Object.values(next));
  for(const slot of turns) {
    if(!slot.actor||done.has(slot.id))continue;
    if(!Object.hasOwn(next,slot.id)&&!used.has(slot.id)){next[slot.id]=slot.id;used.add(slot.id);}
    done.add(slot.id);
  }
  return {claims:next,seeded:[...done]};
}
export function swapClaims(claims,slotId,participantId) {
  const next={...claims},previous=Object.keys(next).find(key=>next[key]===participantId),old=next[slotId];
  if(previous&&previous!==slotId){if(old)next[previous]=old;else delete next[previous];}
  next[slotId]=participantId;return next;
}
export function hasActed(combat,participant) {
  if(!combat?.started||!participant)return false;
  const ground=participant.token?.getFlag?.(scope,'groundMovementState');
  if(ground?.context===combat.id+':'+combat.round&&ground.actionUsed)return true;
  if(flag(combat,'npcCommandActions')?.[participant.id]?.round===combat.round)return true;
  if(participant.actor?.isToken)return false;
  const state=game.settings.get(scope,'spaceCombatBoard');
  return state?.ships?.some(ship=>{const turn=ship.combat?.turns?.[participant.actor?.id];return turn?.round===combat.round&&(turn.action||turn.ended);})??false;
}
export async function assignSlot(combat,round,slotId,participantId) {
  return serial(combat,async()=>{
    if(round!==combat.round||!combat.started)throw Error('Le round a changé. Choisissez de nouveau le créneau.');
    const slot=combat.combatants.get(slotId),participant=combat.combatants.get(participantId);
    if(!slot||!participant?.actor||participant.isDefeated)throw Error('Le personnage ou le créneau est indisponible.');
    if(Number(slot.disposition)!==Number(participant.disposition))throw Error('Choisissez un personnage du même camp.');
    const claims=flag(combat,'combatClaims')??{},current=claims[round]??{},otherSlot=Object.keys(current).find(key=>current[key]===participantId),old=combat.combatants.get(current[slotId]);
    if(current[slotId]===participantId)return;
    if(hasActed(combat,participant)||hasActed(combat,old))throw Error('Un personnage a déjà agi ce round. Le changement ne doit pas lui donner un second tour.');
    const indexes=[slotId,otherSlot].filter(Boolean).map(id=>combat.turns.findIndex(turn=>turn.id===id));
    if(indexes.some(index=>index<combat.turn))throw Error('Ce créneau est déjà passé. Revenez au tour concerné dans le suivi avant de modifier son attribution.');
    await combat.setFlag(scope,'combatClaims',{...claims,[round]:swapClaims(current,slotId,participantId)});
  });
}
async function seed(combat) {
  if(combat?._ffgRosterMutation||!game.user.isGM||game.users.activeGM?.id!==game.user.id||!combat?.started||!game.settings.get(scope,'npcAutoInitiative')||!game.settings.get(scope,'useGenericSlots'))return;
  return serial(combat,async()=>{
    const claims=flag(combat,'combatClaims')??{},mark=flag(combat,'npcInitiativeDefaults')??{},old=mark.round===combat.round?mark.slots:[];
    const result=seedClaims(combat.turns,claims[combat.round],old);
    const update={};
    if(JSON.stringify(result.claims)!==JSON.stringify(claims[combat.round]??{}))update['flags.starwarsffg.combatClaims']={...claims,[combat.round]:result.claims};
    if(mark.round!==combat.round||JSON.stringify(old)!==JSON.stringify(result.seeded))update['flags.starwarsffg.npcInitiativeDefaults']={round:combat.round,slots:result.seeded};
    if(Object.keys(update).length)await combat.update(update);
  });
}
export async function chooseSlot(combat,slotId) {
  const slot=combat?.combatants.get(slotId);if(!slot||!combat.started)return;
  const candidates=combat.combatants.filter(participant=>participant.actor&&!participant.isDefeated&&Number(participant.disposition)===Number(slot.disposition)&&(game.user.isGM||participant.actor.testUserPermission(game.user,'OWNER')));
  const body=document.createElement('div'),hint=document.createElement('p'),select=document.createElement('select');
  hint.textContent='Le personnage choisi échange sa place avec l’occupant actuel. Les jets d’initiative restent inchangés.';hint.style.textAlign='justify';select.name='participant';
  const claims=flag(combat,'combatClaims')?.[combat.round]??{};
  for(const participant of candidates){const option=document.createElement('option');option.value=participant.id;option.textContent=participant.name+(hasActed(combat,participant)?' · déjà joué':'');option.disabled=hasActed(combat,participant);option.selected=claims[slotId]===participant.id;select.append(option);}
  body.append(hint,select);
  const chosen=await foundry.applications.api.DialogV2.wait({window:{title:'Changer le personnage de ce créneau'},content:body,rejectClose:false,buttons:[{action:'assign',label:'Attribuer',callback:(_event,button)=>button.form.elements.participant.value},{action:'cancel',label:'Annuler',callback:()=>null}]});
  if(chosen)await requestAssignment(combat,slotId,chosen);
}
async function requestAssignment(combat,slotId,participantId){
  if(game.user.isGM)return assignSlot(combat,combat.round,slotId,participantId);
  if(!game.users.activeGM)throw Error('Un MJ connecté doit valider le changement de créneau.');
  const id=foundry.utils.randomID();let resolve,reject;const result=new Promise((a,b)=>{resolve=a;reject=b;});
  const timer=setTimeout(()=>{waiting.delete(id);reject(Error('Le MJ n’a pas répondu au changement de créneau.'));},20000);waiting.set(id,{resolve,reject,timer});
  game.socket.emit('system.starwarsffg',{event:'npcInitiativeSwap',data:{id,combatId:combat.id,round:combat.round,slotId,participantId,userId:game.user.id}});return result;
}
export function installNpcInitiative() {
  const prototype=CONFIG.Combat.documentClass.prototype;
  if(prototype._npcClaimsInstalled||!prototype.claimSlot)return;
  prototype._npcClaimsInstalled=true;const original=prototype.claimSlot;
  prototype.claimSlot=function(round,slotId,participantId){return game.user.isGM?assignSlot(this,round,slotId,participantId):original.call(this,round,slotId,participantId);};
  game.socket.on('system.starwarsffg',async message=>{
    const data=message.data;if(!data)return;
    if(message.event==='npcInitiativeSwapResult'&&data.userId===game.user.id){const request=waiting.get(data.id);if(request){clearTimeout(request.timer);waiting.delete(data.id);data.error?request.reject(Error(data.error)):request.resolve();}return;}
    if(message.event!=='npcInitiativeSwap'||!game.user.isGM||game.users.activeGM?.id!==game.user.id)return;
    let error;
    try{
      const combat=game.combats.get(data.combatId),user=game.users.get(data.userId),participant=combat?.combatants.get(data.participantId),occupant=combat?.combatants.get(combat.getSlotClaims(data.round,data.slotId));
      if(!user?.active||!participant?.actor?.testUserPermission(user,'OWNER')||occupant&&!occupant.actor?.testUserPermission(user,'OWNER'))throw Error('Vous ne contrôlez pas les personnages de cet échange. Demandez au MJ.');
      await assignSlot(combat,data.round,data.slotId,data.participantId);
    }catch(reason){error=reason.message;}
    game.socket.emit('system.starwarsffg',{event:'npcInitiativeSwapResult',data:{id:data.id,userId:data.userId,error}});
  });
  const refresh=combat=>seed(combat?.documentName==='Combat'?combat:combat?.parent?.documentName==='Combat'?combat.parent:game.combat).catch(error=>ui.notifications.warn(error.message));
  for(const hook of ['createCombat','updateCombat','createCombatant','updateCombatant','renderCombatTracker'])Hooks.on(hook,refresh);
  Hooks.on('renderCombatTracker',(tracker,html)=>{
    const root=html?.querySelectorAll?html:html?.[0],combat=tracker.viewed;if(!root||!combat?.started||!game.settings.get(scope,'useGenericSlots'))return;
    for(const row of root.querySelectorAll('li.combatant[data-slot-index]')){
      if(row.querySelector('[data-npc-change-slot]'))continue;
      const slot=combat.turns[Number(row.dataset.slotIndex)];if(!slot)continue;
      const occupant=combat.combatants.get(combat.getSlotClaims?.(combat.round,slot.id)??slot.id);
      if(!game.user.isGM&&!occupant?.actor?.testUserPermission(game.user,'OWNER'))continue;
      const button=document.createElement('button');button.type='button';button.className='npc-slot-change';button.dataset.npcChangeSlot=slot.id;button.title='Changer le personnage de ce créneau';button.setAttribute('aria-label',button.title);button.innerHTML='<i class="fa-solid fa-right-left" aria-hidden="true"></i>';
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();chooseSlot(combat,slot.id).catch(error=>ui.notifications.warn(error.message));});(row.querySelector('.combatant-controls')??row).append(button);
    }
  });
  void seed(game.combat);
}
export function activeParticipant(){return initiativeContext().participant;}

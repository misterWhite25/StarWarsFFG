import {aboardRoster,crewActor} from './crew-access.mjs';
import {ensureCombatScene} from './scene-document.mjs';
import {ensureNpcInitiativeSkills} from '../helpers/npc-vehicle.mjs';

const scope='starwarsffg',flag='spaceCombatParticipant';

/** Real characters act individually; embedded NPC stations share their vehicle's entry. */
export function encounterParticipants(ships){
  const entries=new Map();
  for(const ship of ships){
    const vehicle=game.actors.get(ship.actorId);if(vehicle?.type!=='vehicle')continue;
    const members=aboardRoster(vehicle);let collective=!members.some(member=>crewActor(member));
    for(const member of members){
      const actor=crewActor(member);if(!actor)continue;
      if(member.integrated||member.npcStation){collective=true;continue;}
      const token=member.tokenUuid?globalThis.fromUuidSync?.(member.tokenUuid):null;
      const key=token&&!token.actorLink?'token:'+token.uuid:'actor:'+actor.id;
      const existing=entries.get(key);
      if(existing){if(!existing.shipIds.includes(ship.id))existing.shipIds.push(ship.id);continue;}
      entries.set(key,{key,actor,token,name:token?.name??actor.name,shipIds:[ship.id],kind:'character'});
    }
    if(collective){
      const key='ship:'+ship.id;
      entries.set(key,{key,actor:vehicle,name:ship.name??vehicle.name,shipIds:[ship.id],kind:'vehicle'});
    }
  }
  return [...entries.values()];
}

function existingParticipant(combat,entry){
  return combat.combatants.find(participant=>{
    const saved=participant.getFlag(scope,flag);
    if(saved?.key===entry.key)return true;
    if(entry.token)return participant.token?.uuid===entry.token.uuid;
    if(entry.kind==='vehicle')return participant.actor?.id===entry.actor.id&&!saved?.key;
    return entry.kind==='character'&&participant.actor?.id===entry.actor.id&&(!participant.token||participant.token.actorLink);
  });
}

async function participantToken(scene,entry,index){
  if(entry.token?.actor)return entry.token;
  const existing=scene.tokens.find(token=>token.getFlag(scope,flag)?.key===entry.key&&token.actorId===entry.actor.id&&token.actorLink);
  if(existing)return existing;
  // These linked tokens let Foundry resolve ownership and roll initiative normally.
  // The custom spatial map draws the visible ships and does not use these token images.
  const prototype=await entry.actor.getTokenDocument({name:entry.name,actorLink:true,alpha:0,x:(index%20)*100,y:Math.floor(index/20)*100,
    displayName:CONST.TOKEN_DISPLAY_MODES.NONE,displayBars:CONST.TOKEN_DISPLAY_MODES.NONE,
    flags:{[scope]:{[flag]:{key:entry.key,shipIds:entry.shipIds,kind:entry.kind}}}});
  const data=prototype.toObject();delete data._id;
  return (await scene.createEmbeddedDocuments('Token',[data]))[0];
}

/** Populate a dedicated encounter without rolling, starting, or deleting another encounter. */
export async function prepareSpaceEncounter(state){
  if(!game.user.isGM)throw Error('Seul le MJ peut préparer la rencontre spatiale.');
  for(const actorId of new Set(state.ships.map(ship=>ship.actorId)))await ensureNpcInitiativeSkills(game.actors.get(actorId));
  const entries=encounterParticipants(state.ships);if(!entries.length)return null;
  const scene=game.scenes.get(await ensureCombatScene());
  let combat=state.encounterId&&game.combats.get(state.encounterId);
  combat??=game.combats.find(combat=>combat.getFlag(scope,'spaceCombatEncounter')&&(combat.getFlag(scope,'spaceCombatSceneId')===scene.id||combat.scene?.id===scene.id));
  // Preserve an existing initiative that was already used for these spatial participants.
  if(!combat&&state.initiative?.combatId){
    const previous=game.combats.get(state.initiative.combatId);
    if(previous?.combatants.some(participant=>entries.some(entry=>participant.actor?.id===entry.actor.id)))combat=previous;
  }
  if(!combat)combat=await CONFIG.Combat.documentClass.create({scene:scene.id,active:true,flags:{[scope]:{spaceCombatEncounter:true,spaceCombatSceneId:scene.id}}});
  else if(!combat.getFlag(scope,'spaceCombatEncounter')||combat.getFlag(scope,'spaceCombatSceneId')!==scene.id)await combat.update({'flags.starwarsffg.spaceCombatEncounter':true,'flags.starwarsffg.spaceCombatSceneId':scene.id});
  const additions=[];
  for(const [index,entry]of entries.entries()){
    const existing=existingParticipant(combat,entry);
    if(existing){
      const changes={};
      if(!existing.getFlag(scope,flag))changes['flags.'+scope+'.'+flag]={key:entry.key,shipIds:entry.shipIds,kind:entry.kind};
      if(!existing.token){const token=await participantToken(scene,entry,index);Object.assign(changes,{tokenId:token.id,sceneId:token.parent.id});}
      if(Object.keys(changes).length)await existing.update(changes);
      continue;
    }
    const token=await participantToken(scene,entry,index);
    additions.push({actorId:token.actorId,tokenId:token.id,sceneId:token.parent.id,name:entry.name,img:token.texture.src,hidden:token.hidden,
      flags:{[scope]:{[flag]:{key:entry.key,shipIds:entry.shipIds,kind:entry.kind}}}});
  }
  if(additions.length)await combat.createEmbeddedDocuments('Combatant',additions);
  if(!combat.active)await combat.activate();
  if(ui.combat){ui.combat.viewed=combat;await ui.combat.render({force:true});}
  return combat;
}

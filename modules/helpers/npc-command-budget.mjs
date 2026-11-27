import {localizeSystem} from "./system-localization.mjs";
const scope='starwarsffg';
export function npcTurnReason(entry){
  if(!game.user.isGM)return localizeSystem("SWFFG.UI.Operations.GMCommandOnly");
  if(!entry?.actor)return localizeSystem("SWFFG.UI.Operations.CharacterMissing");
  return '';
}
export async function reserveNpcAction(entry){
  const reason=npcTurnReason(entry);if(reason)throw Error(reason);
  return null;
}
// Retain rollback support for a preparation made before the interface was refreshed.
export async function restoreNpcAction(transaction){
  if(!transaction)return;
  const {token,old,combat,participant,id}=transaction,current=token?.getFlag(scope,'groundMovementState');
  if(current?.revision===transaction.revision){if(old)await token.setFlag(scope,'groundMovementState',old);else await token.unsetFlag(scope,'groundMovementState');}
  if(combat.getFlag(scope,'npcCommandActions')?.[participant]?.id===id)await combat.unsetFlag(scope,'npcCommandActions.'+participant);
}
export function attachNpcBudget(builder,entry,{reaction=false}={}){
  if(!builder||builder._npcBudgetAttached)return builder;
  builder._npcBudgetAttached=true;
  const reserve=builder._reserveRollResources.bind(builder),restore=builder._restoreRollResources.bind(builder);
  builder._reserveRollResources=async function(transaction){
    transaction.npcCommand=await reserveNpcAction(entry,null,{reaction});
    try{return await reserve(transaction);}catch(error){await restoreNpcAction(transaction.npcCommand);transaction.npcCommand=null;throw error;}
  };
  builder._restoreRollResources=async function(transaction){try{return await restore(transaction);}finally{await restoreNpcAction(transaction.npcCommand);transaction.npcCommand=null;}};
  return builder;
}

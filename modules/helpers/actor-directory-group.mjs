/** Canonical classification shared by directories and camp defaults. */
export function isNpcActor(actor){
  if(actor.type==='vehicle')return false;
  return actor.flags?.starwarsffg?.npcDirectory??['minion','rival','nemesis'].includes(actor.type);
}
export function actorDirectoryGroup(actor){
  if(actor.type!=='vehicle')return isNpcActor(actor)?'npcs':'actors';
  const group=actor.flags?.starwarsffg?.vehicleDirectory;
  return ['actors','npcs','vehicles'].includes(group)?group:(actor.getFlag?.('starwarsffg','vehicleInActors')??actor.flags?.starwarsffg?.vehicleInActors)?'actors':'vehicles';
}

import {localizedSystemError} from "./system-localization.mjs";
const scope='starwarsffg';
export const rosterFilters=[['all','Tous'],['initiative','Initiative'],['scene','Scène'],['favorites','Favoris']];
const valid=new Set(rosterFilters.map(([key])=>key));
export function npcRosterFilter(model,side=model.side){
  const value=model.rosterFilters?.[side];
  return valid.has(value)?value:globalThis.game?.combat?.combatants?.size?'initiative':'scene';
}
export function npcFavorites(user=globalThis.game?.user){
  const value=user?.getFlag(scope,'npcCommandFavorites');
  return new Set(Array.isArray(value)?value.filter(key=>typeof key==='string'):[]);
}
export function npcRosterMatches(entry,filter,{scene=globalThis.canvas?.scene,favorites=npcFavorites()}={}){
  if(filter==='initiative')return Boolean(entry.participant);
  if(filter==='favorites')return favorites.has(entry.key);
  if(filter==='scene'){
    if(!scene)return false;
    if(entry.token)return entry.token.parent?.id===scene.id;
    return entry.mode==='space'&&Array.from(scene.tokens??[]).some(token=>token.actorId===(entry.vehicle?.id??entry.ship?.actorId));
  }
  return true;
}
// Serialize fast clicks so marking two different groups cannot overwrite either choice.
let pending=Promise.resolve();
export function toggleNpcFavorite(user,key){
  const next=pending.catch(()=>{}).then(async()=>{
    if(!user?.isGM||typeof key!=='string'||!key)throw localizedSystemError("SWFFG.UI.Operations.FavoriteInvalid");
    const favorites=npcFavorites(user);
    if(favorites.has(key))favorites.delete(key);else favorites.add(key);
    await user.setFlag(scope,'npcCommandFavorites',[...favorites]);
    return favorites.has(key);
  });
  pending=next;return next;
}

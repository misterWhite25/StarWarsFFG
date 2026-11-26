const personalTypes=new Set(['character','minion','rival','nemesis']);
export const isPersonalActor = actor => personalTypes.has(actor?.type);
export const gmShortcutFlag='pinnedCharacterShortcuts';

/** World actors represent controlled characters once, independently of selected tokens. */
export function playerCharacters(actors,user){
  if(!user||user.isGM)return [];
  const primary=user.character?.id;
  return [...(actors??[])].filter(actor=>isPersonalActor(actor)&&actor.testUserPermission(user,'OWNER'))
    .sort((a,b)=>Number(b.id===primary)-Number(a.id===primary)||a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
}

export function collapsedCharacters(value){
  return new Set(Array.isArray(value)?value.filter(id=>typeof id==='string'):[]);
}

/** Keep unlinked scene groups distinct from their shared world actor. */
export function gmCharacterShortcutKey(actor){
  if(!personalTypes.has(actor?.type)||actor.pack||actor.inCompendium)return null;
  const key=actor.isToken?actor.token?.uuid:actor.uuid;
  return typeof key==='string'&&/^(?:Actor\.[^.]+|Scene\.[^.]+\.Token\.[^.]+)$/.test(key)?key:null;
}

export function gmCharacterShortcut(key,user,resolve=globalThis.fromUuidSync){
  if(!user?.isGM||typeof key!=='string'||!resolve)return null;
  if(!/^(?:Actor\.[^.]+|Scene\.[^.]+\.Token\.[^.]+)$/.test(key))return null;
  const document=resolve(key),actor=document?.documentName==='Token'?document.actor:document;
  if(!gmCharacterShortcutKey(actor))return null;
  return {key,actor,name:document.name,img:actor.img};
}

export function characterShortcuts(actors,user,resolve=globalThis.fromUuidSync){
  if(!user?.isGM)return playerCharacters(actors,user).map(actor=>({key:actor.id,actor,name:actor.name,img:actor.img}));
  return [...collapsedCharacters(user.getFlag('starwarsffg',gmShortcutFlag))]
    .map(key=>gmCharacterShortcut(key,user,resolve)).filter(Boolean);
}

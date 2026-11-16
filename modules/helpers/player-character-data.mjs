const personalTypes=new Set(['character','minion','rival','nemesis']);

/** World actors represent controlled characters once, independently of selected tokens. */
export function playerCharacters(actors,user){
  if(!user||user.isGM)return [];
  const primary=user.character?.id;
  return [...(actors??[])].filter(actor=>personalTypes.has(actor.type)&&actor.testUserPermission(user,'OWNER'))
    .sort((a,b)=>Number(b.id===primary)-Number(a.id===primary)||a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
}

export function collapsedCharacters(value){
  return new Set(Array.isArray(value)?value.filter(id=>typeof id==='string'):[]);
}

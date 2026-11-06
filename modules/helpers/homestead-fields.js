export function homesteadFieldUpdate(name,value){
  if(name==='name'){
    const text=String(value).trim();if(!text)throw Error('Le nom ne peut pas être vide.');return {name:text};
  }
  if(name==='data.stats.consumables.duration')return {'system.stats.consumables.duration':String(value)};
  if(!['data.stats.cost.value','data.stats.consumables.value'].includes(name))return null;
  if(value===''||!Number.isFinite(Number(value))||Number(value)<0)throw Error('Saisir une valeur positive ou nulle.');
  return {[name.replace(/^data\./,'system.')]:Number(value)};
}
export function activateHomesteadFields(sheet){
  if(sheet.actor.type!=='homestead')return;
  for(const input of sheet.element.querySelectorAll('input[name="name"],input[name="data.stats.cost.value"],input[name="data.stats.consumables.value"],input[name="data.stats.consumables.duration"]')){
    input.addEventListener('change',async event=>{
      event.stopImmediatePropagation();
      if(!sheet.isEditable||!sheet.actor.isOwner)return;
      try{const update=homesteadFieldUpdate(input.name,input.value);if(update)await sheet.actor.update(update);}
      catch(error){ui.notifications.warn(error.message);sheet.render();}
    });
  }
}

// Replace only the old untranslated default name; custom property names are preserved.
export async function translateLegacyHomesteads(game){
  if(!game.user.isGM)return;
  const primary=Array.from(game.users).filter(user=>user.active&&user.isGM).sort((a,b)=>a.id.localeCompare(b.id))[0];
  if(primary?.id!==game.user.id)return;
  for(const actor of game.actors){
    if(actor.type!=='homestead')continue;
    const update={};
    if(game.i18n.lang==='fr'&&actor.name==='Homestead (Translate)')update.name=game.i18n.localize('TYPES.Actor.homestead');
    if(!actor.img||actor.img==='icons/svg/mystery-man.svg')update.img='icons/svg/city.svg';
    if(actor.prototypeToken?.texture?.src==='icons/svg/mystery-man.svg')update['prototypeToken.texture.src']='icons/svg/city.svg';
    if(Object.keys(update).length)await actor.update(update);
  }
}
if(globalThis.Hooks)Hooks.once('ready',()=>translateLegacyHomesteads(game).catch(error=>ui.notifications.warn(error.message)));

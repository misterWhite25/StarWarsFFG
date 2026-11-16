const SYSTEM='starwarsffg',MODULE='swffg-compendium-bilingual-steelers-equipment';
const TYPES=new Set(['character','minion','rival','nemesis']);
function defaultChoice(actor){
 const value=actor.getFlag(SYSTEM,'marketParticipant');
 if(typeof value==='boolean')return value;
 return !(actor.flags?.starwarsffg?.npcDirectory??['minion','rival','nemesis'].includes(actor.type));
}
function marketEnabled(){
 try{return game.modules.get(MODULE)?.active===true&&game.settings.get(SYSTEM,'enableGalacticMarket')===true;}catch{return false;}
}
export function renderMarketParticipant(sheet){
 const actor=sheet.actor,root=sheet.element;
 if(!TYPES.has(actor?.type)||actor.isToken||!root)return;
 const tab=root.querySelector('.tab[data-tab=general]');if(!tab)return;
 let field=tab.querySelector('.ffg-market-participant');
 if(!field){
  field=document.createElement('div');field.className='ffg-market-participant';
  const label=document.createElement('label'),text=document.createElement('span'),input=document.createElement('input'),note=document.createElement('p');
  text.textContent=game.i18n.localize("SWFFG.UI.Equipment.MarketParticipant.ParticipateInTheIntergalacticMarket");
  input.type='checkbox';input.dataset.marketParticipant='';
  label.append(text,input);note.className='ffg-market-participant-note';field.append(label,note);tab.prepend(field);
  input.addEventListener('change',async event=>{
   event.stopPropagation();
   if(!marketEnabled()||!game.user.isGM||!sheet.isEditable){renderMarketParticipant(sheet);return;}
   const value=event.target.checked;input.disabled=true;
   try{await actor.setFlag(SYSTEM,'marketParticipant',value);}catch(error){console.error('Star Wars FFG | Market participant',error);ui.notifications.error(game.i18n.localize("SWFFG.UI.Equipment.MarketParticipant.UnableToChangeMarketParticipation"));}
   finally{if(sheet.rendered)renderMarketParticipant(sheet);}
  });
 }
 const input=field.querySelector('input'),note=field.querySelector('p');
 const predicate=game.modules.get(MODULE)?.api?.market?.canParticipate;
 input.checked=predicate?predicate(actor):defaultChoice(actor);
 input.disabled=!marketEnabled()||!game.user.isGM||!sheet.isEditable;
 note.textContent=!marketEnabled()?(game.i18n.localize("SWFFG.UI.Equipment.MarketParticipant.EnableTheIntergalacticMarketInSystemSettingsTo")):(game.i18n.localize("SWFFG.UI.Equipment.MarketParticipant.AllowsThisCharacterToBeSelectedWhenSearching"));
}
function refresh(){for(const actor of game.actors??[])for(const app of Object.values(actor.apps??{}))if(app.rendered)renderMarketParticipant(app);}
Hooks.on('renderActorSheetFFGV2',renderMarketParticipant);
Hooks.on('updateActor',actor=>{for(const app of Object.values(actor.apps??{}))if(app.rendered)renderMarketParticipant(app);});
for(const hook of ['createSetting','updateSetting'])Hooks.on(hook,setting=>{if(setting.key===SYSTEM+'.enableGalacticMarket')queueMicrotask(refresh);});

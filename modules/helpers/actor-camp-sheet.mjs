import {localizeSystem, localizedSystemError} from "./system-localization.mjs";
import {repairCombatCamps} from './npc-camps.mjs';
const scope='starwarsffg',types=new Set(['character','minion','rival','nemesis','vehicle']);
export const ACTOR_CAMPS=[{value:1,get label(){return localizeSystem("SWFFG.UI.Operations.Ally");},key:'friendly'},{value:0,get label(){return localizeSystem("SWFFG.UI.Operations.Neutral");},key:'neutral'},{value:-1,get label(){return localizeSystem("SWFFG.UI.Operations.Enemy");},key:'hostile'}];
const queues=new Map();let installed=false;
export function campSourceActor(actor){
  if(!actor)return null;
  return actor.isToken?game.actors.get(actor.parent?.actorId??actor.id)??null:actor;
}
export function actorCampValue(actor){
  const source=campSourceActor(actor);if(!source)return null;
  const override=source.getFlag(scope,'campOverride');
  return Number(typeof override==='number'?override:source.prototypeToken?.disposition??0);
}
export async function setActorCamp(document,value){
  if(!game.user.isGM)throw localizedSystemError("SWFFG.UI.Operations.CampGMOnly");
  if(!ACTOR_CAMPS.some(camp=>camp.value===value))throw localizedSystemError("SWFFG.UI.Operations.ChooseCamp");
  const actor=campSourceActor(document);if(!actor||!types.has(actor.type))throw localizedSystemError("SWFFG.UI.Operations.OriginalActor");
  const key=actor.uuid??actor.id;
  const task=(queues.get(key)??Promise.resolve()).catch(()=>{}).then(async()=>{
    await actor.update({'prototypeToken.disposition':value,['flags.'+scope+'.campOverride']:value});
    if(Number(actor.prototypeToken.disposition)!==value||actor.getFlag(scope,'campOverride')!==value)throw localizedSystemError("SWFFG.UI.Operations.CampSaveFailed");
    let count=0;
    if(!actor.pack){
      for(const scene of game.scenes){
        const tokens=scene.tokens.filter(token=>token.actorId===actor.id),updates=tokens.filter(token=>Number(token.disposition)!==value||token.getFlag(scope,'campOverride')!==value).map(token=>({_id:token.id,disposition:value,['flags.'+scope+'.campOverride']:value}));
        if(updates.length)await scene.updateEmbeddedDocuments('Token',updates,{ffgActorCamp:true});
        if(tokens.some(token=>Number(token.disposition)!==value))throw localizedSystemError("SWFFG.UI.Operations.CampTokenFailed");
        count+=tokens.length;
      }
      for(const combat of game.combats)if(combat.combatants.some(participant=>participant.token?.actorId===actor.id))await repairCombatCamps(combat);
    }
    Hooks.callAll('ffgNpcCampChanged');refreshActorCampSheets();return {actorId:actor.id,value,tokens:count};
  });
  queues.set(key,task);
  try{return await task;}finally{if(queues.get(key)===task)queues.delete(key);}
}
export function renderActorCampField(sheet,element=sheet.element){
  if((sheet.document??sheet.object)?.documentName!=='Actor')return;
  const actor=sheet.actor??sheet.document,root=element?.querySelector?element:element?.[0];
  if(!root||!game.user.isGM||!types.has(actor?.type))return;
  const source=campSourceActor(actor),header=root.querySelector('.sheet-header');if(!header?.querySelector('input[name="name"]'))return;
  let bar=root.querySelector('.ffg-sheet-mode-switch,.ffg-actor-camp-toolbar');
  if(!bar){bar=document.createElement('div');bar.className='ffg-actor-camp-toolbar';header.before(bar);}
  if(bar.closest('.ffg-combat-identity'))header.before(bar);
  let field=root.querySelector('.ffg-actor-camp-field');
  if(!field){
    field=document.createElement('div');field.className='ffg-actor-camp-field';field.setAttribute('role','group');field.setAttribute('aria-label',localizeSystem("SWFFG.UI.Operations.PermanentCamp"));
    for(const camp of ACTOR_CAMPS){
      const button=document.createElement('button');button.type='button';button.dataset.actorCamp=String(camp.value);button.dataset.campColor=camp.key;button.textContent=camp.label;
      button.title=source?.pack?localizeSystem("SWFFG.UI.Operations.CampForImports"):localizeSystem("SWFFG.UI.Operations.CampForAllTokens");
      button.addEventListener('click',async event=>{
        event.preventDefault();event.stopPropagation();
        if(!game.user.isGM||!sheet.isEditable)return;
        for(const sibling of field.querySelectorAll('button'))sibling.disabled=true;
        try{await setActorCamp(sheet.actor??sheet.document,camp.value);}
        catch(error){ui.notifications.error(error.message);}
        finally{if(sheet.rendered)renderActorCampField(sheet);}
      });field.append(button);
    }
    bar.prepend(field);
  }
  const current=actorCampValue(actor);field.title=source?localizeSystem("SWFFG.UI.Operations.ActorPermanentCamp", {name:source.name}):localizeSystem("SWFFG.UI.Operations.MissingOriginalActor");
  for(const button of field.querySelectorAll('[data-actor-camp]')){button.setAttribute('aria-pressed',String(Number(button.dataset.actorCamp)===current));button.disabled=!source||!sheet.isEditable;}
}
export function refreshActorCampSheets(){
  for(const app of foundry.applications.instances.values())if(app.rendered&&app.element?.querySelector('.sheet-header'))renderActorCampField(app);
}
export function installActorCampSheet(){
  if(installed)return;installed=true;
  Hooks.on('renderActorSheetFFGV2',renderActorCampField);
  Hooks.on('renderActorSheetFFG',renderActorCampField);
  Hooks.on('updateActor',refreshActorCampSheets);
  for(const app of foundry.applications.instances.values())if(app.rendered)renderActorCampField(app);
}

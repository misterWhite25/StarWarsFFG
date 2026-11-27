import {localizeSystem} from "./system-localization.mjs";
import {actorDirectoryGroup} from './actor-directory-group.mjs';
const valid=new Set([-2,-1,0,1]);
let installed=false,queue=Promise.resolve();
const read=(object,path)=>Object.hasOwn(object??{},path)?object[path]:path.split('.').reduce((value,key)=>value?.[key],object);
const explicit=document=>{const value=read(document,'flags.starwarsffg.campOverride');return typeof value==='number'&&valid.has(value);};
export const hasCampOverride=explicit;
export function usesAlliedDirectoryDefault(actor,token=null){
  return !!actor&&!actor.pack&&!explicit(actor)&&!explicit(token)&&actorDirectoryGroup(actor)==='actors';
}
export const flushDirectoryCamps=()=>queue;
const activeGM=()=>game.user?.isGM&&(!game.users.activeGM||game.users.activeGM.id===game.user.id);
const enqueue=fn=>{const task=queue.catch(()=>{}).then(fn);queue=task;task.catch(error=>ui.notifications.error(localizeSystem("SWFFG.UI.Operations.DefaultCamp") + " "+error.message));return task;};
const groupFields=['flags.starwarsffg.npcDirectory','flags.starwarsffg.vehicleDirectory','flags.starwarsffg.vehicleInActors','type'];
function directoryChanged(changes){return groupFields.some(path=>read(changes,path)!==undefined);}
function setChange(changes,path,value){foundry.utils.setProperty(changes,path,value);}
function tokenActor(token,data={}){return game.actors.get(data.actorId??token.actorId)??token.actor;}
export async function synchronizeActorCamp(actor){
  if(!activeGM()||actor?.isToken||!usesAlliedDirectoryDefault(actor))return;
  if(Number(actor.prototypeToken.disposition)!==1)await actor.update({'prototypeToken.disposition':1},{ffgDirectoryCamp:true});
  if(!usesAlliedDirectoryDefault(actor))return;
  for(const scene of game.scenes){
    const updates=scene.tokens.filter(token=>token.actorId===actor.id&&usesAlliedDirectoryDefault(actor,token)&&Number(token.disposition)!==1).map(token=>({_id:token.id,disposition:1}));
    if(updates.length)await scene.updateEmbeddedDocuments('Token',updates,{ffgDirectoryCamp:true});
  }
}
export function installDirectoryCamps(){
  if(installed)return queue;installed=true;
  Hooks.on('preCreateActor',actor=>{
    if(usesAlliedDirectoryDefault(actor))actor.updateSource({'prototypeToken.disposition':1});
  });
  Hooks.on('preCreateToken',(token,data,options)=>{
    if(options?.ffgManualCamp||!usesAlliedDirectoryDefault(tokenActor(token,data),data))return;
    token.updateSource({disposition:1});
  });
  Hooks.on('preUpdateToken',(token,changes,options)=>{
    const disposition=read(changes,'disposition');if(disposition===undefined)return;
    if(options?.ffgDirectoryCamp){
      if(!usesAlliedDirectoryDefault(tokenActor(token),token))delete changes.disposition;
      return;
    }
    if(valid.has(Number(disposition)))setChange(changes,'flags.starwarsffg.campOverride',Number(disposition));
  });
  Hooks.on('preUpdateActor',(actor,changes,options)=>{
    if(actor.pack||actor.isToken)return;
    const disposition=read(changes,'prototypeToken.disposition');
    if(disposition!==undefined&&!options?.ffgDirectoryCamp&&valid.has(Number(disposition)))setChange(changes,'flags.starwarsffg.campOverride',Number(disposition));
    if(!directoryChanged(changes)||options?.ffgDirectoryCamp)return;
    const draft=foundry.utils.mergeObject(actor.toObject(),foundry.utils.expandObject(changes),{inplace:false});
    if(usesAlliedDirectoryDefault(draft))setChange(changes,'prototypeToken.disposition',1);
  });
  Hooks.on('createActor',actor=>{if(activeGM()&&!actor.isToken)enqueue(()=>synchronizeActorCamp(actor));});
  Hooks.on('updateActor',(actor,changes,options)=>{if(activeGM()&&!actor.isToken&&!options?.ffgDirectoryCamp&&directoryChanged(changes))enqueue(()=>synchronizeActorCamp(actor));});
  if(activeGM())enqueue(async()=>{for(const actor of game.actors)await synchronizeActorCamp(actor);Hooks.callAll('ffgNpcCampChanged');});
  return queue;
}

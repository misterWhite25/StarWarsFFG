import {medicalItemType} from './medical-item-type.mjs';
import {isPossession} from './inventory-location.js';
import {stimpackHealing} from './reviewed-talent-state.js';

const scope='starwarsffg',ledger='medicalTreatments',types=new Set(['character','minion','rival','nemesis']);
let queue=Promise.resolve(),approveReset;
const pending=new Map(),processing=new Map();
export const setMedicalResetApproval=callback=>{approveReset=callback;};
const integer=(value,label)=>{const n=Number(value??0);if(!Number.isSafeInteger(n)||n<0)throw Error(game.i18n.format("SWFFG.UI.Medical.InvalidValue",{label}));return n;};
export function medicalActor(uuid){const actor=fromUuidSync(uuid);if(actor?.documentName!=='Actor'||!types.has(actor.type)||actor.pack)throw Error(game.i18n.localize("SWFFG.UI.Medical.CharacterUnavailable"));return actor;}
export function medicalNature(actor){
 const species=actor.items.filter(item=>item.type==='species');
 if(species.some(item=>/^(droid|droide)(?:$|[\s(:-])/i.test(item.name.normalize('NFD').replace(/[\u0300-\u036f]/g,''))))return 'droid';
 return species.length?'organic':'unknown';
}
export function medicalItems(actor){return actor.items.filter(item=>item.type==='gear'&&!isPossession(item)&&medicalItemType(item)>0);}
const receiptFor=(actor,id)=>actor.getFlag(scope,ledger)?.find(receipt=>receipt.id===id);
function permitted(actor,user,owner=false){return actor.testUserPermission(user,owner?'OWNER':'OBSERVER');}
function verifyUser(user){if(!user?.active)throw Error(game.i18n.localize("SWFFG.UI.Medical.UserDisconnected"));}
export function medicalQuote(giver,target,item,user=game.user){
 verifyUser(user);
 if(!permitted(giver,user,true)||!permitted(target,user))throw Error(game.i18n.localize("SWFFG.UI.Medical.ActorsNotAccessible"));
 if(!item||item.parent?.uuid!==giver.uuid||!medicalItems(giver).some(candidate=>candidate.id===item.id))throw Error(game.i18n.localize("SWFFG.UI.Medical.ChooseCarriedItem"));
 const kind=medicalItemType(item),nature=medicalNature(target);
 if(nature==='droid'&&kind!==2)throw Error(game.i18n.localize("SWFFG.UI.Medical.DroidNeedsPatch"));
 if(nature==='organic'&&kind!==1)throw Error(game.i18n.localize("SWFFG.UI.Medical.PatchOnlyDroids"));
 const uses=integer(target.system.stats?.medical?.uses,game.i18n.localize("SWFFG.UI.Medical.Counter")),wounds=integer(target.system.stats?.wounds?.value,game.i18n.localize("SWFFG.UI.Medical.Wounds")),quantity=integer(item.system.quantity?.value,game.i18n.localize("SWFFG.UI.Medical.Stock"));
 if(uses>=5)throw Error(game.i18n.localize("SWFFG.UI.Medical.FiveUsesReached"));
 if(!quantity)throw Error(game.i18n.localize("SWFFG.UI.Medical.ItemOutOfStock"));
 if(!wounds)throw Error(game.i18n.localize("SWFFG.UI.Medical.NoWounds"));
 const healing=kind===2?3:stimpackHealing(giver,uses),healed=Math.min(wounds,healing);
 return {giverUuid:giver.uuid,targetUuid:target.uuid,itemId:item.id,kind,nature,uses,wounds,quantity,healing,healed,after:wounds-healed};
}
function text(tag,value){const element=document.createElement(tag);element.textContent=value;return element;}
function chatContent(giver,target,item,quote){
 const section=document.createElement('section'),title=text('h4',quote.kind===2?game.i18n.localize("SWFFG.UI.Medical.RepairPatch"):game.i18n.localize("SWFFG.UI.Medical.Stimpack"));title.style.cssText='font:600 14px/1.3 Arial,sans-serif;margin:0 0 5px';
 const line=text('p',game.i18n.format(giver.uuid===target.uuid?"SWFFG.UI.Medical.SelfTreatmentReceipt":"SWFFG.UI.Medical.TreatmentReceipt",{giver:giver.name,item:item.name,target:target.name}));line.style.textAlign='justify';
 const result=text('p',game.i18n.format(quote.healed>1?"SWFFG.UI.Medical.HealedMany":"SWFFG.UI.Medical.HealedOne",{healed:quote.healed,before:quote.wounds,after:quote.after}));result.style.textAlign='justify';
 section.append(title,line,result,text('em',game.i18n.format("SWFFG.UI.Medical.ReceiptDetails",{uses:quote.uses+1,quantity:quote.quantity-1})));return section.outerHTML;
}
function actorOperation(actor,update){return {action:'update',documentName:'Actor',...(actor.isToken?{parent:actor.parent}:{}),updates:[{_id:actor.id,...update}]};}
const value=(object,key)=>Object.hasOwn(object??{},key)?object[key]:foundry.utils.getProperty(object??{},key);
function addReceipt(actor,receipt){return [...(actor.getFlag(scope,ledger)??[]).slice(-39),receipt];}
function commandIdentity(command){if(!/^[A-Za-z0-9]{1,64}$/.test(command.id??''))throw Error(game.i18n.localize("SWFFG.UI.Medical.InvalidCommand"));}
async function execute(command,user,{resetApproved=false}={}){
 commandIdentity(command);verifyUser(user);
 if(game.users.activeGM&&game.users.activeGM.id!==game.user.id)throw Error(game.i18n.localize("SWFFG.UI.Medical.ActiveGMRequired"));
 if(!game.user.isGM&&(game.users.activeGM||game.user.id!==user.id))throw Error(game.i18n.localize("SWFFG.UI.Medical.MedicalAuthorityRequired"));
 if(user.id!==game.user.id&&game.users.activeGM?.id!==game.user.id)throw Error(game.i18n.localize("SWFFG.UI.Medical.ActiveGMChanged"));
 const target=medicalActor(command.targetUuid);
 const previous=receiptFor(target,command.id);
 if(previous){if(previous.userId!==user.id||previous.kind!==command.kind||previous.giverUuid!==(command.giverUuid??null)||previous.itemId!==(command.itemId??null))throw Error(game.i18n.localize("SWFFG.UI.Medical.CommandAlreadyUsed"));return {...previous,replayed:true};}
 let operation,itemOperation,quote,giver,item,content,receipt;
 const messageId=foundry.utils.randomID(),at=game.time.worldTime;
 if(command.kind==='use'){
  giver=medicalActor(command.giverUuid);item=giver.items.get(command.itemId);quote=medicalQuote(giver,target,item,user);
  if(JSON.stringify(command.expected)!==JSON.stringify(quote))throw Error(game.i18n.localize("SWFFG.UI.Medical.QuoteChanged"));
  if(!game.user.isGM&&(!permitted(target,user,true)||!permitted(giver,user,true)))throw Error(game.i18n.localize("SWFFG.UI.Medical.GMNeededForTreatment"));
  receipt={id:command.id,userId:user.id,kind:'use',giverUuid:giver.uuid,itemId:item.id,itemName:item.name,uses:quote.uses+1,healed:quote.healed,before:quote.wounds,after:quote.after,messageId,at};
  operation=actorOperation(target,{'system.stats.medical.uses':quote.uses+1,'system.stats.wounds.value':quote.after,['flags.'+scope+'.'+ledger]:addReceipt(target,receipt)});
  itemOperation={action:'update',documentName:'Item',parent:giver,updates:[{_id:item.id,'system.quantity.value':quote.quantity-1}]};content=chatContent(giver,target,item,quote);
 }else{
  if(!permitted(target,user,true))throw Error(game.i18n.localize("SWFFG.UI.Medical.ActorNotOwned"));
  const uses=integer(target.system.stats?.medical?.uses,game.i18n.localize("SWFFG.UI.Medical.Counter"));
  if(command.kind==='reset'){
   if(!game.user.isGM||(!user.isGM&&!resetApproved))throw Error(game.i18n.localize("SWFFG.UI.Medical.RestNeedsGMApproval"));
   if(!['rest','24h'].includes(command.reason))throw Error(game.i18n.localize("SWFFG.UI.Medical.ChooseRestPeriod"));
  }else if(command.kind!=='adjust')throw Error(game.i18n.localize("SWFFG.UI.Medical.UnknownCommand"));
  const next=command.kind==='reset'?0:Math.max(0,uses-1);
  receipt={id:command.id,userId:user.id,kind:command.kind,giverUuid:null,itemId:null,beforeUses:uses,uses:next,reason:command.reason??null,approvedBy:game.user.id,messageId,at};
  operation=actorOperation(target,{'system.stats.medical.uses':next,['flags.'+scope+'.'+ledger]:addReceipt(target,receipt)});
  const paragraph=text('p',command.kind==='reset'?game.i18n.format("SWFFG.UI.Medical.ResetReceipt",{name:target.name,reason:command.reason==='rest'?game.i18n.localize("SWFFG.UI.Medical.RestReceiptReason"):game.i18n.localize("SWFFG.UI.Medical.DayElapsed")}):game.i18n.format("SWFFG.UI.Medical.AdjustReceipt",{name:target.name,before:uses,after:next}));paragraph.style.textAlign='justify';content=paragraph.outerHTML;
  quote={uses};
 }
 const chat={action:'create',documentName:'ChatMessage',keepId:true,data:[{_id:messageId,author:game.user.id,speaker:{alias:giver?.name??target.name},style:CONST.CHAT_MESSAGE_STYLES.OTHER,whisper:[],blind:false,content,flags:{[scope]:{medicalTreatment:{id:command.id,targetUuid:target.uuid,kind:command.kind}}}}]};
 const batch=itemOperation?[operation,itemOperation,chat]:[operation,chat];
 batch[Symbol.iterator]=function*(){
  yield operation;if(itemOperation)yield itemOperation;yield chat;verifyUser(user);
  if(operation.updates.length!==1||chat.data.length!==1||itemOperation&&itemOperation.updates.length!==1)throw Error(game.i18n.localize("SWFFG.UI.Medical.TreatmentRejected"));
  if(receiptFor(target,command.id))throw Error(game.i18n.localize("SWFFG.UI.Medical.CommandAlreadyRecorded"));
  if(command.kind==='use'){
   if(JSON.stringify(medicalQuote(giver,target,item,user))!==JSON.stringify(quote))throw Error(game.i18n.localize("SWFFG.UI.Medical.RecipientOrStockChanged"));
   if(Number(value(itemOperation.updates[0],'system.quantity.value'))!==quote.quantity-1||Number(value(operation.updates[0],'system.stats.wounds.value'))!==quote.after)throw Error(game.i18n.localize("SWFFG.UI.Medical.PreparedValuesChanged"));
  }else if(!permitted(target,user,true)||integer(target.system.stats?.medical?.uses,game.i18n.localize("SWFFG.UI.Medical.Counter"))!==quote.uses)throw Error(game.i18n.localize("SWFFG.UI.Medical.CounterOrPermissionChanged"));
  if(Number(value(operation.updates[0],'system.stats.medical.uses'))!==receipt.uses)throw Error(game.i18n.localize("SWFFG.UI.Medical.PreparedCounterChanged"));
  const receipts=value(operation.updates[0],'flags.'+scope+'.'+ledger);if(!Array.isArray(receipts)||!receipts.some(entry=>entry.id===receipt.id&&JSON.stringify(entry)===JSON.stringify(receipt)))throw Error(game.i18n.localize("SWFFG.UI.Medical.ReceiptChanged"));
 };
 await foundry.documents.modifyBatch(batch);
 if(!receiptFor(target,command.id)||!game.messages.has(messageId))throw Error(game.i18n.localize("SWFFG.UI.Medical.OperationNotConfirmed"));
 return {...receipt,replayed:false};
}
export function applyMedicalCommand(command,user=game.user,options={}){const task=queue.catch(()=>{}).then(()=>execute(command,user,options));queue=task;return task;}
async function handleRequest(user,command){
 const key=user.id+':'+command.id;if(processing.has(key))return;
 const task=(async()=>{
  try{
   let approved=false;
   if(command.kind==='reset'&&!user.isGM){
    const target=medicalActor(command.targetUuid);if(!permitted(target,user,true))throw Error(game.i18n.localize("SWFFG.UI.Medical.ActorNotOwned"));
    const reason=await approveReset?.(target,user,command.reason);approved=['rest','24h'].includes(reason);if(!approved)throw Error(game.i18n.localize("SWFFG.UI.Medical.ResetNotApproved"));command={...command,reason};
   }
   const result=await applyMedicalCommand(command,user,{resetApproved:approved});await user.setFlag(scope,'medicalResponse',{id:command.id,ok:true,result});
  }catch(error){await user.setFlag(scope,'medicalResponse',{id:command.id,ok:false,error:error.message});}
 })();processing.set(key,task);try{await task;}finally{processing.delete(key);}
}
Hooks.on('updateUser',(user,changes,_options,author)=>{
 if(changes.flags?.[scope]?.medicalRequest&&author===user.id&&game.users.activeGM?.id===game.user.id){
  const command=user.getFlag(scope,'medicalRequest');try{commandIdentity(command);void handleRequest(user,command).catch(error=>console.error('Star Wars FFG | Soins',error));}catch(error){console.warn(error);}
 }
 if(changes.flags?.[scope]?.medicalResponse&&user.id===game.user.id&&author===game.users.activeGM?.id){
  const response=user.getFlag(scope,'medicalResponse'),waiting=pending.get(response?.id);if(waiting){pending.delete(response.id);clearTimeout(waiting.timer);response.ok?waiting.resolve(response.result):waiting.reject(Error(response.error));}
 }
});
export async function requestMedicalCommand(command){
 if(!game.users.activeGM||game.users.activeGM.id===game.user.id)return applyMedicalCommand(command);
 const previous=game.user.getFlag(scope,'medicalResponse');if(previous?.id===command.id&&previous.ok)return {...previous.result,replayed:true};
 if(pending.has(command.id))return pending.get(command.id).promise;
 let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;}),timer=setTimeout(()=>{pending.delete(command.id);reject(Error(game.i18n.localize("SWFFG.UI.Medical.GMApprovalPending")));},120000);
 pending.set(command.id,{promise,resolve,reject,timer});
 try{await game.user.setFlag(scope,'medicalRequest',command);}catch(error){pending.delete(command.id);clearTimeout(timer);reject(error);}
 return promise;
}

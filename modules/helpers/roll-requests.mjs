import {cleanPool,requestData,recipientFor,canAnswerRequest,text} from './roll-request-model.mjs';
import {rollContext} from './roll-context.mjs';
const scope='starwarsffg';
const requestWindows=new Map(),requestWrites=new Map();
const tr=(key,data)=>data?game.i18n.format('SWFFG.UI.RollRequests.'+key,data):game.i18n.localize('SWFFG.UI.RollRequests.'+key);
const gmIds=()=>game.users.filter(user=>user.active&&user.isGM).map(user=>user.id);
const actorFor=async uuid=>{try{return await fromUuid(uuid);}catch{return null;}};
const actorOf=builder=>{
 const data=builder.roll?.data;
 for(const actor of [builder.weaponContext?.actor,data?.document,data?.actor])if(typeof actor?.testUserPermission==='function')return actor;
 if (data?.documentUuid) {
  try { return fromUuidSync(data.documentUuid); }
  catch { return null; }
 }
 return game.actors.get(data?.actor?._id??data?.actor?.id);
};
export const rollRequests=()=>game.messages.filter(message=>message.author?.isGM&&requestData(message)).slice(-20).reverse();

function ensureStyles(){
 if(document.querySelector('link[data-roll-requests]'))return;
 const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../styles/roll-requests.css',import.meta.url).href;link.dataset.rollRequests='';document.head.append(link);
}
function updateRequest(message,userId,patch){
 const previous=requestWrites.get(message.id)??Promise.resolve();
 const next=previous.catch(()=>{}).then(async()=>{
  if(game.users.activeGM?.id!==game.user.id)return;
  const data=requestData(message);if(!data||data.cancelled||data.states?.[userId]?.status==='rolled')return;
  await message.update({['flags.starwarsffg.rollRequest.states.'+userId]:patch});
 });
 requestWrites.set(message.id,next);
 return next.finally(()=>{if(requestWrites.get(message.id)===next)requestWrites.delete(message.id);});
}

export function connectedRollRecipient(actor) {
 if (!actor?.uuid || typeof actor.testUserPermission !== 'function') throw Error(tr('NoPlayerActor'));
 const owners = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission(user, 'OWNER'));
 if (!owners.length) throw Error(tr('NoConnectedOwner'));
 if (owners.length === 1) return owners[0];
 const assigned = owners.filter(user => user.character?.id === actor.id);
 if (assigned.length === 1) return assigned[0];
 throw Error(tr('AmbiguousOwner'));
}

export async function sendRollRequest(spec){
 if(!game.user.isGM)throw Error(tr('GMOnly'));
 const skillKey=text(spec.skillKey),rows=Array.isArray(spec.recipients)?spec.recipients:[];
 if(!rows.length||rows.length>50)throw Error(tr('ChoosePlayers'));
 const recipients=[],seen=new Set();
 for(const row of rows){
  const user=game.users.get(row.userId),actor=await actorFor(row.actorUuid);
  if(!user?.active||user.isGM||seen.has(user.id)||!actor?.testUserPermission(user,'OWNER')||!actor.system?.skills?.[skillKey])throw Error(tr('InvalidRecipient'));
  seen.add(user.id);recipients.push({userId:user.id,actorUuid:actor.uuid,actorName:text(actor.name)});
 }
 const dice=spec.dice==null?null:cleanPool(spec.dice),prepared=spec.prepared?{actorUuid:text(spec.prepared.actorUuid,512),pool:cleanPool(spec.prepared.pool),item:spec.prepared.item?JSON.parse(JSON.stringify(spec.prepared.item)):null,skipAid:spec.prepared.skipAid===true}:null;
 if(prepared&&(recipients.some(row=>row.actorUuid!==prepared.actorUuid)||JSON.stringify(prepared).length>60000))throw Error(tr('InvalidRecipient'));
 const data={version:1,skillKey,title:text(spec.title)||tr('RequestedRoll'),reason:text(spec.reason,2000),dice,prepared,created:Date.now(),recipients,states:Object.fromEntries(recipients.map(row=>[row.userId,{status:'pending'}])),cancelled:false};
 const content=document.createElement('div');content.className='ffg-roll-request-card';
 const title=document.createElement('strong');title.textContent=data.title;
 content.append(title);
 if(data.reason){
  const reason=document.createElement('p');reason.textContent=data.reason;reason.style.textAlign='justify';content.append(reason);
 }
 const button=document.createElement('button');button.type='button';button.dataset.openRollRequest='';button.textContent=tr('Open');
 content.append(button);
 return ChatMessage.create({author:game.user.id,whisper:[...new Set([...gmIds(),...recipients.map(row=>row.userId)])],content:content.outerHTML,flags:{[scope]:{rollRequest:data}}});
}

export async function openRequestedRoll(message){
 const data=requestData(message),recipient=recipientFor(message,game.user),actor=await actorFor(recipient?.actorUuid);
 if(!canAnswerRequest(message,game.user,actor))throw Error(tr('Unavailable'));
 const existing=requestWindows.get(message.id);
 if(existing){const builder=await existing;builder.bringToFront();return builder;}
 const promise=(async()=>{
  const id='ffg-roll-request-'+message.id;
  let builder;
  if(data.prepared){
   const {DicePoolFFG}=await import('../dice/pool.js');
   const {default:RollBuilder}=await import('../dice/roll-builder.js');
   builder=new RollBuilder(rollContext(actor),new DicePoolFFG(data.prepared.pool),data.title,data.skillKey,data.prepared.item,data.reason,null,{id});
   if(data.prepared.skipAid){builder._aidPrepared=true;builder._aidEntries=[];}
  }else{
   builder=await game.ffg.DiceHelpers.rollSkillByKey(
    actor.isToken ? {tokenUuid: actor.token.uuid} : actor.id,data.skillKey,data.dice?.difficulty,data.reason,undefined,{id,render:false}
   );
   if(!builder?.dicePool)throw Error(tr('Unavailable'));
   // Keep explicitly supplied pools for existing requests and API callers.
   if(data.dice){
    const apply=pool=>{pool._ignoreGMDifficulty=true;pool.difficulty=data.dice.difficulty;pool.challenge=data.dice.challenge;pool.boost=(Number(pool.boost)||0)+data.dice.boost;pool.setback=(Number(pool.setback)||0)+data.dice.setback;return pool;};
    apply(builder.dicePool);
    if(builder.weaponContext){const original=builder.weaponContext.makePool;builder.weaponContext.makePool=async(...args)=>apply(await original(...args));builder._weaponBaseline={...builder.dicePool};}
   }
  }
  if(!canAnswerRequest(message,game.user,actor)){await builder.close();throw Error(tr('Unavailable'));}
  builder._rollRequest={messageId:message.id,userId:game.user.id,actorUuid:actor.uuid};
  builder.addEventListener('close',()=>requestWindows.delete(message.id),{once:true});
  try{await builder.render(true);}
  catch(error){await builder.close();throw error;}
  return builder;
 })();
 requestWindows.set(message.id,promise);
 try{return await promise;}catch(error){requestWindows.delete(message.id);throw error;}
}

export function assertRequestedRoll(builder){
 if(!builder._rollRequest)return;
 if(builder._rollRequestSubmitted||!canAnswerRequest(game.messages.get(builder._rollRequest.messageId),game.user,actorOf(builder)))throw Error(tr('Unavailable'));
}

async function resultCreated(message){
 if(!game.user.isGM)return;
 const reference=message.getFlag(scope,'rollRequest');if(!reference?.messageId)return;
 const request=game.messages.get(reference.messageId),recipient=recipientFor(request,message.author),actor=await actorFor(reference.actorUuid);
 if(!recipient||reference.userId!==message.author?.id||!canAnswerRequest(request,message.author,actor)||!message.rolls.some(roll=>roll.ffg))return;
 await updateRequest(request,message.author.id,{status:'rolled',messageId:message.id});
}

function renderRequest(message,element){
 const data=requestData(message);
 if(!data || !message.author?.isGM)return;
 const root=element?.querySelector?element:element?.[0],button=root?.querySelector('[data-open-roll-request]');if(!button)return;
 if(game.user.isGM){
  const list=button.ownerDocument.createElement('ul');
  for(const recipient of data.recipients){
   const row=button.ownerDocument.createElement('li');
   const status=data.states?.[recipient.userId]?.status==='rolled'?'rolled':data.cancelled?'cancelled':'pending';
   row.textContent=[game.users.get(recipient.userId)?.name,recipient.actorName,tr(status)].filter(Boolean).join(' · ');
   list.append(row);
  }
  button.before(list);
  button.textContent=tr('CancelRequest');
  button.hidden=data.cancelled || data.recipients.every(row=>data.states?.[row.userId]?.status==='rolled');
  button.addEventListener('click',async()=>{
   button.disabled=true;
   try { await message.update({'flags.starwarsffg.rollRequest.cancelled':true}); }
   catch(error){ button.disabled=false; ui.notifications.warn(error.message); }
  });
  return;
 }
 button.hidden=!recipientFor(message,game.user);button.disabled=data.cancelled||data.states?.[game.user.id]?.status==='rolled';
 button.addEventListener('click',()=>openRequestedRoll(message).catch(error=>ui.notifications.warn(error.message)));
}

export function registerRollRequests(){
 ensureStyles();
 game.ffg.rollRequests={send:sendRollRequest,playerForActor:connectedRollRecipient,open:openRequestedRoll,assert:assertRequestedRoll,render:renderRequest,requests:rollRequests,
  requestFromBuilder:async builder=>{const {showRollRequestDialog}=await import('./roll-requests-ui.mjs');return showRollRequestDialog({builder});},
  show:async options=>{const {showRollRequestDialog}=await import('./roll-requests-ui.mjs');return showRollRequestDialog(options);}};
 Hooks.on('createChatMessage',message=>{
  if(requestData(message)){
   if(!message.author?.isGM)return;
   if(!game.user.isGM && recipientFor(message,game.user)){
    ui.notifications.info(tr('Received',{name:message.author.name}));
    void openRequestedRoll(message).catch(error=>ui.notifications.warn(error.message));
   }
  }else if(message.getFlag(scope,'rollRequest')?.messageId){
   void resultCreated(message).catch(error=>ui.notifications.error(error.message));
  }
 });
}
Hooks.once('ready',registerRollRequests);

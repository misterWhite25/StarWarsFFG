import {modes,bands,calibration,bandForDistance,movementQuote,spend,narrativeStep,cleanState} from './ground-movement-model.mjs';
export {modes,bands,calibration,movementQuote};
const scope='starwarsffg',flag='groundMovementState',personal=new Set(['character','minion','rival','nemesis']);
let queue=Promise.resolve();const waiting=new Map(),inflight=new Set(),historyCosts=new Map();
const sheetTokens=new Map();
let nativeMovementHandler;
export function registerNativeMovementHandler(handler){nativeMovementHandler=handler;}
export const isGroundToken=token=>token?.documentName==='Token'&&personal.has(token.actor?.type);
export function groundTokensForActor(actor,scene=canvas.scene){
 if(!actor||!scene)return [];
 return scene.tokens.filter(token=>isGroundToken(token)&&(actor.isToken?token.uuid===actor.parent?.uuid:token.actorId===actor.id)&&(game.user.isGM||!token.hidden&&token.object?.isVisible));
}
export function groundTokenForActor(actor,scene=canvas.scene){
 const tokens=groundTokensForActor(actor,scene),preferred=sheetTokens.get(actor?.uuid);
 const remembered=tokens.find(token=>token.uuid===preferred);if(remembered)return remembered;
 const controlled=tokens.filter(token=>token.object?.controlled);return controlled.length===1?controlled[0]:tokens.length===1?tokens[0]:null;
}
export function selectGroundSheetToken(actor,token){
 if(token&&!groundTokensForActor(actor,token.parent).some(candidate=>candidate.uuid===token.uuid))throw Error(game.i18n.localize("SWFFG.UI.Ground.WrongSheetToken"));
 if(token)sheetTokens.set(actor.uuid,token.uuid);else sheetTokens.delete(actor.uuid);
}
export function enabledMovementModes(){
 const enabled=new Set();
 if(game.settings.get(scope,'enableNarrativeMovement'))enabled.add('narrative');
 if(game.settings.get(scope,'enableBattlemapMovement'))enabled.add('battlemap');
 if(!game.settings.get(scope,'groundMovementModesMigrated')){
  const previous=[game.settings.get(scope,'groundMovementMode'),...(game.scenes??[]).map(scene=>scene.getFlag(scope,'groundMovement')?.mode)];
  for(const mode of ['narrative','battlemap'])if(previous.includes(mode))enabled.add(mode);
 }
 return ['narrative','battlemap'].filter(mode=>enabled.has(mode));
}
export function movementMode(scene=canvas.scene){
 const local=scene?.getFlag(scope,'groundMovement')?.mode,enabled=enabledMovementModes();
 if(local==='none')return 'none';
 if(Object.hasOwn(modes,local))return enabled.includes(local)?local:'none';
 const previous=game.settings.get(scope,'groundMovementMode');
 return enabled.includes(previous)?previous:enabled[0]??'none';
}
export async function migrateMovementModes(){
 if(!game.user.isGM||game.settings.get(scope,'groundMovementModesMigrated'))return;
 const enabled=enabledMovementModes();
 if(enabled.includes('narrative'))await game.settings.set(scope,'enableNarrativeMovement',true);
 if(enabled.includes('battlemap'))await game.settings.set(scope,'enableBattlemapMovement',true);
 await game.settings.set(scope,'groundMovementModesMigrated',true);
}
export async function setSceneMovementMode(scene,mode){
 if(!game.user.isGM)throw Error(game.i18n.localize("SWFFG.UI.Ground.GMOnlyMode"));
 if(scene?.documentName!=='Scene')throw Error(game.i18n.localize("SWFFG.UI.Ground.OpenSceneToChooseMode"));
 if(mode!=='none'&&!enabledMovementModes().includes(mode))throw Error(game.i18n.localize("SWFFG.UI.Ground.ModeMustBeEnabled"));
 if(!Object.hasOwn(modes,mode))throw Error(game.i18n.localize("SWFFG.UI.Ground.InvalidMode"));
 await scene.update({'flags.starwarsffg.groundMovement.mode':mode});
 if(movementMode(scene)!==mode)throw Error(game.i18n.localize("SWFFG.UI.Ground.ModeChangeFailed"));
 return mode;
}
export function contextFor(token){
 const combat=game.combats.find(c=>c.started&&c.scene?.id===token.parent.id&&c.combatants.some(entry=>entry.tokenId===token.id));
 return combat?combat.id+':'+combat.round:'manual:'+(token.getFlag(scope,flag)?.manual??0);
}
export const stateFor=token=>cleanState(token.getFlag(scope,flag),contextFor(token));
export const strainPaymentField=actor=>actor.type==='minion'?null:actor.type==='rival'?'wounds':'strain';
export function relationFor(token,target){
 const a=token?.getFlag(scope,'groundRelations')?.[target?.id],b=target?.getFlag(scope,'groundRelations')?.[token?.id];
 return !a?b:!b?a:(a.at>=b.at?a:b);
}
export function rangeFor(token,target){
 if(!isGroundToken(token)||!isGroundToken(target)||token.parent!==target.parent||token.id===target.id)return null;
 const mode=movementMode(token.parent),relation=relationFor(token,target);
 if(mode==='none')return null;
 if(mode==='narrative')return relation??null;
 // Contact is an explicit relationship, never a pixel-distance assumption.
 const position=[token.x,token.y,token.elevation,target.x,target.y,target.elevation].join(':');
 const reverse=[target.x,target.y,target.elevation,token.x,token.y,token.elevation].join(':');
 if(relation?.band===0&&[position,reverse].includes(relation.position))return {...relation,distance:0};
 const a=token.getCenterPoint(),b=target.getCenterPoint();
 const result=token.parent.grid.measurePath([{x:a.x,y:a.y,elevation:token.elevation},{x:b.x,y:b.y,elevation:target.elevation}]);
 return {band:bandForDistance(result.distance,calibration(token.parent)),distance:result.distance,progress:0};
}
export function groundAttackRange(actor){
 if(!canvas.scene||movementMode()==='none'||game.user.targets.size!==1)return null;
 const token=groundTokenForActor(actor);if(!token)return null;
 return rangeFor(token,[...game.user.targets][0].document);
}
export function groundAttackDifficulty(actor,item){
 if(item?.type!=='weapon')return undefined;
 const range=groundAttackRange(actor);if(!range||range.band>4)return undefined;
 const key=item.system.skill?.value??item.system.skill;
 if(['RangedLight','RangedHeavy','Gunnery','Ranged: Light','Ranged: Heavy'].includes(key)){
  if(range.band===0)return key==='Gunnery'?undefined:(['RangedHeavy','Ranged: Heavy'].includes(key)?3:2);
  return range.band;
 }
 return undefined;
}
function tokenFor(uuid){const token=fromUuidSync(uuid);if(!isGroundToken(token))throw Error(game.i18n.localize("SWFFG.UI.Ground.ChoosePersonalToken"));return token;}
function assertUser(token,user){if(!user?.active||!token.actor.testUserPermission(user,'OWNER'))throw Error(game.i18n.localize("SWFFG.UI.Ground.TokenNotOwned"));}
function assertTarget(token,target,user){
 // Visible enemy tokens normally have no Actor-sheet permission for players.
 if(token.parent!==target.parent||token.id===target.id||(!user.isGM&&target.hidden))throw Error(game.i18n.localize("SWFFG.UI.Ground.TargetUnavailable"));
}
function actorOperation(actor,updates){return {action:'update',documentName:'Actor',...(actor.isToken?{parent:actor.parent}:{}),updates:[{_id:actor.id,...updates}]};}
const prop=(object,key)=>Object.hasOwn(object??{},key)?object[key]:foundry.utils.getProperty(object??{},key);
async function execute(command,user){
 if(game.users.activeGM&&game.users.activeGM.id!==game.user.id)throw Error(game.i18n.localize("SWFFG.UI.Ground.ActiveGMRequired"));
 if(!game.user.isGM&&user.id!==game.user.id)throw Error(game.i18n.localize("SWFFG.UI.Ground.UnauthorizedCommand"));
 const token=tokenFor(command.tokenUuid);assertUser(token,user);
 if(!/^[A-Za-z0-9:._-]{1,180}$/.test(command.id??''))throw Error(game.i18n.localize("SWFFG.UI.Ground.InvalidCommand"));
 const mode=movementMode(token.parent);if(mode==='none')throw Error(game.i18n.localize("SWFFG.UI.Ground.MovementDisabled"));
 if(command.kind==='native-move'){if(!nativeMovementHandler)throw Error(game.i18n.localize("SWFFG.UI.Ground.AutomaticTrackingNotReady"));return nativeMovementHandler(command,user);}
 const raw=token.getFlag(scope,flag),state=stateFor(token),oldRevision=state.revision;
 if(state.receipts.includes(command.id))return state;
 if(command.context!==undefined&&command.context!==state.context)throw Error(game.i18n.localize("SWFFG.UI.Ground.TurnChanged"));
 if(command.revision!==undefined&&command.revision!==state.revision)throw Error(game.i18n.localize("SWFFG.UI.Ground.TrackingChanged"));
 let next={...state},relation,target,charge=0;
 const cost=count=>{next=spend(next,count,command.payment);charge=next.strainCost;delete next.strainCost;};
 switch(command.kind){
  case 'record':case 'unrecord':{
   if(mode!=='battlemap'||!state.tracking&&state.context.startsWith('manual:'))return state;
   if(!user.isGM&&command.native!==true)throw Error(game.i18n.localize("SWFFG.UI.Ground.NativePathRequired"));
   const distance=Number(command.distance);if(!Number.isFinite(distance)||distance<0)throw Error(game.i18n.localize("SWFFG.UI.Ground.InvalidDistance"));
   next.distance=command.kind==='unrecord'?Math.max(state.paidDistance,state.distance-distance):state.distance+distance;break;
  }
  case 'validate':{
   if(mode!=='battlemap')throw Error(game.i18n.localize("SWFFG.UI.Ground.BattlemapValidationRequired"));
   const {additional}=movementQuote(state,calibration(token.parent));if(!additional)throw Error(game.i18n.localize("SWFFG.UI.Ground.NoPathToConfirm"));cost(additional);next.movePaid+=additional;next.paidDistance=state.distance;break;
  }
  case 'step':{
   if(mode!=='narrative')throw Error(game.i18n.localize("SWFFG.UI.Ground.NarrativeModeRequired"));
   target=tokenFor(command.targetUuid);assertTarget(token,target,user);relation=narrativeStep(relationFor(token,target),command.direction);cost(command.difficult?2:1);break;
  }
  case 'range':{
   if(!user.isGM)throw Error(game.i18n.localize("SWFFG.UI.Ground.GMOnlyRange"));
   target=tokenFor(command.targetUuid);assertTarget(token,target,user);
   if(!Number.isInteger(command.band)||command.band<0||command.band>4)throw Error(game.i18n.localize("SWFFG.UI.Ground.InvalidRange"));relation={band:command.band,progress:0};break;
  }
  case 'contact':{
   target=tokenFor(command.targetUuid);assertTarget(token,target,user);
   const range=rangeFor(token,target);if(!range||range.band>1)throw Error(game.i18n.localize("SWFFG.UI.Ground.ShortRangeRequired"));
   if(range.band===0)throw Error(game.i18n.localize("SWFFG.UI.Ground.AlreadyEngaged"));relation={band:0,progress:0};cost(1);break;
  }
  case 'disengage':{
   target=tokenFor(command.targetUuid);assertTarget(token,target,user);
   if(rangeFor(token,target)?.band!==0)throw Error(game.i18n.localize("SWFFG.UI.Ground.NotEngaged"));relation={band:1,progress:0};cost(1);break;
  }
  case 'prone':cost(1);next.prone=!state.prone;break;
  case 'other':cost(1);break;
  case 'ignore':if(!user.isGM)throw Error(game.i18n.localize("SWFFG.UI.Ground.GMOnlyIgnore"));next.distance=state.paidDistance;break;
  case 'reset':{
   if(!user.isGM&&!state.context.startsWith('manual:'))throw Error(game.i18n.localize("SWFFG.UI.Ground.GMOnlyCombatReset"));
   next={...next,used:0,distance:0,paidDistance:0,movePaid:0,actionUsed:false,tracking:true};
   if(state.context.startsWith('manual:')){next.manual=(raw?.manual??0)+1;next.context='manual:'+next.manual;}break;
  }
  default:throw Error(game.i18n.localize("SWFFG.UI.Ground.UnknownCommand"));
 }
 next.manual??=raw?.manual??0;next.revision++;next.receipts=[...state.receipts,command.id].slice(-60);
 const updates={_id:token.id,['flags.'+scope+'.'+flag]:next};
 if(relation)updates['flags.'+scope+'.groundRelations.'+target.id]={...relation,position:[token.x,token.y,token.elevation,target.x,target.y,target.elevation].join(':'),at:Math.max(Date.now(),Number(relationFor(token,target)?.at??0)+1),author:user.id};
 const operation={action:'update',documentName:'Token',parent:token.parent,updates:[updates]},batch=[operation];
 let actorOp,before,paymentField;
 if(charge){
  paymentField=strainPaymentField(token.actor);if(!paymentField)throw Error(game.i18n.localize("SWFFG.UI.Ground.MinionCannotPayStrain"));
  before=Number(token.actor.system.stats?.[paymentField]?.value??0);if(!Number.isFinite(before))throw Error(game.i18n.localize("SWFFG.UI.Ground.MissingActorCounter"));
  actorOp=actorOperation(token.actor,{['system.stats.'+paymentField+'.value']:before+charge});batch.push(actorOp);
 }
 // Foundry can cancel individual documents in pre-update hooks. Do not commit a partial charge.
 batch[Symbol.iterator]=function*(){
  yield operation;if(actorOp)yield actorOp;
  assertUser(token,user);
  if(stateFor(token).revision!==oldRevision||contextFor(token)!==state.context||movementMode(token.parent)!==mode)throw Error(game.i18n.localize("SWFFG.UI.Ground.TrackingChangedBeforeCommit"));
  const prepared=foundry.utils.mergeObject(raw??{},prop(operation.updates[0],'flags.'+scope+'.'+flag)??{},{inplace:false});
  if(operation.updates.length!==1||!Object.entries(next).every(([key,value])=>JSON.stringify(prepared[key])===JSON.stringify(value)))throw Error(game.i18n.localize("SWFFG.UI.Ground.TrackingRejected"));
  if(actorOp&&(actorOp.updates.length!==1||Number(token.actor.system.stats[paymentField].value)!==before||Number(prop(actorOp.updates[0],'system.stats.'+paymentField+'.value'))!==before+charge))throw Error(game.i18n.localize("SWFFG.UI.Ground.StrainCostChanged"));
 };
 await foundry.documents.modifyBatch(batch);return next;
}
export function applyMovementCommand(command,user=game.user){const task=queue.catch(()=>{}).then(()=>execute(command,user));queue=task;return task;}
export async function requestMovementCommand(command){
 command={id:foundry.utils.randomID(),...command};
 if(!game.users.activeGM||game.users.activeGM.id===game.user.id)return applyMovementCommand(command);
 let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});
 const timer=setTimeout(()=>{waiting.delete(command.id);reject(Error(game.i18n.localize("SWFFG.UI.Ground.GMTimeout")));},20000);
 waiting.set(command.id,{resolve,reject,timer});
 try{await game.user.setFlag(scope,'groundMovementRequest',command);}catch(error){clearTimeout(timer);waiting.delete(command.id);reject(error);}return promise;
}
Hooks.on('updateUser',(user,changes,_options,author)=>{
 const flags=changes.flags?.[scope];
 if(flags?.groundMovementRequest&&author===user.id&&game.users.activeGM?.id===game.user.id){
  const command=user.getFlag(scope,'groundMovementRequest');if(inflight.has(command?.id))return;inflight.add(command?.id);
  // Native movement records are generated only by the authority's moveToken hook.
  void (async()=>{try{if(['record','unrecord'].includes(command?.kind))throw Error(game.i18n.localize("SWFFG.UI.Ground.FoundryRecordsPaths"));const result=await applyMovementCommand(command,user);await user.setFlag(scope,'groundMovementResponse',{id:command.id,result,error:null});}catch(error){await user.setFlag(scope,'groundMovementResponse',{id:command?.id,result:null,error:error.message});}finally{inflight.delete(command?.id);}})();
 }
 if(flags?.groundMovementResponse&&user.id===game.user.id&&author===game.users.activeGM?.id){
  const response=user.getFlag(scope,'groundMovementResponse'),pending=waiting.get(response?.id);if(!pending)return;waiting.delete(response.id);clearTimeout(pending.timer);response.error?pending.reject(Error(response.error)):pending.resolve(response.result);
 }
});
export function recordNativeMovement(token,movement,options,user){
 if((game.users.activeGM?.id??user.id)!==game.user.id||!isGroundToken(token)||movementMode(token.parent)!=='battlemap'||options.isUndo||options.ffgGroundAutomatic)return;
 if(!stateFor(token).tracking&&stateFor(token).context.startsWith('manual:'))return;
 if(!movement.passed?.waypoints?.length)return;
 const distance=movement.passed.cost;
 if(!Number.isFinite(distance)||distance<=0)return;
 const last=movement.passed.waypoints.at(-1),id='move:'+movement.id+':'+movement.subpathId+':'+last.x+':'+last.y+':'+last.elevation;
 // This is an authority-side observation, not a client-supplied distance.
 void applyMovementCommand({kind:'record',id,tokenUuid:token.uuid,context:contextFor(token),distance,native:true},user).catch(error=>ui.notifications.warn(error.message));
}
const historyCost=token=>(token.movementHistory??[]).reduce((sum,point)=>sum+(Number.isFinite(point.cost)?point.cost:0),0);
function rememberHistory(token){historyCosts.set(token.uuid,{cost:historyCost(token),context:contextFor(token)});}
Hooks.on('updateToken',(token,_changes,options,userId)=>{
 const old=historyCosts.get(token.uuid),now=historyCost(token);rememberHistory(token);
 const user=game.users.get(userId);if(!user||(game.users.activeGM?.id??userId)!==game.user.id||!isGroundToken(token)||movementMode(token.parent)!=='battlemap'||!options.isUndo||!old||old.context!==contextFor(token)||old.cost<=now)return;
 // Undo truncates native recorded history; its return journey has zero movement cost.
 void applyMovementCommand({kind:'unrecord',id:'undo:'+foundry.utils.randomID(),tokenUuid:token.uuid,context:contextFor(token),distance:old.cost-now,native:true},user).catch(error=>ui.notifications.warn(error.message));
});
const seedHistory=()=>{for(const scene of game.scenes)for(const token of scene.tokens)if(isGroundToken(token))rememberHistory(token);};
Hooks.once('ready',seedHistory);Hooks.on('canvasReady',seedHistory);
Hooks.on('deleteToken',token=>historyCosts.delete(token.uuid));

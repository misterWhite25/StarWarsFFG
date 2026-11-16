import {movementMode,isGroundToken,stateFor,contextFor,calibration,strainPaymentField,requestMovementCommand,registerNativeMovementHandler} from './ground-movement-state.mjs';
import {spend,movementQuote} from './ground-movement-model.mjs';
import {paymentFor} from './ground-movement-payment.mjs';
const scope='starwarsffg',flag='groundMovementState',pending=new Map(),approvals=new Map();
const pathKeys=['x','y','elevation','width','height','depth','shape','level','action','snapped','explicit','checkpoint'];
const movementCost=movement=>Math.max(Number(movement.passed.cost)||0,Number(movement.passed.distance)||0);
const position=token=>[token.x,token.y,token.elevation,token.width,token.height,token.depth,token.shape,token.level];
const actorOperation=(actor,updates)=>({action:'update',documentName:'Actor',...(actor.isToken?{parent:actor.parent}:{}),updates:[{_id:actor.id,...updates}]});
const prop=(object,key)=>Object.hasOwn(object??{},key)?object[key]:foundry.utils.getProperty(object??{},key);
function quote(token,distance){
 const state=stateFor(token),next={...state,distance:state.distance+distance},additional=movementQuote(next,calibration(token.parent)).additional;
 if(state.used+additional>2)throw Error(game.i18n.localize("SWFFG.UI.Ground.PathOverBudget"));
 return {state,next,additional};
}
async function executeNativeMovement(command,user){
 const token=fromUuidSync(command.tokenUuid);
 if(!isGroundToken(token)||movementMode(token.parent)!=='battlemap')throw Error(game.i18n.localize("SWFFG.UI.Ground.BattlemapInactive"));
 if(!user?.active||!token.actor.testUserPermission(user,'OWNER'))throw Error(game.i18n.localize("SWFFG.UI.Ground.TokenNotOwned"));
 if(!Array.isArray(command.waypoints)||!command.waypoints.length||command.waypoints.length>256)throw Error(game.i18n.localize("SWFFG.UI.Ground.InvalidPath"));
 const before=stateFor(token),raw=token.getFlag(scope,flag);
 if(before.receipts.includes(command.id))return {moved:true};
 if(before.context!==command.context||before.revision!==command.revision||JSON.stringify(position(token))!==JSON.stringify(command.origin))throw Error(game.i18n.localize("SWFFG.UI.Ground.TokenOrTurnChanged"));
 const session={tokenUuid:token.uuid,command,user,before,raw,prepared:false},capability=foundry.utils.randomID();approvals.set(capability,session);
 const operation={action:'update',documentName:'Token',parent:token.parent,updates:[{_id:token.id}],movement:{[token.id]:{waypoints:command.waypoints,method:'dragging',showRuler:true,constrainOptions:{ignoreWalls:user.isGM,ignoreCost:false}}},animate:command.animate!==false,ffgGroundAutomatic:capability};
 let actorOp,actorBefore,field;
 const verify=()=>{
  if(!user.active||!token.actor.testUserPermission(user,'OWNER'))throw Error(game.i18n.localize("SWFFG.UI.Ground.TokenControlLost"));
  if(!session.prepared||operation.updates.length!==1)throw Error(game.i18n.localize("SWFFG.UI.Ground.PathRejected"));
  if(contextFor(token)!==before.context||stateFor(token).revision!==before.revision||JSON.stringify(position(token))!==JSON.stringify(command.origin)||movementMode(token.parent)!=='battlemap')throw Error(game.i18n.localize("SWFFG.UI.Ground.TrackingChangedBeforeCommit"));
  const update=operation.updates[0],state=foundry.utils.mergeObject(raw??{},prop(update,'flags.'+scope+'.'+flag)??{},{inplace:false});
  if(!Object.entries(session.next).every(([key,value])=>JSON.stringify(state[key])===JSON.stringify(value)))throw Error(game.i18n.localize("SWFFG.UI.Ground.ManeuverCostChanged"));
  const merged=foundry.utils.mergeObject(token.toObject(),update,{inplace:false});
  for(const key of ['x','y','elevation'])if(merged[key]!==session.destination[key])throw Error(game.i18n.localize("SWFFG.UI.Ground.DestinationChanged"));
 };
 const batch=[operation];batch[Symbol.iterator]=function*(){
  yield operation;verify();
  if(session.charge){
   field=strainPaymentField(token.actor);if(!field)throw Error(game.i18n.localize("SWFFG.UI.Ground.MinionActionRequired"));
   actorBefore=Number(token.actor.system.stats?.[field]?.value??0);if(!Number.isFinite(actorBefore))throw Error(game.i18n.localize("SWFFG.UI.Ground.MissingStrainCounter"));
   actorOp=actorOperation(token.actor,{['system.stats.'+field+'.value']:actorBefore+session.charge});yield actorOp;
  }
  verify();
  if(actorOp&&(actorOp.updates.length!==1||Number(token.actor.system.stats[field].value)!==actorBefore||Number(prop(actorOp.updates[0],'system.stats.'+field+'.value'))!==actorBefore+session.charge))throw Error(game.i18n.localize("SWFFG.UI.Ground.StrainCostChanged"));
 };
 try{await foundry.documents.modifyBatch(batch);if(!stateFor(token).receipts.includes(command.id))throw Error(game.i18n.localize("SWFFG.UI.Ground.MovementNotRecorded"));return {moved:true};}
 finally{approvals.delete(capability);}
}
registerNativeMovementHandler(executeNativeMovement);

async function interceptMovement(token,movement,operation){
 if(operation.isUndo||operation.ffgGroundPlacement&&game.user.isGM||!isGroundToken(token)||movementMode(token.parent)!=='battlemap')return;
 const session=approvals.get(operation.ffgGroundAutomatic);
 if(session){if(session.tokenUuid!==token.uuid)throw Error(game.i18n.localize("SWFFG.UI.Ground.InvalidPathAuthorization"));session.movement=movement;return;}
 if(!movement.passed.waypoints.length||movementCost(movement)<=0)return;
 if(pending.has(token.uuid)){ui.notifications.warn(game.i18n.localize("SWFFG.UI.Ground.MovementPending"));return false;}
 let resolve;const promise=new Promise(done=>{resolve=done;}),entry={promise};pending.set(token.uuid,entry);
 const finish=result=>{if(pending.get(token.uuid)===entry)pending.delete(token.uuid);resolve(result);};
 try{
  const {state,additional}=quote(token,movementCost(movement)),origin=position(token),payment=additional?await paymentFor(token,additional):null;
  if(additional&&state.used+additional===2&&!payment){finish(false);return false;}
  const waypoints=[...movement.passed.waypoints,...movement.pending.waypoints].map(point=>Object.fromEntries(pathKeys.filter(key=>point[key]!==undefined).map(key=>[key,point[key]])));
  // Reject the original workflow first. Replay the native path in a single atomic
  // transaction with its counters and optional stress charge on the authority.
  setTimeout(()=>{void requestMovementCommand({kind:'native-move',tokenUuid:token.uuid,context:state.context,revision:state.revision,origin,waypoints,payment,animate:operation.animate!==false}).then(result=>finish(!!result?.moved)).catch(error=>{ui.notifications.warn(error.message);finish(false);});},0);
 }catch(error){ui.notifications.warn(error.message);finish(false);}
 return false;
}
Hooks.once('init',()=>{
 const Base=CONFIG.Token.documentClass;
 CONFIG.Token.documentClass=class SteelersGroundToken extends Base{
  async _preUpdateMovement(movement,operation){if((await super._preUpdateMovement(movement,operation))===false)return false;return interceptMovement(this,movement,operation);}
  async _preUpdate(changes,operation,user){
   const result=await super._preUpdate(changes,operation,user);if(result===false)return false;
   const session=approvals.get(operation.ffgGroundAutomatic),movement=operation._movement?.[this.id];
   if(session&&movement?.passed.waypoints.length){
    const {state,next,additional}=quote(this,movementCost(movement));
    const paid=additional?spend(next,additional,session.command.payment):next;session.charge=paid.strainCost??0;delete paid.strainCost;
    session.next={...paid,movePaid:state.movePaid+additional,paidDistance:paid.distance,tracking:true,manual:session.raw?.manual??0,revision:state.revision+1,receipts:[...state.receipts,session.command.id].slice(-60)};
    session.destination=movement.destination;session.prepared=true;changes['flags.'+scope+'.'+flag]=session.next;
   }
   return result;
  }
  async move(...args){const result=await super.move(...args),forwarded=pending.get(this.uuid);return forwarded?await forwarded.promise:result;}
  async update(data,options){const result=await super.update(data,options),forwarded=pending.get(this.uuid);if(forwarded&&['x','y','elevation'].some(key=>key in data))return await forwarded.promise?this:undefined;return result;}
 };
});

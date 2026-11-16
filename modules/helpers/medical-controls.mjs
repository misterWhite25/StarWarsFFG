import {medicalItemType} from './medical-item-type.mjs';
import {medicalActor,medicalNature,medicalItems,medicalQuote,requestMedicalCommand,setMedicalResetApproval} from './medical-treatment.mjs';

const windows=new Map(),resets=new Map(),types=new Set(['character','minion','rival','nemesis']);
const el=(tag,css,text)=>{const node=document.createElement(tag);if(css)node.className=css;if(text!==undefined)node.textContent=text;return node;};
function loadStyles(){if(document.querySelector('link[data-medical-controls]'))return;const link=el('link');link.rel='stylesheet';link.href=new URL('../../styles/medical-controls.css',import.meta.url).href;link.dataset.medicalControls='';document.head.append(link);}
function targets(giver){
 const people=new Map([[giver.uuid,giver]]);
 for(const actor of game.actors)if(types.has(actor.type)&&actor.testUserPermission(game.user,'OBSERVER'))people.set(actor.uuid,actor);
 for(const token of (game.scenes.viewed?.tokens??[])){const actor=token.actor;if(actor&&types.has(actor.type)&&actor.testUserPermission(game.user,'OBSERVER'))people.set(actor.uuid,actor);}
 return [...people.values()].sort((a,b)=>a.uuid===giver.uuid?-1:b.uuid===giver.uuid?1:a.name.localeCompare(b.name,game.i18n.lang));
}
function note(text){return el('p','ffg-medical-note',text);}
class MedicalUse extends foundry.applications.api.ApplicationV2{
 static DEFAULT_OPTIONS={classes:['starwarsffg','themed','ffg-medical-dialog'],window:{resizable:true},position:{width:480,height:'auto'}};
 constructor(giver,itemId){super({id:'ffg-medical-use-'+giver.uuid.replace(/[^a-z0-9]/gi,'-'),window:{title:game.i18n.format("SWFFG.UI.Medical.UseTitle",{name:giver.name})},position:{width:Math.min(480,innerWidth-32),height:'auto'}});this.giverUuid=giver.uuid;this.itemId=itemId;this.commandId=foundry.utils.randomID();this.hooks=[];this.busy=false;}
 get giver(){return medicalActor(this.giverUuid);}
 async _renderHTML(){
  if(this.root){this.refresh();return this.root;}
  this.root=el('form','ffg-medical-content');this.root.addEventListener('submit',event=>{event.preventDefault();void this.submit();});
  const targetLabel=el('label','',game.i18n.localize("SWFFG.UI.Medical.Recipient"));this.target=el('select');this.target.name='target';this.target.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Medical.Recipient"));
  for(const actor of targets(this.giver)){const option=el('option','',actor.name+(actor.uuid===this.giverUuid?game.i18n.localize("SWFFG.UI.Medical.SelfSuffix"):actor.isToken?game.i18n.localize("SWFFG.UI.Medical.TokenSuffix"):''));option.value=actor.uuid;this.target.append(option);}targetLabel.append(this.target);
  const itemLabel=el('label','',game.i18n.localize("SWFFG.UI.Medical.CarriedConsumable"));this.item=el('select');this.item.name='item';this.item.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Medical.CarriedConsumable"));itemLabel.append(this.item);
  this.target.addEventListener('change',()=>this.refresh());this.item.addEventListener('change',()=>{this.itemId=this.item.value;this.refresh();});
  this.summary=el('section','ffg-medical-summary');this.summary.setAttribute('aria-live','polite');
  this.message=el('p','ffg-medical-error');this.message.setAttribute('role','alert');this.message.hidden=true;
  const footer=el('footer'),cancel=el('button','',game.i18n.localize("SWFFG.UI.Medical.Cancel"));cancel.type='button';cancel.addEventListener('click',()=>{if(!this.busy)void this.close();});this.cancel=cancel;
  this.confirm=el('button','ffg-medical-confirm',game.i18n.localize("SWFFG.UI.Medical.Use"));this.confirm.type='submit';footer.append(cancel,this.confirm);
  this.root.append(targetLabel,itemLabel,this.summary,note(game.i18n.localize("SWFFG.UI.Medical.UseHint")),this.message,footer);this.refresh();return this.root;
 }
 _replaceHTML(result,content){content.replaceChildren(result);}
 async close(options={}){if(this.busy&&!options.medicalCommitted)return;return super.close(options);}
 async _onRender(context,options){await super._onRender(context,options);if(this.hooks.length)return;for(const hook of ['updateActor','deleteActor','updateItem','deleteItem','createItem','updateUser'])this.hooks.push([hook,Hooks.on(hook,()=>{if(this.rendered&&!this.busy)this.refresh();})]);}
 _onClose(options){super._onClose(options);for(const [hook,id]of this.hooks)Hooks.off(hook,id);if(windows.get(this.giverUuid)===this)windows.delete(this.giverUuid);}
 refresh(){
  if(!this.root)return;this.quote=null;this.summary.replaceChildren();
  try{
   const giver=this.giver,target=medicalActor(this.target.value),items=medicalItems(giver),previous=this.itemId??this.item.value;
   this.item.replaceChildren();
   for(const item of items){const count=Number(item.system.quantity?.value??0),option=el('option','',game.i18n.format("SWFFG.UI.Medical.ItemStock",{name:item.name,count,kind:medicalItemType(item)===2?game.i18n.localize("SWFFG.UI.Medical.DroidPatchSuffix"):''}));option.value=item.id;option.disabled=count<1;this.item.append(option);}
   if(items.some(item=>item.id===previous))this.item.value=previous;
   else{const nature=medicalNature(target),first=items.find(item=>Number(item.system.quantity?.value)>0&&(nature==='unknown'||medicalItemType(item)===(nature==='droid'?2:1)));if(first)this.item.value=first.id;}
   this.itemId=this.item.value;
   if(!items.length)throw Error(game.i18n.localize("SWFFG.UI.Medical.NoMedicalItem"));
   this.quote=medicalQuote(giver,target,giver.items.get(this.item.value));
   const q=this.quote,heading=el('strong','',q.kind===2?game.i18n.localize("SWFFG.UI.Medical.RepairPatch"):game.i18n.localize("SWFFG.UI.Medical.Stimpack"));this.summary.append(heading);
   const grid=el('div','ffg-medical-stats');
   for(const [label,value]of [[game.i18n.localize("SWFFG.UI.Medical.UseNumber"),(q.uses+1)+'/5'],[game.i18n.localize("SWFFG.UI.Medical.Healing"),game.i18n.format(q.healed>1?"SWFFG.UI.Medical.WoundMany":"SWFFG.UI.Medical.WoundOne",{count:q.healed})],[game.i18n.localize("SWFFG.UI.Medical.WoundsAfter"),q.after],[game.i18n.localize("SWFFG.UI.Medical.StockAfter"),q.quantity-1]]){const stat=el('div');stat.append(el('span','',label),el('strong','',String(value)));grid.append(stat);}this.summary.append(grid);
   if(q.healing>5-q.uses&&q.kind===1)this.summary.append(note(game.i18n.format("SWFFG.UI.Medical.StimpackSpecialization",{bonus:q.healing-(5-q.uses)})));
   if(q.healed<q.healing)this.summary.append(note(game.i18n.format("SWFFG.UI.Medical.HealingLimited",{healed:q.healed,healing:q.healing})));
   if(q.nature==='unknown')this.summary.append(note(game.i18n.localize("SWFFG.UI.Medical.UnknownSpeciesHint")));
  }catch(error){this.summary.append(el('p','ffg-medical-error',error.message));}
  this.target.disabled=this.busy;this.item.disabled=this.busy;this.confirm.disabled=this.busy||!this.quote;this.cancel.disabled=this.busy;
  const close=this.element?.querySelector('.window-header [data-action=close]');if(close)close.disabled=this.busy;
 }
 async submit(){
  if(this.busy||!this.quote)return;
  const command={id:this.commandId,kind:'use',giverUuid:this.giverUuid,targetUuid:this.target.value,itemId:this.item.value,expected:this.quote};this.busy=true;this.message.hidden=true;this.refresh();
  try{await requestMedicalCommand(command);await this.close({animate:false,medicalCommitted:true});}
  catch(error){this.message.textContent=error.message;this.message.hidden=false;}
  finally{this.busy=false;if(this.rendered)this.refresh();}
 }
}
export async function showMedicalUse(giver,{itemId}={}){
 if(!types.has(giver?.type)||!giver.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Medical.ActorNotOwned"));loadStyles();
 let app=windows.get(giver.uuid);if(!app){app=new MedicalUse(giver,itemId);windows.set(giver.uuid,app);}else if(itemId&&!app.busy)app.itemId=itemId;
 await app.render({force:true});if(app.minimized)await app.maximize();app.bringToFront();return app;
}
async function resetDialog(actor,{requester,reason}={}){
 loadStyles();if(resets.has(actor.uuid))throw Error(game.i18n.localize("SWFFG.UI.Medical.ResetAlreadyPending"));
 const content=el('div'),fields=el('div','ffg-medical-content');content.append(fields);
 if(requester)fields.append(note(game.i18n.format("SWFFG.UI.Medical.ResetRequested",{requester:requester.name,name:actor.name})));
 fields.append(note(game.i18n.localize("SWFFG.UI.Medical.ResetHint")));
 const label=el('label','',game.i18n.localize("SWFFG.UI.Medical.Reason")),select=el('select');select.name='reason';select.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Medical.RestReason"));
 for(const [value,title]of [['rest',game.i18n.localize("SWFFG.UI.Medical.FullRest")],['24h',game.i18n.localize("SWFFG.UI.Medical.DayElapsed")]]){const option=el('option','',title);option.value=value;if(value===(reason??'rest'))option.setAttribute('selected','');select.append(option);}label.append(select);fields.append(label);
 const task=foundry.applications.api.DialogV2.wait({classes:['starwarsffg','themed','ffg-medical-reset-dialog'],window:{title:game.i18n.format(game.user.isGM?"SWFFG.UI.Medical.ApproveRestTitle":"SWFFG.UI.Medical.RequestRestTitle",{name:actor.name})},position:{width:Math.min(440,innerWidth-32)},content,rejectClose:false,buttons:[{action:'confirm',label:game.user.isGM?game.i18n.localize("SWFFG.UI.Medical.Confirm"):game.i18n.localize("SWFFG.UI.Medical.AskGM"),callback:(_event,button)=>button.form.elements.reason.value},{action:'cancel',label:game.i18n.localize("SWFFG.UI.Medical.Cancel"),callback:()=>null}]});
 resets.set(actor.uuid,task);try{return await task;}finally{resets.delete(actor.uuid);}
}
setMedicalResetApproval(async(actor,requester,reason)=>{if(!['rest','24h'].includes(reason))return null;return resetDialog(actor,{requester,reason});});
export async function showMedicalReset(actor){
 if(!actor.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Medical.ActorNotOwned"));
 if(!game.user.isGM&&!game.users.activeGM)throw Error(game.i18n.localize("SWFFG.UI.Medical.GMRequiredForRest"));
 const reason=await resetDialog(actor);if(!reason)return;
 return requestMedicalCommand({id:foundry.utils.randomID(),kind:'reset',targetUuid:actor.uuid,reason});
}
export async function correctMedicalUses(actor){
 if(!actor.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Medical.ActorNotOwned"));
 return requestMedicalCommand({id:foundry.utils.randomID(),kind:'adjust',targetUuid:actor.uuid});
}

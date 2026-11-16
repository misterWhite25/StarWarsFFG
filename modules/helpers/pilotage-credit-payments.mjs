const scope='starwarsffg',ledger='pilotagePayments',windows=new Map();
const format={format:value=>Number(value).toLocaleString(game.i18n.lang,{maximumFractionDigits:2})};
let queue=Promise.resolve();
function guard(){if(!game.user.isGM)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.GMOnlyPayments"));}
function cents(value){
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value),result=Math.round(n*100);
 return Number.isFinite(n)&&n>=0&&Number.isSafeInteger(result)&&Math.abs(n*100-result)<0.00001?result:null;
}
const carried=actor=>cents(actor?.system.stats?.credits?.value);
const money=value=>value===null?game.i18n.localize("SWFFG.UI.Pilotage.NotSpecified"):format.format(value/100)+' cr';
function element(tag,css,text){const node=document.createElement(tag);if(css)node.className=css;if(text!==undefined)node.textContent=text;return node;}
const receiptFor=(actor,id)=>actor.getFlag(scope,ledger)?.find(entry=>entry.id===id);

function paymentChatContent(targets,cost,reason){
 const section=element('section','pilotage-credit-receipt'),title=element('h4','',targets.length>1?game.i18n.localize("SWFFG.UI.Pilotage.GroupPayment"):game.i18n.localize("SWFFG.UI.Pilotage.Payment"));
 title.style.cssText='font-size:14px;font-weight:600;line-height:1.2;margin:0 0 6px';
 const paragraph=element('p');paragraph.style.textAlign='justify';const names=document.createDocumentFragment();
 for(const [index,actor]of targets.entries()){if(index)names.append(document.createTextNode(index===targets.length-1?game.i18n.localize("SWFFG.UI.Pilotage.And"):', '));names.append(element('strong','',actor.name));}
 const parts={names,amount:element('strong','',money(cost))};for(const part of game.i18n.localize(targets.length>1?"SWFFG.UI.Pilotage.ReceiptMany":"SWFFG.UI.Pilotage.ReceiptOne").split(/(\{(?:names|amount)\})/))paragraph.append(parts[part.slice(1,-1)]??document.createTextNode(part));
 section.append(title,paragraph);
 if(targets.length>1){const total=element('p');total.style.textAlign='justify';total.append(document.createTextNode(game.i18n.localize("SWFFG.UI.Pilotage.TotalPrefix")),element('strong','',money(cost*targets.length)),document.createTextNode('.'));section.append(total);}
 if(reason){const note=element('p');note.style.textAlign='justify';note.append(element('em','',game.i18n.format("SWFFG.UI.Pilotage.ReasonText",{reason})));section.append(note);}
 return section.outerHTML;
}

/** One local queue and an atomic native write for the debit and its public receipt. */
export function payCharacterCredits(command,getActors){
 const task=queue.catch(()=>{}).then(async()=>{
  guard();const cost=cents(command.amount),ids=[...new Set(command.actorIds??[])];
  if(!cost)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.PositivePaymentAmount"));
  if(!ids.length)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.SelectCharacter"));
  if(typeof command.id!=='string'||!/^[A-Za-z0-9]{1,64}$/.test(command.id))throw Error(game.i18n.localize("SWFFG.UI.Pilotage.InvalidPayment"));
  const eligible=new Map(getActors().map(actor=>[actor.id,actor]));
  const targets=ids.map(id=>{const actor=eligible.get(id);if(!actor||!actor.isOwner||actor.isToken)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.PaymentCharacterUnavailable"));return actor;});
  const prior=targets.map(actor=>receiptFor(actor,command.id));
  if(prior.every(Boolean)){
   if(prior.some(receipt=>receipt.amount!==cost/100||receipt.userId!==game.user.id))throw Error(game.i18n.localize("SWFFG.UI.Pilotage.PaymentAlreadyUsed"));
   return {replayed:true,count:targets.length};
  }
  if(prior.some(Boolean))throw Error(game.i18n.localize("SWFFG.UI.Pilotage.PaymentPartlyRecorded"));
  const balances=targets.map(carried);
  const invalid=targets.filter((_actor,index)=>balances[index]===null||balances[index]<cost);
  if(invalid.length)throw Error(game.i18n.format("SWFFG.UI.Pilotage.PaymentInsufficientCredits",{names:invalid.map(actor=>actor.name).join(', ')}));
  const reason=String(command.reason??'').trim().slice(0,160),messageId=foundry.utils.randomID();
  if(!Number.isSafeInteger(cost*targets.length))throw Error(game.i18n.localize("SWFFG.UI.Pilotage.PaymentTotalTooHigh"));
  const updates=targets.map((actor,index)=>({
   _id:actor.id,'system.stats.credits.value':(balances[index]-cost)/100,
   ['flags.'+scope+'.'+ledger]:[...(actor.getFlag(scope,ledger)??[]).slice(-19),{id:command.id,userId:game.user.id,amount:cost/100,before:balances[index]/100,after:(balances[index]-cost)/100,reason,messageId,at:Date.now()}]
  }));
  const operation={action:'update',documentName:'Actor',updates};
  const chat={action:'create',documentName:'ChatMessage',keepId:true,data:[{
   _id:messageId,author:game.user.id,speaker:{alias:game.i18n.localize("SWFFG.UI.Pilotage.GMControl")},style:CONST.CHAT_MESSAGE_STYLES.OTHER,whisper:[],blind:false,
   content:paymentChatContent(targets,cost,reason),
   flags:{[scope]:{pilotagePayment:{id:command.id,actorIds:ids,amount:cost/100,total:cost*targets.length/100,reason}}}
  }]};
  const batch=[operation,chat];
  // Native preprocessing may silently remove a document cancelled by a hook.
  // Refuse any incomplete preparation before sending the batch to the server.
  batch[Symbol.iterator]=function*(){
   yield operation;yield chat;guard();
   if(chat.data.length!==1)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.PaymentReceiptRejected"));
   const currentEligible=new Set(getActors().map(actor=>actor.id));
   if(operation.updates.length!==targets.length)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.PaymentUpdateRejected"));
   for(const [index,actor]of targets.entries()){
    if(!currentEligible.has(actor.id)||!actor.isOwner||carried(actor)!==balances[index]||receiptFor(actor,command.id))throw Error(game.i18n.localize("SWFFG.UI.Pilotage.PaymentBalanceChanged"));
    const prepared=operation.updates.find(update=>update._id===actor.id);
    const value=prepared?.['system.stats.credits.value']??foundry.utils.getProperty(prepared??{},'system.stats.credits.value');
    if(cents(value)!==balances[index]-cost)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.PaymentPreparedAmountChanged"));
    const receipts=prepared?.['flags.'+scope+'.'+ledger]??foundry.utils.getProperty(prepared??{},'flags.'+scope+'.'+ledger);
    if(!Array.isArray(receipts)||!receipts.some(receipt=>receipt.id===command.id&&receipt.amount===cost/100&&receipt.after===(balances[index]-cost)/100))throw Error(game.i18n.localize("SWFFG.UI.Pilotage.PaymentRecordChanged"));
   }
  };
  await foundry.documents.modifyBatch(batch);
  if(!game.messages.has(messageId)||targets.some(actor=>!receiptFor(actor,command.id)))throw Error(game.i18n.localize("SWFFG.UI.Pilotage.PaymentNotConfirmed"));
  return {replayed:false,count:targets.length};
 });queue=task;return task;
}

class CreditPayment extends foundry.applications.api.ApplicationV2{
 static DEFAULT_OPTIONS={classes:['starwarsffg','themed','pilotage-credit-payment'],window:{resizable:true},position:{width:560,height:600}};
 constructor(getActors,actorId){
  const candidates=getActors().filter(actor=>!actorId||actor.id===actorId);if(!candidates.length)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.NoCharacterAvailable"));
  const key=actorId??'group';super({id:'ffg-credit-payment-'+key,window:{title:actorId?game.i18n.format("SWFFG.UI.Pilotage.ChargeCharacter",{name:candidates[0].name}):game.i18n.localize("SWFFG.UI.Pilotage.GroupPayment")},position:{width:Math.min(560,window.innerWidth-32),height:Math.min(actorId?430:600,window.innerHeight-40)}});
  this.key=key;this.getActors=getActors;this.candidates=candidates.map(actor=>({id:actor.id,name:actor.name,img:actor.img}));this.selected=new Set(candidates.map(actor=>actor.id));this.paymentId=foundry.utils.randomID();this.busy=false;this.hooks=[];
 }
 async _renderHTML(){
  guard();if(this.root)return this.root;
  this.root=element('form','pilotage-credit-payment-content');
  this.root.addEventListener('submit',event=>{event.preventDefault();void this.submit();});
  const fields=element('div','pilotage-credit-payment-fields'),amountLabel=element('label','',game.i18n.localize("SWFFG.UI.Pilotage.AmountPerCharacter"));
  this.amount=element('input');this.amount.name='amount';this.amount.type='number';this.amount.min='0.01';this.amount.step='0.01';this.amount.required=true;this.amount.placeholder='5';this.amount.autofocus=true;this.amount.addEventListener('input',()=>this.refresh());amountLabel.append(this.amount);
  const reasonLabel=element('label','',game.i18n.localize("SWFFG.UI.Pilotage.OptionalReason"));this.reason=element('input');this.reason.type='text';this.reason.maxLength=160;this.reason.placeholder=game.i18n.localize("SWFFG.UI.Pilotage.ReasonPlaceholder");reasonLabel.append(this.reason);fields.append(amountLabel,reasonLabel);
  this.root.append(fields,element('p','pilotage-credit-payment-note',game.i18n.localize("SWFFG.UI.Pilotage.PaymentDebitHint")));
  if(this.candidates.length>1){
   const tools=element('div','pilotage-credit-payment-tools');
   for(const [caption,select]of [[game.i18n.localize("SWFFG.UI.Pilotage.SelectAll"),true],[game.i18n.localize("SWFFG.UI.Pilotage.ClearAll"),false]]){const button=element('button','',caption);button.type='button';button.addEventListener('click',()=>{if(this.busy)return;this.selected=new Set(select?this.candidates.map(actor=>actor.id):[]);this.refresh();});tools.append(button);}this.root.append(tools);
  }
  const headings=element('div','pilotage-credit-payment-row pilotage-credit-payment-head');headings.append(element('span','',game.i18n.localize("SWFFG.UI.Pilotage.Character")),element('span','',game.i18n.localize("SWFFG.UI.Pilotage.Carried")),element('span','',game.i18n.localize("SWFFG.UI.Pilotage.After")));
  this.list=element('div','pilotage-credit-payment-list');this.list.tabIndex=0;this.list.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Pilotage.CharactersToCharge"));
  this.summary=element('p','pilotage-credit-payment-summary');this.summary.setAttribute('aria-live','polite');
  this.error=element('p','pilotage-credit-payment-error');this.error.setAttribute('role','alert');this.error.hidden=true;
  const footer=element('footer','pilotage-credit-payment-footer'),cancel=element('button','',game.i18n.localize("SWFFG.UI.Pilotage.Cancel"));cancel.type='button';cancel.addEventListener('click',()=>{if(!this.busy)void this.close();});
  this.confirm=element('button','pilotage-credit-payment-confirm',game.i18n.localize("SWFFG.UI.Pilotage.Charge"));this.confirm.type='submit';footer.append(cancel,this.confirm);
  this.root.append(headings,this.list,this.summary,this.error,footer);this.refresh();return this.root;
 }
 _replaceHTML(result,content){content.replaceChildren(result);}
 async _onRender(context,options){
  await super._onRender(context,options);if(this.hooks.length)return;
  for(const hook of ['updateActor','deleteActor','updateUser'])this.hooks.push([hook,Hooks.on(hook,()=>{if(!this.rendered)return;if(!game.user.isGM){void this.close();return;}this.refresh();})]);
 }
 _onClose(options){super._onClose(options);for(const [hook,id]of this.hooks)Hooks.off(hook,id);this.hooks=[];if(windows.get(this.key)===this)windows.delete(this.key);}
 refresh(){
  const cost=cents(this.amount.value),validAmount=cost!==null&&cost>0,eligible=new Map(this.getActors().map(actor=>[actor.id,actor]));
  const scroll=this.list.scrollTop;this.list.replaceChildren();let blocked=false;
  for(const candidate of this.candidates){
   const actor=eligible.get(candidate.id),funds=carried(actor),checked=this.selected.has(candidate.id),insufficient=validAmount&&(funds===null||funds<cost),unavailable=!actor;
   const row=element('div','pilotage-credit-payment-row');row.dataset.actorId=candidate.id;row.classList.toggle('is-blocked',checked&&(insufficient||unavailable));
   const label=element('label'),check=element('input');check.type='checkbox';check.checked=checked;check.disabled=this.busy;check.setAttribute('aria-label',game.i18n.format("SWFFG.UI.Pilotage.ChargeCharacterAria",{name:candidate.name}));
   check.addEventListener('change',()=>{if(check.checked)this.selected.add(candidate.id);else this.selected.delete(candidate.id);this.error.hidden=true;this.refresh();});
   const image=element('img');image.src=actor?.img??candidate.img;image.alt='';image.width=24;image.height=24;
   label.append(check,image,element('span','',actor?.name??candidate.name));
   const balance=element('span','pilotage-credit-payment-number',unavailable?game.i18n.localize("SWFFG.UI.Pilotage.Unavailable"):money(funds));
   const after=element('span','pilotage-credit-payment-number',!checked?'-':!validAmount?'…':insufficient||unavailable?game.i18n.localize("SWFFG.UI.Pilotage.Impossible"):money(funds-cost));
   row.append(label,balance,after);this.list.append(row);if(checked&&(unavailable||insufficient))blocked=true;
  }
  this.list.scrollTop=scroll;
  const count=this.selected.size,total=validAmount?cost*count:null,totalValid=total!==null&&Number.isSafeInteger(total);
  this.summary.textContent=validAmount?game.i18n.format("SWFFG.UI.Pilotage.PaymentTotals",{selected:game.i18n.format(count===1?"SWFFG.UI.Pilotage.SelectedOne":"SWFFG.UI.Pilotage.SelectedMany",{count}),amount:money(cost),total:totalValid?money(total):game.i18n.localize("SWFFG.UI.Pilotage.AmountTooHigh")}):game.i18n.format(count===1?"SWFFG.UI.Pilotage.SelectedOne":"SWFFG.UI.Pilotage.SelectedMany",{count});
  if(blocked)this.summary.append(document.createTextNode(game.i18n.localize("SWFFG.UI.Pilotage.PaymentAdjustHint")));
  this.confirm.disabled=this.busy||!count||!validAmount||!totalValid||blocked;
  this.amount.disabled=this.busy;this.reason.disabled=this.busy;
  for(const button of this.root.querySelectorAll('.pilotage-credit-payment-tools button,.pilotage-credit-payment-footer button:not([type=submit])'))button.disabled=this.busy;
 }
 async submit(){
  if(this.busy||this.confirm.disabled||!this.root.reportValidity())return;
  this.busy=true;this.error.hidden=true;this.refresh();
  try{
   const result=await payCharacterCredits({id:this.paymentId,actorIds:[...this.selected],amount:this.amount.value,reason:this.reason.value},this.getActors);
   ui.notifications.info(game.i18n.format(result.count===1?"SWFFG.UI.Pilotage.PaymentSavedOne":"SWFFG.UI.Pilotage.PaymentSavedMany",{count:result.count}));await this.close();
  }catch(error){this.error.textContent=error.message;this.error.hidden=false;}
  finally{this.busy=false;if(this.rendered)this.refresh();}
 }
}
export async function showCreditPayment(getActors,actorId=null){
 guard();const key=actorId??'group';let app=windows.get(key);
 if(!app){app=new CreditPayment(getActors,actorId);windows.set(key,app);}await app.render({force:true});app.bringToFront();return app;
}

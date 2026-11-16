const scope='starwarsffg',key='vehicleLogbook',voyageScope='swffg-compendium-bilingual-steelers-core_rule';
const pending=new Map();
const clone=v=>foundry.utils.deepClone(v);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tr=k=>game.i18n.localize(`SWFFG.VehicleLogbook.${k}`);
const entries=actor=>clone(actor.getFlag(scope,key)??[]);
const writable=actor=>actor?.type==='vehicle'&&actor.isOwner;
const statusName=s=>tr(({rolled:'Rolled',completed:'Completed',interrupted:'Interrupted','not-departed':'NotDeparted',planned:'Planned'})[s]??'Planned');
const number=v=>Number(v).toLocaleString(game.i18n.lang||'fr',{maximumFractionDigits:2});
export function journeyFromMessage(message){
  const roll=message.rolls?.find(r=>r.data?.flags?.[voyageScope]?.voyage),trip=roll?.data.flags[voyageScope].voyage;
  if(!trip?.id||!trip.shipUuid||!roll.ffg)return null;
  const spent=message.getFlag(scope,'combatActions')?.entries??[];
  const has=(effect,currencies)=>spent.some(e=>!e.undone&&e.kind==='astrogation'&&e.effect===effect&&e.quantity===1&&currencies.includes(e.currency)&&e.cost===(e.currency==='triumph'||e.currency==='despair'?1:3));
  const factor=1-(has('astro-faster',['advantage','triumph'])?0.25:0)+(has('astro-slower',['threat','despair'])?0.25:0);
  const hours=Number(trip.baseHours)*Number(trip.hyperdrive??1)*factor+Number(trip.preparation??0);
  return {id:`trip:${trip.id}`,tripId:trip.id,source:'astrogation',messageId:message.id,shipUuid:trip.shipUuid,when:new Date(message.timestamp??Date.now()).toISOString(),from:String(trip.from??''),to:String(trip.to??''),navigator:String(trip.navigator??''),route:String(trip.route??''),nodes:clone(trip.nodes??[]),hours:Number.isFinite(hours)?hours:null,status:'rolled',note:'',success:Number(roll.ffg.success??0)>Number(roll.ffg.failure??0)};
}
export function collectVehicleJourneys(actor,messages=[]){
  const saved = entries(actor);
  const deleted = new Set(saved.filter(entry => entry.deleted).map(entry => entry.id));
  const rows = new Map(saved.map(entry => [entry.id, entry]));
  for(const message of messages){const entry=journeyFromMessage(message);if(entry?.shipUuid===actor.uuid)rows.set(entry.id,entry);}
  const history=actor.flags?.[voyageScope]?.voyageResources?.history??{};
  for(const receipt of Object.values(history)){
    const id=`trip:${receipt.id}`,prior=rows.get(id)??{};
    rows.set(id,{...prior,id,tripId:receipt.id,source:'astrogation',messageId:receipt.messageId,when:receipt.when,from:receipt.from,to:receipt.to,navigator:receipt.navigator,route:receipt.route,hours:receipt.cost?.hours??null,status:receipt.outcome,note:receipt.note??'',fuel:receipt.cost?.fuel,maintenance:receipt.cost?.maintenance,totalCost:receipt.cost?.value,refuel:receipt.refuel??(receipt.supply?.fuelAdded>0?{units:receipt.supply.fuelAdded,total:receipt.cost?.fuelValue}:null),breakdown:receipt.breakdown?.title});
  }
  return [...rows.values()].filter(e=>!deleted.has(e.id)).sort((a,b)=>String(b.when??'').localeCompare(String(a.when??'')));
}
export function prepareVehicleLogbook(actor){
  return collectVehicleJourneys(actor,Array.from(game.messages?.contents??game.messages??[])).map(row=>({...row,dateLabel:row.dateLabel||formatDate(row.when),hoursLabel:row.hours===null||row.hours===undefined?'':`${number(row.hours)} h`,statusLabel:statusName(row.status),automatic:row.source==='astrogation',canEdit:actor.isOwner&&row.source==='manual',canDelete:actor.isOwner}));
}
function formatDate(value){const d=new Date(value);return Number.isNaN(d.getTime())?String(value??''):d.toLocaleString(game.i18n.lang||'fr',{dateStyle:'short',timeStyle:'short'});}
async function mutate(actor,change){
  if(!writable(actor))throw Error(tr('Forbidden'));
  const previous=pending.get(actor.uuid)??Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{if(!writable(actor))throw Error(tr('Forbidden'));const before=entries(actor),after=change(before);if(JSON.stringify(after)!==JSON.stringify(before))await actor.setFlag(scope,key,after);return after;});
  pending.set(actor.uuid,next);try{return await next;}finally{if(pending.get(actor.uuid)===next)pending.delete(actor.uuid);}
}
export function manualJourney(data){
  const from=String(data.from??'').trim(),to=String(data.to??'').trim(),hours=Number(data.hours);
  if(!from||!to||from.length>200||to.length>200)throw Error(tr('PlacesRequired'));
  if(!Number.isFinite(hours)||hours<0)throw Error(tr('InvalidDuration'));
  const status=['planned','completed','interrupted','not-departed'].includes(data.status)?data.status:'completed';
  return {from,to,hours,status,dateLabel:String(data.dateLabel??'').slice(0,200),navigator:String(data.navigator??'').slice(0,200),note:String(data.note??'').slice(0,2000)};
}
export async function saveManualJourney(actor,data,{id=null,revision=null}={}){
  const values=manualJourney(data);
  return mutate(actor,list=>{
    if(!id)return [...list,{...values,id:foundry.utils.randomID(),source:'manual',when:new Date().toISOString(),revision:0}];
    const current=list.find(e=>e.id===id);
    if(!current||current.source!=='manual'||current.revision!==revision)throw Error(tr('Stale'));
    return list.map(e=>e.id===id?{...e,...values,revision:e.revision+1}:e);
  });
}
export async function deleteVehicleJourney(actor,id,expected){
  return mutate(actor,list=>{
    const current=collectVehicleJourneys(actor,Array.from(game.messages?.contents??game.messages??[])).find(e=>e.id===id);
    if(!current||JSON.stringify(current)!==expected)throw Error(tr('Stale'));
    // Retain a deletion marker so chat backfill and settlement history cannot recreate the row.
    const marker={id,deleted:true,source:'deleted',when:new Date().toISOString()};
    return [...list.filter(e=>e.id!==id),marker];
  });
}
function isRecorder(message){
  const gm=Array.from(game.users??[]).filter(u=>u.active&&u.isGM).sort((a,b)=>a.id.localeCompare(b.id))[0];
  return gm?gm.id===game.user.id:message.author?.id===game.user.id;
}
export async function recordVehicleJourney(message){
  if(!isRecorder(message))return;
  const row=journeyFromMessage(message);if(!row)return;
  const actor=await fromUuid(row.shipUuid);if(!writable(actor))return;
  await mutate(actor,list=>{const old=list.find(e=>e.id===row.id);if(old?.deleted)return list;return old?list.map(e=>e.id===row.id?row:e):[...list,row];});
}
async function editJourney(sheet,entry){
  if(!sheet.isEditable||!writable(sheet.actor))return;
  const value=k=>esc(entry?.[k]??(k==='hours'?0:''));
  const statuses=['completed','planned','interrupted','not-departed'];
  const content=`<div class="ffg-logbook-editor"><label>${tr('Date')}<input name="dateLabel" type="text" value="${value('dateLabel')}"></label><div class="logbook-form-row"><label>${tr('From')}<input name="from" type="text" maxlength="200" required value="${value('from')}"></label><label>${tr('To')}<input name="to" type="text" maxlength="200" required value="${value('to')}"></label></div><div class="logbook-form-row"><label>${tr('Navigator')}<input name="navigator" type="text" value="${value('navigator')}"></label><label>${tr('Hours')}<input name="hours" type="number" min="0" step="any" required value="${value('hours')}"></label></div><label>${tr('Status')}<select name="status">${statuses.map(s=>`<option value="${s}"${s===(entry?.status??'completed')?' selected':''}>${statusName(s)}</option>`).join('')}</select></label><label>${tr('Notes')}<textarea name="note" maxlength="2000" rows="3">${value('note')}</textarea></label><p class="logbook-error" role="alert"></p></div>`;
  const app=new foundry.applications.api.DialogV2({window:{title:tr(entry?'Edit':'Add')},classes:['starwarsffg','themed'],position:{width:580},content,buttons:[{action:'save',label:tr('Save'),default:true,callback:async(_event,_button,dialog)=>{try{const data=Object.fromEntries(['from','to','hours','dateLabel','navigator','status','note'].map(k=>[k,dialog.element.querySelector(`[name="${k}"]`).value]));await saveManualJourney(sheet.actor,data,{id:entry?.id,revision:entry?.revision});}catch(e){dialog.element.querySelector('.logbook-error').textContent=e.message;throw e;}}},{action:'cancel',label:tr('Cancel')}],rejectClose:false});
  await app.render({force:true});
}
function showJourney(entry){
  const fields=[[tr('Date'),entry.dateLabel||formatDate(entry.when)],[tr('From'),entry.from],[tr('To'),entry.to],[tr('Navigator'),entry.navigator],[tr('Duration'),entry.hours===null?'':`${number(entry.hours)} h`],[tr('Status'),statusName(entry.status)],[tr('FuelAdded'),entry.refuel?.units>0?number(entry.refuel.units):''],[tr('RefuelPrice'),entry.refuel?.units>0&&entry.refuel.unitPrice!==undefined?number(entry.refuel.unitPrice)+' '+tr('CreditsPerUnit'):''],[tr('RefuelCost'),entry.refuel?.units>0&&entry.refuel.total!==undefined?number(entry.refuel.total)+' '+tr('Credits'):''],[tr('MaintenanceCost'),entry.maintenance!==undefined?number(entry.maintenance)+' '+tr('Credits'):''],[tr('TotalCost'),entry.totalCost!==undefined?number(entry.totalCost)+' '+tr('Credits'):''],[tr('Route'),entry.route],[tr('Notes'),entry.note]];
  const content=`<div class="ffg-logbook-detail"><dl>${fields.filter(([,v])=>v!==undefined&&v!=='').map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${entry.nodes?.length?`<p>${entry.nodes.map(esc).join(' → ')}</p>`:''}</div>`;
  return new foundry.applications.api.DialogV2({window:{title:tr('Title')},classes:['starwarsffg','themed'],position:{width:660},content,buttons:[{action:'close',label:tr('Close')}],rejectClose:false}).render({force:true});
}
export function activateVehicleLogbook(sheet){
  if(sheet.actor.type!=='vehicle')return;
  const root=sheet.element.querySelector('.ffg-vehicle-logbook');if(!root)return;
  root.addEventListener('click',async event=>{
    const control=event.target.closest('[data-logbook-action]');if(!control)return;
    event.preventDefault();event.stopPropagation();
    const action=control.dataset.logbookAction,id=control.closest('[data-journey-id]')?.dataset.journeyId;
    try{
      const entry=collectVehicleJourneys(sheet.actor,Array.from(game.messages?.contents??game.messages??[])).find(e=>e.id===id);
      if(action==='view'&&entry){showJourney(entry);return;}
      if(!sheet.isEditable||!writable(sheet.actor))return;
      if(action==='add')await editJourney(sheet,null);
      else if(action==='edit'&&entry?.source==='manual')await editJourney(sheet,entry);
      else if(action==='delete'&&entry){
        const expected=JSON.stringify(entry);
        if(await foundry.applications.api.DialogV2.confirm({window:{title:tr('Delete')},content:`<p>${tr('DeleteConfirm')}</p>`}))await deleteVehicleJourney(sheet.actor,id,expected);
      }
    }catch(e){ui.notifications.error(e.message);}
  });
}
if(globalThis.Hooks){
  const record=message=>recordVehicleJourney(message).catch(e=>console.error('Vehicle logbook',e));
  Hooks.on('createChatMessage',record);Hooks.on('updateChatMessage',record);
  Hooks.once('ready',async()=>{for(const message of Array.from(game.messages?.contents??game.messages??[]))await record(message);});
}

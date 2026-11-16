import {vehicleDamageResource} from './vehicle-minion-group.mjs';
// Aucune question indiscrète, table 3-4, p. 76. Targeted strain is a campaign adaptation.
const scope='starwarsffg',key='combatActions',voyageScope='swffg-compendium-bilingual-steelers-core_rule';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>foundry.utils.deepClone(v);
const numeric=v=>Number.isFinite(Number(v))?Number(v):0;
const ledger=m=>clone(m.getFlag(scope,key)??{entries:[]});
export function astrogationTrip(message){return message.rolls?.find(r=>r.data?.flags?.[voyageScope]?.voyage)?.data.flags[voyageScope].voyage;}
export function isAstrogationMessage(message){
  if(astrogationTrip(message))return true;
  const skill=message.getFlag(scope,'combatSkill')??message.rolls?.find(r=>r.hasFFG)?.skillName??'';
  return /^(astrogation|astronavigation)$/i.test(String(skill).trim());
}
export function failedAstrogation(message){const s=message.rolls?.find(r=>r.ffg)?.ffg??{};return numeric(s.success)<=numeric(s.failure);}
export function astrogationOptions({negative=true,failed=false,voyage=false}={}){
  const options=[
    {id:'astro-next-boost',name:game.i18n.localize("SWFFG.UI.Astrogation.AstroNextBoost"),payments:{advantage:1}},
    {id:'astro-recover',name:game.i18n.localize("SWFFG.UI.Astrogation.AstroRecover"),payments:{advantage:2},stat:'strain',amount:-2},
    {id:'astro-faster',name:game.i18n.localize("SWFFG.UI.Astrogation.AstroFaster"),payments:{advantage:3,triumph:1},max:1,time:true},
    {id:'astro-shortcut',name:game.i18n.localize("SWFFG.UI.Astrogation.AstroShortcut"),payments:{triumph:1},max:1}
  ];
  if(failed&&voyage)options.unshift({id:'astro-cancel-departure',name:game.i18n.localize("SWFFG.UI.Astrogation.AstroCancelDeparture"),payments:{advantage:2},max:1,departure:true});
  if(negative)options.push(
    {id:'astro-overload',name:game.i18n.localize("SWFFG.UI.Astrogation.AstroOverload"),payments:{threat:1},stat:'strain',amount:1,shipDefault:true},
    {id:'astro-stress',name:game.i18n.localize("SWFFG.UI.Astrogation.AstroStress"),payments:{threat:2},stat:'strain',amount:2},
    {id:'astro-debris',name:game.i18n.localize("SWFFG.UI.Astrogation.AstroDebris"),payments:{threat:2},stat:'hullTrauma',amount:1,shipOnly:true},
    {id:'astro-mynocks',name:game.i18n.localize("SWFFG.UI.Astrogation.AstroMynocks"),payments:{threat:2},stat:'strain',amount:3,shipDefault:true},
    {id:'astro-course',name:game.i18n.localize("SWFFG.UI.Astrogation.AstroWrongCourse"),payments:{threat:3,despair:1},max:1},
    {id:'astro-slower',name:game.i18n.localize("SWFFG.UI.Astrogation.AstroSlower"),payments:{threat:3,despair:1},max:1,time:true},
    {id:'astro-hyperdrive',name:game.i18n.localize("SWFFG.UI.Astrogation.AstroHyperdrive"),payments:{despair:1},max:1},
    {id:'astro-critical',name:game.i18n.localize("SWFFG.UI.Astrogation.AstroCritical"),payments:{despair:2},max:1}
  );
  return options;
}
export function canSpendAstrogationOption(option,available,entries=[]){
  const used=entries.filter(e=>!e.undone&&e.effect===option.id).reduce((n,e)=>n+numeric(e.quantity),0);
  return used<(option.max??Infinity)&&Object.entries(option.payments).some(([currency,cost])=>numeric(available[currency])>=cost);
}
export function strainChange(actor,option,quantity){
  if(!Number.isInteger(quantity)||quantity<1)throw Error(game.i18n.localize("SWFFG.UI.Astrogation.InvalidQuantity"));
  if(!actor?.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Astrogation.ActorOwnerOrGMRequired"));
  const vehicle=actor.type==='vehicle';
  if(option.shipOnly&&!vehicle)throw Error(game.i18n.localize("SWFFG.UI.Astrogation.ShipRequiredHull"));
  const requested=option.stat==='hullTrauma'?'hullTrauma':vehicle?'systemStrain':'strain',stat=vehicle?vehicleDamageResource(actor,requested):requested;
  if(stat!==requested&&option.amount<0)throw Error(game.i18n.localize("SWFFG.UI.Astrogation.NoStrainToRecover"));
  if(!actor.system?.stats?.[stat])throw Error(game.i18n.localize("SWFFG.UI.Astrogation.MissingStrainOrHull"));
  const before=numeric(actor.system.stats[stat].value),after=Math.max(0,before+option.amount*quantity);
  if(after===before&&option.amount<0)throw Error(game.i18n.localize("SWFFG.UI.Astrogation.NoStrainToRecover"));
  return {actor:actor.uuid,path:`system.stats.${stat}.value`,before,after};
}
export function checkAstrogationLimits(entries,selections){
  for(const s of selections){
    const count=entries.filter(e=>!e.undone&&e.effect===s.effect).reduce((n,e)=>n+numeric(e.quantity),0)+selections.filter(e=>e.effect===s.effect).reduce((n,e)=>n+e.quantity,0);
    if(count>(s.option.max??Infinity))throw Error(game.i18n.localize("SWFFG.UI.Astrogation.OncePerCheck"));
  }
  return selections;
}
async function voyageSettled(message){
  const trip=astrogationTrip(message);if(!trip)return false;
  const ship=await fromUuid(trip.shipUuid);return Boolean(ship?.flags?.[voyageScope]?.voyageResources?.history?.[trip.id]);
}
export async function undoAstrogationEntry(message,entry){
  if((entry.time||entry.departure||entry.effect==='astro-cancel-departure')&&await voyageSettled(message))throw Error(game.i18n.localize("SWFFG.UI.Astrogation.VoyageAlreadyApplied"));
  const current=ledger(message),live=current.entries.find(e=>e.id===entry.id);
  if(!live||live.undone)return;
  if(live.change){
    const actor=await fromUuid(live.change.actor);
    if(!actor?.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Astrogation.OwnerOrGMUndoRequired"));
    if(numeric(foundry.utils.getProperty(actor,live.change.path))!==live.change.after)throw Error(game.i18n.localize("SWFFG.UI.Astrogation.PoolChangedBeforeUndo"));
    await actor.update({[live.change.path]:live.change.before});
    try{live.undone=true;await message.setFlag(scope,key,current);}
    catch(error){await actor.update({[live.change.path]:live.change.after});throw error;}
  }else{live.undone=true;await message.setFlag(scope,key,current);}
}
export async function spendAstrogationDialog(message,{edit,remainingSymbols,validateSpending,results,speakerActor}){
  const actor=await speakerActor(message),trip=astrogationTrip(message);
  const allActors=Array.from(game.actors?.contents??game.actors??[]).filter(a=>a?.uuid&&a.isOwner);
  if(actor?.isOwner&&!allActors.some(a=>a.uuid===actor.uuid))allActors.unshift(actor);
  const linked=trip?.shipUuid?await fromUuid(trip.shipUuid):null;
  if(linked?.isOwner&&!allActors.some(a=>a.uuid===linked.uuid))allActors.unshift(linked);
  const ships=allActors.filter(a=>a.type==='vehicle'&&(!linked||a.uuid===linked.uuid));
  const available=remainingSymbols(results(message),ledger(message).entries);
  const settled=await voyageSettled(message);
  const options=astrogationOptions({negative:game.user.isGM,failed:failedAstrogation(message),voyage:Boolean(trip)}).filter(o=>(!o.departure||!settled)&&canSpendAstrogationOption(o,available,ledger(message).entries));
  const names={advantage:game.i18n.localize("SWFFG.UI.Astrogation.Advantages"),triumph:game.i18n.localize("SWFFG.UI.Astrogation.Triumphs"),threat:game.i18n.localize("SWFFG.UI.Astrogation.Threats"),despair:game.i18n.localize("SWFFG.UI.Astrogation.Despairs")};
  const icons={};for(const [k,tag]of Object.entries({advantage:'AD',triumph:'TR',threat:'TH',despair:'DE',boost:'BO'})){
    const html=await foundry.applications.ux.TextEditor.enrichHTML(`[${tag}]`),label=names[k]??game.i18n.localize("SWFFG.UI.Astrogation.Boost");
    icons[k]=`<span class="spending-symbol" role="img" aria-label="${label}" title="${label}">${html}</span>`;
  }
  const symbols=(k,n)=>n>0?icons[k].repeat(n):'0';
  const payment=o=>Object.entries(o.payments).map(([k,n])=>symbols(k,n)).join(game.i18n.localize("SWFFG.UI.Astrogation.Or"));
  const effectColor=o=>o.payments.threat||o.payments.despair?'negative':o.payments.advantage?`advantage-${o.payments.advantage}`:'triumph';
  const effectName=name=>esc(name).replace(/\b1 (?:Fortune|Boost)\b/g,icons.boost);
  const targetFor=o=>(o.shipOnly||o.shipDefault?linked:actor)?.uuid??'';
  const content=`<div class="ffg-astro-spending"><p><strong>${game.i18n.localize("SWFFG.UI.Astrogation.AstroEffects")}</strong></p>
    <p>${game.i18n.localize("SWFFG.UI.Astrogation.AstroSelectionHint")}</p>
    <div class="astro-budget" role="status"></div><div class="astro-effects">${options.map(o=>`<section class="astro-effect" data-cost-color="${effectColor(o)}" data-astro-effect="${o.id}"><strong>${effectName(o.name)}</strong><div><small>${game.i18n.localize("SWFFG.UI.Astrogation.Cost")}${payment(o)}${game.i18n.localize("SWFFG.UI.Astrogation.PerActivation")}${o.max?game.i18n.localize("SWFFG.UI.Astrogation.OnceSuffix"):''}</small></div><div class="astro-payments">${Object.entries(o.payments).map(([k,n])=>`<label>${symbols(k,n)} <input type="number" min="0" step="1" value="0" data-currency="${k}" aria-label="${esc(o.name)} - ${names[k]}"></label>`).join('')}</div>${o.stat||o.time||o.departure?'':`<small class="astro-note">${game.i18n.localize("SWFFG.UI.Astrogation.AstroNarrativeHint")}</small>`}${o.departure?`<small class="astro-note">${game.i18n.localize("SWFFG.UI.Astrogation.AstroDepartureHint")}</small>`:''}${o.time?`<small class="astro-note">${game.i18n.localize("SWFFG.UI.Astrogation.AstroTimeHint")}</small>`:''}</section>`).join('')}</div><p class="astro-error" role="alert"></p><button type="button" class="astro-apply">${game.i18n.localize("SWFFG.UI.Astrogation.ApplySelection")}</button></div>`;
  const app=new foundry.applications.api.DialogV2({window:{title:game.i18n.localize("SWFFG.UI.Astrogation.AstroSpendingTitle")},classes:['starwarsffg','themed'],position:{width:760},content,buttons:[{action:'close',label:game.i18n.localize("SWFFG.UI.Astrogation.Close")}],rejectClose:false});
  await app.render({force:true});
  const body=app.element.querySelector('.ffg-astro-spending'),button=body.querySelector('.astro-apply'),error=body.querySelector('.astro-error');let busy=false;
  const read=()=>Array.from(body.querySelectorAll('[data-currency]')).filter(el=>Number(el.value)!==0).map(el=>{const row=el.closest('[data-astro-effect]');return {effect:row.dataset.astroEffect,currency:el.dataset.currency,quantity:Number(el.value),target:targetFor(options.find(o=>o.id===row.dataset.astroEffect))};});
  const refresh=()=>{
    const current=ledger(message),left=remainingSymbols(results(message),current.entries);
    try{
      const selections=read();if(selections.length)for(const s of checkAstrogationLimits(current.entries,validateSpending(results(message),current.entries,options,selections)))left[s.currency]-=s.cost;
      error.textContent='';button.disabled=busy||!selections.length;
    }catch(e){error.textContent=e.message;button.disabled=true;}
    body.querySelector('.astro-budget').innerHTML=game.i18n.localize("SWFFG.UI.Astrogation.Remaining")+(Object.entries(left).filter(([k])=>available[k]>0).map(([k,n])=>symbols(k,n)).join(' · ')||'0');
    for(const row of body.querySelectorAll('[data-astro-effect]')){
      const option=options.find(o=>o.id===row.dataset.astroEffect);
      const selected=Array.from(row.querySelectorAll('[data-currency]')).some(input=>Number(input.value)!==0);
      row.hidden=!selected&&!canSpendAstrogationOption(option,left,current.entries);
    }
    for(const input of body.querySelectorAll('[data-currency]')){
      const option=options.find(o=>o.id===input.closest('[data-astro-effect]').dataset.astroEffect),unit=option.payments[input.dataset.currency];
      const used=current.entries.filter(e=>!e.undone&&e.effect===option.id).reduce((n,e)=>n+numeric(e.quantity),0);
      input.max=Math.max(0,Math.min(option.max===undefined?Infinity:option.max-used,Number(input.value)+Math.floor(left[input.dataset.currency]/unit)));
      input.disabled=busy||Number(input.value)===0&&(left[input.dataset.currency]<unit||used>=(option.max??Infinity));
    }
  };
  body.addEventListener('input',refresh);body.addEventListener('change',refresh);refresh();
  button.addEventListener('click',async()=>{
    if(busy)return;busy=true;refresh();
    await edit(message,async()=>{
      const applied=[];
      try{
        const current=ledger(message),fresh=astrogationOptions({negative:game.user.isGM,failed:failedAstrogation(message),voyage:Boolean(trip)});
        const selections=checkAstrogationLimits(current.entries,validateSpending(results(message),current.entries,fresh,read()));
        if(selections.some(s=>s.option.time||s.option.departure)&&await voyageSettled(message))throw Error(game.i18n.localize("SWFFG.UI.Astrogation.VoyageFinalized"));
        const batch=foundry.utils.randomID(),entries=[];
        for(const s of selections){
          const e={id:foundry.utils.randomID(),batch,kind:'astrogation',effect:s.effect,label:`${s.option.name} ×${s.quantity}`,currency:s.currency,cost:s.cost,quantity:s.quantity,time:Boolean(s.option.time),departure:Boolean(s.option.departure)};
          if(s.option.stat){
            const uuid=targetFor(s.option);
            if(!uuid)throw Error(game.i18n.localize("SWFFG.UI.Astrogation.NoActorForEffect"));
            const target=await fromUuid(uuid);
            if(!allActors.some(a=>a.uuid===target?.uuid))throw Error(game.i18n.localize("SWFFG.UI.Astrogation.UnauthorizedTarget"));
            if(s.option.shipOnly&&!ships.some(a=>a.uuid===target?.uuid))throw Error(game.i18n.localize("SWFFG.UI.Astrogation.ChooseVoyageShip"));
            e.change=strainChange(target,s.option,s.quantity);e.note=target.name;
            await target.update({[e.change.path]:e.change.after});applied.push({target,change:e.change});
          }
          entries.push(e);
        }
        const latest=ledger(message);
        if(JSON.stringify(latest)!==JSON.stringify({...current}))throw Error(game.i18n.localize("SWFFG.UI.Astrogation.SpendingChanged"));
        current.entries.push(...entries);await message.setFlag(scope,key,current);applied.length=0;await app.close();
      }catch(e){
        const failures=[];
        for(const {target,change}of applied.reverse())try{
          if(numeric(foundry.utils.getProperty(target,change.path))!==change.after)throw Error(game.i18n.localize("SWFFG.UI.Astrogation.PoolChangedDuringOperation"));
          await target.update({[change.path]:change.before});
        }catch(rollback){failures.push(`${target.name} : ${rollback.message}`);}
        error.textContent=e.message+(failures.length?game.i18n.format("SWFFG.UI.Astrogation.RestoreIncomplete",{errors:failures.join(' ; ')}):'');
      }
    });busy=false;refresh();
  });
  return app;
}

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
    {id:'astro-next-boost',name:'Ajouter 1 Fortune au prochain test sur le même itinéraire',payments:{advantage:1}},
    {id:'astro-recover',name:'Voyage sans incident : récupérer 2 points de stress',payments:{advantage:2},stat:'strain',amount:-2},
    {id:'astro-faster',name:'Réduire le temps de transit de 25 %',payments:{advantage:3,triumph:1},max:1,time:true},
    {id:'astro-shortcut',name:'Découvrir un raccourci : 1 Fortune aux futurs tests sur cet itinéraire',payments:{triumph:1},max:1}
  ];
  if(failed&&voyage)options.unshift({id:'astro-cancel-departure',name:'Annuler le départ après un échec',payments:{advantage:2},max:1,departure:true});
  if(negative)options.push(
    {id:'astro-overload',name:'Surcharge : +1 stress mécanique et 1 Infortune au prochain test sur cet itinéraire',payments:{threat:1},stat:'strain',amount:1,shipDefault:true},
    {id:'astro-stress',name:'Voyage éprouvant : subir 2 points de stress',payments:{threat:2},stat:'strain',amount:2},
    {id:'astro-debris',name:'Heurter un débris : +1 dégât de coque',payments:{threat:2},stat:'hullTrauma',amount:1,shipOnly:true},
    {id:'astro-mynocks',name:'Mynocks à bord : +3 stress mécanique, puis les chasser',payments:{threat:2},stat:'strain',amount:3,shipDefault:true},
    {id:'astro-course',name:'Mauvaise destination (échec) ou sortie prématurée (réussite) : recalcul nécessaire',payments:{threat:3,despair:1},max:1},
    {id:'astro-slower',name:'Allonger le temps de transit de 25 %',payments:{threat:3,despair:1},max:1,time:true},
    {id:'astro-hyperdrive',name:'Arrêt de sécurité : hyperdrive hors service jusqu’à réparation',payments:{despair:1},max:1},
    {id:'astro-critical',name:'Collision : sortie forcée et dégât critique de véhicule avec +30',payments:{despair:2},max:1}
  );
  return options;
}
export function canSpendAstrogationOption(option,available,entries=[]){
  const used=entries.filter(e=>!e.undone&&e.effect===option.id).reduce((n,e)=>n+numeric(e.quantity),0);
  return used<(option.max??Infinity)&&Object.entries(option.payments).some(([currency,cost])=>numeric(available[currency])>=cost);
}
export function strainChange(actor,option,quantity){
  if(!Number.isInteger(quantity)||quantity<1)throw Error('Quantité invalide.');
  if(!actor?.isOwner)throw Error('Tu ne contrôles pas cette fiche. Le MJ peut appliquer cet effet.');
  const vehicle=actor.type==='vehicle';
  if(option.shipOnly&&!vehicle)throw Error('Choisis un vaisseau pour les dégâts de coque.');
  const stat=option.stat==='hullTrauma'?'hullTrauma':vehicle?'systemStrain':'strain';
  if(!actor.system?.stats?.[stat])throw Error('Cette fiche ne dispose pas de cette réserve de stress ou de coque.');
  const before=numeric(actor.system.stats[stat].value),after=Math.max(0,before+option.amount*quantity);
  if(after===before&&option.amount<0)throw Error('Cette cible n’a plus de stress à récupérer.');
  return {actor:actor.uuid,path:`system.stats.${stat}.value`,before,after};
}
export function checkAstrogationLimits(entries,selections){
  for(const s of selections){
    const count=entries.filter(e=>!e.undone&&e.effect===s.effect).reduce((n,e)=>n+numeric(e.quantity),0)+selections.filter(e=>e.effect===s.effect).reduce((n,e)=>n+e.quantity,0);
    if(count>(s.option.max??Infinity))throw Error('Cet effet est limité à une utilisation par test.');
  }
  return selections;
}
async function voyageSettled(message){
  const trip=astrogationTrip(message);if(!trip)return false;
  const ship=await fromUuid(trip.shipUuid);return Boolean(ship?.flags?.[voyageScope]?.voyageResources?.history?.[trip.id]);
}
export async function undoAstrogationEntry(message,entry){
  if((entry.time||entry.departure||entry.effect==='astro-cancel-departure')&&await voyageSettled(message))throw Error('Le voyage est déjà appliqué. Sa durée et son départ ne peuvent plus être modifiés.');
  const current=ledger(message),live=current.entries.find(e=>e.id===entry.id);
  if(!live||live.undone)return;
  if(live.change){
    const actor=await fromUuid(live.change.actor);
    if(!actor?.isOwner)throw Error('Seul le propriétaire ou le MJ peut annuler cette application.');
    if(numeric(foundry.utils.getProperty(actor,live.change.path))!==live.change.after)throw Error('La réserve a changé depuis. Annule les effets suivants d’abord ou corrige la fiche manuellement.');
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
  const names={advantage:'Avantages',triumph:'Triomphes',threat:'Menaces',despair:'Désespoirs'};
  const icons={};for(const [k,tag]of Object.entries({advantage:'AD',triumph:'TR',threat:'TH',despair:'DE',boost:'BO'})){
    const html=await foundry.applications.ux.TextEditor.enrichHTML(`[${tag}]`),label=names[k]??'Fortune';
    icons[k]=`<span class="spending-symbol" role="img" aria-label="${label}" title="${label}">${html}</span>`;
  }
  const symbols=(k,n)=>n>0?icons[k].repeat(n):'0';
  const payment=o=>Object.entries(o.payments).map(([k,n])=>symbols(k,n)).join(' ou ');
  const effectColor=o=>o.payments.threat||o.payments.despair?'negative':o.payments.advantage?`advantage-${o.payments.advantage}`:'triumph';
  const effectName=name=>esc(name).replace(/\b1 Fortune\b/g,icons.boost);
  const targetFor=o=>(o.shipOnly||o.shipDefault?linked:actor)?.uuid??'';
  const content=`<div class="ffg-astro-spending"><p><strong>Astrogation - effets du voyage</strong></p>
    <p>Choisis plusieurs effets et leur nombre d’activations. Le paiement se choisit dans les colonnes de symboles.</p>
    <div class="astro-budget" role="status"></div><div class="astro-effects">${options.map(o=>`<section class="astro-effect" data-cost-color="${effectColor(o)}" data-astro-effect="${o.id}"><strong>${effectName(o.name)}</strong><div><small>Coût : ${payment(o)} par activation${o.max?' (une seule fois par test).':''}</small></div><div class="astro-payments">${Object.entries(o.payments).map(([k,n])=>`<label>${symbols(k,n)} <input type="number" min="0" step="1" value="0" data-currency="${k}" aria-label="${esc(o.name)} - ${names[k]}"></label>`).join('')}</div>${o.stat||o.time||o.departure?'':'<small class="astro-note">Effet narratif consigné dans le chat, à résoudre avec le MJ.</small>'}${o.departure?'<small class="astro-note">Le départ est annulé dans la résolution du voyage. Aucun stock n’est débité ici.</small>':''}${o.time?'<small class="astro-note">La durée du calculateur est actualisée. Aucun stock n’est débité ici.</small>':''}</section>`).join('')}</div><p class="astro-error" role="alert"></p><button type="button" class="astro-apply">Appliquer la sélection</button></div>`;
  const app=new foundry.applications.api.DialogV2({window:{title:'Astrogation - Utiliser les avantages / menaces'},classes:['starwarsffg','themed'],position:{width:760},content,buttons:[{action:'close',label:'Fermer'}],rejectClose:false});
  await app.render({force:true});
  const body=app.element.querySelector('.ffg-astro-spending'),button=body.querySelector('.astro-apply'),error=body.querySelector('.astro-error');let busy=false;
  const read=()=>Array.from(body.querySelectorAll('[data-currency]')).filter(el=>Number(el.value)!==0).map(el=>{const row=el.closest('[data-astro-effect]');return {effect:row.dataset.astroEffect,currency:el.dataset.currency,quantity:Number(el.value),target:targetFor(options.find(o=>o.id===row.dataset.astroEffect))};});
  const refresh=()=>{
    const current=ledger(message),left=remainingSymbols(results(message),current.entries);
    try{
      const selections=read();if(selections.length)for(const s of checkAstrogationLimits(current.entries,validateSpending(results(message),current.entries,options,selections)))left[s.currency]-=s.cost;
      error.textContent='';button.disabled=busy||!selections.length;
    }catch(e){error.textContent=e.message;button.disabled=true;}
    body.querySelector('.astro-budget').innerHTML='Restants : '+(Object.entries(left).filter(([k])=>available[k]>0).map(([k,n])=>symbols(k,n)).join(' · ')||'0');
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
        if(selections.some(s=>s.option.time||s.option.departure)&&await voyageSettled(message))throw Error('Le voyage est déjà appliqué : sa durée et son départ sont figés.');
        const batch=foundry.utils.randomID(),entries=[];
        for(const s of selections){
          const e={id:foundry.utils.randomID(),batch,kind:'astrogation',effect:s.effect,label:`${s.option.name} ×${s.quantity}`,currency:s.currency,cost:s.cost,quantity:s.quantity,time:Boolean(s.option.time),departure:Boolean(s.option.departure)};
          if(s.option.stat){
            const uuid=targetFor(s.option);
            if(!uuid)throw Error('Aucune fiche associée à cet effet.');
            const target=await fromUuid(uuid);
            if(!allActors.some(a=>a.uuid===target?.uuid))throw Error('Cible non autorisée.');
            if(s.option.shipOnly&&!ships.some(a=>a.uuid===target?.uuid))throw Error('Choisis le vaisseau associé au voyage.');
            e.change=strainChange(target,s.option,s.quantity);e.note=target.name;
            await target.update({[e.change.path]:e.change.after});applied.push({target,change:e.change});
          }
          entries.push(e);
        }
        const latest=ledger(message);
        if(JSON.stringify(latest)!==JSON.stringify({...current}))throw Error('Les dépenses du jet ont changé. Ferme puis rouvre cette fenêtre.');
        current.entries.push(...entries);await message.setFlag(scope,key,current);applied.length=0;await app.close();
      }catch(e){
        const failures=[];
        for(const {target,change}of applied.reverse())try{
          if(numeric(foundry.utils.getProperty(target,change.path))!==change.after)throw Error('Réserve modifiée pendant l’opération.');
          await target.update({[change.path]:change.before});
        }catch(rollback){failures.push(`${target.name} : ${rollback.message}`);}
        error.textContent=e.message+(failures.length?' Restauration incomplète : '+failures.join(' ; '):'');
      }
    });busy=false;refresh();
  });
  return app;
}

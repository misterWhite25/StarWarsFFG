const pendingModes=new WeakSet(),pendingOwners=new WeakSet();

/** Both shared tools place their controls in the same compact Pilotage MJ row. */
export function renderSharedWindowControls(kind,config,dialog){
  if(!game.user.isGM)return;
  const views=(dialog??ui.ffgPilotage)?.element?.querySelector('.pilotage-views-content');
  if(!views)return;
  let group=views.querySelector('.pilotage-shared-windows');
  if(!group){
    group=document.createElement('div');group.className='pilotage-shared-windows';
    const hint=document.createElement('p');hint.className='pilotage-shared-hint';
    hint.textContent=game.i18n.localize("SWFFG.UI.Interface.SharedModeChangeHint");
    group.append(hint);
    views.prepend(group);
  }
  let section=group.querySelector('.pilotage-'+kind+'-controls');
  if(!section){
    section=document.createElement('section');
    section.className='pilotage-shared-window pilotage-'+kind+'-controls';
    section.innerHTML=`<div class="pilotage-shared-heading"><h3></h3><label><input type="checkbox"> ${game.i18n.localize("SWFFG.UI.Interface.SharedView")}</label></div><div class="pilotage-shared-owner"><span></span><select></select><span class="pilotage-shared-status" role="status"></span></div>`;
    section.dataset.sharedWindowKind=kind;
    const order={map:0,market:1,journal:2};
    const next=[...group.querySelectorAll('.pilotage-shared-window')].find(node=>(order[node.dataset.sharedWindowKind]??99)>(order[kind]??99));
    group.insertBefore(section,next??group.querySelector('.pilotage-shared-hint'));
    section.querySelector('input').setAttribute('data-'+kind+'-shared','');
    section.querySelector('input').addEventListener('change',async event=>{
      pendingModes.add(section);event.target.disabled=true;
      try{await section.configuration.onModeChange(event.target.checked);}
      catch(error){ui.notifications.warn(error.message);}
      finally{pendingModes.delete(section);section.configuration.refresh();}
    });
    section.querySelector('select').addEventListener('change',async event=>{
      pendingOwners.add(section);event.target.disabled=true;
      try{await section.configuration.onOwnerChange(event.target.value);}
      catch(error){ui.notifications.warn(error.message);}
      finally{pendingOwners.delete(section);section.configuration.refresh();}
    });
  }
  section.configuration=config;
  section.querySelector('h3').textContent=config.title;
  const toggle=section.querySelector('input');
  toggle.setAttribute('aria-label',game.i18n.format("SWFFG.UI.Interface.NamedSharedView",{title:config.title}));
  toggle.checked=config.shared;toggle.disabled=pendingModes.has(section);
  const owner=section.querySelector('.pilotage-shared-owner');
  owner.querySelector('span').textContent=config.ownerLabel;
  owner.classList.toggle('pilotage-map-navigator',kind==='map');
  const select=owner.querySelector('select');
  select.setAttribute('aria-label',config.ownerAria);
  const status=owner.querySelector('.pilotage-shared-status');
  select.hidden=!config.shared||(!config.open&&kind!=='map');status.hidden=!select.hidden;
  select.replaceChildren();select.disabled=select.hidden||pendingModes.has(section)||pendingOwners.has(section);
  status.textContent=select.hidden?(config.shared?game.i18n.localize("SWFFG.UI.Interface.AssignOnOpen"):game.i18n.localize("SWFFG.UI.Interface.IndividualUse")):'';
  if(!select.hidden&&kind==='map'&&!game.users.some(user=>user.active&&user.id===config.ownerId)){
    const option=document.createElement('option');option.value='';option.textContent=game.i18n.localize('SWFFG.UI.Interface.AssignOnOpen');option.disabled=true;option.selected=true;select.append(option);
  }
  if(!select.hidden)for(const user of game.users.filter(user=>user.active).sort((a,b)=>a.name.localeCompare(b.name))){
    const option=document.createElement('option');option.value=user.id;option.textContent=user.name;
    option.selected=user.id===config.ownerId;select.append(option);
  }
}

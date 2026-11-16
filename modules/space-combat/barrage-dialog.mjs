import {board} from './board.mjs';
import {crewActor} from './crew-access.mjs';
import {crewStationWeapons} from '../helpers/crew.js';
import {crewRoleDefinitions} from '../helpers/crew-role-definitions.mjs';
import {barrageConfiguration} from './barrage-rules.mjs';
import {SECTORS,attackSector} from './combat-rules.mjs';

export async function chooseBarrage(ship,definition,candidates){
  const vehicle=game.actors.get(ship.actorId),content=document.createElement('div'),body=document.createElement('section');body.className='sc-action-choice';content.append(body);
  const note=document.createElement('p');note.className='sc-action-choice-description';note.textContent=definition.description;body.append(note);
  const field=(label,name,entries)=>{
    const wrap=document.createElement('label');wrap.className='form-group stacked';const title=document.createElement('span');title.textContent=label;
    const select=document.createElement('select');select.name=name;select.required=true;wrap.append(title,select);body.append(wrap);
    for(const [value,text]of entries){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}return select;
  };
  if(!candidates.length)throw Error('Aucun artilleur disponible pour ce barrage.');
  field('Artilleur','barrageCrew',candidates.map(member=>[member.actor_id,crewActor(member)?.name??member.actor_name]));
  field('Type d’armes','barrageWeapon',[]);const arcs=field(definition.target?'Arc de tir':'Arcs couverts (sélection multiple possible)','barrageArc',[]);arcs.multiple=!definition.target;
  const wrap=document.createElement('label');wrap.className='form-group stacked';wrap.textContent='Nombre d’armes identiques dans cet arc';
  const count=document.createElement('input');count.type='number';count.name='barrageCount';count.required=true;count.min=definition.id==='blanketBarrage'?'1':'2';count.max='10000';count.value=count.min;count.style.textAlign='center';wrap.append(count);body.append(wrap);
  const explanation=document.createElement('p');explanation.className='sc-action-choice-description';explanation.textContent='Indiquez le nombre de canons représentés par la batterie. Toutes ces armes tirent ce round et ne peuvent plus tirer à nouveau.';body.append(explanation);
  if(definition.target){
    field('Vaisseau cible','barrageTarget',[['','Choisir un vaisseau'],...board().ships.filter(target=>target.id!==ship.id&&(definition.id!=='concentratedBarrage'||target.silhouette>=5)).map(target=>[target.id,game.actors.get(target.actorId)?.name??target.name])]);
    field('Secteur visé','barrageSector',Object.entries(SECTORS));
  }
  return foundry.applications.api.DialogV2.wait({classes:['sc-action-dialog'],window:{title:definition.label},position:{width:440},modal:true,content,rejectClose:false,
    buttons:[{action:'perform',label:definition.target?'Préparer le tir':'Lancer le jet',default:true,callback:(_event,button)=>{
      const fields=button.form.elements;
      const result={crewId:fields.barrageCrew.value,weaponId:fields.barrageWeapon.value,barrageArc:fields.barrageArc.value,barrageArcs:[...fields.barrageArc.selectedOptions].map(option=>option.value),barrageCount:Number(fields.barrageCount.value),targetId:fields.barrageTarget?.value,sector:fields.barrageSector?.value};
      barrageConfiguration(board().ships.find(entry=>entry.id===ship.id),vehicle,definition,result);return result;
    }},{action:'cancel',label:'Annuler',callback:()=>null}],
    render:(_event,dialog)=>{
      const root=dialog.element,find=name=>root.querySelector('[name="'+name+'"]'),crew=find('barrageCrew'),weapon=find('barrageWeapon'),arc=find('barrageArc'),target=find('barrageTarget'),sector=find('barrageSector'),count=find('barrageCount'),confirm=root.querySelector('[data-action="perform"]');
      const fill=(select,entries)=>{const previous=select.value;select.replaceChildren();for(const [value,text]of entries){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=entries.some(([id])=>id===previous)?previous:entries[0]?.[0]??'';};
      const validate=()=>{confirm.disabled=!weapon.value||!arc.value||!count.validity.valid||(definition.target&&!target?.value);if(sector)sector.disabled=!target.value;};
      const selectWeapon=()=>{const item=vehicle.items.get(weapon.value);fill(arc,Object.entries({fore:'Avant',aft:'Arrière',port:'Bâbord',starboard:'Tribord',dorsal:'Dorsal',ventral:'Ventral'}).filter(([key])=>item?.system.firingarc?.[key]));validate();};
      const selectCrew=()=>{const member=candidates.find(member=>member.actor_id===crew.value),weapons=crewStationWeapons(vehicle,member,crewRoleDefinitions(vehicle));fill(weapon,weapons.map(item=>[item.id,item.name]));selectWeapon();};
      crew.addEventListener('change',selectCrew);weapon.addEventListener('change',selectWeapon);arc.addEventListener('change',validate);count.addEventListener('input',validate);
      target?.addEventListener('change',()=>{const destination=board().ships.find(entry=>entry.id===target.value);if(destination)sector.value=attackSector(ship,destination,crew.value);validate();});selectCrew();
    }
  });
}

// Keep the optional symbol spends visible beside the ordinary post-roll controls.
Hooks.on('renderChatMessageHTML',(message,html)=>{
  const root=html instanceof HTMLElement?html:html?.[0];if(!root||root.querySelector('.sc-barrage-result'))return;
  const barrage=message.getFlag('starwarsffg','spaceBarrage')??message.rolls?.map(roll=>roll.data?.flags?.starwarsffg?.spaceCombatRoll?.barrage).find(Boolean);
  if(!barrage)return;
  const details=document.createElement('details');details.className='sc-barrage-result';
  const summary=document.createElement('summary');summary.textContent=barrage.label+' · '+barrage.count+' arme(s)';
  const note=document.createElement('p');note.style.textAlign='justify';note.textContent=barrage.description;details.append(summary,note);
  (root.querySelector('.message-content')??root).append(details);
});

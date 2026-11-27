import {localizeSystem, localizedSystemError} from "../helpers/system-localization.mjs";
import {board} from './board.mjs';
import {SECTORS,attackSector} from './combat-rules.mjs';

/** Choose a fresh target for this weapon without spending the character's action. */
export async function chooseShotTarget(ship,member,weapon){
  const source=board().ships.find(entry=>entry.id===ship.id);
  if(!source)throw localizedSystemError("SWFFG.UI.SpaceCombat.ShipGone");
  const targets=board().ships.filter(entry=>entry.id!==source.id);
  if(!targets.length)throw localizedSystemError("SWFFG.UI.SpaceCombat.NoOtherShip");
  const content=document.createElement('div');
  const field=(label,name,entries)=>{
    const wrap=document.createElement('label');wrap.className='form-group stacked';
    const caption=document.createElement('span');caption.textContent=label;
    const select=document.createElement('select');select.name=name;select.required=true;
    for(const [value,text]of entries){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
    wrap.append(caption,select);content.append(wrap);return select;
  };
  const target=field(localizeSystem("SWFFG.UI.SpaceCombat.TargetShip"),'shotTarget',[['',localizeSystem("SWFFG.UI.SpaceCombat.SelectShip")],...targets.map(entry=>[entry.id,game.actors.get(entry.actorId)?.name??entry.name])]);
  field(localizeSystem("SWFFG.UI.SpaceCombat.TargetSector"),'shotSector',Object.entries(SECTORS));
  target.value='';
  return foundry.applications.api.DialogV2.wait({
    classes:['sc-shot-dialog'],window:{title:localizeSystem("SWFFG.UI.SpaceCombat.ShotTitle", {name:weapon.name})},position:{width:400},modal:true,content,rejectClose:false,
    buttons:[{action:'prepare',label:localizeSystem("SWFFG.UI.SpaceCombat.PrepareShot"),default:true,callback:(_event,button)=>({targetId:button.form.elements.shotTarget.value,sector:button.form.elements.shotSector.value})},
      {action:'cancel',label:localizeSystem("SWFFG.Cancel"),callback:()=>null}],
    render:(_event,dialog)=>{
      const target=dialog.element.querySelector('[name="shotTarget"]'),sector=dialog.element.querySelector('[name="shotSector"]'),confirm=dialog.element.querySelector('[data-action="prepare"]');
      const update=()=>{
        const destination=board().ships.find(entry=>entry.id===target.value&&entry.id!==source.id);
        confirm.disabled=!destination;sector.disabled=!destination;
        if(destination)sector.value=attackSector(source,destination,member.actor_id);
      };
      target.addEventListener('change',update);update();
    }
  });
}

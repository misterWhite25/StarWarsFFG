import {localizeSystem, localizedSystemError} from "../helpers/system-localization.mjs";
import {board} from './board.mjs';
import {crewActor} from './crew-access.mjs';
import {SECTORS} from './combat-rules.mjs';

/** Choose action-specific options without spending an action before confirmation. */
export async function chooseCombatAction(ship,action,candidates,description) {
  const source=board().ships.find(entry=>entry.id===ship.id);
  if(!source)throw localizedSystemError("SWFFG.UI.SpaceCombat.ShipGone");
  const vehicle=game.actors.get(source.actorId);
  if(!candidates.length)throw localizedSystemError("SWFFG.UI.SpaceCombat.NoCrewForAction");
  const targets=board().ships.filter(entry=>entry.id!==source.id);
  if(action.target&&!targets.length)throw localizedSystemError("SWFFG.UI.SpaceCombat.NoOtherShip");
  const critical=action.id==='repairCritical';
  const hasSector=['boostShields','slice'].includes(action.id);
  if(!action.target&&!action.skills&&!hasSector&&!critical&&candidates.length===1)return {crewId:candidates[0].actor_id};
  const content=document.createElement('div'),body=document.createElement('section');body.className='sc-action-choice';content.append(body);
  const note=document.createElement('p');note.className='sc-action-choice-description';note.textContent=description;body.append(note);
  const field=(label,name,entries)=>{
    const wrap=document.createElement('label');wrap.className='form-group stacked';
    const caption=document.createElement('span');caption.textContent=label;
    const select=document.createElement('select');select.name=name;select.required=true;
    wrap.append(caption,select);body.append(wrap);
    for(const [value,text]of entries){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
    return select;
  };
  if(candidates.length>1)field('Personnage','actionCrew',candidates.map(member=>[member.actor_id,crewActor(member)?.name??member.actor_name]));
  if(action.target)field(localizeSystem("SWFFG.UI.SpaceCombat.TargetShip"),'actionTarget',[['',localizeSystem("SWFFG.UI.SpaceCombat.SelectShip")],...targets.map(entry=>[entry.id,game.actors.get(entry.actorId)?.name??entry.name])]);
  if(hasSector)field(action.id==='boostShields'?localizeSystem("SWFFG.UI.SpaceCombat.ShieldSector"):localizeSystem("SWFFG.UI.SpaceCombat.TargetSector"),'actionSector',Object.entries(SECTORS));
  if(action.skills)field(localizeSystem("SWFFG.UI.Pdf.Skill"),'actionSkill',[]);
  if(critical)field(localizeSystem("SWFFG.UI.SpaceCombat.CriticalHit"),'actionCritical',vehicle.items.filter(item=>item.type==='criticaldamage').map(item=>[item.id,item.name]));
  return foundry.applications.api.DialogV2.wait({
    classes:['sc-action-dialog'],window:{title:action.label},position:{width:420},modal:true,content,rejectClose:false,
    buttons:[{action:'perform',label:localizeSystem("SWFFG.UI.SpaceCombat.MakeRoll"),default:true,callback:(_event,button)=>{
      const fields=button.form.elements;
      return {crewId:fields.actionCrew?.value??candidates[0].actor_id,targetId:fields.actionTarget?.value,
        sector:fields.actionSector?.value,skill:fields.actionSkill?.value,criticalId:fields.actionCritical?.value};
    }},{action:'cancel',label:localizeSystem("SWFFG.Cancel"),callback:()=>null}],
    render:(_event,dialog)=>{
      const root=dialog.element,find=name=>root.querySelector('[name="'+name+'"]');
      const crew=find('actionCrew'),target=find('actionTarget'),skill=find('actionSkill'),damage=find('actionCritical');
      const confirm=root.querySelector('[data-action="perform"]');
      const member=()=>candidates.find(member=>member.actor_id===(crew?.value??candidates[0].actor_id));
      const fill=(select,entries)=>{
        const previous=select.value;select.replaceChildren();
        for(const [value,text]of entries){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
        select.value=entries.some(([value])=>value===previous)?previous:entries[0]?.[0]??'';
      };
      const validate=()=>{
        const destination=target&&board().ships.find(entry=>entry.id===target.value&&entry.id!==source.id);
        confirm.disabled=!member()||(action.target&&!destination)||(action.skills&&!skill?.value)||(critical&&!damage?.value);
      };
      const selectCrew=()=>{
        const actor=crewActor(member());
        if(skill)fill(skill,action.skills.filter(key=>actor?.system.skills?.[key]).map(key=>[key,game.i18n.localize(actor.system.skills[key].label??key)]));
        validate();
      };
      crew?.addEventListener('change',selectCrew);
      target?.addEventListener('change',validate);
      for(const select of [skill,damage])select?.addEventListener('change',validate);
      selectCrew();
    }
  });
}

export async function chooseDamageControl(choices){
  const content=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select');
  label.className='form-group stacked';label.textContent=localizeSystem("SWFFG.UI.SpaceCombat.RepairType");select.name='repairAction';select.required=true;label.append(select);content.append(label);
  const names={repairStrain:localizeSystem("SWFFG.UI.SpaceCombat.MechanicalStrain"),repairHull:localizeSystem("SWFFG.UI.SpaceCombat.HullTrauma"),repairCritical:localizeSystem("SWFFG.UI.SpaceCombat.CriticalHit")};
  for(const {definition,reason}of choices){const option=document.createElement('option');option.value=definition.id;option.textContent=names[definition.id]+(reason?' - '+reason:'');option.disabled=!!reason;select.append(option);}
  select.value=choices.find(choice=>!choice.reason)?.definition.id??'';
  return foundry.applications.api.DialogV2.wait({classes:['sc-action-dialog'],window:{title:localizeSystem("SWFFG.UI.SpaceCombat.DamageControl")},position:{width:420},modal:true,content,rejectClose:false,
    buttons:[{action:'continue',label:localizeSystem("SWFFG.UI.SpaceCombat.Continue"),default:true,callback:(_event,button)=>button.form.elements.repairAction.value},{action:'cancel',label:localizeSystem("SWFFG.Cancel"),callback:()=>null}]});
}

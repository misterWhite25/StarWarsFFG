import {localizeSystem} from "../helpers/system-localization.mjs";
import {command} from "./board.mjs";
import {vehicleMinionGroup} from '../helpers/vehicle-minion-group.mjs';
import {setCombatSheetMode} from "../helpers/combat-sheet.mjs";
import {canSelectShip} from "./crew-access.mjs";
import {renderCrewSkills} from "./crew-skills.mjs";
import {renderCombatControls} from "./combat-controls.mjs";
import {effectiveDefense} from "./combat-rules.mjs";

function node(tag,className,text) {
  const element=document.createElement(tag);
  if(className) element.className=className;
  if(text!=null) element.textContent=String(text);
  return element;
}
const number=value=>Number.isFinite(Number(value))&&value!==""&&value!=null ? Number(value).toLocaleString(globalThis.game?.i18n?.lang) : "?";
function stat(parent,label,value) {
  const block=node("div","sc-card-stat");
  block.append(node("span","",label),node("strong","",number(value)));
  parent.append(block);
}

function resource(parent,actor,key,label,report) {
  const data=actor.system.stats?.[key],group=vehicleMinionGroup(actor);
  const block=node("label","sc-card-stat sc-card-resource");
  const values=node("div","sc-card-values");
  const input=node("input");
  input.type="number";input.min="0";input.step="1";
  input.value=data?.value??"";
  input.dataset.combatResource=key;
  input.setAttribute("aria-label",label+" - Actuel");
  input.disabled=!actor.isOwner;
  input.addEventListener("change",async event=>{
    event.stopPropagation();
    const value=input.valueAsNumber;
    if(!actor.isOwner || !Number.isInteger(value) || value<0) {
      input.value=actor.system.stats?.[key]?.value??"";
      return;
    }
    input.disabled=true;
    try { await actor.update({["system.stats."+key+".value"]:value}); }
    catch(error) {input.value=actor.system.stats?.[key]?.value??"";report(error);}
    finally {input.disabled=!actor.isOwner;}
  });
  values.append(input,node("span","", "/ "+number(key==='hullTrauma'&&group.enabled?group.totalHull:data?.max)));
  block.append(node("span","",label),values);parent.append(block);
}

export function combatCard(ship,report,options={}) {
  const card=node("section","sc-combat-card");
  card.setAttribute("aria-label",localizeSystem("SWFFG.UI.SpaceCombat.SelectedCombatSheet"));
  card.dataset.shipId=ship.id;
  const actor=ship.actorId&&game.actors.get(ship.actorId);
  const readable=actor?.type==="vehicle"&&canSelectShip(ship);
  const header=node("header","sc-card-header");
  const canOpen=readable&&actor.testUserPermission(game.user,"OBSERVER");
  const name=node(canOpen?"a":"strong","sc-card-name",readable?actor.name:ship.name);
  if(canOpen){
    name.classList.add("sc-card-sheet-link");name.href="#";name.dataset.openShipSheet=actor.id;
    name.title=localizeSystem("SWFFG.UI.SpaceCombat.OpenShipSheet");
    name.addEventListener("click",event=>{
      event.preventDefault();event.stopPropagation();
      Promise.resolve().then(async()=>{
        const sheet=actor.sheet;
        if(sheet._ffgCombatMode)await setCombatSheetMode(sheet,false);
        else await sheet.render({force:true});
        sheet.bringToFront?.();
      }).catch(report);
    });
  }
  header.append(node("h3","",localizeSystem("SWFFG.UI.SpaceCombat.CombatSheet")),name);
  const group=actor&&vehicleMinionGroup(actor);if(group?.enabled){const count=node('small','sc-minion-count',group.alive+' / '+group.count+' appareils');count.dataset.vehicleGroupAlive=group.alive;header.append(count);}
  card.append(header);
  const mobility=node("div","sc-card-grid");
  stat(mobility,localizeSystem("SWFFG.UI.SpaceCombat.Silhouette"),ship.silhouette);
  const speed=node("div","sc-card-stat");
  speed.append(node("span","",localizeSystem("SWFFG.UI.SpaceCombat.MapSpeed")));
  if(game.user.isGM){
    const values=node("div","sc-card-values"),input=node("input");
    let savedSpeed=ship.speed;
    input.type="number";input.min="0";input.max=String(ship.maxSpeed);input.step="1";input.required=true;
    input.value=String(ship.speed);input.dataset.shipSpeed=ship.id;
    input.setAttribute("aria-label",localizeSystem("SWFFG.UI.SpaceCombat.ShipMapSpeed"));
    input.title=localizeSystem("SWFFG.UI.SpaceCombat.GMSpeedHint");
    input.addEventListener("change",async event=>{
      event.stopPropagation();
      if(input.disabled||!input.isConnected)return;
      if(!input.reportValidity()){input.value=String(savedSpeed);return;}
      const value=input.valueAsNumber;if(value===savedSpeed)return;
      input.disabled=true;
      try{await command("speed",{shipId:ship.id,version:ship.version,speed:value});savedSpeed=value;}
      catch(error){input.value=String(savedSpeed);report(error);}
      finally{input.disabled=false;}
    });
    values.append(input,node("span","","/ "+number(ship.maxSpeed)));speed.append(values);
  }else speed.append(node("strong","",number(ship.speed)+" / "+number(ship.maxSpeed)));
  mobility.append(speed);
  card.append(mobility);
  if(!readable) {
    card.append(node("p","sc-card-note",actor ? localizeSystem("SWFFG.UI.SpaceCombat.LimitedSheet") : localizeSystem("SWFFG.UI.SpaceCombat.MissingSheet")));
    return card;
  }
  const stats=actor.system.stats??{};
  stat(mobility,"Blindage",stats.armour?.value);
  stat(mobility,localizeSystem("SWFFG.UI.SpaceCombat.Handling"),stats.handling?.value);
  resource(mobility,actor,"hullTrauma",localizeSystem("SWFFG.UI.SpaceCombat.HullTrauma"),report);
  if(!group.enabled)resource(mobility,actor,"systemStrain",localizeSystem("SWFFG.UI.SpaceCombat.SystemStrain"),report);
  const shields=node("section","sc-card-section");
  shields.append(node("h4","",localizeSystem("SWFFG.UI.SpaceCombat.Defense")));
  const quadrants=node("div","sc-card-shields");
  for(const [key,label] of [["fore",localizeSystem("SWFFG.UI.SpaceCombat.Fore")],["aft",localizeSystem("SWFFG.UI.SpaceCombat.Aft")],["port",localizeSystem("SWFFG.UI.SpaceCombat.Port")],["starboard",localizeSystem("SWFFG.UI.SpaceCombat.Starboard")]]) stat(quadrants,label,effectiveDefense(ship,actor,key));
  shields.append(quadrants);card.append(shields);
  card.append(renderCrewSkills(ship,report,options));
  card.append(renderCombatControls(ship,report,options));
  return card;
}

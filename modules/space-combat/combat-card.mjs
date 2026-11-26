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
const number=value=>Number.isFinite(Number(value))&&value!==""&&value!=null ? Number(value).toLocaleString("fr-FR") : "?";
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
  card.setAttribute("aria-label","Fiche de combat du vaisseau sélectionné");
  card.dataset.shipId=ship.id;
  const actor=ship.actorId&&game.actors.get(ship.actorId);
  const readable=actor?.type==="vehicle"&&canSelectShip(ship);
  const header=node("header","sc-card-header");
  const canOpen=readable&&actor.testUserPermission(game.user,"OBSERVER");
  const name=node(canOpen?"a":"strong","sc-card-name",readable?actor.name:ship.name);
  if(canOpen){
    name.classList.add("sc-card-sheet-link");name.href="#";name.dataset.openShipSheet=actor.id;
    name.title="Ouvrir la fiche du vaisseau";
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
  header.append(node("h3","","Fiche de combat"),name);
  const group=actor&&vehicleMinionGroup(actor);if(group?.enabled){const count=node('small','sc-minion-count',group.alive+' / '+group.count+' appareils');count.dataset.vehicleGroupAlive=group.alive;header.append(count);}
  card.append(header);
  const mobility=node("div","sc-card-grid");
  stat(mobility,"Gabarit",ship.silhouette);
  const speed=node("div","sc-card-stat");
  speed.append(node("span","","Vitesse carte"));
  if(game.user.isGM){
    const values=node("div","sc-card-values"),input=node("input");
    let savedSpeed=ship.speed;
    input.type="number";input.min="0";input.max=String(ship.maxSpeed);input.step="1";input.required=true;
    input.value=String(ship.speed);input.dataset.shipSpeed=ship.id;
    input.setAttribute("aria-label","Vitesse du vaisseau sur la carte");
    input.title="Réglage MJ : vitesse du pion, sans coût en manœuvre ni en stress.";
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
    card.append(node("p","sc-card-note",actor ? "La fiche de ce véhicule est à accès limité." : "La fiche associée à ce pion est indisponible."));
    return card;
  }
  const stats=actor.system.stats??{};
  stat(mobility,"Blindage",stats.armour?.value);
  stat(mobility,"Maniabilité",stats.handling?.value);
  resource(mobility,actor,"hullTrauma","Dégâts de coque",report);
  if(!group.enabled)resource(mobility,actor,"systemStrain","Stress système",report);
  const shields=node("section","sc-card-section");
  shields.append(node("h4","","Défense"));
  const quadrants=node("div","sc-card-shields");
  for(const [key,label] of [["fore","Avant"],["aft","Arrière"],["port","Bâbord"],["starboard","Tribord"]]) stat(quadrants,label,effectiveDefense(ship,actor,key));
  shields.append(quadrants);card.append(shields);
  card.append(renderCrewSkills(ship,report,options));
  card.append(renderCombatControls(ship,report,options));
  return card;
}

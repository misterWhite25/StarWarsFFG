import {consolidateNpcPassengers} from '../helpers/npc-vehicle.mjs';
import {stationWeapons,renderCrewWeapon,fireCrewWeapon} from './crew-weapons.mjs';
import {vehicleMinionGroup} from '../helpers/vehicle-minion-group.mjs';
import {resolveCrewActor} from '../helpers/integrated-crew.mjs';
import DiceHelpers,{get_dice_pool} from "../helpers/dice-helpers.js";
import {DicePoolFFG} from "../dice/pool.js";
import {crewRoleDefinition,canonicalCrewSkill,crewRoleDefinitions} from "../helpers/crew-role-definitions.mjs";
import {vehicleCrew} from "../helpers/crew-gunners.mjs";
import {crewStationWeapons} from "../helpers/crew.js";
import {LegacyDialogV2} from "../applications/legacy-dialog-v2.js";
import {aboardRoster,canSelectShip,controlsCrewMember,isPilotRole,isNavigationRole,actionRoleReason} from "./crew-access.mjs";
import {openSelectedCombatRoll} from "./combat-controls.mjs";
import {pilotSkill as vehiclePilotSkill,characterActionState} from "./combat-rules.mjs";
import {board} from "./board.mjs";
import {initiativeReason} from "./initiative.mjs";

const normalize=value=>String(value??"").toLowerCase().replace(/[^a-z]/g,"");
const pilotSkill=key=>/^(piloting|driving)/.test(normalize(canonicalCrewSkill(key)));
const statNumber=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value))?Number(value).toLocaleString("fr-FR"):"?";

function selectableWeapons(vehicle,member) {
  if(actionRoleReason(vehicle,member.actor_id,"attack"))return [];
  return crewStationWeapons(vehicle,member,crewRoleDefinitions(vehicle));
}
function currentMember(vehicle,member) {
  return aboardRoster(vehicle).find(entry=>entry.actor_id===member.actor_id&&entry.role===member.role);
}
async function rollSkill(ship,member,key,options) {
  const vehicle=game.actors.get(ship.actorId),current=currentMember(vehicle,member);
  if(!current||!canSelectShip(ship)||!controlsCrewMember(current))throw Error("Vous pouvez jouer les compétences de vos membres d’équipage.");
  const actor=resolveCrewActor(current,vehicle);
  if(!actor?.system.skills?.[key])throw Error("Cette compétence est indisponible.");
  if(normalize(canonicalCrewSkill(key))==="astrogation"&&!vehicleCrew(vehicle).some(entry=>entry.actor_id===actor.id&&["pilot","copilot"].includes(crewRoleDefinition(vehicle,entry.role)?.kind)))
    throw Error("L’astrogation est réservée au pilote et au copilote.");
  if(pilotSkill(key)) {
    if(!game.user.isGM&&!isNavigationRole(current))throw Error("Ce jet de pilotage est réservé au pilote et au copilote.");
    return openSelectedCombatRoll(ship,current,undefined,options);
  }
  if(normalize(key)==="gunnery") {
    const weapons=selectableWeapons(vehicle,current);
    if(!weapons.length)throw Error("Aucune arme disponible à ce poste.");
    const roll=weapon=>openSelectedCombatRoll(ship,current,weapon,options);
    if(weapons.length===1)return roll(weapons[0]);
    const buttons=Object.fromEntries(weapons.map((weapon,index)=>["weapon"+index,{label:weapon.name,callback:()=>roll(weapon)}]));
    return new LegacyDialogV2({title:"Choisir l’arme",content:"<p>Quelle arme utilisez-vous ?</p>",buttons}).render(true);
  }
  const difficulty=["cool","vigilance"].includes(normalize(key))?0:2;
  return DiceHelpers.rollSkillByKey(actor,key,difficulty);
}

export function renderCrewSkills(ship,report,options={}) {
  const vehicle=game.actors.get(ship.actorId);
  if(vehicle?.flags?.starwarsffg?.npcVehicle?.version===1&&game.user.isGM)void consolidateNpcPassengers(vehicle).catch(report);
  const section=document.createElement("section");section.className="sc-card-section sc-crew-skills";
  const title=document.createElement("h4");title.textContent="Équipage et passagers";section.append(title);
  const bound=vehicleCrew(vehicle),entries=[],seen=new Set(),covered=new Set();
  const collator=new Intl.Collator('fr',{numeric:true,sensitivity:'base'});
  for(const raw of aboardRoster(vehicle)){
    const assigned=bound.find(m=>m.actor_id===raw.actor_id&&m.role===raw.role);
    const member=assigned?{...raw,...assigned}:raw;
    const kind=member.passenger?'passenger':crewRoleDefinition(vehicle,member.role)?.kind??'support';
    const weapons=stationWeapons(vehicle,member);
    const posts=kind==='gunner'&&weapons.length?weapons.map(weapon=>({weapons:[weapon],weapon})):[{weapons}];
    for(const post of posts){
      const key=[member.actor_id,member.role,post.weapon?.id??''].join(':');if(seen.has(key))continue;seen.add(key);
      for(const weapon of post.weapons)covered.add(weapon.id);
      entries.push({...post,member,kind,order:{pilot:0,copilot:1,gunner:2,passenger:4}[kind]??3});
    }
  }
  for(const weapon of vehicle.items.filter(item=>item.type==='shipweapon'&&!covered.has(item.id)))entries.push({kind:'gunner',order:2,weapon,weapons:[weapon]});
  entries.sort((a,b)=>a.order-b.order||(a.order===2?collator.compare(a.weapon?.name??a.weapons[0]?.name??'',b.weapon?.name??b.weapons[0]?.name??''):0));
  if(!entries.length){const empty=document.createElement('p');empty.textContent='Aucun membre d’équipage affecté.';section.append(empty);return section;}
  for(const entry of entries){
    const member=entry.member;
    if(!member){
      const details=document.createElement('details');details.className='sc-crew-member sc-crew-vacant';details.dataset.crewRole='gunner';details.dataset.weaponId=entry.weapon.id;
      const summary=document.createElement('summary'),name=document.createElement('strong'),role=document.createElement('small');name.textContent=entry.weapon.name;role.textContent='Artilleur · Poste non pourvu';summary.append(name,role);details.append(summary);
      details.append(renderCrewWeapon(ship,vehicle,entry.weapon,report,options));section.append(details);continue;
    }
    const assignments=[member],actor=resolveCrewActor(member,vehicle);
    const details=document.createElement("details");details.className="sc-crew-member";details.dataset.crewMember=member.actor_id;details.dataset.crewRole=entry.kind;if(entry.weapon)details.dataset.weaponId=entry.weapon.id;details.open=!game.user.isGM&&controlsCrewMember(member);
    const summary=document.createElement("summary");
    const name=document.createElement("strong");name.textContent=member.integrated?String(actor?.name??member.actor_name??"Poste intégré").replace(vehicle.name+" - ",""):actor?.name??member.actor_name??"Membre indisponible";
    const roles=document.createElement("small");
    roles.textContent=(member.integrated?"Intégré · ":"")+assignments.map(entry=>crewRoleDefinition(vehicle,entry.role)?.label??entry.role).join(" · ");
    if(entry.weapon){if(member.integrated)name.textContent=entry.weapon.name;else roles.textContent+=" · "+entry.weapon.name;}
    summary.append(name,roles);details.append(summary);section.append(details);
    const appendWeapons=()=>{for(const weapon of entry.weapons)details.append(renderCrewWeapon(ship,vehicle,weapon,report,options,member));};
    if(!actor||(!controlsCrewMember(member)&&!actor.testUserPermission(game.user,"OBSERVER"))) {
      const note=document.createElement("p");note.textContent="Compétences à accès limité.";details.append(note);appendWeapons();continue;
    }
    const navigator=assignments.some(entry=>["pilot","copilot"].includes(crewRoleDefinition(vehicle,entry.role)?.kind));
    if(navigator&&!actor._npcStation) {
      const strain=actor.system.stats?.strain;
      const row=document.createElement("div");row.className="sc-crew-stress";row.dataset.crewStress=actor.id;
      const label=document.createElement("span");label.textContent="Stress personnel";
      const value=document.createElement("strong");value.textContent=statNumber(strain?.value)+" / "+statNumber(strain?.max);
      value.title="Stress subi / seuil";
      row.append(label,value);details.append(row);
    }
    const support=assignments.some(entry=>/engineer|operator|mécanicien|mecanicien|technicien|ingénieur|ingenieur|astromech/i.test(entry.role))||['engineer','operator','astromech'].includes(actor.flags?.starwarsffg?.autoCrew?.kind);
    const pilotKey=canonicalCrewSkill(vehiclePilotSkill(vehicle,game.settings.get("starwarsffg","skilltheme")));
    const skills=Object.entries(actor.system.skills??{}).filter(([key,skill])=>
      skill&&actor.system.characteristics?.[skill.characteristic]&&
      (member.passenger?["computers","leadership","mechanics"].includes(normalize(canonicalCrewSkill(key))):normalize(canonicalCrewSkill(key))==="gunnery"||(member.passenger||support)&&["mechanics","computers","leadership"].includes(normalize(canonicalCrewSkill(key)))||navigator&&(normalize(canonicalCrewSkill(key))==="astrogation"||canonicalCrewSkill(key)===pilotKey)));
    for(const [key,skill] of skills) {
      const row=document.createElement("div");row.className="sc-crew-skill";row.dataset.skill=key;row.dataset.crewActor=actor.id;
      const label=document.createElement("span");label.textContent=game.i18n.localize(skill.label??key);
      const rank=document.createElement("span");rank.className="sc-crew-rank";rank.textContent=String(skill.rank??0);rank.title="Rang de compétence";
      const control=document.createElement("button");control.type="button";control.className="sc-card-action sc-crew-roll";
      control.setAttribute("aria-label","Lancer "+label.textContent+" pour "+actor.name);
      const navigation=assignments.find(isPilotRole)??assignments.find(isNavigationRole);
      const station=pilotSkill(key)?navigation:normalize(key)==="gunnery"?assignments.find(entry=>selectableWeapons(vehicle,entry).length):member;
      control.disabled=!controlsCrewMember(member)||(!game.user.isGM&&pilotSkill(key)&&!navigation)||(normalize(key)==="gunnery"&&!station);
      control.disabled||=vehicleMinionGroup(vehicle).enabled&&!vehicleMinionGroup(vehicle).alive;
      control.disabled||=board().round===0&&(pilotSkill(key)||normalize(key)==="gunnery");
      if(pilotSkill(key)||normalize(key)==="gunnery") {
        const turn=characterActionState(board().ships,member.actor_id,board().round);
        control.disabled||=!!initiativeReason(station??member)||(!game.user.isGM&&(turn.action||turn.ended));
      }
      const pool=get_dice_pool(actor,key,new DicePoolFFG({difficulty:0}));
      const preview=pool.renderPreview();
      if(preview.querySelector("img"))control.append(preview);
      else control.textContent="Jeter";
      control.addEventListener("click",event=>{
        event.preventDefault();event.stopPropagation();
        Promise.resolve().then(()=>normalize(canonicalCrewSkill(key))==="gunnery"&&entry.weapon?fireCrewWeapon(ship,vehicle,entry.weapon,options,member):rollSkill(ship,station??member,key,options)).catch(report);
      });
      row.append(label,rank,control);
      details.append(row);
    }
    if(!skills.length) {
      const note=document.createElement("p");note.textContent="Aucune compétence disponible pour ce poste.";details.append(note);
    }
    appendWeapons();
  }
  return section;
}

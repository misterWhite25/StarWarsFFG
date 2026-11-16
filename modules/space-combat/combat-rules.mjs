import {BARRAGES} from './barrage-rules.mjs';
// Vehicle maneuvers, actions and their costs. Voler / Conduire commits map movement.
export const MANEUVERS = [
  {id:"speed",label:"Accélérer / Décélérer",pilot:true,description:"Augmente ou réduit la vitesse de 1, entre 0 et la vitesse maximale."},
  {id:"fly",label:"Voler / Conduire",pilot:true,minSpeed:1,description:"Dépense une manœuvre pour choisir une destination dans la zone de déplacement. Le déplacement et son coût s’appliquent à la validation."},
  {id:"evasive",label:"Manœuvre d’évasion",pilot:true,maxSize:4,minSpeed:3,description:"Améliore une fois la difficulté des attaques effectuées et subies, jusqu’à la fin du prochain tour du pilote."},
  {id:"stay",label:"Coller à la cible",pilot:true,maxSize:4,minSpeed:3,description:"Améliore une fois les dés de maîtrise des attaques effectuées et subies, jusqu’à la fin du prochain tour du pilote."},
  {id:"punch",label:"Mettre la gomme",pilot:true,maxSize:4,description:"Passe à la vitesse maximale. Le vaisseau subit 1 stress système par point de vitesse gagné."},
  {id:"shields",label:"Réorienter les boucliers",description:"Transfère 1 point de défense du secteur source au secteur choisi. Choisissez le pilote, le copilote, un membre d’équipage hors artilleurs ou un passager à bord. Une seconde manœuvre coûte 2 stress personnel, sans stress système."}
];
export const ACTIONS = [
  {id:"attack",label:"Effectuer une attaque",target:true,description:"Choisissez le personnage, une arme accessible, le vaisseau cible et le secteur visé. La préparation du jet inclut les effets des manœuvres et permet de choisir les talents. L’action est dépensée au lancer des dés."},
  {id:"advantage",label:"Prendre l’avantage",pilot:true,maxSize:4,minSpeed:4,target:true,skill:"pilot",description:"Test de pilotage selon les vitesses relatives. En cas de réussite, le pilote ignore les pénalités des manœuvres évasives contre cette cible et choisit son secteur défensif jusqu’à la fin du round suivant."},
  {id:"repairStrain",label:"Limiter les avaries - stress",skill:"Mechanics",description:"Test de Mécanique selon le stress actuel. Une réussite retire 1 stress système."},
  {id:"repairHull",label:"Limiter les avaries - coque",skill:"Mechanics",description:"Une tentative par rencontre pour le vaisseau. Chaque succès net répare 1 dégât de coque. Le MJ doit autoriser les réparations réalisables dans la situation."},
  {id:"repairCritical",label:"Réparer un dégât critique",skill:"Mechanics",description:"Test de Mécanique selon la gravité du dégât critique sélectionné. Une réussite retire ce dégât critique. Une nouvelle tentative reste possible à un tour ultérieur."},
  {id:"manualRepair",label:"Réparations manuelles",skill:"Athletics",difficulty:3,description:"Avec l’accord du MJ et les outils adaptés, répare 1 dégât de coque par succès net. Partage la limite d’une tentative de réparation de coque par rencontre."},
  {id:"copilot",label:"Assister pilotage",skill:"pilot",difficulty:2,description:"Chaque succès net rétrograde une fois la difficulté du prochain test de pilotage du pilote."},
  {id:"plot",label:"Tracer l’itinéraire",skills:["Astrogation","Perception"],description:"Astrogation moyenne ou Perception difficile. Chaque succès retire 1 dé d’infortune dû au terrain au prochain test de pilotage."},
  {id:"jam",label:"Brouillage",skill:"Computers",difficulty:2,target:true,description:"La cible doit réussir un test d’Informatique pour communiquer. La difficulté est de 2, plus 1 par succès supplémentaire."},
  {id:"boostShields",label:"Intensifier le bouclier",skill:"Mechanics",difficulty:3,description:"Si le vaisseau possède une défense, une réussite lui inflige 1 stress système et ajoute 1 défense au secteur choisi. Chaque succès supplémentaire prolonge l’effet d’un round."},
  {id:"fireDiscipline",label:"Discipline de tir",skills:["Leadership","Discipline"],difficulty:3,description:"Ajoute 1 dé de fortune au prochain tir, puis à un autre tir par paire de succès supplémentaires."},
  {id:"scan",label:"Scanner l’ennemi",skill:"Perception",difficulty:3,target:true,description:"Une réussite révèle l’armement, les modifications et les seuils de coque et de stress. Les avantages peuvent révéler les niveaux actuels."},
  {id:"slice",label:"Pirater les systèmes de l’ennemi",skill:"Computers",difficulty:3,target:true,description:"Une réussite réduit de 1 la défense du secteur ciblé pendant un round par succès net."},
  {id:"spoof",label:"Contre mesures",skills:["Computers","Vigilance"],description:"Informatique moyenne ou Vigilance difficile. Une réussite améliore une fois la difficulté des attaques guidées jusqu’au début du prochain tour."},
  ...BARRAGES,
  {id:"communicate",label:"Rétablir les communications",skill:"Computers",description:"Effectue le test imposé par un brouillage. Une réussite permet de communiquer malgré ce brouillage."}
];
export const SECTORS = {fore:"Avant",aft:"Arrière",port:"Bâbord",starboard:"Tribord"};
export const normalizeSkill = key => String(key??"").toLowerCase().replace(/[^a-z]/g,"");
export function pilotSkill(vehicle,theme="starwars") {
  return theme==="starwars"?(vehicle.system.spaceShip?"Piloting: Space":"Piloting: Planetary"):(vehicle.system.spaceShip?"Piloting":"Driving");
}
export function combatState(ship) {
  return ship.combat??={turns:{},effects:[],pilotManeuvers:0,pilotAction:false,hullRepairUsed:false,advantageCounts:{}};
}
export function turnState(ship,actorId,round) {
  const state=combatState(ship);
  if(state.turns[actorId]?.round!==round)state.turns[actorId]={round,maneuvers:0,action:false,ended:false};
  return state.turns[actorId];
}
// Rendering reads counters without cloning the ship or creating combat state.
export function readTurnState(ship,actorId,round) {
  const turn=ship.combat?.turns?.[actorId];
  return turn?.round===round?turn:{round,maneuvers:0,action:false,ended:false};
}
export function characterActionState(ships,actorId,round) {
  const turns=ships.map(ship=>ship.combat?.turns?.[actorId]).filter(turn=>turn?.round===round);
  return {action:turns.some(turn=>turn.action),ended:turns.some(turn=>turn.ended)};
}
export const pilotManeuverLimit=ship=>Number(ship.silhouette)>=5?1:2;
export function maneuverCost(ship,actorId,round,pilot=false) {
  const turn=readTurnState(ship,actorId,round);
  return {personal:turn.maneuvers===1?2:0,system:pilot&&pilotManeuverLimit(ship)>1&&(ship.combat?.pilotManeuvers??0)===1?2:0,
    available:!turn.ended&&turn.maneuvers<2&&(!pilot||(ship.combat?.pilotManeuvers??0)<pilotManeuverLimit(ship))};
}
export function maneuverCostLabel(cost,systemLabel="stress système") {
  if(!cost.personal&&cost.system)return "aucun stress personnel · +2 "+systemLabel;
  return [cost.personal?"+2 stress personnel":"",cost.system?"+2 "+systemLabel:""].filter(Boolean).join(" · ")||"sans coût de stress";
}
export function maneuverPerformer(ship,members,round,preferredId="") {
  const unique=[...new Map(members.map(member=>[member.actor_id,member])).values()];
  const available=unique.filter(member=>maneuverCost(ship,member.actor_id,round,true).available);
  if(preferredId)return available.find(member=>member.actor_id===preferredId);
  return available.sort((a,b)=>maneuverCost(ship,a.actor_id,round,true).personal-maneuverCost(ship,b.actor_id,round,true).personal)[0];
}
export function maneuverReason(def,ship,pilot) {
  if(def.pilot&&!pilot)return ACTIONS.some(action=>action.id===def.id)?"Seul le pilote peut effectuer cette action.":"Seuls le pilote et le copilote peuvent effectuer cette manœuvre.";
  if(def.minSize&&ship.silhouette<def.minSize)return "Réservé aux gabarits "+def.minSize+" ou plus.";
  if(def.maxSpeed!==undefined&&ship.speed>def.maxSpeed)return "Vitesse maximale "+def.maxSpeed+" pour cette action.";
  if(def.maxSize&&ship.silhouette>def.maxSize)return "Réservé aux gabarits 1 à "+def.maxSize+".";
  if(def.minSpeed&&ship.speed<def.minSpeed)return "Vitesse minimale "+def.minSpeed+".";
  if(def.id==="shields"&&!Object.values(globalThis.game?.actors?.get(ship.actorId)?.system.stats?.shields??{}).some(value=>Number(value)>0))
    return "Ce vaisseau ne possède aucun point de défense à réorienter.";
  if(def.id==="speed"&&ship.maxSpeed<=0)return "Ce véhicule ne peut pas changer de vitesse.";
  if((def.id==="accelerate"||def.id==="punch")&&ship.speed>=ship.maxSpeed)return "La vitesse maximale est déjà atteinte.";
  if(def.id==="decelerate"&&ship.speed<=0)return "Le vaisseau est déjà à l’arrêt.";
  return "";
}
export function repairDifficulty(resource) {
  const value=Number(resource?.value),max=Number(resource?.max);
  if(!Number.isFinite(value)||!Number.isFinite(max)||max<=0)throw Error("Le seuil et la valeur de cette ressource doivent être renseignés.");
  return value>max?3:value>=max/2?2:1;
}
export function advantageDifficulty(ship,target) {
  const delta=ship.speed-target.speed;
  return (delta>0?1:delta===0?2:delta===-1?3:4)+(ship.combat?.advantageCounts?.[target.id]??0)+(target.combat?.advantageCounts?.[ship.id]??0);
}
export function effectiveDefense(ship,vehicle,sector) {
  const base=Number(vehicle?.system.stats?.shields?.[sector])||0;
  const modifier=(ship.combat?.effects??[]).filter(e=>e.sector===sector&&["boostShields","slice"].includes(e.kind)).reduce((sum,e)=>sum+e.value,0);
  return Math.max(0,Math.min(4,base+modifier));
}
export function attackSector(ship,target,actorId,requested="fore") {
  if(ship.combat?.effects?.some(e=>e.kind==="advantage"&&e.actorId===actorId&&e.targetId===target.id))return Object.hasOwn(SECTORS,requested)?requested:"fore";
  const bearing=Math.atan2(ship.y-target.y,ship.x-target.x)*180/Math.PI;
  const relative=((bearing-target.heading+540)%360)-180;
  return Math.abs(relative)<=45?"fore":Math.abs(relative)>=135?"aft":relative>0?"port":"starboard";
}
export function attackModifiers(ship,target,actorId,{guided=false}={}) {
  const own=ship.combat?.effects??[],enemy=target?.combat?.effects??[];
  const advantage=own.some(e=>e.kind==="advantage"&&e.actorId===actorId&&e.targetId===target?.id);
  const modifiers={boost:0,abilityUpgrades:0,difficultyUpgrades:0,consume:[]};
  const discipline=own.find(e=>e.kind==="fireDiscipline");
  if(discipline){modifiers.boost++;modifiers.consume.push(discipline.id);}
  modifiers.abilityUpgrades=own.filter(e=>e.kind==="stay").length+enemy.filter(e=>e.kind==="stay").length;
  const covered=ship.silhouette<=4?enemy.filter(e=>e.kind==="blanketBarrage"&&(e.arcs??[e.arc]).includes(attackSector(ship,target,null))).reduce((sum,e)=>sum+e.value,0):0;
  modifiers.difficultyUpgrades=covered+(advantage?0:own.filter(e=>e.kind==="evasive").length+enemy.filter(e=>e.kind==="evasive").length)+
    (guided?enemy.filter(e=>e.kind==="spoof").reduce((sum,e)=>sum+e.value,0):0);
  return modifiers;
}
export function expireEffects(ship,round,phase,actorId) {
  const state=combatState(ship);
  state.effects=state.effects.filter(effect=>!(effect.expiresRound<=round&&effect.phase===phase&&(!actorId||effect.actorId===actorId)));
}
export function advanceCombatRound(ship,oldRound) {
  const state=combatState(ship);
  expireEffects(ship,oldRound,"end");
  expireEffects(ship,oldRound,"round");
  expireEffects(ship,oldRound+1,"start");
  state.pilotManeuvers=0;state.pilotAction=false;state.turns={};
  delete state.flightOrder;delete state.flightMoves;
  state.accelerated=false;
  state.reservations={};
  return ship;
}
export function endShipCombat(ship) {
  return {...ship,version:(ship.version??0)+1,startSpeed:ship.speed,destination:{x:ship.x,y:ship.y},
    desiredHeading:ship.heading,turn:0,movementSpent:0,movementTurnSpent:0,
    combat:{turns:{},effects:[],pilotManeuvers:0,pilotAction:false,hullRepairUsed:false,advantageCounts:{},reservations:{}}};
}

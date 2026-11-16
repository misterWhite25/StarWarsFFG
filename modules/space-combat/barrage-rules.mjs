export const BARRAGES=[
  {id:'blanketBarrage',label:'Barrage de couverture',english:'Blanket Barrage',barrage:true,minSize:5,maxSpeed:3,skill:'Gunnery',difficulty:2,description:'Artillerie moyenne. Toutes les armes d’un même type dans les arcs choisis tirent ce round. Jusqu’à la fin du prochain tour de l’artilleur, les appareils de gabarit 4 ou moins améliorent une fois la difficulté de leurs attaques contre ces arcs, plus une fois par paire d’avantages. Deux menaces sur leur attaque leur infligent une touche automatique à la moitié des dégâts de base, arrondie au supérieur ; un désastre inflige une touche aux dégâts de base. Le MJ vérifie les arcs effectivement couverts.'},
  {id:'concentratedBarrage',label:'Barrage concentré',english:'Concentrated Barrage',barrage:true,minSize:5,maxSpeed:3,skill:'Gunnery',target:true,description:'Au moins deux armes identiques dans un même arc tirent sur une cible de gabarit 5 ou plus. Effectuez un seul tir normal. Sur une réussite, dépensez un avantage une seule fois pour ajouter le nombre d’armes engagées aux dégâts d’une touche.'},
  {id:'overwhelmingBarrage',label:'Barrage écrasant',english:'Overwhelming Barrage',barrage:true,minSize:5,maxSpeed:3,skill:'Gunnery',target:true,description:'Au moins deux armes identiques dans un même arc effectuent un seul tir normal. Sur une réussite, un avantage inflige une touche à une autre cible à portée courte de la cible initiale, plus une cible par tranche de dix armes. Chaque cible supplémentaire doit être de gabarit au moins égal à la cible initiale et ne peut être touchée qu’une fois par cette action. Répétez cette dépense si vous disposez d’autres avantages. Chaque touche supplémentaire inflige les dégâts de base plus les succès nets.'}
];
export const isBarrage=id=>BARRAGES.some(action=>action.id===id);
export const CREW_ACTION_ORDER=['damageControl','manualRepair','boostShields','fireDiscipline','jam','scan','slice','spoof','plot','blanketBarrage','concentratedBarrage','overwhelmingBarrage'];
export const REPAIR_ACTIONS=['repairStrain','repairHull','repairCritical'];
export const DAMAGE_CONTROL={id:'damageControl',label:'Contrôle des dégâts',description:'Réparer le stress mécanique, les dégâts de coque ou un dégât critique.'};
export function barrageConfiguration(ship,vehicle,definition,request){
  if(!definition?.barrage||Number(ship.silhouette)<5||ship.speed<0||ship.speed>3)throw Error('Les barrages exigent un gabarit de 5 ou plus et une vitesse de 0 à 3.');
  const weapon=vehicle.items.get(request.weaponId);
  if(weapon?.type!=='shipweapon')throw Error('Choisissez une arme de vaisseau.');
  const arc=request.barrageArc;
  if(!['fore','aft','port','starboard','dorsal','ventral'].includes(arc)||!weapon.system.firingarc?.[arc])throw Error('Cette arme ne couvre pas l’arc choisi.');
  const arcs=definition.id==='blanketBarrage'?[...new Set(request.barrageArcs??[arc])]:[arc];
  if(!arcs.length||arcs.some(key=>!['fore','aft','port','starboard','dorsal','ventral'].includes(key)||!weapon.system.firingarc?.[key]))throw Error('Choisissez uniquement les arcs couverts par cette batterie.');
  const count=Number(request.barrageCount),minimum=definition.id==='blanketBarrage'?1:2;
  if(!Number.isInteger(count)||count<minimum||count>10000)throw Error('Indiquez au moins '+minimum+' arme(s) identique(s) dans cet arc.');
  const raw=Number(weapon.system.damage?.adjusted)||Number(weapon.system.damage?.value);
  if(!Number.isFinite(raw)||raw<0)throw Error('Les dégâts de cette arme doivent être renseignés.');
  return {id:definition.id,label:definition.label,weaponId:weapon.id,weaponName:weapon.name,arc,arcs,count,damage:raw,description:definition.description};
}

import { chooseTokenTarget, preferredTokenTarget as preferredDamageTarget, watchTokenTarget as watchDamageTarget } from './token-target-picker.js';
export { preferredDamageTarget, watchDamageTarget };
import { damageModeFromSnapshot, weaponQualityName, combatModeForRoll } from "./weapon-selection.js";
import { tonioRulesEnabled, weaponSuccessDamage } from "./custom-rules.js";
// Post-roll helpers. Only message authors/GMs spend results; damage respects Actor ownership.
const scope = 'starwarsffg';
const key = 'combatActions';
const activeQualities = [
  {names:['auto-fire','auto fire','autofire','automatique','tir automatique'],cost:2,note:['Nécessite la difficulté accrue avant le jet ; chaque activation ajoute une touche.','Requires increased difficulty before rolling; each activation adds a hit.']},
  {names:['linked','lie','liee'],cost:2,note:['Une touche supplémentaire sur la même cible ; nombre limité par le rang.','One extra hit on the same target; limited by rating.']},
  {names:['blast','souffle','explosion'],cost:2,note:['Résoudre les dégâts de zone selon les cibles au contact. Sur un échec, le coût est de 3 avantages.','Resolve blast damage against engaged targets. On a miss the cost is 3 advantages.']},
  {names:['burn','brulure','incendiaire'],cost:2},
  {names:['concussive','choc','concussion'],cost:2},
  {names:['disorient','desorientation'],cost:2},
  {names:['ensnare','immobilisation','entrave'],cost:2},
  {names:['knockdown','renversement'],cost:2,note:['Ajouter 1 avantage au coût par point de gabarit de la cible au-delà de 1.','Add 1 advantage to the cost per target silhouette above 1.']},
  {names:['sunder','destruction','fracassage'],cost:1,note:['Un cran de détérioration par activation ; choisir un objet admissible.','One step of damage per activation; choose an eligible item.']},
  {names:['stun','etourdissement'],cost:2},
  {names:['guided','guide','guidage'],cost:3,note:['Activation après un tir raté ; attaque guidée à résoudre en fin de round.','Activate after a miss; resolve the guided attack at the end of the round.']},
];
const normalized = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+quality(?:\s+\d+)?$/,'');
const t = (fr, en) => game.i18n.lang === 'fr' ? fr : en;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const state = message => foundry.utils.deepClone(message.getFlag(scope, key) ?? {entries: []});
const canEdit = message => game.user.isGM || message.author?.id === game.user.id;
const locks = new Set();
const rawResult = message => message.rolls?.find(roll => roll.hasFFG)?.ffg;
export function adjustedResult(raw,entries=[]){
 if(!raw)return raw;const gain=entries.filter(e=>['smooth-talker','knowledge-specialization'].includes(e.effect)&&!e.undone).reduce((n,e)=>n+(Number(e.successGain)||0),0);
 const net=(Number(raw.success)||0)-(Number(raw.failure)||0)+gain;
 return {...raw,success:Math.max(0,net),failure:Math.max(0,-net)};
}
export function successConversionSummary(raw,entries=[]){
 const names={'smooth-talker':'Beau Parleur','knowledge-specialization':'Connaissances Spécialisées'};
 const gains=Object.entries(names).map(([id,name])=>({name,added:entries.filter(e=>e.effect===id&&!e.undone).reduce((n,e)=>n+num(e.successGain),0)})).filter(e=>e.added>0);
 if(!gains.length)return '';
 const adjusted=adjustedResult(raw,entries);
 return gains.map(e=>`${e.name} : +${e.added} réussite(s).`).join(' ')+` Total des réussites ajoutées : +${gains.reduce((n,e)=>n+e.added,0)}. Nouveau total : ${adjusted.success} réussite(s)`+(adjusted.failure>0?`, ${adjusted.failure} échec(s) restant(s)`:'')+'.';
}
const result = message => adjustedResult(rawResult(message),message.getFlag(scope,key)?.entries??[]);
const weapon = message => {
  const data = message.rolls?.find(roll => roll.hasFFG)?.data;
  return ['weapon', 'shipweapon'].includes(data?.type) ? data : null;
};
export function remainingSymbols(results, entries = []) {
  const available = {advantage: Math.max(0,num(results?.advantage)), triumph: Math.max(0,num(results?.triumph)), threat: Math.max(0,num(results?.threat)), despair: Math.max(0,num(results?.despair))};
  for (const entry of entries) if (!entry.undone && entry.currency in available) available[entry.currency] -= num(entry.cost);
  return available;
}
export function calculateDamage({base, successes, soak, pierce = 0, breach = 0, vehicle = false, scale = 1, tonioRules = false}) {
  const raw = Math.max(0, (num(base) + weaponSuccessDamage(successes, tonioRules)) * num(scale));
  const reduction = Math.max(0, num(soak) - (vehicle ? num(breach) : num(pierce) + 10 * num(breach)));
  return {raw, reduction, wounds: Math.max(0, raw - reduction)};
}
export function weaponBaseDamage(item) {
  const damage = [item?.system?.damage, item?.system?.system?.damage, item?.damage, item?.data?.damage, item?.data?.data?.damage]
    .find(value => value && (value.adjusted !== undefined || value.value !== undefined)) ?? {};
  const adjusted = Number(damage.adjusted);
  return Number.isFinite(adjusted) && adjusted !== 0 ? adjusted : num(damage.value);
}
// Point Blank is already included in the saved first-hit weapon snapshot.
// Any later hit, on any target, uses the original damage. Undo releases the first hit.
export function weaponHitDamage(item, entries = []) {
  const bonus = num(item?.flags?.starwarsffg?.rollTalentWeapon?.damageBonus);
  const spent = entries.some(entry => entry.kind === 'damage' && !entry.undone);
  return weaponBaseDamage(item) - (spent ? bonus : 0)+(spent?0:entries.filter(e=>e.kind==='destiny-talent'&&!e.undone).reduce((n,e)=>n+num(e.damageBonus),0));
}
function qualities(item) {
  const values = item?.system?.adjusteditemmodifier ?? item?.system?.itemmodifier ?? [];
  return Object.values(values).filter(Boolean).map(q => ({name: q.name ?? '', rank: num(q.system?.rank_current ?? q.system?.rank ?? 1), description: q.system?.description ?? ''}));
}
export function weaponEffects(item, successful, autoFire = false) {
  return qualities(item).flatMap((quality,index)=>{
    const rule=activeQualities.find(rule=>rule.names.includes(normalized(quality.name)));
    if(!rule || (rule.names[0]==='auto-fire' && !autoFire)) return [];
    const blast=rule.names[0]==='blast',guided=rule.names[0]==='guided';
    if((guided&&successful)||(!successful&&!blast&&!guided)) return [];
    const rig=item?.flags?.starwarsffg?.juryRiggedApplied;const reduction=rig?.effect==='quality'&&normalized(quality.name).replace(/[^a-z]/g,'')===rig.quality?1:0;
    return [{...quality,id:`quality-${index}`,cost:Math.max(1,(blast&&!successful?3:rule.cost)-reduction),preselected:rule.names[0]==='auto-fire',note:rule.note,variable:rule.names[0]==='knockdown'}];
  });
}
function qualityRank(item, names) {
  return qualities(item).filter(q => names.includes(q.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())).reduce((sum,q)=>sum+q.rank,0);
}
async function dialog(title, content, label, callback) {
  const body=document.createElement('div');body.innerHTML=content;
  const raw=body.querySelector('[name="raw"]'),reduction=body.querySelector('[name="reduction"]');
  if(raw&&reduction) {
    const total=document.createElement('p');total.setAttribute('role','status');body.append(total);
    const refresh=()=>{total.textContent=`${t('À appliquer','To apply')}: ${Math.max(0,Math.floor(num(raw.value)-num(reduction.value)))}`;};
    raw.addEventListener('input',refresh);reduction.addEventListener('input',refresh);refresh();
  }
  const effect=body.querySelector('[name="effect"]'),cost=body.querySelector('[name="cost"]');
  if(effect&&cost) effect.addEventListener('change',()=>{cost.value=effect.selectedOptions[0].dataset.cost;});
  return foundry.applications.api.DialogV2.prompt({window:{title},classes:['starwarsffg','themed'],position:{width:500},content:body,
    ok:{label, callback:(_event,_button,app)=>callback(app.element)}, rejectClose:false});
}
const field = (root, name) => root.querySelector(`[name="${name}"]`)?.value;
async function edit(message, action) {
  if (!canEdit(message) || locks.has(message.id)) return;
  locks.add(message.id);
  try { await action(); } catch(error) { ui.notifications.error(error.message); }
  finally {locks.delete(message.id);}
}
async function saveEntry(message, entry) {
  const current = state(message);
  const left = remainingSymbols(result(message), current.entries);
  if (entry.currency && (!(entry.currency in left) || !Number.isInteger(entry.cost) || entry.cost < 1 || entry.cost > left[entry.currency])) throw Error(t('Symboles insuffisants.', 'Not enough symbols.'));
  entry.id = foundry.utils.randomID();
  current.entries.push(entry);
  await message.setFlag(scope,key,current);
  return entry;
}
const symbolNames = () => ({advantage:t('avantages','advantages'),triumph:t('triomphes','triumphs'),threat:t('menaces','threats'),despair:t('désastres','despairs')});

// Core rulebook, combat spending tables 6-2 and 6-3. Narrative consequences
// are recorded, not silently translated into permanent Actor modifications.
export function spendingOptions(item, results, {strain = 0, canStrain = false, negative = true, autoFire = false, combatMode = 'personal',smoothTalker=null,knowledgeSpecialization=null,reviewedCombat=null} = {}) {
  if(combatMode==='vehicle')return vehicleSpendingOptions(item,results,{negative,autoFire});
  const options=[];
  if(knowledgeSpecialization?.rank>0)options.push({id:'knowledge-specialization',name:`Connaissances spécialisées : échanger 1 Triomphe contre ${knowledgeSpecialization.rank} Réussite(s)`,payments:{triumph:1},successPerActivation:knowledgeSpecialization.rank});
  if(reviewedCombat?.success&&reviewedCombat.disorient>0)options.push({id:'talent-disorient',name:`Désorientation : cible désorientée pendant ${reviewedCombat.disorient} round(s)`,payments:{advantage:2},max:1});
  if(reviewedCombat?.success&&reviewedCombat.stunningImproved)options.push({id:'talent-stagger',name:'Coup Assommant (Amélioré) : cible étourdie, 1 round par Triomphe',payments:{triumph:1}});
  if(smoothTalker?.rank>0)options.push({id:'smooth-talker',name:t(`Beau Parleur : échanger 1 Triomphe contre ${smoothTalker.rank} Réussite(s)`,`Smooth Talker: exchange 1 Triumph for ${smoothTalker.rank} Success(es)`),payments:{triumph:1},successPerActivation:smoothTalker.rank});
  const add=(id,fr,en,cost,extra={})=>options.push({id,name:t(fr,en),payments:cost,...extra});
  const positive=n=>({advantage:n,triumph:1}), bad=n=>({threat:n,despair:1});
  if(canStrain && strain>0) add('strain','Éliminer 1 point de stress','Recover 1 strain',positive(1),{max:strain});
  add('aid-next','Ajouter 1 Fortune au prochain allié actif','Give the next active ally 1 Boost',positive(1),{aid:'next'});
  add('notice','Remarquer un détail important','Notice an important detail',positive(1));
  add('aid-chosen','Ajouter 1 Fortune à un allié choisi (soi compris)','Give a chosen ally 1 Boost (including yourself)',positive(2),{aid:'chosen'});
  add('maneuver','Exécuter une manœuvre gratuite immédiate (dans la limite de deux manœuvres par tour)','Perform an immediate free maneuver (within the limit of two maneuvers per turn)',positive(2),{max:1});
  add('setback','Ajouter 1 Infortune au prochain test de la cible','Add 1 Setback to the target’s next check',positive(2),{target:true});
  add('defense','Annuler les bonus défensifs de la cible jusqu’à la fin du round','Negate the target’s defensive bonuses until the round ends',positive(3),{target:true,max:1});
  add('environment','Ignorer les pénalités environnementales jusqu’à la fin de son prochain tour','Ignore environmental penalties until your next turn ends',positive(3),{max:1});
  add('gain-defense','Gagner +1 défense de mêlée ou à distance jusqu’à la fin de son prochain tour','Gain +1 melee or ranged defense until your next turn ends',positive(3));
  add('drop','Faire lâcher une arme à la cible','Make the target drop a weapon',positive(3),{target:true});
  add('difficulty','Améliorer la difficulté du prochain test de la cible','Upgrade the difficulty of the target’s next check',{triumph:1},{target:true});
  add('upgrade','Améliorer le prochain test d’un allié (soi compris)','Upgrade an ally’s next check (including yourself)',{triumph:1},{target:true});
  add('vital','Effectuer une action cruciale','Do something vital',{triumph:1});
  if(item && num(results?.success)>0) {
    const condition=t('La cible subit des dégâts après encaissement.','The target takes damage past soak.');
    const crit=num(item.system?.crit?.adjusted ?? item.system?.crit?.value);
    if(crit>0) add('critical','Dégâts critiques (+10 par activation supplémentaire sur la même touche)','Critical injury (+10 per extra activation on the same hit)',positive(crit),{target:true,condition});
    add('disable','Neutraliser temporairement la cible ou son équipement au lieu des dégâts','Temporarily disable the target or its gear instead of damage',positive(3),{target:true,max:1,condition:t('L’attaque infligerait des dégâts ; le MJ accepte de les remplacer par cet effet temporaire.','The attack would deal damage; the GM agrees to replace it with this temporary effect.')});
    add('destroy','Détruire un équipement de la cible en plus des dégâts','Destroy a piece of the target’s equipment in addition to damage',{triumph:2},{target:true,condition});
  }
  for(const q of weaponEffects(item,num(results?.success)>0,autoFire)) add(q.id,`Activer ${weaponQualityName(q.name,game.i18n.lang)} ${q.rank||''}`,`Activate ${weaponQualityName(q.name,game.i18n.lang)} ${q.rank||''}`,positive(q.cost),{
    target:true,variable:q.variable,max:normalized(q.name)==='linked'||['lie','liee'].includes(normalized(q.name))?q.rank:undefined,
    condition:q.preselected?undefined:q.note?t(...q.note):t('Les conditions de cet attribut sont remplies.','The conditions for this quality are satisfied.')});
  if(negative) {
    if(canStrain) add('suffer-strain','Subir 1 point de stress','Suffer 1 strain',bad(1));
    add('lose-maneuver','Perdre le bénéfice d’une manœuvre jusqu’à la refaire','Lose a maneuver’s benefit until it is performed again',bad(1));
    add('enemy-maneuver','Accorder une manœuvre gratuite immédiate à un adversaire','Grant an opponent an immediate free maneuver',bad(2),{target:true});
    add('enemy-boost','Ajouter 1 Fortune au prochain test du personnage visé','Add 1 Boost to the targeted character’s next check',bad(2),{target:true});
    add('ally-setback','Ajouter 1 Infortune à sa prochaine action ou à celle d’un allié','Add 1 Setback to your or an ally’s next action',bad(2),{target:true});
    add('prone','Tomber à terre','Fall prone',bad(3),{max:1});
    add('enemy-edge','Accorder un avantage important à l’ennemi','Give the enemy a significant advantage',bad(3));
    add('ally-difficulty','Améliorer la difficulté du prochain test d’un allié (soi compris)','Upgrade your or an ally’s next check difficulty',{despair:1},{target:true});
    if(item) {
      if(!reviewedCombat?.spareClip||qualities(item).some(q=>['limitedammo','munitionslimitees'].includes(normalized(q.name).replace(/[^a-z]/g,''))))add('ammo','Épuiser les munitions de l’arme à distance','Run out of ammunition for this encounter',{despair:1},{max:1,condition:t('Il s’agit d’une arme à distance utilisant des munitions.','This is a ranged weapon using ammunition.')});
      add('damage-gear','Endommager l’arme de mêlée ou l’outil utilisé','Damage the melee weapon or tool being used',{despair:1},{condition:t('L’objet utilisé est un outil ou une arme de mêlée.','The item being used is a tool or melee weapon.')});
    }
  }
  return options;
}


// Core rulebook tables 7-5 and 7-6, transcribed from the supplied French tables.
// Vehicle effects are recorded for the GM; do not apply system strain to the pilot.
export function vehicleSpendingOptions(item, results, {negative=true,autoFire=false}={}) {
  const options=[],positive=n=>({advantage:n,triumph:1}),bad=n=>({threat:n,despair:1});
  const add=(id,fr,en,payments,extra={})=>options.push({id,name:t(fr,en),payments,...extra});
  const skillsFR='Pilotage, Artillerie, Informatique ou Mécanique',skillsEN='Piloting, Gunnery, Computers, or Mechanics';
  add('vehicle-aid-next',`Ajouter 1 Fortune au prochain allié actif (test de ${skillsFR})`,`Give the next active ally 1 Boost (${skillsEN} check)`,positive(1));
  add('vehicle-notice','Découvrir un détail important dans la bataille','Notice an important detail in the battle',positive(1));
  add('vehicle-maneuver','Exécuter une manœuvre gratuite immédiate (si deux manœuvres n’ont pas déjà été accomplies ce tour)','Perform an immediate free maneuver (if you have not already performed two this turn)',positive(2),{max:1});
  add('vehicle-setback','Ajouter 1 Infortune au prochain test du personnage visé','Add 1 Setback to the targeted character’s next check',positive(2));
  add('vehicle-aid-chosen',`Ajouter 1 Fortune à un allié, soi compris (prochain test de ${skillsFR})`,`Give an ally, including yourself, 1 Boost (next ${skillsEN} check)`,positive(2));
  add('vehicle-environment','Ignorer les pénalités du terrain ou des phénomènes célestes jusqu’à la fin de son prochain tour','Ignore terrain or celestial phenomena penalties until the end of your next turn',positive(3),{max:1});
  add('vehicle-pilot-maneuver','Exécuter une manœuvre gratuite de pilote (aux commandes, dans la limite de deux manœuvres par tour)','Perform a free pilot maneuver (at the controls, within the limit of two maneuvers per turn)',positive(3),{max:1});
  add('vehicle-change-course','Forcer un changement de cap annulant les effets de Viser et Coller à la cible','Force a course change, canceling Aim and Stay on Target benefits',positive(3));
  add('vehicle-enemy-difficulty','Améliorer la difficulté du prochain test de Pilotage ou d’Artillerie du personnage visé','Upgrade the difficulty of the targeted character’s next Piloting or Gunnery check',{triumph:1});
  add('vehicle-ally-upgrade',`Améliorer l’aptitude du prochain test de ${skillsFR} d’un allié`,`Upgrade an ally’s next ${skillsEN} check`,{triumph:1});
  add('vehicle-vital','Réussir un coup d’éclat qui renverse le cours de la bataille','Do something vital that turns the tide of battle',{triumph:1});
  if(item && num(results?.success)>0) {
    const crit=num(item.system?.crit?.adjusted??item.system?.crit?.value);
    if(crit>0)add('critical','Dégâts critiques de véhicule (+10 par activation supplémentaire sur la même touche)','Vehicle critical hit (+10 per extra activation on the same hit)',positive(crit),{condition:t('L’attaque a percé le blindage de la cible.','The attack penetrated the target’s armor.')});
    add('vehicle-disable-component','Endommager temporairement un composant choisi au lieu des dégâts ou du stress mécanique','Temporarily damage a chosen component instead of damage or system strain',positive(3),{condition:t('Attaque réussie : l’effet remplace les dégâts ou le stress mécanique et est convenu avec le MJ.','Successful attack: replace damage or system strain with an effect agreed with the GM.'),max:1});
    add('vehicle-destroy-component','Détruire un composant important au lieu des dégâts ou du stress mécanique (réparable)','Destroy an important component instead of damage or system strain (repairable)',{triumph:2},{condition:t('Attaque réussie : composant choisi avec le MJ, désactivé jusqu’à réparation.','Successful attack: choose the component with the GM; disabled until repaired.'),max:1});
  }
  if(negative) {
    add('vehicle-reduce-speed','Réduire la vitesse de 1 à cause de manœuvres inattendues','Reduce speed by 1 due to unexpected maneuvers',bad(1));
    add('vehicle-lose-maneuver','Perdre les effets d’une manœuvre (évasion, viser…) jusqu’à la refaire','Lose a maneuver’s benefits (evasive maneuvers, aim…) until performed again',bad(1));
    add('vehicle-system-strain','Infliger 1 point de stress mécanique au véhicule (répétable)','Inflict 1 system strain on the vehicle (repeatable)',bad(1));
    add('vehicle-enemy-maneuver','Accorder à un adversaire une manœuvre gratuite immédiate en réaction au test','Grant an opponent an immediate free maneuver in response to the check',bad(2));
    add('vehicle-enemy-boost','Ajouter 1 Fortune au prochain test de Pilotage ou d’Artillerie du personnage visé','Add 1 Boost to the targeted character’s next Piloting or Gunnery check',bad(2));
    add('vehicle-ally-setback','Ajouter 1 Infortune à sa prochaine action ou à celle d’un allié','Add 1 Setback to your or an ally’s next action',bad(2));
    add('vehicle-last-slot','Déplacer le créneau du joueur en dernière position dans l’ordre d’initiative','Move the player’s initiative slot to last in the order',bad(3),{max:1});
    add('vehicle-enemy-edge','Conférer un avantage majeur à l’ennemi jusqu’au début de son prochain tour','Give the enemy a major advantage until the start of your next turn',bad(3));
    add('vehicle-weapon-damaged','Endommager l’armement principal ou l’arme utilisée (dégât critique de composant, hors total des critiques)','Damage the main armament or weapon used (component critical hit, not counted toward total critical hits)',{despair:1});
    add('vehicle-ally-difficulty',`Améliorer la difficulté du prochain test de ${skillsFR} d’un allié, soi compris`,`Upgrade the difficulty of your or an ally’s next ${skillsEN} check`,{despair:1});
    add('vehicle-minor-collision','Subir une collision mineure avec un adversaire à portée proche, le terrain ou un objet flottant','Suffer a minor collision with a close-range opponent, terrain, or floating object',{despair:1});
    if(num(results?.success)<=0)add('vehicle-major-collision','Subir une collision majeure avec un adversaire à portée proche, le terrain ou un objet flottant (test raté)','Suffer a major collision with a close-range opponent, terrain, or floating object (failed check)',{despair:1});
  }
  options.push(...spendingOptions(item,results,{negative:false,autoFire,combatMode:'personal'}).filter(o=>o.id.startsWith('quality-')));
  return options;
}

export function validateSpending(results, entries, options, selections) {
  const left=remainingSymbols(results,entries), counts={};
  if(!selections.length) throw Error(t('Sélectionne au moins un effet.','Select at least one effect.'));
  return selections.map(selection=>{
    const option=options.find(o=>o.id===selection.effect),quantity=Number(selection.quantity);
    if(!option || !Number.isInteger(quantity)||quantity<1 || !option.payments[selection.currency]) throw Error(t('Sélection invalide.','Invalid selection.'));
    const unit=option.variable && selection.currency==='advantage'?Number(selection.unit):option.payments[selection.currency];
    if(!Number.isInteger(unit)||unit<option.payments[selection.currency]) throw Error(t('Coût invalide.','Invalid cost.'));
    counts[option.id]=(counts[option.id]??0)+quantity;
    if(counts[option.id]>(option.max??Infinity)) throw Error(t('Nombre maximal d’activations dépassé.','Maximum activations exceeded.'));
    if(option.condition&&!selection.confirmed) throw Error(t('Confirme les conditions de l’effet sélectionné.','Confirm the selected effect’s conditions.'));
    const cost=unit*quantity;left[selection.currency]-=cost;
    if(left[selection.currency]<0) throw Error(t('Symboles insuffisants.','Not enough symbols.'));
    return {...selection,cost,quantity,option};
  });
}

function spendingColor(option) {
  if(['smooth-talker','knowledge-specialization','talent-disorient','talent-stagger'].includes(option.id))return 'talent';
  if (option.id.startsWith('quality-')) return 'weapon-quality';
  if (option.id === 'critical') return 'critical';
  if (option.payments.advantage) return `advantage-${Math.min(3,option.payments.advantage)}`;
  if (option.payments.triumph) return option.payments.triumph === 2 ? 'double-triumph' : 'triumph';
  return 'negative';
}

const messageCombatMode=message=>combatModeForRoll(message.getFlag(scope,'combatSkill'),weapon(message),message.getFlag(scope,'combatMode'));

async function spendDialog(message) {
  const astro=await import('./astrogation-spending.js');
  if(astro.isAstrogationMessage(message))return astro.spendAstrogationDialog(message,{edit,remainingSymbols,validateSpending,results:result,speakerActor});
  const vehicleMode=messageCombatMode(message)==='vehicle';
  const actor=await speakerActor(message),canStrain=Boolean(actor?.isOwner&&actor.system.stats?.strain);
  const initial=state(message),available=remainingSymbols(result(message),initial.entries);
  const options=spendingOptions(weapon(message),result(message),{strain:num(actor?.system.stats?.strain?.value),canStrain,negative:game.user.isGM,autoFire:message.getFlag(scope,'autoFire')===true,combatMode:messageCombatMode(message),smoothTalker:smoothTalkerForMessage(actor,message),knowledgeSpecialization:smoothTalkerForMessage(actor,message,'knowledgeSpecialization'),reviewedCombat:reviewedCombatForMessage(actor,message)})
    .filter(o=>Object.entries(o.payments).some(([currency,cost])=>available[currency]>=cost))
    .sort((a,b)=>{
      const order=['talent','advantage-1','advantage-2','advantage-3','critical','triumph','double-triumph','negative','weapon-quality'];
      return order.indexOf(spendingColor(a))-order.indexOf(spendingColor(b));
    });
  const icons=Object.fromEntries(await Promise.all(Object.entries({advantage:'AD',triumph:'TR',threat:'TH',despair:'DE',boost:'BO',setback:'SE'}).map(async ([key,tag])=>{
    const name=({boost:t('Fortune','Boost'),setback:t('Infortune','Setback')})[key]??symbolNames()[key];
    const html=await foundry.applications.ux.TextEditor.enrichHTML(`[${tag}]`);
    return [key,`<span class="spending-symbol" role="img" aria-label="${esc(name)}" title="${esc(name)}">${html}</span>`];
  })));
  const symbols=(currency,count)=>count>0?icons[currency].repeat(count):'0';
  const effectName=name=>esc(name).replace(/\b1 (Fortune|Boost|Infortune|Setback)\b/g,(_match,word)=>icons[/^(Fortune|Boost)$/.test(word)?'boost':'setback']);
  let body=document.createElement('div');body.className='ffg-spending';
  body.innerHTML=`<style>.ffg-spending{color:#242424}.ffg-spending .budget{position:sticky;top:0;background:#eee9dc;padding:10px;border:1px solid #88795c;z-index:1;font-weight:bold}.ffg-spending .effects{max-height:52vh;overflow:auto}
    .ffg-spending .effect{padding:12px 10px;margin:6px 0;border:1px solid #b8b1a6;border-left:5px solid var(--cost-color,#777);border-radius:4px;background:var(--cost-bg,#f1eee8)}
    .ffg-spending .effect[data-cost-color="talent"]{--cost-color:#6d4e88;--cost-bg:#ece4f3;border-width:2px}.ffg-spending .effect[data-cost-color="advantage-1"]{--cost-color:#387348;--cost-bg:#eaf3e9}
    .ffg-spending .effect[data-cost-color="advantage-2"]{--cost-color:#32658d;--cost-bg:#e9f1f8}
    .ffg-spending .effect[data-cost-color="advantage-3"]{--cost-color:#956116;--cost-bg:#fbf1df}
    .ffg-spending .effect[data-cost-color="critical"]{--cost-color:#a33240;--cost-bg:#fae9ec}
    .ffg-spending .effect[data-cost-color="double-triumph"]{--cost-color:#74408f;--cost-bg:#f1e9f7}
    .ffg-spending .effect[data-cost-color="triumph"]{--cost-color:#7c6a22;--cost-bg:#f6f2da}
    .ffg-spending .effect[data-cost-color="weapon-quality"]{--cost-color:#236b68;--cost-bg:#e1f3f0}
    .ffg-spending .effect[data-cost-color="negative"]{--cost-color:#62636b;--cost-bg:#eeeef1}
    .ffg-spending .effect>strong{color:var(--cost-color,#444)}
.ffg-spending .spending-symbol{display:inline-block;vertical-align:middle;line-height:1;margin:0 2px}.ffg-spending .spending-symbol .dietype{font-size:20px;line-height:1}.ffg-spending .payments{display:flex;gap:14px;flex-wrap:wrap;margin:8px 0}.ffg-spending label{display:block}.ffg-spending input[type=number]{width:64px;background:white;color:#222}.ffg-spending input[type=text],.ffg-spending select{background:white;color:#222;width:100%}.ffg-spending .condition{font-size:12px;margin:6px 0}.ffg-spending .error{color:#941d2b}.ffg-spending button{margin-top:10px}</style>
    ${vehicleMode?`<p><strong>${t('Combat spatial / véhicules','Space / vehicle combat')}</strong></p>`:''}
    <p><strong>${weapon(message)?`${t('Arme','Weapon')} : ${esc(weapon(message).name)}`:t('Aucune arme associée à ce jet : critiques et attributs d’arme indisponibles.','No weapon associated with this roll: criticals and weapon qualities unavailable.')}</strong></p>
    ${qualities(weapon(message)).some(q=>['stun setting','reglage etourdissant'].includes(normalized(q.name)))?`<p>${t('Réglage étourdissant : se choisit avant le tir, sans dépenser d’avantages. Dégâts de stress, portée courte. Ce n’est pas l’attribut actif Étourdissement.','Stun setting: choose before firing, without spending advantages. Strain damage, short range. This is not the active Stun quality.')}</p>`:''}
    <p>${t('Choisis plusieurs effets et leur nombre d’activations. Le paiement se choisit dans les colonnes de symboles.','Choose several effects and their activation counts. Choose payment using the symbol columns.')}</p>
    <div class="budget" role="status"></div><div class="effects">${options.map(o=>`<section class="effect" data-effect="${o.id}" data-cost-color="${spendingColor(o)}"><strong>${effectName(o.name)}</strong><div><small>${t('Coût','Cost')} : ${Object.entries(o.payments).map(([c,n])=>symbols(c,n)).join(t(' ou ',' or '))} ${t('par activation','per activation')}${o.id==='strain'?t(' (1 point de stress ; répétable).',' (1 strain; repeatable).'):''}</small></div>
    <div class="payments">${Object.entries(o.payments).map(([c,n])=>`<label>${symbols(c,n)} <input aria-label="${esc(o.name)} - ${symbolNames()[c]}" type="number" min="0" step="1" value="0" data-currency="${c}"></label>`).join('')}</div>
    ${o.variable?`<label>${t('Coût en avantages par activation (gabarit de la cible)','Advantages per activation (target silhouette)')}<input name="unit" type="number" min="${o.payments.advantage}" step="1" value="${o.payments.advantage}"></label>`:''}
    ${o.condition?`<label class="condition"><input type="checkbox" name="confirmed"> ${esc(o.condition)}</label>`:''}
    </section>`).join('')}</div>
    <p>${vehicleMode?t('Effets consignés dans le chat, à appliquer manuellement au véhicule ou au personnage concerné. Menaces et désastres : dépense par le MJ.','Effects recorded in chat; apply manually to the relevant vehicle or character. Threats and Despairs: spent by the GM.'):t('Stress : appliqué à la fiche. Bonus de dés : à appliquer manuellement. Autres effets : consignés, à résoudre avec le MJ. Les menaces et désastres sont dépensés par le MJ.','Strain: applied to the sheet. Dice bonuses: apply manually. Other effects: recorded, resolve with the GM. Threats and Despairs are spent by the GM.')}</p>
    <p class="error" role="alert"></p><button type="button" class="apply">${t('Appliquer la sélection','Apply selection')}</button>`;
  const read=()=>[...body.querySelectorAll('[data-currency]')].filter(input=>Number(input.value)!==0).map(input=>{
    const row=input.closest('[data-effect]');return {effect:row.dataset.effect,currency:input.dataset.currency,quantity:Number(input.value),unit:field(row,'unit'),target:field(row,'target')??'',recipient:field(row,'recipient'),confirmed:row.querySelector('[name=confirmed]')?.checked};
  });
  let button=body.querySelector('.apply'),error=body.querySelector('.error'),busy=false;
  const refresh=()=>{
    const selections=read(),left={...available};
    for(const s of selections) {const o=options.find(o=>o.id===s.effect);left[s.currency]-=s.quantity*(o.variable&&s.currency==='advantage'?num(s.unit):o.payments[s.currency]);}
    body.querySelector('.budget').innerHTML=`${t('Restants','Remaining')} : `+Object.entries(left).filter(([c])=>available[c]>0).map(([c,n])=>symbols(c,n)).join(' · ');
    for(const input of body.querySelectorAll('[data-currency]')) {
      const o=options.find(o=>o.id===input.closest('[data-effect]').dataset.effect),c=input.dataset.currency;
      const unit=o.variable&&c==='advantage'?num(field(input.closest('[data-effect]'),'unit')):o.payments[c];
      input.max=Math.max(0,Number(input.value)+Math.floor(left[c]/Math.max(1,unit)));
      input.disabled=busy||(Number(input.value)===0&&(left[c]<unit));
    }
    for(const row of body.querySelectorAll('[data-effect]')) {
      const inputs=[...row.querySelectorAll('[data-currency]')];
      row.hidden=!inputs.some(input=>Number(input.value)!==0||!input.disabled);
    }
    try {validateSpending(result(message),initial.entries,options,selections);error.textContent='';button.disabled=busy;}
    catch(e){error.textContent=selections.length?e.message:'';button.disabled=true;}
  };
  refresh();
  const content=document.createElement('div');content.append(body);
  const app=new foundry.applications.api.DialogV2({window:{title:t('Utiliser les avantages / menaces','Spend advantages / threats')},classes:['starwarsffg','themed'],position:{width:740},content,buttons:[{action:'close',label:t('Fermer','Close')}],rejectClose:false});
  await app.render({force:true});
  // DialogV2 serializes supplied HTML; bind to the rendered nodes, not the source.
  body=app.element.querySelector('.ffg-spending');button=body.querySelector('.apply');error=body.querySelector('.error');
  const trigger=message.getFlag(scope,'triggeredTalent'),special=[];
  if(['stimap','stimapimp'].includes(trigger)&&result(message)?.success>0&&available.triumph>0&&reviewedRank(actor,['stimapplicationsupreme','dosedestimulantultime','dosedestimulantsupreme'])>0)special.push({name:'Dose de Stimulant (Ultime) - choisir les caractéristiques supplémentaires',action:()=>stimulusDialog(message)});
  if(trigger==='fldcomm'&&result(message)?.success>0&&available.triumph>0&&reviewedRank(actor,['fieldcommanderimproved','officiersuperieurameliore'])>0)special.push({name:'Officier Supérieur (Amélioré) - accorder les actions aux alliés',action:()=>commanderDialog(message)});
  for(const item of special.reverse()){const section=document.createElement('section');section.className='effect';section.dataset.costColor='talent';const action=document.createElement('button');action.type='button';action.textContent=item.name;action.addEventListener('click',async()=>{await app.close();await edit(message,item.action);});section.append(action);body.querySelector('.effects').prepend(section);}

  body.addEventListener('input',refresh);body.addEventListener('change',refresh);refresh();
  button.addEventListener('click',async()=>{
    if(busy)return;busy=true;refresh();
    await edit(message,async()=>{
      try {
        // Revalidate against live flags and current strain immediately before saving.
        const current=state(message),fresh=spendingOptions(weapon(message),result(message),{strain:num(actor?.system.stats?.strain?.value),canStrain:Boolean(actor?.isOwner&&actor.system.stats?.strain),negative:game.user.isGM,autoFire:message.getFlag(scope,'autoFire')===true,combatMode:messageCombatMode(message),smoothTalker:smoothTalkerForMessage(actor,message),knowledgeSpecialization:smoothTalkerForMessage(actor,message,'knowledgeSpecialization'),reviewedCombat:reviewedCombatForMessage(actor,message)});
        const selected=validateSpending(result(message),current.entries,fresh,read()),batch=foundry.utils.randomID();
        const entries=selected.map(s=>({successGain:['smooth-talker','knowledge-specialization'].includes(s.effect)?s.quantity*s.option.successPerActivation:0,id:foundry.utils.randomID(),batch,kind:'effect',effect:s.effect,label:`${s.option.name} ×${s.quantity}`,note:s.target,currency:s.currency,cost:s.cost,quantity:s.quantity}));
        let value=num(actor?.system.stats?.strain?.value);
        for(const e of entries) if(['strain','suffer-strain'].includes(e.effect)) {const after=Math.max(0,value+(e.effect==='strain'?-e.quantity:Math.max(1,e.quantity-reviewedRank(actor,['resolve','determination']))));e.change={actor:actor.uuid,path:'system.stats.strain.value',before:value,after};value=after;}
        current.entries.push(...entries);await message.setFlag(scope,key,current);
        if(entries.some(e=>e.change)) {
          try {await actor.update({'system.stats.strain.value':value});}
          catch(e){const rollback=state(message);for(const entry of rollback.entries)if(entry.batch===batch)entry.undone=true;await message.setFlag(scope,key,rollback);throw e;}
        }
        await app.close();
        const criticalIds=entries.filter(entry=>entry.effect==='critical').map(entry=>entry.id);
        if(criticalIds.length) {
          try {const {resolveCritical}=await import('./critical-actions.js');await resolveCritical(message,criticalIds);}
          catch(error){ui.notifications.error(error.message);}
        }
      } catch(e){error.textContent=e.message;}
    });
    busy=false;button.disabled=false;
  });
}

export function smoothTalkerForMessage(actor,message,kind='smoothTalker'){
 const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
 const skill=message.getFlag(scope,'combatSkill')??message.rolls?.find(r=>r.hasFFG)?.skillName;
 let rank=0;const skills=new Set();
 for(const item of Array.from(actor?.items?.contents??actor?.items??[])){
  if(item.system?.active===false)continue;
  const nodes=item.type==='talent'?[['_self',{...item.system,name:item.name,islearned:true,isRanked:item.system?.ranks?.ranked,rank:item.system?.ranks?.current}]]:item.type==='specialization'?Object.entries(item.system?.talents??{}):[];
  for(const [slot,node] of nodes)if(node.islearned===true&&(kind==='knowledgeSpecialization'?['knowledgespecialization','connaissancesspecialisees']:['smoothtalker','beauparleur']).includes(normalize(node.name))){rank+=node.isRanked?Math.max(0,Number(node.rank??1)||0):1;for(const k of item.flags?.starwarsffg?.reviewedTalentChoices?.[slot]?.skills??[])skills.add(k);}
 }
 const localize=value=>game.i18n.localize(String(value??''));
 const rolled=new Set([normalize(skill),normalize(localize(skill))]);
 const matches=k=>{
  const label=actor?.system?.skills?.[k]?.label;
  return [k,label,label?localize(label):null].filter(Boolean).some(value=>rolled.has(normalize(value)));
 };
 return rank>0&&skills.size===1&&[...skills].some(matches)?{rank}:null;
}
async function speakerActor(message) {
  const speaker=message.speaker;
  if(speaker?.scene && speaker?.token) return (await fromUuid(`Scene.${speaker.scene}.Token.${speaker.token}`))?.actor;
  return game.actors.get(speaker?.actor);
}
async function acceptAid(message, entry) {
  const {acceptPilotageAid}=await import('./pilotage-mj.js');
  return acceptPilotageAid(message,entry);
}
export function pendingAid(context) {
  return (game.user.getFlag(scope,'rollAid')?.pending ?? []).filter(a=>{
    const message=game.messages.get(a.message);
    const entry=message?.getFlag(scope,key)?.entries?.find(e=>e.id===a.entry);
    if(!(entry?.kind==='aid' && !entry.undone && entry.recipient===game.user.id))return false;
    if(!context)return true; // Compatibility for consumers explicitly inspecting the queue.
    const subject=a.subjectUuid??entry.subjectUuid;
    if(subject)return subject===context.subjectUuid||subject===context.actorUuid;
    // Old unassigned assistance can only benefit the player's assigned character.
    return Boolean(game.user.character?.uuid&&game.user.character.uuid===context.actorUuid);
  });
}
export async function consumeAid(entries,context) {
  if(!entries?.length) return;
  const current=foundry.utils.deepClone(game.user.getFlag(scope,'rollAid') ?? {pending:[],used:[]});
  const valid=new Set(pendingAid(context).map(a=>a.id));
  if(entries.some(a=>!valid.has(a.id)||current.used.includes(a.id))) throw Error(t('Cette aide a changé ou a déjà été utilisée. Rouvre le jet.','This assistance changed or was already used. Reopen the roll.'));
  const ids=new Set(entries.map(a=>a.id));
  current.pending=current.pending.filter(a=>!ids.has(a.id));current.used.push(...ids);
  await game.user.setFlag(scope,'rollAid',current);
}
export async function restoreAid(entries) {
  if(!entries?.length) return;
  const current=foundry.utils.deepClone(game.user.getFlag(scope,'rollAid') ?? {pending:[],used:[]});
  const ids=new Set(entries.map(a=>a.id));current.used=current.used.filter(id=>!ids.has(id));
  for(const entry of entries) if(!current.pending.some(a=>a.id===entry.id)) current.pending.push(entry);
  await game.user.setFlag(scope,'rollAid',current);
}
async function chooseDamageTarget(tokens,requested) {
  return chooseTokenTarget(tokens,{requested,title:t('Choisir la cible','Choose target'),confirmLabel:t('Calculer','Calculate')});
}

async function damageDialog(message) {
  const item=weapon(message);if(!item || num(result(message)?.success)<=0) return;
  const tokens=(canvas.tokens?.placeables ?? []).filter(token=>token.actor && (game.user.isGM || (token.visible && !token.document.hidden)));
  if(!tokens.length) throw Error(t('Aucun token sur la scène.','No tokens on this scene.'));
  const request=state(message).request;
  const targets=[...game.user.targets], controlled=canvas.tokens.controlled ?? [];
  const preferred=preferredDamageTarget(request?.target,targets,controlled);
  const selected=new Set([...targets, ...controlled].map(token=>token.id));
  tokens.sort((a,b)=>Number(selected.has(b.id))-Number(selected.has(a.id)));
  const choose=await chooseDamageTarget(tokens,preferred);
  if(!choose) return;
  const token=await fromUuid(choose), actor=token?.actor;if(!actor) return;
  const vehicle=actor.type==='vehicle', shipWeapon=item.type==='shipweapon';
  const scale=shipWeapon===vehicle?1:shipWeapon?10:0.1;
  const soak=vehicle?actor.system.stats?.armour?.value:actor.system.stats?.soak?.value;
  const computed=calculateDamage({base:weaponHitDamage(item,state(message).entries),successes:result(message).success,soak,
    pierce:qualityRank(item,['pierce','perforant']),breach:qualityRank(item,['breach','breche']),vehicle,scale,tonioRules:tonioRulesEnabled()});
  if(request?.target===choose) {computed.raw=request.raw;computed.reduction=request.reduction;}
  const damageMode=damageModeFromSnapshot(message.getFlag(scope,'shot'),item);
  const talentStun=message.getFlag(scope,'rollTalents')?.some(t=>t.id==='stunning-blow');
  const damageType=talentStun?'strain':request?.target===choose?request.type:damageMode.damageType;
  const prior=state(message).entries.filter(e=>e.kind==='damage'&&!e.undone&&e.change?.actor===actor.uuid);
  await dialog(t('Appliquer les dégâts','Apply damage'),`<p><strong>${esc(token.name)}</strong></p>
    ${prior.length?`<p><strong>${t('Attention : ce jet a déjà appliqué des dégâts à cette cible. Nouvelle touche seulement.','Warning: this roll already applied damage to this target. Additional hit only.')}</strong></p>`:''}
    <p>${t('Vérifie les qualités de l’arme et les cas particuliers. Les valeurs restent modifiables.','Check weapon qualities and special cases. Values remain editable.')}${scale!==1?` ${t('Changement d’échelle','Scale conversion')} ×${scale}.`:''}</p>
    <label>${t('Dégâts bruts','Raw damage')}<input type="number" name="raw" min="0" value="${computed.raw}"></label>
    <label>${t('Réduction effective (encaissement / blindage)','Effective reduction (soak / armour)')}<input type="number" name="reduction" min="0" value="${computed.reduction}"></label>
    ${damageMode.requiresConfirmation?`<p>${t('Ancien jet : le mode étourdissant n’a pas été enregistré. Choisis le type réellement utilisé.','Older roll: stun mode was not saved. Choose the type actually used.')}</p>`:''}
    <label>${t('Type','Type')}<select name="type"><option value="" ${!damageType?'selected':''} disabled>${t('Choisir le mode réel du tir','Choose the actual firing mode')}</option><option value="wounds" ${damageType==='wounds'?'selected':''}>${t('Blessures / dégâts de coque','Wounds / hull trauma')}</option><option value="strain" ${damageType==='strain'?'selected':''}>${t('Stress / stress mécanique','Strain / system strain')}</option></select></label>
    <p>${t('Les boucliers ne sont pas de l’encaissement. Les sbires et rivaux subissent le stress comme blessures.','Shields are not soak. Minions and rivals suffer strain as wounds.')}</p>`,actor.isOwner?t('Appliquer','Apply'):t('Demander au MJ','Request GM'),async root=>{
      if(!['wounds','strain'].includes(field(root,'type')))throw Error(t('Choisis le type de dégâts du tir.','Choose the shot damage type.'));
      const raw=num(field(root,'raw')),reduction=num(field(root,'reduction'));if(raw<0||reduction<0) throw Error(t('Valeurs invalides.','Invalid values.'));
      if(!actor.isOwner) {const s=state(message);s.request={target:choose,raw,reduction,type:field(root,'type')};await message.setFlag(scope,key,s);return;}
      const strain=talentStun||field(root,'type')==='strain';
      const stat=vehicle?(strain?'systemStrain':'hullTrauma'):(strain&&actor.system.stats?.strain&&!['minion','rival'].includes(actor.type)?'strain':'wounds');
      if(!actor.system.stats?.[stat]) throw Error(t('Statistique absente sur cette cible.','Target lacks this statistic.'));
      const path=`system.stats.${stat}.value`,before=num(actor.system.stats[stat].value),amount=Math.max(0,Math.floor(raw-reduction));
      const change={actor:actor.uuid,path,before,after:before+amount};
      const statName=vehicle?(strain?t('stress mécanique','system strain'):t('dégâts de coque','hull trauma')):(stat==='strain'?t('stress','strain'):t('blessures','wounds'));
      const entry=await saveEntry(message,{kind:'damage',label:`${token.name}: +${amount} ${statName}`,change});
      try {await actor.update({[path]:change.after});} catch(error){await markUndone(message,entry.id);throw error;}
      const s=state(message);delete s.request;await message.setFlag(scope,key,s);
    });
}
async function markUndone(message,id) {const current=state(message);const entry=current.entries.find(e=>e.id===id);if(entry) entry.undone=true;await message.setFlag(scope,key,current);}
async function undo(message,id) {
  const entry=state(message).entries.find(e=>e.id===id);if(!entry||entry.undone) return;
  if(entry.effect==='stim-application'){const target=await fromUuid(entry.change.actor);if(!target?.isOwner||num(foundry.utils.getProperty(target,entry.change.path))!==entry.change.after)throw Error('Le bénéficiaire a changé depuis : annulation à vérifier avec le MJ.');await target.update({[entry.change.path]:entry.change.before,'flags.starwarsffg.stimBonuses':(target.getFlag(scope,'stimBonuses')??[]).filter(b=>!entry.stimBonusIds.includes(b.id))});await markUndone(message,id);return;}
  if(entry.kind==='destiny-talent'){if(state(message).entries.some(e=>e.kind==='damage'&&!e.undone))throw Error('Annulez d’abord les dégâts de cette attaque.');const {refundTalentDestiny}=await import('./reviewed-destiny.js');await refundTalentDestiny(entry.destiny);await markUndone(message,id);return;}
  if(entry.kind==='astrogation'){const {undoAstrogationEntry}=await import('./astrogation-spending.js');return undoAstrogationEntry(message,entry);}
  if(entry.effect==='critical') {
    const {undoCritical}=await import('./critical-actions.js');
    await undoCritical(message,entry);return;
  }
  if(entry.kind==='aid') {
    const user=game.users.get(entry.recipient),aid=user?.getFlag(scope,'rollAid');
    if(aid?.pending?.some(a=>a.id===`${message.id}:${id}`)||aid?.used?.includes(`${message.id}:${id}`)) throw Error(t('Cette aide a déjà été acceptée.','This assistance was already accepted.'));
  }
  if(entry.change) {
    const actor=await fromUuid(entry.change.actor);
    if(!actor?.isOwner) throw Error(t('Seul le propriétaire ou le MJ peut annuler.','Only the owner or GM can undo.'));
    if(num(foundry.utils.getProperty(actor,entry.change.path))!==entry.change.after) throw Error(t('La valeur a changé depuis. Corrige la fiche manuellement pour préserver les actions suivantes.','The value changed since this action. Adjust the sheet manually to preserve later actions.'));
    await actor.update({[entry.change.path]:entry.change.before});
  }
  await markUndone(message,id);
}
export function renderCombatActions(message,element) {
  if(!message.isContentVisible || !result(message)) return;
  if(message.getFlag(scope,'talentReplacement')){const root=element instanceof HTMLElement?element:element?.[0];if(root&&!root.querySelector('.ffg-talent-replaced')){const p=document.createElement('p');p.className='ffg-talent-replaced';p.textContent='Jet remplacé par une relance de talent : utiliser uniquement le nouveau résultat.';root.append(p);}return;}
  const root=element instanceof HTMLElement?element:element?.[0];if(!root||root.querySelector('.ffg-combat-actions')) return;
  const s=state(message),left=remainingSymbols(result(message),s.entries),editable=canEdit(message);
  const box=document.createElement('section');box.className='ffg-combat-actions';box.style.cssText='border-top:1px solid currentColor;padding-top:6px;margin-top:6px';
  const conversion=successConversionSummary(rawResult(message),s.entries);
  if(conversion){const p=document.createElement('p');p.className='ffg-talent-success-summary';p.textContent=conversion;box.append(p);}
  const shot=message.getFlag(scope,'shot');
  if(shot?.damageType){const note=document.createElement('p');note.className='ffg-shot-status';note.textContent=shot.damageType==='strain'?t('Tir étourdissant - dégâts de stress (encaissement applicable)','Stun shot - strain damage (soak applies)'):t('Tir normal - blessures','Normal shot - wounds');box.append(note);}
  const talents=message.getFlag(scope,'rollTalents')??[];
  if(talents.length) {
    const note=document.createElement('p');
    note.innerHTML='<strong>'+esc(t('Talents activés :','Activated talents:'))+'</strong> '+talents.map(talent=>esc(talent.name)+(talent.cost?' <em>('+esc(talent.cost)+' '+esc(t('stress','strain'))+')</em>':'')).join(' · ');
    box.append(note);
  }
  if(messageCombatMode(message)==='vehicle'){const context=document.createElement('p');context.textContent=t('Combat spatial / véhicules','Space / vehicle combat');context.style.cssText='font-weight:bold;font-size:12px';box.append(context);}
  if(message.getFlag(scope,'autoFire')===true && !root.querySelector('.ffg-auto-fire-status')) {
    const status=document.createElement('p');status.className='ffg-auto-fire-status';
    status.textContent=t('Tir automatique activé','Auto-fire enabled');
    status.title=t('Choisi avant le jet : +1 dé de Difficulté.','Selected before rolling: +1 Difficulty die.');
    status.style.cssText='display:block;margin:6px 0;padding:4px 7px;border-left:3px solid #236b68;border-radius:3px;background:#e1f3f0;color:#236b68;font-size:12px;font-weight:bold;line-height:1.4';
    box.append(status);
  }
  const addButton=(label,callback)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='height:auto;white-space:normal;margin:2px 0';b.addEventListener('click',async event=>{event.preventDefault();b.disabled=true;try{await callback();}catch(error){ui.notifications.error(error.message);}finally{b.disabled=false;}});box.append(b);};
  if(editable) {
    const actor=game.actors?.get(message.speaker?.actor);
    if(result(message)?.success>0&&['stimap','stimapimp'].includes(message.getFlag(scope,'triggeredTalent')))addButton('Appliquer Dose de Stimulant',()=>edit(message,()=>stimulusDialog(message)));
    if(result(message)?.success>0&&message.getFlag(scope,'triggeredTalent')==='fldcomm')addButton('Accorder les effets d’Officier Supérieur',()=>edit(message,()=>commanderDialog(message)));
    const skill=String(message.getFlag(scope,'combatSkill')??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
    if(['mechanics','mecanique','swffgskillsnamemechanics'].includes(skill)&&result(message)?.success>0&&reviewedRank(actor,['finetuning','mecaniciendeprecision'])>0)addButton('Réparer du stress mécanique - Mécanicien de Précision',()=>edit(message,()=>fineTuningDialog(message)));
    if(['computers','informatique','swffgskillsnamecomputers'].includes(skill)&&reviewedRank(actor,['technicalaptitude','geniedelinformatique'])>0)addButton('Calculer la durée - Génie de l’Informatique',()=>edit(message,()=>technicalDurationDialog(message)));
    for(const option of destinyHitOptions(actor,message))addButton('Utiliser '+option.label,()=>edit(message,()=>destinyHitDialog(message,option.id)));
    for(const option of talentRerollOptions(actor,message)){const names={'natural-enforcer':'Brute-Née','natural-doctor':'Médecin-Né','natural-negotiator':'Négociateur-Né'};addButton('Relancer avec '+names[option.id],()=>rerollWithTalent(message,option.id));}
    const count=document.createElement('p');count.textContent=`${t('Restants','Remaining')}: `+(Object.entries(left).filter(([,n])=>n>0).map(([c,n])=>`${n} ${symbolNames()[c]}`).join(' · ')||'0');box.append(count);
    if(left.advantage>0||left.triumph>0||(game.user.isGM&&(left.threat>0||left.despair>0))) addButton(t('Utiliser les avantages / menaces','Spend advantages / threats'),()=>spendDialog(message));
    if(weapon(message)&&num(result(message).success)>0) addButton(s.request?t('Demande de dégâts - valider','Damage request - review'):t('Appliquer les dégâts…','Apply damage…'),()=>edit(message,()=>damageDialog(message)));
  }
  const criticalGroups=new Set();
  for(const entry of s.entries.filter(e=>!e.undone)) {
    const line=document.createElement('p');line.textContent=`${entry.label}${entry.note?` - ${entry.note}`:''}${entry.cost?` (${entry.cost} ${symbolNames()[entry.currency] ?? entry.currency})`:''}`;box.append(line);
    if(entry.kind==='aid'&&entry.recipient===game.user.id) addButton(t('Accepter pour mon prochain jet','Accept for my next roll'),()=>acceptAid(message,entry));
    if(entry.effect==='critical') {
      const group=entry.batch??entry.id;
      if(criticalGroups.has(group))continue;
      criticalGroups.add(group);
      const resolution=entry.criticalResolution;
      if(resolution?.summary) {const summary=document.createElement('p');summary.textContent=resolution.summary;box.append(summary);}
      if(editable&&resolution?.status!=='applied') {
        const ids=s.entries.filter(candidate=>candidate.effect==='critical'&&!candidate.undone&&(entry.batch?candidate.batch===entry.batch:candidate.id===entry.id)).map(candidate=>candidate.id);
        addButton(resolution?.status==='requested'?t('Demande de critique - valider','Critical request - review'):t('Résoudre le critique…','Resolve critical…'),()=>edit(message,async()=>{
          const {resolveCritical}=await import('./critical-actions.js');await resolveCritical(message,ids);
        }));
      }
    }
    if(editable) addButton(entry.effect==='critical'?t('Annuler le critique et sa dépense','Undo critical and spending'):t('Annuler cette application','Undo this application'),()=>edit(message,()=>undo(message,entry.id)));
  }
  if(box.childElementCount) root.append(box);
}

export function reviewedRank(actor,names){
 const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
 let rank=0;for(const item of Array.from(actor?.items?.contents??actor?.items??[])){
  if(item.system?.active===false)continue;
  const nodes=item.type==='talent'?[{...item.system,name:item.name,islearned:true,isRanked:item.system?.ranks?.ranked,rank:item.system?.ranks?.current}]:item.type==='specialization'?Object.values(item.system?.talents??{}):[];
  for(const n of nodes)if(n.islearned===true&&names.includes(norm(n.name)))rank+=n.isRanked?Math.max(0,Number(n.rank??1)||0):1;
 }return rank;
}
export function reviewedCombatForMessage(actor,message){
 const skill=String(message.getFlag(scope,'combatSkill')??message.rolls?.find(r=>r.hasFFG)?.skillName??'').toLowerCase();
 const combat=/melee|brawl|ranged|gunnery|lightsaber|corps|pugilat|armes|artillerie|sabre/.test(skill);
 const melee=/melee|brawl|corps|pugilat/.test(skill);
 const stun=message.getFlag(scope,'rollTalents')?.some(t=>t.id==='stunning-blow')||message.getFlag(scope,'shot')?.damageType==='strain';
 return {spareClip:reviewedRank(actor,['spareclip','jamaisacourt'])>0,success:result(message)?.success>0,disorient:combat?reviewedRank(actor,['disorient','desorientation']):0,stunningImproved:melee&&stun&&reviewedRank(actor,['stunningblowimproved','improvedstunningblow','coupassommantameliore'])>0};
}

export const sessionRerollRules=[
 {id:'natural-enforcer',names:['naturalenforcer','brutenee'],skills:['coercion','streetwise','systemed']},
 {id:'natural-doctor',names:['naturaldoctor','medecinne'],skills:['medicine','medecine']},
 {id:'natural-negotiator',names:['naturalnegotiator','negociateurne'],skills:['cool','calme','negotiation','negociation']}
];
const rerollLocks=new Set();
export function talentRerollOptions(actor,message){
 if(!actor?.isOwner||message.getFlag(scope,'talentReplacement'))return [];
 if((message.getFlag(scope,'combatActions')?.entries??[]).some(e=>!e.undone))return [];
 const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'').replace(/^swffgskillsname/,'');
 const skill=norm(message.getFlag(scope,'combatSkill')??message.rolls?.find(r=>r.hasFFG)?.skillName);
 return sessionRerollRules.filter(r=>r.skills.includes(skill)&&reviewedRank(actor,r.names)>0&&!actor.getFlag?.(scope,'talentSessionUsage')?.[r.id]);
}
export async function rerollWithTalent(message,id){
 const actor=await speakerActor(message);if(!canEdit(message)||!actor?.isOwner)throw Error('Le propriétaire doit relancer ce test.');
 if(rerollLocks.has(actor.uuid))throw Error('Une relance est déjà en cours.');
 rerollLocks.add(actor.uuid);let used=false,replacement;
 try{
  const option=talentRerollOptions(actor,message).find(r=>r.id===id),old=message.rolls?.find(r=>r.hasFFG);
  if(!option||!old)throw Error('Relance indisponible : usage de session, compétence ou dépenses déjà effectuées.');
  const additions={};for(const a of old.addedResults??[]){const field=String(a.type??'').toLowerCase();if(['success','failure','advantage','threat','triumph','despair','light','dark'].includes(field))additions[field]=(additions[field]??0)+Number(a.value)*(a.negative?-1:1);}
  await actor.update({['flags.starwarsffg.talentSessionUsage.'+id]:true});used=true;
  const flags=foundry.utils.deepClone(message.flags?.starwarsffg??{});delete flags.combatActions;delete flags.usedAid;
  flags.talentReroll={id,source:message.uuid};
  const roll=new game.ffg.RollFFG(old.formula,foundry.utils.deepClone(old.data),additions,old.flavor);
  const messageData=await roll.toMessage({speaker:message.speaker,flavor:'Relance de talent - '+(message.flavor??''),flags:{starwarsffg:flags}},{create:false});messageData.whisper=Array.from(message.whisper??[]);messageData.blind=Boolean(message.blind);replacement=await ChatMessage.create(messageData);
  await message.setFlag(scope,'talentReplacement',replacement.uuid);
  return replacement;
 }catch(error){if(used&&!replacement)await actor.update({['flags.starwarsffg.talentSessionUsage.'+id]:false});throw error;}
 finally{rerollLocks.delete(actor.uuid);}
}

export function fineTuningRepair(current,base,rank){
 if(!Number.isFinite(current)||current<0||!Number.isInteger(base)||base<1||!Number.isInteger(rank)||rank<1)throw Error('Réparation invalide.');
 return {base,bonus:rank,removed:Math.min(current,base+rank),after:Math.max(0,current-base-rank)};
}
export function technicalTaskDuration(minutes,rank){
 if(!Number.isFinite(minutes)||minutes<=0||!Number.isInteger(rank)||rank<1)throw Error('Durée ou rang invalide.');
 if(rank>=4)throw Error('Réduction de 100 % ou plus : durée minimale à arbitrer par le MJ, aucun plancher inventé.');
 return minutes*(1-0.25*rank);
}
async function fineTuningDialog(message){
 const actor=await speakerActor(message),rank=reviewedRank(actor,['finetuning','mecaniciendeprecision']);
 if(!actor?.isOwner||!rank||num(result(message)?.success)<1)throw Error('Réparation indisponible.');
 const vehicles=Array.from(game.actors?.contents??[]).filter(a=>a.type==='vehicle'&&a.isOwner&&num(a.system.stats?.systemStrain?.value)>0);
 if(!vehicles.length)throw Error('Aucun véhicule accessible avec du stress mécanique à réparer.');
 const chosen=await foundry.applications.api.DialogV2.prompt({window:{title:'Mécanicien de Précision'},classes:['starwarsffg','themed'],rejectClose:false,content:'<p style="text-align:justify">Confirmez les points normalement réparés par ce test. Le talent ajoute '+rank+' point(s), sans dépasser le stress mécanique restant. Aucun dégât de coque n’est réparé.</p><label>Véhicule<select name="vehicle">'+vehicles.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.name)+'</option>').join('')+'</select></label><label>Points réparés avant talent<input type="number" name="base" min="1" step="1" required></label>',ok:{label:'Réparer',callback:(_e,_b,app)=>({id:field(app.element,'vehicle'),base:Number(field(app.element,'base'))})}});
 if(!chosen)return;
 const vehicle=vehicles.find(v=>v.id===chosen.id);if(!vehicle?.isOwner)throw Error('Véhicule inaccessible.');
 const current=state(message);if(current.entries.some(e=>e.effect==='fine-tuning'&&!e.undone))throw Error('Ce test a déjà réparé un véhicule.');
 const before=num(vehicle.system.stats.systemStrain.value),repair=fineTuningRepair(before,chosen.base,rank);
 const entry={id:foundry.utils.randomID(),kind:'effect',effect:'fine-tuning',label:'Mécanicien de Précision : '+repair.base+' + '+rank+' = '+repair.removed+' stress mécanique réparé(s)',note:vehicle.name,change:{actor:vehicle.uuid,path:'system.stats.systemStrain.value',before,after:repair.after}};
 await vehicle.update({[entry.change.path]:repair.after});
 try{current.entries.push(entry);await message.setFlag(scope,key,current);}catch(error){if(num(vehicle.system.stats.systemStrain.value)===repair.after)await vehicle.update({[entry.change.path]:before});throw error;}
}
async function technicalDurationDialog(message){
 const actor=await speakerActor(message),rank=reviewedRank(actor,['technicalaptitude','geniedelinformatique']);
 if(!actor?.isOwner||!rank)throw Error('Talent indisponible.');
 return foundry.applications.api.DialogV2.prompt({window:{title:'Génie de l’Informatique'},classes:['starwarsffg','themed'],rejectClose:false,content:'<label>Durée normale de la tâche (minutes)<input type="number" name="minutes" min="0.01" step="any" required></label>',ok:{label:'Calculer',callback:async(_e,_b,app)=>{
  const minutes=Number(field(app.element,'minutes')),after=technicalTaskDuration(minutes,rank),current=state(message);
  current.entries.push({id:foundry.utils.randomID(),kind:'effect',effect:'technical-aptitude',label:'Génie de l’Informatique : '+minutes+' min → '+after+' min (-'+rank*25+' %)',note:'Calcul de durée, sans modification de l’horloge de campagne.'});await message.setFlag(scope,key,current);return after;
 }}});
}
export function destinyHitOptions(actor,message){
 const item=weapon(message);if(!actor?.isOwner||!item||item.type!=='weapon'||messageCombatMode(message)==='vehicle'||num(result(message)?.success)<1)return [];
 if(state(message).entries.some(e=>e.kind==='damage'&&!e.undone))return [];
 return [{id:'anatomy-lessons',names:['anatomylessons','leconsdanatomie'],label:'Leçons d’Anatomie',stat:'Intellect'},{id:'targeted-blow',names:['targetedblow','coupcible'],label:'Coup Ciblé',stat:'Agility'}].filter(r=>reviewedRank(actor,r.names)>0&&!state(message).entries.some(e=>e.effect===r.id&&!e.undone));
}
async function destinyHitDialog(message,id){
 const actor=await speakerActor(message),option=destinyHitOptions(actor,message).find(o=>o.id===id);if(!option)throw Error('Talent indisponible pour cette attaque.');
 if(!game.user.isGM)throw Error('Le MJ doit confirmer cette dépense de Destin.');
 const pool=await foundry.applications.api.DialogV2.prompt({window:{title:option.label},classes:['starwarsffg','themed'],rejectClose:false,content:'<p style="text-align:justify">1 point de Destin, dégâts supplémentaires pour une seule touche réussie.</p><label>Réserve<select name="pool"><option value="light">Lumineux</option><option value="dark">Obscur</option></select></label>',ok:{label:'Activer',callback:(_e,_b,app)=>field(app.element,'pool')}});
 if(!pool)return;
 const {reserveTalentDestiny,refundTalentDestiny}=await import('./reviewed-destiny.js'),destiny=await reserveTalentDestiny(pool);
 try{const current=state(message);if(!destinyHitOptions(actor,message).some(o=>o.id===id))throw Error('L’attaque a changé depuis la confirmation.');current.entries.push({id:foundry.utils.randomID(),kind:'destiny-talent',effect:id,label:option.label+' : +'+num(actor.system.characteristics?.[option.stat]?.value)+' dégâts sur une touche',damageBonus:num(actor.system.characteristics?.[option.stat]?.value),destiny});await message.setFlag(scope,key,current);}catch(error){await refundTalentDestiny(destiny);throw error;}
}

export function stimulusChoiceLimit(triumph,hasSupreme){return 1+(hasSupreme?Math.max(0,Math.floor(Number(triumph)||0)):0);}
export async function applyStimulus(message,target,choices,contactConfirmed){
 const actor=await speakerActor(message),trigger=message.getFlag(scope,'triggeredTalent');
 const improved=trigger==='stimapimp';
 if(!canEdit(message)||!actor?.isOwner||!target?.isOwner||!['stimap','stimapimp'].includes(trigger)||num(result(message)?.success)<1||!contactConfirmed)throw Error('Confirmez le bénéficiaire au contact, les droits et la réussite du jet de Dose de Stimulant.');
 const combat=game.combat;if(!combat?.started)throw Error('Un combat actif est nécessaire pour gérer la durée jusqu’à la fin de la rencontre.');
 const current=state(message);if(current.entries.some(e=>e.effect==='stim-application'&&!e.undone))throw Error('Ce test a déjà appliqué Dose de Stimulant.');
 const supreme=reviewedRank(actor,['stimapplicationsupreme','dosedestimulantultime','dosedestimulantsupreme'])>0;
 const left=remainingSymbols(result(message),current.entries),limit=stimulusChoiceLimit(left.triumph,supreme);
 if(!choices.length||new Set(choices).size!==choices.length||choices.length>limit||choices.some(k=>!target.system.characteristics?.[k]))throw Error('Choix de caractéristiques ou budget de Triomphes invalide.');
 const old=target.getFlag(scope,'stimBonuses')??[];
 if(choices.some(k=>old.some(b=>b.encounterId===combat.id&&b.characteristic===k)))throw Error('Une de ces caractéristiques a déjà été augmentée par ce talent pendant cette rencontre.');
 const stat=target.system.stats?.strain?.max>0?{path:'system.stats.strain.value',value:target.system.stats.strain.value}:target.type==='rival'?{path:'system.stats.wounds.value',value:target.system.stats.wounds.value}:null;
 if(!stat)throw Error('Le coût de stress de ce bénéficiaire doit être résolu avec le MJ.');
 const id=foundry.utils.randomID(),cost=improved?1:4,bonuses=choices.map(k=>({id:id+':'+k,source:message.uuid,encounterId:combat.id,characteristic:k}));
 const entry={id,kind:'effect',effect:'stim-application',label:'Dose de Stimulant : '+choices.map(k=>game.i18n.localize('SWFFG.Characteristic'+k)).join(', ')+' +1 jusqu’à la fin de la rencontre',note:target.name,stimBonusIds:bonuses.map(b=>b.id),change:{actor:target.uuid,path:stat.path,before:num(stat.value),after:num(stat.value)+cost},...(choices.length>1?{currency:'triumph',cost:choices.length-1}:{} )};
 await target.update({[stat.path]:entry.change.after,'flags.starwarsffg.stimBonuses':[...old,...bonuses]});
 try{current.entries.push(entry);await message.setFlag(scope,key,current);}catch(error){await target.update({[stat.path]:entry.change.before,'flags.starwarsffg.stimBonuses':old});throw error;}
 return entry;
}
async function stimulusDialog(message){
 const actor=await speakerActor(message),candidates=[...new Map([actor,...(canvas.tokens?.placeables??[]).map(t=>t.actor)].filter(a=>a?.isOwner&&['character','rival','nemesis'].includes(a.type)).map(a=>[a.uuid,a])).values()];
 const choices=['Brawn','Agility','Intellect','Cunning','Willpower','Presence'];
 const selected=await foundry.applications.api.DialogV2.prompt({window:{title:'Dose de Stimulant'},classes:['starwarsffg','themed'],rejectClose:false,content:'<label>Bénéficiaire<select name="actor">'+candidates.map(a=>'<option value="'+esc(a.uuid)+'">'+esc(a.name)+'</option>').join('')+'</select></label><p style="text-align:justify">Confirmez le contact et la disponibilité de médicaments, médipack ou stimpack. Une caractéristique ; avec le talent Ultime, chaque caractéristique supplémentaire coûte un Triomphe réellement disponible.</p><label><input type="checkbox" name="contact">Conditions de contact et matériel remplies</label>'+choices.map(k=>'<label><input type="checkbox" name="trait" value="'+k+'">'+esc(game.i18n.localize('SWFFG.Characteristic'+k))+'</label>').join(''),ok:{label:'Appliquer',callback:(_e,_b,app)=>({actor:field(app.element,'actor'),traits:Array.from(app.element.querySelectorAll('[name=trait]:checked')).map(e=>e.value),contact:app.element.querySelector('[name=contact]').checked})}});
 if(selected)await applyStimulus(message,candidates.find(a=>a.uuid===selected.actor),selected.traits,selected.contact);
}
export function commanderCapacity(presence,improved){return Math.max(0,Number(presence)||0)*(improved?2:1);}
async function commanderDialog(message){
 const actor=await speakerActor(message);if(!actor?.isOwner||message.getFlag(scope,'triggeredTalent')!=='fldcomm'||num(result(message)?.success)<1)throw Error('Action d’Officier Supérieur réussie requise.');
 const improved=reviewedRank(actor,['fieldcommanderimproved','officiersuperieurameliore'])>0,limit=commanderCapacity(actor.system.characteristics?.Presence?.value,improved);
 const tokens=(canvas.tokens?.placeables??[]).filter(t=>t.actor?.isOwner&&['character','rival','nemesis'].includes(t.actor.type));
 const candidates=[...new Map(tokens.filter(t=>t.actor.uuid!==actor.uuid).map(t=>[t.actor.uuid,t.actor])).values()];
 if(!candidates.length)throw Error('Aucun allié accessible sur la scène. Le MJ peut appliquer les effets aux autres personnages.');
 const selected=await foundry.applications.api.DialogV2.prompt({window:{title:'Officier Supérieur'},classes:['starwarsffg','themed'],rejectClose:false,content:'<p style="text-align:justify">Jusqu’à '+limit+' allié(s). Chacun subit 1 stress avant de jouer. Les manœuvres accordées ne comptent pas dans la limite habituelle par tour. L’officier décide de leur ordre. Les actions sont ensuite jouées par les interfaces normales.</p>'+candidates.map((a,i)=>'<label><input type="checkbox" name="ally" value="'+i+'">'+esc(a.name)+(improved?' <input type="checkbox" name="action'+i+'">Action au lieu de manœuvre (1 Triomphe)':'')+'</label>').join(''),ok:{label:'Accorder',callback:(_e,_b,app)=>Array.from(app.element.querySelectorAll('[name=ally]:checked')).map(e=>({actor:candidates[Number(e.value)],action:app.element.querySelector('[name=action'+e.value+']')?.checked===true}))}});
 if(!selected)return;
 const current=state(message),left=remainingSymbols(result(message),current.entries);
 if(current.entries.some(e=>e.effect==='field-commander'&&!e.undone))throw Error('Ce jet a déjà accordé ses effets.');
 if(!selected.length||selected.length>limit||selected.filter(s=>s.action).length>left.triumph)throw Error('Nombre d’alliés ou budget de Triomphes invalide.');
 const applied=[];
 try{
  for(const {actor:target,action}of selected){if(!target?.isOwner)throw Error('Bénéficiaire inaccessible.');const stat=target.system.stats?.strain?.max>0?{path:'system.stats.strain.value',value:target.system.stats.strain.value}:target.type==='rival'?{path:'system.stats.wounds.value',value:target.system.stats.wounds.value}:null;if(!stat)throw Error('Coût du bénéficiaire à résoudre avec le MJ.');const entry={id:foundry.utils.randomID(),kind:'effect',effect:'field-commander',label:'Officier Supérieur : '+(action?'action':'manœuvre hors limite habituelle'),note:target.name,change:{actor:target.uuid,path:stat.path,before:num(stat.value),after:num(stat.value)+1},...(action?{currency:'triumph',cost:1}:{})};await target.update({[stat.path]:entry.change.after});applied.push({target,entry});}
  current.entries.push(...applied.map(x=>x.entry));await message.setFlag(scope,key,current);
 }catch(error){for(const {target,entry}of applied.reverse())if(num(foundry.utils.getProperty(target,entry.change.path))===entry.change.after)await target.update({[entry.change.path]:entry.change.before});throw error;}
}

import {vehicleDamageResource} from './vehicle-minion-group.mjs';
import { chooseTokenTarget, preferredTokenTarget as preferredDamageTarget, watchTokenTarget as watchDamageTarget } from './token-target-picker.js';
export { preferredDamageTarget, watchDamageTarget };
import { damageModeFromSnapshot, weaponQualityName, combatModeForRoll } from "./weapon-selection.js";
import { tonioRulesEnabled, weaponSuccessDamage } from "./custom-rules.js";
// Post-roll helpers. Only message authors/GMs spend results; damage respects Actor ownership.
const scope = 'starwarsffg';
const key = 'combatActions';
const activeQualities = [
  {names:['auto-fire','auto fire','autofire','automatique','tir automatique'],cost:2,note:"SWFFG.UI.Combat.Spending.RequiresIncreasedDifficultyBeforeRollingEachActivationAddsA"},
  {names:['linked','lie','liee'],cost:2,note:"SWFFG.UI.Combat.Spending.OneExtraHitOnTheSameTargetLimitedBy"},
  {names:['blast','souffle','explosion'],cost:2,note:"SWFFG.UI.Combat.Spending.ResolveBlastDamageAgainstEngagedTargetsOnAMiss"},
  {names:['burn','brulure','incendiaire'],cost:2},
  {names:['concussive','choc','concussion'],cost:2},
  {names:['disorient','desorientation'],cost:2},
  {names:['ensnare','immobilisation','entrave'],cost:2},
  {names:['knockdown','renversement'],cost:2,note:"SWFFG.UI.Combat.Spending.AddAdvantageToTheCostPerTargetSilhouetteAbove"},
  {names:['sunder','destruction','fracassage'],cost:1,note:"SWFFG.UI.Combat.Spending.OneStepOfDamagePerActivationChooseAnEligible"},
  {names:['stun','etourdissement'],cost:2},
  {names:['guided','guide','guidage'],cost:3,note:"SWFFG.UI.Combat.Spending.ActivateAfterAMissResolveTheGuidedAttackAt"},
];
const normalized = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+quality(?:\s+\d+)?$/,'');
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
 const names={'smooth-talker':game.i18n.localize("SWFFG.UI.Combat.Talents.SmoothTalker"),'knowledge-specialization':game.i18n.localize("SWFFG.UI.Combat.Talents.KnowledgeSpecialization")};
 const gains=Object.entries(names).map(([id,name])=>({name,added:entries.filter(e=>e.effect===id&&!e.undone).reduce((n,e)=>n+num(e.successGain),0)})).filter(e=>e.added>0);
 if(!gains.length)return '';
 const adjusted=adjustedResult(raw,entries);
 return gains.map(e=>game.i18n.format("SWFFG.UI.Combat.Talents.SuccessGain",{name:e.name,added:e.added})).join(' ')+game.i18n.format("SWFFG.UI.Combat.Talents.SuccessGainTotal",{gain:gains.reduce((n,e)=>n+e.added,0),success:adjusted.success})+(adjusted.failure>0?game.i18n.format("SWFFG.UI.Combat.Talents.RemainingFailure",{failure:adjusted.failure}):'')+'.';
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
    return [{...quality,id:`quality-${index}`,cost:Math.max(1,(blast&&!successful?3:rule.cost)-reduction-(blast&&item?.flags?.starwarsffg?.masterGrenadier?1:0)),preselected:rule.names[0]==='auto-fire',note:rule.note,variable:rule.names[0]==='knockdown'}];
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
    const refresh=()=>{total.textContent=`${game.i18n.localize("SWFFG.UI.Combat.CombatActions.ToApply")}: ${Math.max(0,Math.floor(num(raw.value)-num(reduction.value)))}`;};
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
  if (entry.currency && (!(entry.currency in left) || !Number.isInteger(entry.cost) || entry.cost < 1 || entry.cost > left[entry.currency])) throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.NotEnoughSymbols"));
  entry.id = foundry.utils.randomID();
  current.entries.push(entry);
  await message.setFlag(scope,key,current);
  return entry;
}
const symbolNames = () => ({advantage:game.i18n.localize("SWFFG.UI.Combat.CombatActions.Advantages"),triumph:game.i18n.localize("SWFFG.UI.Combat.CombatActions.Triumphs"),threat:game.i18n.localize("SWFFG.UI.Combat.CombatActions.Threats"),despair:game.i18n.localize("SWFFG.UI.Combat.CombatActions.Despairs")});

// Core rulebook, combat spending tables 6-2 and 6-3. Narrative consequences
// are recorded, not silently translated into permanent Actor modifications.
export function spendingOptions(item, results, {strain = 0, canStrain = false, negative = true, autoFire = false, combatMode = 'personal',smoothTalker=null,knowledgeSpecialization=null,reviewedCombat=null} = {}) {
  if(combatMode==='vehicle')return vehicleSpendingOptions(item,results,{negative,autoFire});
  const options=[];
  if(knowledgeSpecialization?.rank>0)options.push({id:'knowledge-specialization',name:game.i18n.format("SWFFG.UI.Combat.Talents.KnowledgeExchange",{rank:knowledgeSpecialization.rank}),payments:{triumph:1},successPerActivation:knowledgeSpecialization.rank});
  if(reviewedCombat?.success&&reviewedCombat.disorient>0)options.push({id:'talent-disorient',name:game.i18n.format("SWFFG.UI.Combat.Talents.TalentDisorient",{rounds:reviewedCombat.disorient}),payments:{advantage:2},max:1});
  if(reviewedCombat?.success&&reviewedCombat.stunningImproved)options.push({id:'talent-stagger',name:game.i18n.localize("SWFFG.UI.Combat.Talents.ImprovedStunningBlow"),payments:{triumph:1}});
  if(smoothTalker?.rank>0)options.push({id:'smooth-talker',name:game.i18n.format("SWFFG.UI.Combat.CombatActions.SmoothTalkerExchangeTriumphForSuccessEs",{value1:smoothTalker.rank}),payments:{triumph:1},successPerActivation:smoothTalker.rank});
  const add=(id,name,cost,extra={})=>options.push({id,name,payments:cost,...extra});
  const positive=n=>({advantage:n,triumph:1}), bad=n=>({threat:n,despair:1});
  if(canStrain && strain>0) add('strain',game.i18n.localize("SWFFG.UI.Combat.Spending.RecoverStrain"),positive(1),{max:strain});
  add('aid-next',game.i18n.localize("SWFFG.UI.Combat.Spending.GiveTheNextActiveAllyBoost"),positive(1),{aid:'next'});
  add('notice',game.i18n.localize("SWFFG.UI.Combat.Spending.NoticeAnImportantDetail"),positive(1));
  add('aid-chosen',game.i18n.localize("SWFFG.UI.Combat.Spending.GiveAChosenAllyBoostIncludingYourself"),positive(2),{aid:'chosen'});
  add('maneuver',game.i18n.localize("SWFFG.UI.Combat.Spending.PerformAnImmediateFreeManeuverWithinTheLimitOf"),positive(2),{max:1});
  add('setback',game.i18n.localize("SWFFG.UI.Combat.Spending.AddSetbackToTheTargetSNextCheck"),positive(2),{target:true});
  add('defense',game.i18n.localize("SWFFG.UI.Combat.Spending.NegateTheTargetSDefensiveBonusesUntilTheRound"),positive(3),{target:true,max:1});
  add('environment',game.i18n.localize("SWFFG.UI.Combat.Spending.IgnoreEnvironmentalPenaltiesUntilYourNextTurnEnds"),positive(3),{max:1});
  add('gain-defense',game.i18n.localize("SWFFG.UI.Combat.Spending.GainMeleeOrRangedDefenseUntilYourNextTurn"),positive(3));
  add('drop',game.i18n.localize("SWFFG.UI.Combat.Spending.MakeTheTargetDropAWeapon"),positive(3),{target:true});
  add('difficulty',game.i18n.localize("SWFFG.UI.Combat.Spending.UpgradeTheDifficultyOfTheTargetSNextCheck"),{triumph:1},{target:true});
  add('upgrade',game.i18n.localize("SWFFG.UI.Combat.Spending.UpgradeAnAllySNextCheckIncludingYourself"),{triumph:1},{target:true});
  add('vital',game.i18n.localize("SWFFG.UI.Combat.Spending.DoSomethingVital"),{triumph:1});
  if(item && num(results?.success)>0) {
    const condition=game.i18n.localize("SWFFG.UI.Combat.CombatActions.TheTargetTakesDamagePastSoak");
    const crit=num(item.system?.crit?.adjusted ?? item.system?.crit?.value);
    if(crit>0) add('critical',game.i18n.localize("SWFFG.UI.Combat.Spending.CriticalInjuryPerExtraActivationOnTheSameHit"),positive(crit),{target:true,condition});
    add('disable',game.i18n.localize("SWFFG.UI.Combat.Spending.TemporarilyDisableTheTargetOrItsGearInsteadOf"),positive(3),{target:true,max:1,condition:game.i18n.localize("SWFFG.UI.Combat.CombatActions.TheAttackWouldDealDamageTheGMAgrees")});
    add('destroy',game.i18n.localize("SWFFG.UI.Combat.Spending.DestroyAPieceOfTheTargetSEquipmentIn"),{triumph:2},{target:true,condition});
  }
  for(const q of weaponEffects(item,num(results?.success)>0,autoFire)) add(q.id,game.i18n.format("SWFFG.UI.Combat.Spending.Activate",{value1:weaponQualityName(q.name,game.i18n.lang),value2:q.rank||''}),positive(q.cost),{
    target:true,variable:q.variable,max:normalized(q.name)==='linked'||['lie','liee'].includes(normalized(q.name))?q.rank:undefined,
    condition:q.preselected?undefined:q.note?game.i18n.localize(q.note):game.i18n.localize("SWFFG.UI.Combat.CombatActions.TheConditionsForThisQualityAreSatisfied")});
  if(negative) {
    if(canStrain) add('suffer-strain',game.i18n.localize("SWFFG.UI.Combat.Spending.SufferStrain"),bad(1));
    add('lose-maneuver',game.i18n.localize("SWFFG.UI.Combat.Spending.LoseAManeuverSBenefitUntilItIsPerformed"),bad(1));
    add('enemy-maneuver',game.i18n.localize("SWFFG.UI.Combat.Spending.GrantAnOpponentAnImmediateFreeManeuver"),bad(2),{target:true});
    add('enemy-boost',game.i18n.localize("SWFFG.UI.Combat.Spending.AddBoostToTheTargetedCharacterSNextCheck"),bad(2),{target:true});
    add('ally-setback',game.i18n.localize("SWFFG.UI.Combat.Spending.AddSetbackToYourOrAnAllySNext"),bad(2),{target:true});
    add('prone',game.i18n.localize("SWFFG.UI.Combat.Spending.FallProne"),bad(3),{max:1});
    add('enemy-edge',game.i18n.localize("SWFFG.UI.Combat.Spending.GiveTheEnemyASignificantAdvantage"),bad(3));
    add('ally-difficulty',game.i18n.localize("SWFFG.UI.Combat.Spending.UpgradeYourOrAnAllySNextCheckDifficulty"),{despair:1},{target:true});
    if(item) {
      if(!reviewedCombat?.spareClip||qualities(item).some(q=>['limitedammo','munitionslimitees'].includes(normalized(q.name).replace(/[^a-z]/g,''))))add('ammo',game.i18n.localize("SWFFG.UI.Combat.Spending.RunOutOfAmmunitionForThisEncounter"),{despair:1},{max:1,condition:game.i18n.localize("SWFFG.UI.Combat.CombatActions.ThisIsARangedWeaponUsingAmmunition")});
      add('damage-gear',game.i18n.localize("SWFFG.UI.Combat.Spending.DamageTheMeleeWeaponOrToolBeingUsed"),{despair:1},{condition:game.i18n.localize("SWFFG.UI.Combat.CombatActions.TheItemBeingUsedIsAToolOr")});
    }
  }
  return options;
}


// Core rulebook tables 7-5 and 7-6, transcribed from the supplied French tables.
// Vehicle effects are recorded for the GM; do not apply system strain to the pilot.
export function vehicleSpendingOptions(item, results, {negative=true,autoFire=false}={}) {
  const options=[],positive=n=>({advantage:n,triumph:1}),bad=n=>({threat:n,despair:1});
  const add=(id,name,payments,extra={})=>options.push({id,name,payments,...extra});
  const skills=game.i18n.localize("SWFFG.UI.Combat.Spending.PilotingGunneryComputersOrMechanics");
  add('vehicle-aid-next',game.i18n.format("SWFFG.UI.Combat.Spending.GiveTheNextActiveAllyBoostCheck",{value1:skills}),positive(1));
  add('vehicle-notice',game.i18n.localize("SWFFG.UI.Combat.Spending.NoticeAnImportantDetailInTheBattle"),positive(1));
  add('vehicle-maneuver',game.i18n.localize("SWFFG.UI.Combat.Spending.PerformAnImmediateFreeManeuverIfYouHaveNot"),positive(2),{max:1});
  add('vehicle-setback',game.i18n.localize("SWFFG.UI.Combat.Spending.AddSetbackToTheTargetedCharacterSNextCheck"),positive(2));
  add('vehicle-aid-chosen',game.i18n.format("SWFFG.UI.Combat.Spending.GiveAnAllyIncludingYourselfBoostNextCheck",{value1:skills}),positive(2));
  add('vehicle-environment',game.i18n.localize("SWFFG.UI.Combat.Spending.IgnoreTerrainOrCelestialPhenomenaPenaltiesUntilTheEnd"),positive(3),{max:1});
  add('vehicle-pilot-maneuver',game.i18n.localize("SWFFG.UI.Combat.Spending.PerformAFreePilotManeuverAtTheControlsWithin"),positive(3),{max:1});
  add('vehicle-change-course',game.i18n.localize("SWFFG.UI.Combat.Spending.ForceACourseChangeCancelingAimAndStayOn"),positive(3));
  add('vehicle-enemy-difficulty',game.i18n.localize("SWFFG.UI.Combat.Spending.UpgradeTheDifficultyOfTheTargetedCharacterSNext"),{triumph:1});
  add('vehicle-ally-upgrade',game.i18n.format("SWFFG.UI.Combat.Spending.UpgradeAnAllySNextCheck",{value1:skills}),{triumph:1});
  add('vehicle-vital',game.i18n.localize("SWFFG.UI.Combat.Spending.DoSomethingVitalThatTurnsTheTideOfBattle"),{triumph:1});
  if(item && num(results?.success)>0) {
    const crit=num(item.system?.crit?.adjusted??item.system?.crit?.value);
    if(crit>0)add('critical',game.i18n.localize("SWFFG.UI.Combat.Spending.VehicleCriticalHitPerExtraActivationOnTheSame"),positive(crit),{condition:game.i18n.localize("SWFFG.UI.Combat.CombatActions.TheAttackPenetratedTheTargetSArmor")});
    add('vehicle-disable-component',game.i18n.localize("SWFFG.UI.Combat.Spending.TemporarilyDamageAChosenComponentInsteadOfDamageOr"),positive(3),{condition:game.i18n.localize("SWFFG.UI.Combat.CombatActions.SuccessfulAttackReplaceDamageOrSystemStrainWith"),max:1});
    add('vehicle-destroy-component',game.i18n.localize("SWFFG.UI.Combat.Spending.DestroyAnImportantComponentInsteadOfDamageOrSystem"),{triumph:2},{condition:game.i18n.localize("SWFFG.UI.Combat.CombatActions.SuccessfulAttackChooseTheComponentWithTheGM"),max:1});
  }
  if(negative) {
    add('vehicle-reduce-speed',game.i18n.localize("SWFFG.UI.Combat.Spending.ReduceSpeedByDueToUnexpectedManeuvers"),bad(1));
    add('vehicle-lose-maneuver',game.i18n.localize("SWFFG.UI.Combat.Spending.LoseAManeuverSBenefitsEvasiveManeuversAimUntil"),bad(1));
    add('vehicle-system-strain',game.i18n.localize("SWFFG.UI.Combat.Spending.InflictSystemStrainOnTheVehicleRepeatable"),bad(1));
    add('vehicle-enemy-maneuver',game.i18n.localize("SWFFG.UI.Combat.Spending.GrantAnOpponentAnImmediateFreeManeuverInResponse"),bad(2));
    add('vehicle-enemy-boost',game.i18n.localize("SWFFG.UI.Combat.Spending.AddBoostToTheTargetedCharacterSNextPiloting"),bad(2));
    add('vehicle-ally-setback',game.i18n.localize("SWFFG.UI.Combat.Spending.AddSetbackToYourOrAnAllySNext"),bad(2));
    add('vehicle-last-slot',game.i18n.localize("SWFFG.UI.Combat.Spending.MoveThePlayerSInitiativeSlotToLastIn"),bad(3),{max:1});
    add('vehicle-enemy-edge',game.i18n.localize("SWFFG.UI.Combat.Spending.GiveTheEnemyAMajorAdvantageUntilTheStart"),bad(3));
    add('vehicle-weapon-damaged',game.i18n.localize("SWFFG.UI.Combat.Spending.DamageTheMainArmamentOrWeaponUsedComponentCritical"),{despair:1});
    add('vehicle-ally-difficulty',game.i18n.format("SWFFG.UI.Combat.Spending.UpgradeTheDifficultyOfYourOrAnAllyS",{value1:skills}),{despair:1});
    add('vehicle-minor-collision',game.i18n.localize("SWFFG.UI.Combat.Spending.SufferAMinorCollisionWithACloseRangeOpponent"),{despair:1});
    if(num(results?.success)<=0)add('vehicle-major-collision',game.i18n.localize("SWFFG.UI.Combat.Spending.SufferAMajorCollisionWithACloseRangeOpponent"),{despair:1});
  }
  options.push(...spendingOptions(item,results,{negative:false,autoFire,combatMode:'personal'}).filter(o=>o.id.startsWith('quality-')));
  return options;
}

export function validateSpending(results, entries, options, selections) {
  const left=remainingSymbols(results,entries), counts={};
  if(!selections.length) throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.SelectAtLeastOneEffect"));
  return selections.map(selection=>{
    const option=options.find(o=>o.id===selection.effect),quantity=Number(selection.quantity);
    if(!option || !Number.isInteger(quantity)||quantity<1 || !option.payments[selection.currency]) throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.InvalidSelection"));
    const unit=option.variable && selection.currency==='advantage'?Number(selection.unit):option.payments[selection.currency];
    if(!Number.isInteger(unit)||unit<option.payments[selection.currency]) throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.InvalidCost"));
    counts[option.id]=(counts[option.id]??0)+quantity;
    if(counts[option.id]>(option.max??Infinity)) throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.MaximumActivationsExceeded"));
    if(option.condition&&!selection.confirmed) throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.ConfirmTheSelectedEffectSConditions"));
    const cost=unit*quantity;left[selection.currency]-=cost;
    if(left[selection.currency]<0) throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.NotEnoughSymbols"));
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
    const name=({boost:game.i18n.localize("SWFFG.UI.Combat.CombatActions.Boost"),setback:game.i18n.localize("SWFFG.UI.Combat.CombatActions.Setback")})[key]??symbolNames()[key];
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
    ${vehicleMode?`<p><strong>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.SpaceVehicleCombat")}</strong></p>`:''}
    <p><strong>${weapon(message)?`${game.i18n.localize("SWFFG.UI.Combat.CombatActions.Weapon")} : ${esc(weapon(message).name)}`:game.i18n.localize("SWFFG.UI.Combat.CombatActions.NoWeaponAssociatedWithThisRollCriticalsAnd")}</strong></p>
    ${qualities(weapon(message)).some(q=>['stun setting','reglage etourdissant'].includes(normalized(q.name)))?`<p>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.StunSettingChooseBeforeFiringWithoutSpendingAdvantages")}</p>`:''}
    <p>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.ChooseSeveralEffectsAndTheirActivationCountsChoose")}</p>
    <div class="budget" role="status"></div><div class="effects">${options.map(o=>`<section class="effect" data-effect="${o.id}" data-cost-color="${spendingColor(o)}"><strong>${effectName(o.name)}</strong><div><small>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.Cost")} : ${Object.entries(o.payments).map(([c,n])=>symbols(c,n)).join(game.i18n.localize("SWFFG.UI.Combat.CombatActions.Or"))} ${game.i18n.localize("SWFFG.UI.Combat.CombatActions.PerActivation")}${o.id==='strain'?game.i18n.localize("SWFFG.UI.Combat.CombatActions.StrainRepeatable"):''}</small></div>
    <div class="payments">${Object.entries(o.payments).map(([c,n])=>`<label>${symbols(c,n)} <input aria-label="${esc(o.name)} - ${symbolNames()[c]}" type="number" min="0" step="1" value="0" data-currency="${c}"></label>`).join('')}</div>
    ${o.variable?`<label>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.AdvantagesPerActivationTargetSilhouette")}<input name="unit" type="number" min="${o.payments.advantage}" step="1" value="${o.payments.advantage}"></label>`:''}
    ${o.condition?`<label class="condition"><input type="checkbox" name="confirmed"> ${esc(o.condition)}</label>`:''}
    </section>`).join('')}</div>
    <p><em>${vehicleMode?game.i18n.localize("SWFFG.UI.Combat.CombatActions.EffectsRecordedInChatApplyManuallyToThe"):game.i18n.localize("SWFFG.UI.Combat.CombatActions.StrainAppliedToTheSheetDiceBonusesApply")}</em></p>
    <p class="error" role="alert"></p><button type="button" class="apply">${game.i18n.localize("SWFFG.UI.Combat.CombatActions.ApplySelection")}</button>`;
  const read=()=>[...body.querySelectorAll('[data-currency]')].filter(input=>Number(input.value)!==0).map(input=>{
    const row=input.closest('[data-effect]');return {effect:row.dataset.effect,currency:input.dataset.currency,quantity:Number(input.value),unit:field(row,'unit'),target:field(row,'target')??'',recipient:field(row,'recipient'),confirmed:row.querySelector('[name=confirmed]')?.checked};
  });
  let button=body.querySelector('.apply'),error=body.querySelector('.error'),busy=false;
  const refresh=()=>{
    const selections=read(),left={...available};
    for(const s of selections) {const o=options.find(o=>o.id===s.effect);left[s.currency]-=s.quantity*(o.variable&&s.currency==='advantage'?num(s.unit):o.payments[s.currency]);}
    body.querySelector('.budget').innerHTML=`${game.i18n.localize("SWFFG.UI.Combat.CombatActions.Remaining")} : `+Object.entries(left).filter(([c])=>available[c]>0).map(([c,n])=>symbols(c,n)).join(' · ');
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
  const app=new foundry.applications.api.DialogV2({window:{title:game.i18n.localize("SWFFG.UI.Combat.CombatActions.SpendAdvantagesThreats")},classes:['starwarsffg','themed'],position:{width:740},content,buttons:[{action:'close',label:game.i18n.localize("SWFFG.UI.Combat.CombatActions.Close")}],rejectClose:false});
  await app.render({force:true});
  // DialogV2 serializes supplied HTML; bind to the rendered nodes, not the source.
  body=app.element.querySelector('.ffg-spending');button=body.querySelector('.apply');error=body.querySelector('.error');
  const trigger=message.getFlag(scope,'triggeredTalent'),special=[];
  if(['stimap','stimapimp'].includes(trigger)&&result(message)?.success>0&&available.triumph>0&&reviewedRank(actor,['stimapplicationsupreme','dosedestimulantultime','dosedestimulantsupreme'])>0)special.push({name:game.i18n.localize("SWFFG.UI.Combat.Talents.SupremeStimSelection"),action:()=>stimulusDialog(message)});
  if(trigger==='fldcomm'&&result(message)?.success>0&&available.triumph>0&&reviewedRank(actor,['fieldcommanderimproved','officiersuperieurameliore'])>0)special.push({name:game.i18n.localize("SWFFG.UI.Combat.Talents.ImprovedCommanderSelection"),action:()=>commanderDialog(message)});
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
  if(entries.some(a=>!valid.has(a.id)||current.used.includes(a.id))) throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.ThisAssistanceChangedOrWasAlreadyUsedReopen"));
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
  return chooseTokenTarget(tokens,{requested,title:game.i18n.localize("SWFFG.UI.Combat.CombatActions.ChooseTarget"),confirmLabel:game.i18n.localize("SWFFG.UI.Combat.CombatActions.Calculate")});
}

async function damageDialog(message) {
  const item=weapon(message);if(!item || num(result(message)?.success)<=0) return;
  const tokens=(canvas.tokens?.placeables ?? []).filter(token=>token.actor && (game.user.isGM || (token.visible && !token.document.hidden)));
  if(!tokens.length) throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.NoTokensOnThisScene"));
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
  const pressure=pressurePointApplies(item,actor);const soak=pressure?0:vehicle?actor.system.stats?.armour?.value:actor.system.stats?.soak?.value;
  const computed=calculateDamage({base:weaponHitDamage(item,state(message).entries),successes:result(message).success,soak,
    pierce:qualityRank(item,['pierce','perforant']),breach:qualityRank(item,['breach','breche']),vehicle,scale,tonioRules:tonioRulesEnabled()});
  if(request?.target===choose) {computed.raw=request.raw;computed.reduction=request.reduction;}
  const damageMode=damageModeFromSnapshot(message.getFlag(scope,'shot'),item);
  const talentStun=pressure||message.getFlag(scope,'rollTalents')?.some(t=>t.id==='stunning-blow');
  const damageType=talentStun?'strain':request?.target===choose?request.type:damageMode.damageType;
  const prior=state(message).entries.filter(e=>e.kind==='damage'&&!e.undone&&e.change?.actor===actor.uuid);
  await dialog(game.i18n.localize("SWFFG.UI.Combat.CombatActions.ApplyDamage"),`<p><strong>${esc(token.name)}</strong></p>
    ${prior.length?`<p><strong>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.WarningThisRollAlreadyAppliedDamageToThis")}</strong></p>`:''}
    <p>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.CheckWeaponQualitiesAndSpecialCasesValuesRemain")}${scale!==1?` ${game.i18n.localize("SWFFG.UI.Combat.CombatActions.ScaleConversion")} ×${scale}.`:''}</p>
    <label>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.RawDamage")}<input type="number" name="raw" min="0" value="${computed.raw}"></label>
    <label>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.EffectiveReductionSoakArmour")}<input type="number" name="reduction" min="0" value="${computed.reduction}"></label>
    ${damageMode.requiresConfirmation?`<p>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.OlderRollStunModeWasNotSavedChoose")}</p>`:''}
    <label>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.Type")}<select name="type"><option value="" ${!damageType?'selected':''} disabled>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.ChooseTheActualFiringMode")}</option><option value="wounds" ${damageType==='wounds'?'selected':''}>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.WoundsHullTrauma")}</option><option value="strain" ${damageType==='strain'?'selected':''}>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.StrainSystemStrain")}</option></select></label>
    <p>${game.i18n.localize("SWFFG.UI.Combat.CombatActions.ShieldsAreNotSoakMinionsAndRivalsSuffer")}</p>`,actor.isOwner?game.i18n.localize("SWFFG.UI.Combat.CombatActions.Apply"):game.i18n.localize("SWFFG.UI.Combat.CombatActions.RequestGM"),async root=>{
      if(!['wounds','strain'].includes(field(root,'type')))throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.ChooseTheShotDamageType"));
      const raw=num(field(root,'raw')),reduction=num(field(root,'reduction'));if(raw<0||reduction<0) throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.InvalidValues"));
      if(!actor.isOwner) {const s=state(message);s.request={target:choose,raw,reduction,type:field(root,'type')};await message.setFlag(scope,key,s);return;}
      const strain=talentStun||field(root,'type')==='strain';
      const stat=vehicle?vehicleDamageResource(actor,strain?'systemStrain':'hullTrauma'):(strain&&actor.system.stats?.strain&&!['minion','rival'].includes(actor.type)?'strain':'wounds');
      if(!actor.system.stats?.[stat]) throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.TargetLacksThisStatistic"));
      const path=`system.stats.${stat}.value`,before=num(actor.system.stats[stat].value),amount=Math.max(0,Math.floor(raw-reduction));
      const change={actor:actor.uuid,path,before,after:before+amount};
      const statName=vehicle?(stat==='systemStrain'?game.i18n.localize("SWFFG.UI.Combat.CombatActions.SystemStrain"):game.i18n.localize("SWFFG.UI.Combat.CombatActions.HullTrauma")):(stat==='strain'?game.i18n.localize("SWFFG.UI.Combat.CombatActions.Strain"):game.i18n.localize("SWFFG.UI.Combat.CombatActions.Wounds"));
      const entry=await saveEntry(message,{kind:'damage',label:`${token.name}: +${amount} ${statName}`,change});
      try {await actor.update({[path]:change.after});} catch(error){await markUndone(message,entry.id);throw error;}
      const s=state(message);delete s.request;await message.setFlag(scope,key,s);
    });
}
async function markUndone(message,id) {const current=state(message);const entry=current.entries.find(e=>e.id===id);if(entry) entry.undone=true;await message.setFlag(scope,key,current);}
async function undo(message,id) {
  const entry=state(message).entries.find(e=>e.id===id);if(!entry||entry.undone) return;
  if(entry.effect==='encounter-recovery'){const target=await fromUuid(entry.change.actor);if(!target?.isOwner||num(target.system.stats.strain.value)!==entry.change.after||target.getFlag(scope,'lastRecoveredEncounter')!==entry.encounter)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.RecoveryChanged"));await target.update({[entry.change.path]:entry.change.before,'flags.starwarsffg.lastRecoveredEncounter':entry.previous});await markUndone(message,id);return;}
  if(entry.effect==='rhetoric'){for(const change of entry.changes){const target=await fromUuid(change.actor);if(!target?.isOwner||num(foundry.utils.getProperty(target,change.path))!==change.after)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.RecipientChangedUndoBlocked"));}for(const change of entry.changes){const target=await fromUuid(change.actor);await target.update({[change.path]:change.before,'flags.starwarsffg.timedTalentModifiers':(target.getFlag(scope,'timedTalentModifiers')??[]).filter(e=>e.id!==entry.id)});}await markUndone(message,id);return;}
  if(entry.effect==='full-throttle'){const vehicle=await fromUuid(entry.vehicle);if(!vehicle?.isOwner||vehicle.getFlag(scope,'fullThrottle')?.source!==message.uuid)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.VehicleEffectChanged"));await vehicle.update({'flags.starwarsffg.fullThrottle':entry.previous??null});await markUndone(message,id);return;}
  if(entry.effect==='stim-application'){const target=await fromUuid(entry.change.actor);if(!target?.isOwner||num(foundry.utils.getProperty(target,entry.change.path))!==entry.change.after)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.RecipientChangedConsultGM"));await target.update({[entry.change.path]:entry.change.before,'flags.starwarsffg.stimBonuses':(target.getFlag(scope,'stimBonuses')??[]).filter(b=>!entry.stimBonusIds.includes(b.id))});await markUndone(message,id);return;}
  if(entry.kind==='destiny-talent'){if(state(message).entries.some(e=>e.kind==='damage'&&!e.undone))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.UndoDamageFirst"));const {refundTalentDestiny}=await import('./reviewed-destiny.js');await refundTalentDestiny(entry.destiny);await markUndone(message,id);return;}
  if(entry.kind==='astrogation'){const {undoAstrogationEntry}=await import('./astrogation-spending.js');return undoAstrogationEntry(message,entry);}
  if(entry.effect==='critical') {
    const {undoCritical}=await import('./critical-actions.js');
    await undoCritical(message,entry);return;
  }
  if(entry.kind==='aid') {
    const user=game.users.get(entry.recipient),aid=user?.getFlag(scope,'rollAid');
    if(aid?.pending?.some(a=>a.id===`${message.id}:${id}`)||aid?.used?.includes(`${message.id}:${id}`)) throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.ThisAssistanceWasAlreadyAccepted"));
  }
  if(entry.change) {
    const actor=await fromUuid(entry.change.actor);
    if(!actor?.isOwner) throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.OnlyTheOwnerOrGMCanUndo"));
    if(num(foundry.utils.getProperty(actor,entry.change.path))!==entry.change.after) throw Error(game.i18n.localize("SWFFG.UI.Combat.CombatActions.TheValueChangedSinceThisActionAdjustThe"));
    await actor.update({[entry.change.path]:entry.change.before});
  }
  await markUndone(message,id);
}
export function renderCombatActions(message,element) {
  if(!message.isContentVisible || !result(message)) return;
  if(message.getFlag(scope,'talentReplacement')){const root=element instanceof HTMLElement?element:element?.[0];if(root&&!root.querySelector('.ffg-talent-replaced')){const p=document.createElement('p');p.className='ffg-talent-replaced';p.textContent=game.i18n.localize("SWFFG.UI.Combat.Talents.RollReplaced");root.append(p);}return;}
  const root=element instanceof HTMLElement?element:element?.[0];if(!root||root.querySelector('.ffg-combat-actions')) return;
  const s=state(message),left=remainingSymbols(result(message),s.entries),editable=canEdit(message);
  const box=document.createElement('section');box.className='ffg-combat-actions';box.style.cssText='border-top:1px solid currentColor;padding-top:6px;margin-top:6px';
  const conversion=successConversionSummary(rawResult(message),s.entries);
  if(conversion){const p=document.createElement('p');p.className='ffg-talent-success-summary';p.textContent=conversion;box.append(p);}
  const shot=message.getFlag(scope,'shot');
  if(shot?.damageType){const note=document.createElement('p');note.className='ffg-shot-status';note.textContent=shot.damageType==='strain'?game.i18n.localize("SWFFG.UI.Combat.CombatActions.StunShotStrainDamageSoakApplies"):game.i18n.localize("SWFFG.UI.Combat.CombatActions.NormalShotWounds");box.append(note);}
  const talents=message.getFlag(scope,'rollTalents')??[];
  if(talents.length) {
    const note=document.createElement('p');
    note.innerHTML='<strong>'+esc(game.i18n.localize("SWFFG.UI.Combat.CombatActions.ActivatedTalents"))+'</strong> '+talents.map(talent=>esc(talent.name)+(talent.cost?' <em>('+esc(talent.cost)+' '+esc(game.i18n.localize("SWFFG.UI.Combat.CombatActions.Strain"))+')</em>':'')).join(' · ');
    box.append(note);
  }
  if(messageCombatMode(message)==='vehicle'){const context=document.createElement('p');context.textContent=game.i18n.localize("SWFFG.UI.Combat.CombatActions.SpaceVehicleCombat");context.style.cssText='font-weight:bold;font-size:12px';box.append(context);}
  if(message.getFlag(scope,'autoFire')===true && !root.querySelector('.ffg-auto-fire-status')) {
    const status=document.createElement('p');status.className='ffg-auto-fire-status';
    status.textContent=game.i18n.localize("SWFFG.UI.Combat.CombatActions.AutoFireEnabled");
    status.title=game.i18n.localize("SWFFG.UI.Combat.CombatActions.SelectedBeforeRollingDifficultyDie");
    status.style.cssText='display:block;margin:6px 0;padding:4px 7px;border-left:3px solid #236b68;border-radius:3px;background:#e1f3f0;color:#236b68;font-size:12px;font-weight:bold;line-height:1.4';
    box.append(status);
  }
  const addButton=(label,callback)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='height:auto;white-space:normal;margin:2px 0';b.addEventListener('click',async event=>{event.preventDefault();b.disabled=true;try{await callback();}catch(error){ui.notifications.error(error.message);}finally{b.disabled=false;}});box.append(b);};
  if(editable) {
    const actor=game.actors?.get(message.speaker?.actor);
    if(result(message)?.success>0&&['insprhet','insprhetsup','scath','scathsup'].includes(message.getFlag(scope,'triggeredTalent')))addButton(game.i18n.localize("SWFFG.UI.Combat.Talents.ApplyTalent"),()=>edit(message,()=>rhetoricDialog(message)));
    if(result(message)?.success>0&&['fullth','fullthimp'].includes(message.getFlag(scope,'triggeredTalent')))addButton(game.i18n.localize("SWFFG.UI.Combat.Talents.ApplyFullThrottle"),()=>edit(message,()=>fullThrottleDialog(message)));
    if(result(message)?.success>0&&['stimap','stimapimp'].includes(message.getFlag(scope,'triggeredTalent')))addButton(game.i18n.localize("SWFFG.UI.Combat.Talents.ApplyStim"),()=>edit(message,()=>stimulusDialog(message)));
    if(result(message)?.success>0&&message.getFlag(scope,'triggeredTalent')==='fldcomm')addButton(game.i18n.localize("SWFFG.UI.Combat.Talents.ApplyCommander"),()=>edit(message,()=>commanderDialog(message)));
    const skill=String(message.getFlag(scope,'combatSkill')??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
    if(['mechanics','mecanique','swffgskillsnamemechanics'].includes(skill)&&result(message)?.success>0&&reviewedRank(actor,['finetuning','mecaniciendeprecision'])>0)addButton(game.i18n.localize("SWFFG.UI.Combat.Talents.FineTuningButton"),()=>edit(message,()=>fineTuningDialog(message)));
    if(['cool','discipline','calme','sangfroid'].includes(skill)&&actor?.getFlag?.(scope,'lastCompletedEncounter')&&(reviewedRank(actor,['rapidrecovery','recuperationrapide'])>0||message.getFlag(scope,'rollTalents')?.some(t=>t.id==='balance')))addButton(game.i18n.localize("SWFFG.UI.Combat.Talents.RecoverEncounter"),()=>edit(message,()=>encounterRecoveryDialog(message)));
    if(halvedTaskTalents(message).length)addButton(game.i18n.localize("SWFFG.UI.Combat.Talents.CalculateTask"),()=>edit(message,()=>halvedTaskDialog(message)));
    if(['negotiation','negociation'].includes(skill)&&result(message)?.success>0&&reviewedRank(actor,['wheelanddeal','sensdesaffaires'])>0)addButton(game.i18n.localize("SWFFG.UI.Combat.Talents.CalculateSale"),()=>edit(message,()=>wheelDealDialog(message)));
    if(['mechanics','mecanique','swffgskillsnamemechanics'].includes(skill)&&result(message)?.success>0&&reviewedRank(actor,['solidrepairs','reparationssolides'])>0)addButton(game.i18n.localize("SWFFG.UI.Combat.Talents.SolidRepairsButton"),()=>edit(message,()=>fineTuningDialog(message,true)));
    if(['computers','informatique','swffgskillsnamecomputers'].includes(skill)&&reviewedRank(actor,['technicalaptitude','geniedelinformatique'])>0)addButton(game.i18n.localize("SWFFG.UI.Combat.Talents.TechnicalAptitudeButton"),()=>edit(message,()=>technicalDurationDialog(message)));
    for(const option of destinyHitOptions(actor,message))addButton(game.i18n.format("SWFFG.UI.Combat.Talents.UseTalent",{talent:option.label}),()=>edit(message,()=>destinyHitDialog(message,option.id)));
    for(const option of talentRerollOptions(actor,message)){const names={'natural-enforcer':game.i18n.localize("SWFFG.UI.Combat.Talents.NaturalEnforcer"),'natural-doctor':game.i18n.localize("SWFFG.UI.Combat.Talents.NaturalDoctor"),'natural-negotiator':game.i18n.localize("SWFFG.UI.Combat.Talents.NaturalNegotiator"),'natural-driver':game.i18n.localize("SWFFG.UI.Combat.Talents.NaturalDriver"),'natural-pilot':game.i18n.localize("SWFFG.UI.Combat.Talents.NaturalPilot"),'natural-leader':game.i18n.localize("SWFFG.UI.Combat.Talents.NaturalLeader"),'natural-programmer':game.i18n.localize("SWFFG.UI.Combat.Talents.NaturalProgrammer"),'natural-marksman':game.i18n.localize("SWFFG.UI.Combat.Talents.NaturalMarksman"),'natural-rogue':game.i18n.localize("SWFFG.UI.Combat.Talents.NaturalRogue")};addButton(game.i18n.format("SWFFG.UI.Combat.Talents.RerollTalent",{talent:names[option.id]}),()=>rerollWithTalent(message,option.id));}
    const count=document.createElement('p');count.textContent=`${game.i18n.localize("SWFFG.UI.Combat.CombatActions.Remaining")}: `+(Object.entries(left).filter(([,n])=>n>0).map(([c,n])=>`${n} ${symbolNames()[c]}`).join(' · ')||'0');box.append(count);
    if(left.advantage>0||left.triumph>0||(game.user.isGM&&(left.threat>0||left.despair>0))) addButton(game.i18n.localize("SWFFG.UI.Combat.CombatActions.SpendAdvantagesThreats"),()=>spendDialog(message));
    if(weapon(message)&&num(result(message).success)>0) addButton(s.request?game.i18n.localize("SWFFG.UI.Combat.CombatActions.DamageRequestReview"):game.i18n.localize("SWFFG.UI.Combat.CombatActions.ApplyDamage_d4840e"),()=>edit(message,()=>damageDialog(message)));
  }
  const criticalGroups=new Set();
  for(const entry of s.entries.filter(e=>!e.undone)) {
    const line=document.createElement('p');line.textContent=`${entry.label}${entry.note?` - ${entry.note}`:''}${entry.cost?` (${entry.cost} ${symbolNames()[entry.currency] ?? entry.currency})`:''}`;box.append(line);
    if(entry.kind==='aid'&&entry.recipient===game.user.id) addButton(game.i18n.localize("SWFFG.UI.Combat.CombatActions.AcceptForMyNextRoll"),()=>acceptAid(message,entry));
    if(entry.effect==='critical') {
      const group=entry.batch??entry.id;
      if(criticalGroups.has(group))continue;
      criticalGroups.add(group);
      const resolution=entry.criticalResolution;
      if(resolution?.summary) {const summary=document.createElement('p');summary.textContent=resolution.summary;box.append(summary);}
      if(editable&&resolution?.status!=='applied') {
        const ids=s.entries.filter(candidate=>candidate.effect==='critical'&&!candidate.undone&&(entry.batch?candidate.batch===entry.batch:candidate.id===entry.id)).map(candidate=>candidate.id);
        addButton(resolution?.status==='requested'?game.i18n.localize("SWFFG.UI.Combat.CombatActions.CriticalRequestReview"):game.i18n.localize("SWFFG.UI.Combat.CombatActions.ResolveCritical"),()=>edit(message,async()=>{
          const {resolveCritical}=await import('./critical-actions.js');await resolveCritical(message,ids);
        }));
      }
    }
    if(editable) addButton(entry.effect==='critical'?game.i18n.localize("SWFFG.UI.Combat.CombatActions.UndoCriticalAndSpending"):game.i18n.localize("SWFFG.UI.Combat.CombatActions.UndoThisApplication"),()=>edit(message,()=>undo(message,entry.id)));
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

export const sessionRerollRules=[{"id": "natural-driver", "names": ["naturaldriver", "fonceurne"], "skills": ["pilotingplanetary", "pilotageplanetaire", "gunnery", "artillerie"]}, {"id": "natural-pilot", "names": ["naturalpilot", "pilotene"], "skills": ["pilotingspace", "pilotagespatial", "pilotageespace", "gunnery", "artillerie"]}, {"id": "natural-leader", "names": ["naturalleader", "meneurne"], "skills": ["cool", "calme", "leadership", "commandement"]}, {"id": "natural-programmer", "names": ["naturalprogrammer", "programmeurne"], "skills": ["computers", "informatique", "astrogation"]}, {"id": "natural-marksman", "names": ["naturalmarksman", "tireurne"], "skills": ["rangedlight", "rangedheavy", "armeslegeres", "armeslourdes"]}, {"id": "natural-rogue", "names": ["naturalrogue", "voyoune"], "skills": ["skulduggery", "magouilles", "stealth", "discretion"]},
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
 const actor=await speakerActor(message);if(!canEdit(message)||!actor?.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.OwnerMustReroll"));
 if(rerollLocks.has(actor.uuid))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.RerollPending"));
 rerollLocks.add(actor.uuid);let used=false,replacement;
 try{
  const option=talentRerollOptions(actor,message).find(r=>r.id===id),old=message.rolls?.find(r=>r.hasFFG);
  if(!option||!old)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.RerollUnavailable"));
  const additions={};for(const a of old.addedResults??[]){if(a.talentGenerated)continue;const field=String(a.type??'').toLowerCase();if(['success','failure','advantage','threat','triumph','despair','light','dark'].includes(field))additions[field]=(additions[field]??0)+Number(a.value)*(a.negative?-1:1);}
  await actor.update({['flags.starwarsffg.talentSessionUsage.'+id]:true});used=true;
  if(old.forceTalentMode)additions._forceTalent=foundry.utils.deepClone(old.forceTalentMode);
  const flags=foundry.utils.deepClone(message.flags?.starwarsffg??{});delete flags.combatActions;delete flags.usedAid;
  flags.talentReroll={id,source:message.uuid};
  const roll=new game.ffg.RollFFG(old.formula,foundry.utils.deepClone(old.data),additions,old.flavor);
  const messageData=await roll.toMessage({speaker:message.speaker,flavor:game.i18n.format("SWFFG.UI.Combat.Talents.TalentRerollFlavor",{flavor:message.flavor??''}),flags:{starwarsffg:flags}},{create:false});messageData.whisper=Array.from(message.whisper??[]);messageData.blind=Boolean(message.blind);replacement=await ChatMessage.create(messageData);
  await message.setFlag(scope,'talentReplacement',replacement.uuid);
  return replacement;
 }catch(error){if(used&&!replacement)await actor.update({['flags.starwarsffg.talentSessionUsage.'+id]:false});throw error;}
 finally{rerollLocks.delete(actor.uuid);}
}

export function fineTuningRepair(current,base,rank){
 if(!Number.isFinite(current)||current<0||!Number.isInteger(base)||base<1||!Number.isInteger(rank)||rank<1)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.InvalidRepair"));
 return {base,bonus:rank,removed:Math.min(current,base+rank),after:Math.max(0,current-base-rank)};
}
export function technicalTaskDuration(minutes,rank){
 if(!Number.isFinite(minutes)||minutes<=0||!Number.isInteger(rank)||rank<1)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.InvalidTimeOrRank"));
 if(rank>=4)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.FullTimeReductionNeedsGM"));
 return minutes*(1-0.25*rank);
}
async function fineTuningDialog(message,repairHull=false){
 const group=repairHull?'hullTrauma':'systemStrain',effectName=repairHull?'solid-repairs':'fine-tuning',title=repairHull?game.i18n.localize("SWFFG.UI.Combat.Talents.SolidRepairs"):game.i18n.localize("SWFFG.UI.Combat.Talents.FineTuning");
 const actor=await speakerActor(message),rank=reviewedRank(actor,repairHull?['solidrepairs','reparationssolides']:['finetuning','mecaniciendeprecision']);
 if(!actor?.isOwner||!rank||num(result(message)?.success)<1)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.RepairUnavailable"));
 const vehicles=Array.from(game.actors?.contents??[]).filter(a=>a.type==='vehicle'&&a.isOwner&&num(a.system.stats?.[group]?.value)>0);
 if(!vehicles.length)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.NoVehicleStrain"));
 const chosen=await foundry.applications.api.DialogV2.prompt({window:{title},classes:['starwarsffg','themed'],rejectClose:false,content:`<p style="text-align:justify">${game.i18n.format("SWFFG.UI.Combat.Talents.RepairHint",{rank})}</p><label>${game.i18n.localize("SWFFG.UI.Combat.Talents.Vehicle")}<select name="vehicle">`+vehicles.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.name)+'</option>').join('')+`</select></label><label>${game.i18n.localize("SWFFG.UI.Combat.Talents.BaseRepairPoints")}<input type="number" name="base" min="1" step="1" required></label>`,ok:{label:game.i18n.localize("SWFFG.UI.Combat.Talents.Repair"),callback:(_e,_b,app)=>({id:field(app.element,'vehicle'),base:Number(field(app.element,'base'))})}});
 if(!chosen)return;
 const vehicle=vehicles.find(v=>v.id===chosen.id);if(!vehicle?.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.VehicleUnavailable"));
 const current=state(message);if(current.entries.some(e=>['fine-tuning','solid-repairs'].includes(e.effect)&&!e.undone))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.VehicleAlreadyRepaired"));
 const before=num(vehicle.system.stats[group].value),repair=fineTuningRepair(before,chosen.base,rank);
 const entry={id:foundry.utils.randomID(),kind:'effect',effect:effectName,label:game.i18n.format("SWFFG.UI.Combat.Talents.RepairReceipt",{talent:title,base:repair.base,rank,repaired:repair.removed}),note:vehicle.name,change:{actor:vehicle.uuid,path:'system.stats.'+group+'.value',before,after:repair.after}};
 await vehicle.update({[entry.change.path]:repair.after});
 try{current.entries.push(entry);await message.setFlag(scope,key,current);}catch(error){if(num(vehicle.system.stats[group].value)===repair.after)await vehicle.update({[entry.change.path]:before});throw error;}
}
async function technicalDurationDialog(message){
 const actor=await speakerActor(message),rank=reviewedRank(actor,['technicalaptitude','geniedelinformatique']);
 if(!actor?.isOwner||!rank)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.TalentUnavailable"));
 return foundry.applications.api.DialogV2.prompt({window:{title:game.i18n.localize("SWFFG.UI.Combat.Talents.TechnicalAptitude")},classes:['starwarsffg','themed'],rejectClose:false,content:`<label>${game.i18n.localize("SWFFG.UI.Combat.Talents.NormalTaskMinutes")}<input type="number" name="minutes" min="0.01" step="any" required></label>`,ok:{label:game.i18n.localize("SWFFG.UI.Combat.Talents.Calculate"),callback:async(_e,_b,app)=>{
  const minutes=Number(field(app.element,'minutes')),after=technicalTaskDuration(minutes,rank),current=state(message);
  current.entries.push({id:foundry.utils.randomID(),kind:'effect',effect:'technical-aptitude',label:game.i18n.format("SWFFG.UI.Combat.Talents.TechnicalDurationReceipt",{minutes,after,percent:rank*25}),note:game.i18n.localize("SWFFG.UI.Combat.Talents.TimeCalculationHint")});await message.setFlag(scope,key,current);return after;
 }}});
}
export function destinyHitOptions(actor,message){
 const item=weapon(message);if(!actor?.isOwner||!item||item.type!=='weapon'||messageCombatMode(message)==='vehicle'||num(result(message)?.success)<1)return [];
 if(state(message).entries.some(e=>e.kind==='damage'&&!e.undone))return [];
 return [{id:'soft-spot',names:['softspot','pointfaible'],label:game.i18n.localize("SWFFG.UI.Combat.Talents.SoftSpot"),stat:'Cunning'},{id:'anatomy-lessons',names:['anatomylessons','leconsdanatomie'],label:game.i18n.localize("SWFFG.UI.Combat.Talents.AnatomyLessons"),stat:'Intellect'},{id:'targeted-blow',names:['targetedblow','coupcible'],label:game.i18n.localize("SWFFG.UI.Combat.Talents.TargetedBlow"),stat:'Agility'}].filter(r=>reviewedRank(actor,r.names)>0&&!state(message).entries.some(e=>e.effect===r.id&&!e.undone));
}
async function destinyHitDialog(message,id){
 const actor=await speakerActor(message),option=destinyHitOptions(actor,message).find(o=>o.id===id);if(!option)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.AttackTalentUnavailable"));
 if(!game.user.isGM)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.GMConfirmDestiny"));
 const pool=await foundry.applications.api.DialogV2.prompt({window:{title:option.label},classes:['starwarsffg','themed'],rejectClose:false,content:`<p style="text-align:justify">${game.i18n.localize("SWFFG.UI.Combat.Talents.DestinyDamageHint")}</p><label>${game.i18n.localize("SWFFG.UI.Combat.Talents.Pool")}<select name="pool"><option value="light">${game.i18n.localize("SWFFG.UI.Combat.Talents.Light")}</option><option value="dark">${game.i18n.localize("SWFFG.UI.Combat.Talents.Dark")}</option></select></label>`,ok:{label:game.i18n.localize("SWFFG.UI.Combat.Talents.Activate"),callback:(_e,_b,app)=>field(app.element,'pool')}});
 if(!pool)return;
 const {reserveTalentDestiny,refundTalentDestiny}=await import('./reviewed-destiny.js'),destiny=await reserveTalentDestiny(pool);
 try{const current=state(message);if(!destinyHitOptions(actor,message).some(o=>o.id===id))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.AttackChanged"));current.entries.push({id:foundry.utils.randomID(),kind:'destiny-talent',effect:id,label:game.i18n.format("SWFFG.UI.Combat.Talents.DestinyHitReceipt",{talent:option.label,damage:num(actor.system.characteristics?.[option.stat]?.value)}),damageBonus:num(actor.system.characteristics?.[option.stat]?.value),destiny});await message.setFlag(scope,key,current);}catch(error){await refundTalentDestiny(destiny);throw error;}
}

export function stimulusChoiceLimit(triumph,hasSupreme){return 1+(hasSupreme?Math.max(0,Math.floor(Number(triumph)||0)):0);}
export async function applyStimulus(message,target,choices,contactConfirmed){
 const actor=await speakerActor(message),trigger=message.getFlag(scope,'triggeredTalent');
 const improved=trigger==='stimapimp';
 if(!canEdit(message)||!actor?.isOwner||!target?.isOwner||!['stimap','stimapimp'].includes(trigger)||num(result(message)?.success)<1||!contactConfirmed)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.StimConditionsRequired"));
 const combat=game.combat;if(!combat?.started)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.EncounterNeeded"));
 const current=state(message);if(current.entries.some(e=>e.effect==='stim-application'&&!e.undone))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.StimAlreadyApplied"));
 const supreme=reviewedRank(actor,['stimapplicationsupreme','dosedestimulantultime','dosedestimulantsupreme'])>0;
 const left=remainingSymbols(result(message),current.entries),limit=stimulusChoiceLimit(left.triumph,supreme);
 if(!choices.length||new Set(choices).size!==choices.length||choices.length>limit||choices.some(k=>!target.system.characteristics?.[k]))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.StimBudgetInvalid"));
 const old=target.getFlag(scope,'stimBonuses')??[];
 if(choices.some(k=>old.some(b=>b.encounterId===combat.id&&b.characteristic===k)))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.CharacteristicAlreadyBoosted"));
 const stat=target.system.stats?.strain?.max>0?{path:'system.stats.strain.value',value:target.system.stats.strain.value}:target.type==='rival'?{path:'system.stats.wounds.value',value:target.system.stats.wounds.value}:null;
 if(!stat)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.RecipientStrainNeedsGM"));
 const id=foundry.utils.randomID(),cost=improved?1:4,bonuses=choices.map(k=>({id:id+':'+k,source:message.uuid,encounterId:combat.id,characteristic:k}));
 const entry={id,kind:'effect',effect:'stim-application',label:game.i18n.format("SWFFG.UI.Combat.Talents.StimReceipt",{traits:choices.map(k=>game.i18n.localize('SWFFG.Characteristic'+k)).join(', ')}),note:target.name,stimBonusIds:bonuses.map(b=>b.id),change:{actor:target.uuid,path:stat.path,before:num(stat.value),after:num(stat.value)+cost},...(choices.length>1?{currency:'triumph',cost:choices.length-1}:{} )};
 await target.update({[stat.path]:entry.change.after,'flags.starwarsffg.stimBonuses':[...old,...bonuses]});
 try{current.entries.push(entry);await message.setFlag(scope,key,current);}catch(error){await target.update({[stat.path]:entry.change.before,'flags.starwarsffg.stimBonuses':old});throw error;}
 return entry;
}
async function stimulusDialog(message){
 const actor=await speakerActor(message),candidates=[...new Map([actor,...(canvas.tokens?.placeables??[]).map(t=>t.actor)].filter(a=>a?.isOwner&&['character','rival','nemesis'].includes(a.type)).map(a=>[a.uuid,a])).values()];
 const choices=['Brawn','Agility','Intellect','Cunning','Willpower','Presence'];
 const selected=await foundry.applications.api.DialogV2.prompt({window:{title:game.i18n.localize("SWFFG.UI.Combat.Talents.StimApplication")},classes:['starwarsffg','themed'],rejectClose:false,content:`<label>${game.i18n.localize("SWFFG.UI.Combat.Talents.Recipient")}<select name="actor">`+candidates.map(a=>'<option value="'+esc(a.uuid)+'">'+esc(a.name)+'</option>').join('')+`</select></label><p style="text-align:justify">${game.i18n.localize("SWFFG.UI.Combat.Talents.StimEquipmentHint")}</p><label><input type="checkbox" name="contact">${game.i18n.localize("SWFFG.UI.Combat.Talents.StimConditions")}</label>`+choices.map(k=>'<label><input type="checkbox" name="trait" value="'+k+'">'+esc(game.i18n.localize('SWFFG.Characteristic'+k))+'</label>').join(''),ok:{label:game.i18n.localize("SWFFG.UI.Combat.Talents.Apply"),callback:(_e,_b,app)=>({actor:field(app.element,'actor'),traits:Array.from(app.element.querySelectorAll('[name=trait]:checked')).map(e=>e.value),contact:app.element.querySelector('[name=contact]').checked})}});
 if(selected)await applyStimulus(message,candidates.find(a=>a.uuid===selected.actor),selected.traits,selected.contact);
}
export function commanderCapacity(presence,improved){return Math.max(0,Number(presence)||0)*(improved?2:1);}
async function commanderDialog(message){
 const actor=await speakerActor(message);if(!actor?.isOwner||message.getFlag(scope,'triggeredTalent')!=='fldcomm'||num(result(message)?.success)<1)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.CommanderSuccessRequired"));
 const improved=reviewedRank(actor,['fieldcommanderimproved','officiersuperieurameliore'])>0,limit=commanderCapacity(actor.system.characteristics?.Presence?.value,improved);
 const tokens=(canvas.tokens?.placeables??[]).filter(t=>t.actor?.isOwner&&['character','rival','nemesis'].includes(t.actor.type));
 const candidates=[...new Map(tokens.filter(t=>t.actor.uuid!==actor.uuid).map(t=>[t.actor.uuid,t.actor])).values()];
 if(!candidates.length)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.NoAccessibleAlly"));
 const selected=await foundry.applications.api.DialogV2.prompt({window:{title:game.i18n.localize("SWFFG.UI.Combat.Talents.FieldCommander")},classes:['starwarsffg','themed'],rejectClose:false,content:`<p style="text-align:justify">${game.i18n.format("SWFFG.UI.Combat.Talents.CommanderHint",{limit})}</p>`+candidates.map((a,i)=>'<label><input type="checkbox" name="ally" value="'+i+'">'+esc(a.name)+(improved?' <input type="checkbox" name="action'+i+'">'+game.i18n.localize('SWFFG.UI.Combat.Talents.CommanderActionOption'):'')+'</label>').join(''),ok:{label:game.i18n.localize("SWFFG.UI.Combat.Talents.Grant"),callback:(_e,_b,app)=>Array.from(app.element.querySelectorAll('[name=ally]:checked')).map(e=>({actor:candidates[Number(e.value)],action:app.element.querySelector('[name=action'+e.value+']')?.checked===true}))}});
 if(!selected)return;
 const current=state(message),left=remainingSymbols(result(message),current.entries);
 if(current.entries.some(e=>e.effect==='field-commander'&&!e.undone))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.EffectsAlreadyGranted"));
 if(!selected.length||selected.length>limit||selected.filter(s=>s.action).length>left.triumph)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.CommanderBudgetInvalid"));
 const applied=[];
 try{
  for(const {actor:target,action}of selected){if(!target?.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.RecipientUnavailable"));const stat=target.system.stats?.strain?.max>0?{path:'system.stats.strain.value',value:target.system.stats.strain.value}:target.type==='rival'?{path:'system.stats.wounds.value',value:target.system.stats.wounds.value}:null;if(!stat)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.RecipientCostNeedsGM"));const entry={id:foundry.utils.randomID(),kind:'effect',effect:'field-commander',label:action?game.i18n.localize("SWFFG.UI.Combat.Talents.CommanderActionReceipt"):game.i18n.localize("SWFFG.UI.Combat.Talents.CommanderManeuverReceipt"),note:target.name,change:{actor:target.uuid,path:stat.path,before:num(stat.value),after:num(stat.value)+1},...(action?{currency:'triumph',cost:1}:{})};await target.update({[stat.path]:entry.change.after});applied.push({target,entry});}
  current.entries.push(...applied.map(x=>x.entry));await message.setFlag(scope,key,current);
 }catch(error){for(const {target,entry}of applied.reverse())if(num(foundry.utils.getProperty(target,entry.change.path))===entry.change.after)await target.update({[entry.change.path]:entry.change.before});throw error;}
}

export async function applyFullThrottle(message,vehicle,pilotingConfirmed){
 const actor=await speakerActor(message),trigger=message.getFlag(scope,'triggeredTalent'),combat=game.combat;
 if(!actor?.isOwner||!vehicle?.isOwner||vehicle.type!=='vehicle'||!pilotingConfirmed||!['fullth','fullthimp'].includes(trigger)||num(result(message)?.success)<1||!combat?.started)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.FullThrottleConditions"));
 if(reviewedRank(actor,['fullthrottle','pleinsgaz'])<1)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.FullThrottleNotAcquired"));
 const duration=Number(actor.system.characteristics?.Cunning?.value);if(!Number.isInteger(duration)||duration<1)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.InvalidCunning"));
 const current=state(message);if(current.entries.some(e=>e.effect==='full-throttle'&&!e.undone))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.FullThrottleAlreadyApplied"));
 const previous=vehicle.getFlag(scope,'fullThrottle')??null;if(previous&&!previous.expired&&previous.combatId===combat.id&&(combat.round<previous.expiresRound||combat.round===previous.expiresRound&&combat.turn<previous.expiresTurn))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.FullThrottleAlreadyActive"));
 const bonus=reviewedRank(actor,['fullthrottlesupreme','pleinsgazultime'])>0?2:1,effect={source:message.uuid,actor:actor.uuid,combatId:combat.id,bonus,expiresRound:combat.round+duration,expiresTurn:combat.turn};
 await vehicle.update({'flags.starwarsffg.fullThrottle':effect});
 try{current.entries.push({id:foundry.utils.randomID(),kind:'effect',effect:'full-throttle',vehicle:vehicle.uuid,previous,label:game.i18n.format("SWFFG.UI.Combat.Talents.FullThrottleReceipt",{bonus,rounds:duration}),note:game.i18n.format("SWFFG.UI.Combat.Talents.FullThrottleNote",{vehicle:vehicle.name})});await message.setFlag(scope,key,current);}catch(error){if(vehicle.getFlag(scope,'fullThrottle')?.source===message.uuid)await vehicle.update({'flags.starwarsffg.fullThrottle':previous});throw error;}return effect;
}
async function fullThrottleDialog(message){
 const vehicles=Array.from(game.actors?.contents??[]).filter(a=>a.type==='vehicle'&&a.isOwner);if(!vehicles.length)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.NoVehicle"));
 const choice=await foundry.applications.api.DialogV2.prompt({window:{title:game.i18n.localize("SWFFG.UI.Combat.Talents.FullThrottle")},classes:['starwarsffg','themed'],rejectClose:false,content:`<label>${game.i18n.localize("SWFFG.UI.Combat.Talents.Vehicle")}<select name="vehicle">`+vehicles.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.name)+'</option>').join('')+`</select></label><label><input type="checkbox" name="pilot">${game.i18n.localize("SWFFG.UI.Combat.Talents.PilotingConfirmed")}</label>`,ok:{label:game.i18n.localize("SWFFG.UI.Combat.Talents.Apply"),callback:(_e,_b,app)=>({id:field(app.element,'vehicle'),confirmed:app.element.querySelector('[name=pilot]').checked})}});if(choice)await applyFullThrottle(message,vehicles.find(v=>v.id===choice.id),choice.confirmed);
}

export async function applyRhetoric(message,allocations,rangeConfirmed){
 const actor=await speakerActor(message),trigger=message.getFlag(scope,'triggeredTalent'),inspiring=['insprhet','insprhetsup'].includes(trigger),scathing=['scath','scathsup'].includes(trigger),successes=Math.floor(num(result(message)?.success));
 if(!actor?.isOwner||(!inspiring&&!scathing)||successes<1||!rangeConfirmed||!allocations.length||allocations.length>successes)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.RhetoricConditions"));
 const current=state(message);if(current.entries.some(e=>e.effect==='rhetoric'&&!e.undone))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.EffectsAlreadyApplied"));
 const unique=new Set(allocations.map(a=>a.actor.uuid));if(unique.size!==allocations.length)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.DuplicateTarget"));
 const extra=allocations.reduce((n,a)=>n+a.extra,0),available=remainingSymbols(result(message),current.entries);if(allocations.some(a=>!Number.isInteger(a.extra)||a.extra<0)||extra>available.advantage)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.InvalidAdvantageBudget"));
 const improved=reviewedRank(actor,inspiring?['inspiringrhetoricimproved','sensdelarhetoriqueameliore']:['scathingtiradeimproved','repartiecaustiqueameliore'])>0,combat=game.combat;
 if(improved&&!combat?.started)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.ImprovedTalentNeedsCombat"));
 const skill=inspiring?'Leadership':'Coercion',duration=Number(actor.system.skills?.[skill]?.rank);if(improved&&(!Number.isInteger(duration)||duration<1))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.InvalidDurationSkillRank"));
 const id=foundry.utils.randomID(),changes=[];const present=new Set((canvas.tokens?.placeables??[]).filter(t=>game.user.isGM||(t.visible&&!t.document.hidden)).map(t=>t.actor?.uuid));
 for(const allocation of allocations){const target=allocation.actor;if(!target?.isOwner||!present.has(target.uuid)||inspiring&&target.uuid===actor.uuid)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.RhetoricTargetRequired"));const strain=target.system.stats?.strain;const account=Number(strain?.max)>0?{path:'system.stats.strain.value',stat:strain}:!inspiring&&target.type==='rival'?{path:'system.stats.wounds.value',stat:target.system.stats.wounds}:null;if(!account)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.TargetStrainNeedsGM"));const before=Number(account.stat.value);if(!Number.isFinite(before)||inspiring&&before<=0)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.NoTargetStrain"));const after=inspiring?Math.max(0,before-1-allocation.extra):before+1+allocation.extra;changes.push({actor:target.uuid,path:account.path,before,after,target,modifiers:target.getFlag(scope,'timedTalentModifiers')??[]});}
 const applied=[];
 try{for(const change of changes){const update={[change.path]:change.after};if(improved){const kind=inspiring?'boost':'setback',family=inspiring?'inspiring-rhetoric':'scathing-tirade';update['flags.starwarsffg.timedTalentModifiers']=[...change.modifiers,{id,kind,family,source:message.uuid,combatId:combat.id,expiresRound:combat.round+duration,expiresTurn:combat.turn}];}await change.target.update(update);applied.push(change);}
 current.entries.push({id,kind:'effect',effect:'rhetoric',label:game.i18n.format("SWFFG.UI.Combat.Talents.RhetoricReceipt",{talent:inspiring?game.i18n.localize("SWFFG.UI.Combat.Talents.InspiringRhetoric"):game.i18n.localize("SWFFG.UI.Combat.Talents.ScathingTirade"),targets:changes.length,advantages:extra}),changes:changes.map(({target,modifiers,...change})=>change),...(extra?{currency:'advantage',cost:extra}:{})});await message.setFlag(scope,key,current);
 }catch(error){for(const change of applied)if(num(foundry.utils.getProperty(change.target,change.path))===change.after)await change.target.update({[change.path]:change.before,'flags.starwarsffg.timedTalentModifiers':change.modifiers});throw error;}return changes.map(({target,modifiers,...change})=>change);
}
async function rhetoricDialog(message){
 const candidates=Array.from(new Map((canvas.tokens?.placeables??[]).filter(t=>t.actor?.isOwner&&(game.user.isGM||t.visible&&!t.document.hidden)).map(t=>[t.actor.uuid,t.actor])).values());
 if(!candidates.length)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.NoVisibleTarget"));
 const choice=await foundry.applications.api.DialogV2.prompt({window:{title:game.i18n.localize("SWFFG.UI.Combat.Talents.TalentEffects")},classes:['starwarsffg','themed'],rejectClose:false,content:`<p style="text-align:justify">${game.i18n.localize("SWFFG.UI.Combat.Talents.RhetoricTargetHint")}</p>`+candidates.map((a,i)=>'<label><input type="checkbox" name="target" value="'+i+'">'+esc(a.name)+' <input type="number" name="extra-'+i+'" min="0" step="1" value="0" aria-label="'+esc(game.i18n.format("SWFFG.UI.Combat.Talents.ExtraAdvantages",{name:a.name}))+'"></label>').join('')+`<label><input type="checkbox" name="range">${game.i18n.localize("SWFFG.UI.Combat.Talents.RhetoricRangeConfirmed")}</label>`,ok:{label:game.i18n.localize("SWFFG.UI.Combat.Talents.Apply"),callback:(_e,_b,app)=>({allocations:Array.from(app.element.querySelectorAll('[name=target]:checked')).map(e=>({actor:candidates[Number(e.value)],extra:Number(field(app.element,'extra-'+e.value))})),confirmed:app.element.querySelector('[name=range]').checked})}});if(choice)await applyRhetoric(message,choice.allocations,choice.confirmed);
}

const encounterRecoveryLocks=new Set();
export async function recoverEncounterStrain(message,confirmed){
 const actor=await speakerActor(message),encounter=actor?.getFlag?.(scope,'lastCompletedEncounter');
 const skill=String(message.getFlag(scope,'combatSkill')??'').toLowerCase().replace(/[^a-z]/g,'');
 if(!actor?.isOwner||!encounter||!confirmed||!['cool','discipline','calme','sangfroid'].includes(skill))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.RecoveryConditions"));
 if(game.combat?.id===encounter&&game.combat.started)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.EncounterStillActive"));
 if(encounterRecoveryLocks.has(actor.uuid))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.RecoveryPending"));encounterRecoveryLocks.add(actor.uuid);
 try{if(actor.getFlag(scope,'lastRecoveredEncounter')===encounter)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.RecoveryAlreadyDone"));
 const rapid=reviewedRank(actor,['rapidrecovery','recuperationrapide']),balance=message.getFlag(scope,'rollTalents')?.some(t=>t.id==='balance'),rolled=result(message),light=balance?Math.max(0,Math.floor(num(rolled?.light))):0,successes=Math.max(0,Math.floor(num(rolled?.success))),before=num(actor.system.stats?.strain?.value),amount=successes+rapid+light,after=Math.max(0,before-amount);
 if(!(Number(actor.system.stats?.strain?.max)>0))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.NoPersonalStrain"));
 const previous=actor.getFlag(scope,'lastRecoveredEncounter')??null;await actor.update({'system.stats.strain.value':after,'flags.starwarsffg.lastRecoveredEncounter':encounter});
 try{const current=state(message);current.entries.push({id:foundry.utils.randomID(),kind:'effect',effect:'encounter-recovery',label:game.i18n.format("SWFFG.UI.Combat.Talents.RecoveryReceipt",{successes,rapid,light,recovered:before-after,after}),change:{actor:actor.uuid,path:'system.stats.strain.value',before,after},encounter,previous});await message.setFlag(scope,key,current);}catch(error){if(actor.system.stats.strain.value===after)await actor.update({'system.stats.strain.value':before,'flags.starwarsffg.lastRecoveredEncounter':previous});throw error;}
 return {successes,rapid,light,recovered:before-after,after};
 }finally{encounterRecoveryLocks.delete(actor.uuid);}
}
async function encounterRecoveryDialog(message){return foundry.applications.api.DialogV2.prompt({window:{title:game.i18n.localize("SWFFG.UI.Combat.Talents.EncounterRecovery")},classes:['starwarsffg','themed'],rejectClose:false,content:`<label><input type="checkbox" name="confirm">${game.i18n.localize("SWFFG.UI.Combat.Talents.RecoveryCheckConfirmed")}</label>`,ok:{label:game.i18n.localize("SWFFG.UI.Combat.Talents.Recover"),callback:(_e,_b,app)=>recoverEncounterStrain(message,app.element.querySelector('[name=confirm]').checked)}});}

export function wheelDealPrice(price,rank){if(!Number.isFinite(price)||price<0||!Number.isInteger(rank)||rank<1)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.InvalidPriceOrRank"));const bonus=Math.round(price*rank*10)/100;return {base:price,bonus,total:Math.round((price+bonus)*100)/100};}
async function wheelDealDialog(message){const actor=await speakerActor(message),rank=reviewedRank(actor,['wheelanddeal','sensdesaffaires']);return foundry.applications.api.DialogV2.prompt({window:{title:game.i18n.localize("SWFFG.UI.Combat.Talents.WheelAndDeal")},classes:['starwarsffg','themed'],rejectClose:false,content:`<label>${game.i18n.localize("SWFFG.UI.Combat.Talents.NormalSalePrice")}<input name="price" type="number" min="0" step="0.01"></label><label><input type="checkbox" name="legal">${game.i18n.localize("SWFFG.UI.Combat.Talents.LegalSaleConfirmed")}</label>`,ok:{label:game.i18n.localize("SWFFG.UI.Combat.Talents.Calculate"),callback:async(_e,_b,app)=>{if(!app.element.querySelector('[name=legal]').checked)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.ConfirmSaleConditions"));const calculation=wheelDealPrice(Number(field(app.element,'price')),rank),current=state(message);if(current.entries.some(e=>e.effect==='wheel-and-deal'&&!e.undone))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.SaleAlreadyCalculated"));current.entries.push({id:foundry.utils.randomID(),kind:'effect',effect:'wheel-and-deal',label:game.i18n.format("SWFFG.UI.Combat.Talents.SaleReceipt",{base:calculation.base,bonus:calculation.bonus,total:calculation.total}),note:game.i18n.localize("SWFFG.UI.Combat.Talents.PriceOnlyHint")});await message.setFlag(scope,key,current);return calculation;}}});}

export function halvedTaskTalents(message){
 const skill=String(message.getFlag(scope,'combatSkill')??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
 return (message.getFlag(scope,'rollTalents')??[]).filter(t=>t.id==='utinni'||['survival','survie'].includes(skill)&&['expert-tracker','forager'].includes(t.id));
}
export function halvedTaskDuration(minutes){if(!Number.isFinite(minutes)||minutes<=0)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.InvalidNormalDuration"));return minutes/2;}
async function halvedTaskDialog(message){
 const talents=halvedTaskTalents(message);if(!talents.length)throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.TalentMustBeUsed"));
 return foundry.applications.api.DialogV2.prompt({window:{title:game.i18n.localize("SWFFG.UI.Combat.Talents.TaskDuration")},classes:['starwarsffg','themed'],rejectClose:false,content:`<label>${game.i18n.localize("SWFFG.UI.Combat.Talents.NormalMinutes")}<input name="minutes" type="number" min="0.01" step="any"></label><p style="text-align:justify">${game.i18n.localize("SWFFG.UI.Combat.Talents.HalfTimeHint")}</p>`,ok:{label:game.i18n.localize("SWFFG.UI.Combat.Talents.Calculate"),callback:async(_e,_b,app)=>{const base=Number(field(app.element,'minutes')),after=halvedTaskDuration(base),current=state(message);if(current.entries.some(e=>e.effect==='halved-task-duration'&&!e.undone))throw Error(game.i18n.localize("SWFFG.UI.Combat.Talents.TaskAlreadyCalculated"));current.entries.push({id:foundry.utils.randomID(),kind:'effect',effect:'halved-task-duration',label:talents.map(t=>t.name??t.id).join(', ')+' : '+base+' min → '+after+' min',note:game.i18n.localize("SWFFG.UI.Combat.Talents.TaskTimeOnlyHint")});await message.setFlag(scope,key,current);return after;}}});
}

export function pressurePointApplies(item,target){return Boolean(target?.type!=='vehicle'&&typeof target?.uuid==='string'&&item?.flags?.starwarsffg?.brawlAttack?.unarmed&&item.flags.starwarsffg.pressurePointTarget===target.uuid);}

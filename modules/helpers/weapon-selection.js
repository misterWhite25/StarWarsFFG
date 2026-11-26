const supported = new Set(['Brawl', 'Gunnery', 'Lightsaber', 'Melee', 'RangedLight', 'RangedHeavy', 'Ranged: Light', 'Ranged: Heavy']);
// Presentation only: keep imported Item names intact for rules/import matching.
const qualityLabels = [
  ['accurate','Précision','passive'], ['inaccurate','Imprécision','passive'],
  ['auto-fire','Tir automatique','before'], ['linked','Lié','active'],
  ['blast','Souffle','active'], ['burn','Brûlure','active'],
  ['concussive','Choc','active'], ['disorient','Désorientation','active'],
  ['ensnare','Immobilisation','active'], ['knockdown','Renversement','active'],
  ['sunder','Destruction','active'], ['stun','Étourdissement','active'],
  ['guided','Guidage','active'], ['stun setting','Réglage étourdissant','setting'],
  ['stun damage','Dégâts étourdissants','passive'], ['pierce','Perforant','passive'],
  ['breach','Brèche','passive'], ['vicious','Cruel','passive'],
  ['defensive','Défensif','passive'], ['deflection','Déflexion','passive'],
  ['cumbersome','Encombrant','passive'], ['unwieldy','Peu maniable','passive'],
  ['limited ammo','Munitions limitées','passive'], ['slow-firing','Tir lent','passive'], ['slow firing','Tir lent','passive'],
  ['prepare','Préparation','passive'], ['piercing','Perforant','passive'],
  ['ion','Ionique','passive'], ['cortosis','Cortosis','passive'],
  ['inferior','Qualité inférieure','passive'], ['superior','Qualité supérieure','passive'],
  ['tractor','Rayon tracteur','passive'], ['fragile','Fragile','passive'],
];
const qualityDisplayKeys = {
  "accurate": "SWFFG.UI.Dice.WeaponQuality.Accurate",
  "inaccurate": "SWFFG.UI.Dice.WeaponQuality.Inaccurate",
  "auto-fire": "SWFFG.UI.Dice.WeaponQuality.AutoFire",
  "linked": "SWFFG.UI.Dice.WeaponQuality.Linked",
  "blast": "SWFFG.UI.Dice.WeaponQuality.Blast",
  "burn": "SWFFG.UI.Dice.WeaponQuality.Burn",
  "concussive": "SWFFG.UI.Dice.WeaponQuality.Concussive",
  "disorient": "SWFFG.UI.Dice.WeaponQuality.Disorient",
  "ensnare": "SWFFG.UI.Dice.WeaponQuality.Ensnare",
  "knockdown": "SWFFG.UI.Dice.WeaponQuality.Knockdown",
  "sunder": "SWFFG.UI.Dice.WeaponQuality.Sunder",
  "stun": "SWFFG.UI.Dice.WeaponQuality.Stun",
  "guided": "SWFFG.UI.Dice.WeaponQuality.Guided",
  "stun setting": "SWFFG.UI.Dice.WeaponQuality.StunSetting",
  "stun damage": "SWFFG.UI.Dice.WeaponQuality.StunDamage",
  "pierce": "SWFFG.UI.Dice.WeaponQuality.Pierce",
  "breach": "SWFFG.UI.Dice.WeaponQuality.Breach",
  "vicious": "SWFFG.UI.Dice.WeaponQuality.Vicious",
  "defensive": "SWFFG.UI.Dice.WeaponQuality.Defensive",
  "deflection": "SWFFG.UI.Dice.WeaponQuality.Deflection",
  "cumbersome": "SWFFG.UI.Dice.WeaponQuality.Cumbersome",
  "unwieldy": "SWFFG.UI.Dice.WeaponQuality.Unwieldy",
  "limited ammo": "SWFFG.UI.Dice.WeaponQuality.LimitedAmmo",
  "slow-firing": "SWFFG.UI.Dice.WeaponQuality.SlowFiring",
  "slow firing": "SWFFG.UI.Dice.WeaponQuality.SlowFiring",
  "prepare": "SWFFG.UI.Dice.WeaponQuality.Prepare",
  "piercing": "SWFFG.UI.Dice.WeaponQuality.Piercing",
  "ion": "SWFFG.UI.Dice.WeaponQuality.Ion",
  "cortosis": "SWFFG.UI.Dice.WeaponQuality.Cortosis",
  "inferior": "SWFFG.UI.Dice.WeaponQuality.Inferior",
  "superior": "SWFFG.UI.Dice.WeaponQuality.Superior",
  "tractor": "SWFFG.UI.Dice.WeaponQuality.Tractor",
  "fragile": "SWFFG.UI.Dice.WeaponQuality.Fragile"
};
const cleanQualityName = name => String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+quality(?:\s+\d+)?$/,'');
export function describeWeaponQuality(quality, _language = 'en') {
  const original=String(quality?.name ?? ''), name=cleanQualityName(original);
  const entry=qualityLabels.find(([en,translated])=>name===en||name===cleanQualityName(translated));
  const raw=quality?.system?.rank_current ?? quality?.system?.rank;
  const rank=raw?.value ?? raw;
  const suffix=rank!==undefined&&rank!==null&&rank!==''?` ${rank}`:'';
  if(entry) {
    const mode=entry[2]==='before'?(game.i18n.localize("SWFFG.UI.Dice.WeaponSelection.ChooseBeforeRollingTriggerAfter")):entry[2]==='active'?(game.i18n.localize("SWFFG.UI.Dice.WeaponSelection.Active")):entry[2]==='setting'?(game.i18n.localize("SWFFG.UI.Dice.WeaponSelection.PassiveSetBeforeFiring")):(game.i18n.localize("SWFFG.UI.Dice.WeaponSelection.Passive"));
    return `${game.i18n.localize(qualityDisplayKeys[entry[0]])}${suffix} (${mode})`;
  }
  const mods={
    'may select additional jury rigged option mod':'SWFFG.UI.Dice.WeaponQuality.AdditionalJuryRiggedOption',
    'decreases encumbrance mod':'SWFFG.UI.Dice.WeaponQuality.ReducedEncumbrance',
  };
  if(Object.hasOwn(mods,name))return `${game.i18n.localize(mods[name])}${suffix} (${game.i18n.localize("SWFFG.UI.Dice.WeaponSelection.PassiveModification")})`;
  return `${original}${suffix} (${game.i18n.localize("SWFFG.UI.Dice.WeaponSelection.Unclassified")})`;
}
export function missingAccurateBoost(quality, configuredBoost = 0) {
  const name = String(quality?.name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+quality(?:\s+\d+)?$/,'');
  if (!['accurate','precision','precis'].includes(name)) return 0;
  const raw = quality.system?.rank_current ?? quality.system?.rank ?? 1;
  const rank = Number(raw?.value ?? raw);
  if (!Number.isFinite(rank)) return 0;
  return Math.max(0,rank - Math.max(0,Number(configuredBoost) || 0));
}
export function supportsWeaponSelection(key, skill) {
  return supported.has(key) || supported.has(skill?.value);
}
export function matchingWeapons(actor, key) {
  return (actor?.items?.contents ?? []).filter(item => !(item?.flags?.starwarsffg?.inventoryLocation==='possession') && item.type === 'weapon' && item.system?.skill?.value === key);
}

// Actor flags survive closing a dialog, reconnecting and switching clients.
// Keep a separate choice per skill so a lightsaber never replaces a blaster.
const weaponMemoryKey = key => `lastWeapons.${encodeURIComponent(key)}`;
export function rememberedWeapon(actor, key) {
  const id = actor?.getFlag?.('starwarsffg', weaponMemoryKey(key));
  return matchingWeapons(actor, key).find(item => item.id === id) ?? null;
}
export async function rememberWeapon(actor, key, item) {
  if (!actor?.isOwner || !actor.setFlag || !supportsWeaponSelection(key)) return;
  const id = item?.id ?? '';
  if (id && !matchingWeapons(actor, key).some(weapon => weapon.id === id)) return;
  if (actor.getFlag?.('starwarsffg', weaponMemoryKey(key)) !== id) {
    await actor.setFlag('starwarsffg', weaponMemoryKey(key), id);
  }
}

export async function prepareRememberedWeapon(context, item, pool) {
  if (!context) return {item, pool};
  // An attack from an inventory weapon always takes precedence over memory.
  if (item?.id) {
    await rememberWeapon(context.actor, context.skillKey, item);
    return {item, pool};
  }
  const remembered = rememberedWeapon(context.actor, context.skillKey);
  if (!remembered) return {item, pool};
  return {item: remembered, pool: await context.makePool(remembered)};
}
// Retain manual changes (and accepted assistance) while replacing only the
// contribution of the previous weapon. Never run modifiers on the live pool twice.
export function replaceWeaponPool(current, previous, next) {
  const result = {...next};
  const signed = new Set(['advantage','success','threat','failure','triumph','despair','light','dark']);
  for (const key of Object.keys(next)) {
    if (typeof next[key] !== 'number') continue;
    const value = next[key] + Number(current[key] ?? 0) - Number(previous[key] ?? 0);
    result[key] = signed.has(key) ? value : Math.max(0,value);
  }
  return result;
}

export function hasAutoFire(item) {
  const values=item?.system?.adjusteditemmodifier ?? item?.system?.itemmodifier ?? [];
  return Object.values(values).some(q=>q && ['auto-fire','auto fire','autofire','automatique','tir automatique'].includes(cleanQualityName(q.name)));
}
export function setAutoFirePool(pool, previous, enabled) {
  if (Boolean(previous) === Boolean(enabled)) return;
  pool.difficulty=Math.max(0,(Number(pool.difficulty)||0)+(enabled?1:-1));
}

export function weaponQualityName(name, _language = 'en') {
  const cleaned=cleanQualityName(name);
  const entry=qualityLabels.find(([en,fr])=>cleaned===en||cleaned===cleanQualityName(fr));
  if(entry)return game.i18n.localize(qualityDisplayKeys[entry[0]]);
  if(['auto fire','autofire','automatique'].includes(cleaned))return game.i18n.localize(qualityDisplayKeys['auto-fire']);
  return String(name??'');
}

export function combatSkillKind(skill) {
  const name=String(skill??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
  if(['gunnery','artillerie','swffgskillsnamegunnery'].includes(name))return 'gunnery';
  if(['pilotingplanetary','pilotingspace','pilotageplanetaire','pilotagespatial','swffgskillsnamepilotingplanetary','swffgskillsnamepilotingspace'].includes(name))return 'piloting';
  return null;
}
export function combatModeForRoll(skill,item,explicit) {
  if(['personal','vehicle'].includes(explicit))return explicit;
  if(combatSkillKind(skill)==='piloting' || item?.type==='shipweapon' || item?.crew?.crew_card)return 'vehicle';
  return 'personal';
}

// Per-roll intent: a setting is available equipment, never proof that it was used.
export function weaponStunProfile(item) {
  const adjusted=Object.values(item?.system?.adjusteditemmodifier??{}).filter(Boolean);
  const values=adjusted.length?adjusted:Object.values(item?.system?.itemmodifier??{}).filter(Boolean);
  const names=values.map(q=>cleanQualityName(q.name));
  return {fixed:names.some(n=>['stun damage','degats etourdissants'].includes(n)),setting:names.some(n=>['stun setting','reglage etourdissant'].includes(n))};
}
export function resolveShot(item,{mode,targetRange}={}) {
  const profile=weaponStunProfile(item);
  if(profile.fixed)return {damageType:'strain',weaponMode:'fixed-stun',shortOnly:false};
  if(mode==='stun') {
    if(!profile.setting)throw Error(game.i18n.localize("SWFFG.UI.Dice.WeaponSelection.ThisWeaponNoLongerHasAStunSetting"));
    if(!['engaged','short'].includes(targetRange))throw Error(game.i18n.localize("SWFFG.UI.Dice.WeaponSelection.StunSettingConfirmEngagedOrShortRangeBefore"));
    return {damageType:'strain',weaponMode:'stun',shortOnly:true,targetRange};
  }
  if(mode!==undefined&&mode!=='normal')throw Error(game.i18n.localize("SWFFG.UI.Dice.WeaponSelection.InvalidFiringMode"));
  return {damageType:'wounds',weaponMode:'normal',shortOnly:false};
}
export function damageModeFromSnapshot(snapshot,item) {
  if(['wounds','strain'].includes(snapshot?.damageType))return {damageType:snapshot.damageType,source:'snapshot'};
  const profile=weaponStunProfile(item);
  if(profile.fixed)return {damageType:'strain',source:'fixed-quality'};
  if(profile.setting)return {requiresConfirmation:true,source:'old-message-with-setting'};
  return {damageType:'wounds',source:'ordinary'};
}

export function isBrawlSkill(skill){
 const key=String(skill??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'').replace(/^swffgskillsname/,'');
 return ['brawl','pugilat'].includes(key);
}
/** Per-roll combat profile only. Never creates an owned weapon or alters its damage. */
export function brawlAttackProfile(actor,skill,item={}){
 if(!isBrawlSkill(skill))return item;
 const armed=item?.type==='weapon';
 const profile=armed?JSON.parse(JSON.stringify(item.toObject?item.toObject():item)):{name:game.i18n.localize("SWFFG.UI.Dice.WeaponSelection.Unarmed"),type:'weapon',img:'icons/svg/fist.svg',system:{}};
 if(armed)profile.system=JSON.parse(JSON.stringify(item.system));
 const data=profile.system??={},brawn=Number(actor?.system?.characteristics?.Brawn?.value);
 if(!armed&&!Number.isFinite(brawn))throw Error(game.i18n.localize("SWFFG.UI.Dice.WeaponSelection.MissingBrawnCannotCalculateUnarmedDamage"));
 if(!armed){data.damage={value:brawn,adjusted:brawn};data.range={value:'Engaged',adjusted:'Engaged'};data.skill={value:'Brawl'};data.characteristic={value:'Brawn'};}
 const critical=Number(data.crit?.adjusted??data.crit?.value);data.crit={...(data.crit??{}),value:critical>0?Math.min(5,critical):5,adjusted:critical>0?Math.min(5,critical):5};
 const adjustedQualities=Object.values(data.adjusteditemmodifier??{}).filter(Boolean);
 const qualityList=(adjustedQualities.length?adjustedQualities:Object.values(data.itemmodifier??{}).filter(Boolean)).map(q=>JSON.parse(JSON.stringify(q)));
 for(const [name,rank,aliases]of [['Disorient',1,['disorient','desorientation']],['Knockdown',null,['knockdown','renversement']]]){
  const current=qualityList.find(q=>aliases.includes(cleanQualityName(q.name)));
  if(!current)qualityList.push({name,system:{rank,rank_current:rank}});
 }
 data.adjusteditemmodifier=qualityList;
 profile.flags??={};profile.flags.starwarsffg??={};profile.flags.starwarsffg.rollWeaponSnapshot=true;profile.flags.starwarsffg.brawlAttack={unarmed:!armed,brawn:Number.isFinite(brawn)?brawn:null,source:'SWR02 p.212 / PDF223 ; AoR p.224 / PDF225'};
 return profile;
}

const supported = new Set(['Gunnery', 'Lightsaber', 'Melee', 'RangedLight', 'RangedHeavy', 'Ranged: Light', 'Ranged: Heavy']);
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
const cleanQualityName = name => String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+quality(?:\s+\d+)?$/,'');
export function describeWeaponQuality(quality, language = 'en') {
  const original=String(quality?.name ?? ''), name=cleanQualityName(original),fr=language==='fr';
  const entry=qualityLabels.find(([en,translated])=>name===en||name===cleanQualityName(translated));
  const raw=quality?.system?.rank_current ?? quality?.system?.rank;
  const rank=raw?.value ?? raw;
  const suffix=rank!==undefined&&rank!==null&&rank!==''?` ${rank}`:'';
  if(entry) {
    const mode=entry[2]==='before'?(fr?'choix avant le jet, déclenché après':'choose before rolling, trigger after'):entry[2]==='active'?(fr?'déclenché':'active'):entry[2]==='setting'?(fr?'passif — réglage avant le tir':'passive — set before firing'):(fr?'passif':'passive');
    return `${fr?entry[1]:entry[0]}${suffix} (${mode})`;
  }
  const mods={
    'may select additional jury rigged option mod':'Option supplémentaire de modification artisanale (Jury Rigged)',
    'decreases encumbrance mod':'Réduction de l’encombrement',
  };
  if(mods[name])return `${fr?mods[name]:original}${suffix} (${fr?'modification passive':'passive modification'})`;
  return `${original}${suffix} (${fr?'type non identifié':'unclassified'})`;
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
  return (actor?.items?.contents ?? []).filter(item => item.type === 'weapon' && item.system?.skill?.value === key);
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

export function weaponQualityName(name, language = 'en') {
  const cleaned=cleanQualityName(name);
  const entry=qualityLabels.find(([en,fr])=>cleaned===en||cleaned===cleanQualityName(fr));
  if(entry)return language==='fr'?entry[1]:entry[0];
  if(['auto fire','autofire','automatique'].includes(cleaned))return language==='fr'?'Tir automatique':'Auto-fire';
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

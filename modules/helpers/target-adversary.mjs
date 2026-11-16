import {npcAdversaryRank} from './npc-command-data.mjs';

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '').replace(/^swffgskillsname/, '');
const attackSkills = new Set(['rangedlight','rangedheavy','gunnery','armeslegeres','armeslegere','armeslourdes','artillerie','brawl','pugilat','melee','corpsacorps','lightsaber','sabrelaser']);

export function isTargetedAttack(builder) {
  if (builder.roll.nonAttack) return false;
  const skill = builder.weaponContext?.skillKey ?? builder.roll.item?.system?.skill?.value ?? builder.roll.skillName;
  return ['weapon','shipweapon'].includes(builder.roll.item?.type) || attackSkills.has(normalize(skill));
}

// Use the same acquired ranks as the token badge. Never borrow a pilot's talent for a vehicle.
export function targetAdversaryEffect(builder, targets) {
  if (!isTargetedAttack(builder)) return {rank:0, targets:[]};
  let configured;
  try {configured = game.settings.get('starwarsffg', 'adversaryItemName');} catch { /* Default talent names remain available. */ }
  const entries = targets.filter(token => token.actor?.type !== 'vehicle').map(token => ({
    uuid:token.document.uuid, name:token.name, rank:npcAdversaryRank(token.actor, configured)
  })).filter(entry => entry.rank > 0);
  // A multi-target pool uses the most difficult target, rather than adding unrelated ranks.
  return {rank:Math.max(0, ...entries.map(entry => entry.rank)), targets:entries};
}

// Apply after common difficulty, on a copy. The editable base pool stays intact on target changes.
export function applyTargetAdversary(pool, effect) {
  const result = Object.assign(Object.create(Object.getPrototypeOf(pool)), pool);
  if (effect?.rank > 0) result.upgradeDifficulty(effect.rank);
  return result;
}

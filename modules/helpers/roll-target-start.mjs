import {isTargetedAttack} from './target-adversary.mjs';

// A new attack starts with a deliberate target choice. Re-rendering that roll never calls this.
export async function resetNewRollTarget(pool, {skillName, item, weaponContext, nonAttack = false}) {
  if (!isTargetedAttack({roll:{skillName, item, nonAttack}, weaponContext})) return pool;
  globalThis.canvas?.tokens?.setTargets([], {mode:'replace'});
  // The initial pool may already contain the previous target's range and defence.
  return weaponContext?.makePool ? await weaponContext.makePool(item ?? {}) : pool;
}

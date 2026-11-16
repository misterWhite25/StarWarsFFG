import test from 'node:test';
import assert from 'node:assert/strict';
import {resetNewRollTarget} from '../../modules/helpers/roll-target-start.mjs';

test('each new attack clears the old target before recalculating range and defence', async()=>{
  const targets=new Set(['old']);let clears=0;
  globalThis.canvas={tokens:{setTargets:(ids,options)=>{assert.deepEqual(ids,[]);assert.equal(options.mode,'replace');targets.clear();clears++;}}};
  const old={difficulty:4,setback:3,ability:3};
  const next={difficulty:2,setback:0,ability:3};
  const weaponContext={skillKey:'Ranged: Heavy',makePool:async()=>{assert.equal(targets.size,0);return next;}};
  assert.equal(await resetNewRollTarget(old,{skillName:'Ranged: Heavy',weaponContext}),next);
  assert.equal(clears,1);
  targets.add('new');
  assert.equal(await resetNewRollTarget(old,{skillName:'Ranged: Heavy',weaponContext}),next);
  assert.equal(clears,2);assert.equal(old.setback,3);
  delete globalThis.canvas;
});

test('weaponless combat skills also start empty; non-attacks preserve the current selection', async()=>{
  let clears=0;globalThis.canvas={tokens:{setTargets:()=>clears++}};
  const pool={difficulty:2};
  for(const skillName of ['Melee','Brawl','Lightsaber','Gunnery'])assert.equal(await resetNewRollTarget(pool,{skillName}),pool);
  assert.equal(clears,4);
  await resetNewRollTarget(pool,{skillName:'Astrogation'});
  await resetNewRollTarget(pool,{skillName:'Gunnery',nonAttack:true});
  assert.equal(clears,4);
  delete globalThis.canvas;
});

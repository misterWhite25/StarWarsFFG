import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';
import {isTargetedAttack,targetAdversaryEffect,applyTargetAdversary} from '../../modules/helpers/target-adversary.mjs';

const {DicePoolFFG} = (await loadSystemModule('dice/pool.js',vm.createContext({}),{
  'helpers/gm-difficulty.js':{effectivePool:pool=>pool,gmDifficulty:()=>({enabled:false})}
})).namespace;
const builder = (skill='Ranged: Heavy',nonAttack=false) => ({roll:{skillName:skill,nonAttack}});
const target = (rank,name='Adversary',type='nemesis') => ({name:'Target',document:{uuid:'Scene.s.Token.t'},actor:{type,items:[{id:'t',type:'talent',name,system:{active:true,ranks:{current:rank}}}]}});

test('attack recognition includes melee, unarmed, lightsabers and French skill labels, but excludes non-attacks',()=>{
  for(const skill of ['Ranged: Light','RangedHeavy','Gunnery','Brawl','Melee','Lightsaber','Pugilat','Corps à corps','Sabre laser','SWFFG.SkillsNameRangedHeavy'])assert.equal(isTargetedAttack(builder(skill)),true,skill);
  for(const skill of ['Astrogation','Coercion','Piloting: Space'])assert.equal(isTargetedAttack(builder(skill)),false,skill);
  assert.equal(isTargetedAttack(builder('Gunnery',true)),false);
});

test('Adversary 2 upgrades two purple dice to two red dice, leaving the base and other dice intact',()=>{
  const base=new DicePoolFFG({difficulty:2,setback:2,ability:3,proficiency:1});
  const effect=targetAdversaryEffect(builder(),[target(2,'Adversaire')]);
  for(let i=0;i<5;i++){
    const pool=applyTargetAdversary(base,effect);
    assert.equal(pool.difficulty,0);assert.equal(pool.challenge,2);
    assert.equal(pool.setback,2);assert.equal(pool.ability,3);assert.equal(pool.proficiency,1);
  }
  assert.equal(base.difficulty,2);assert.equal(base.challenge,0);
  const cleared=applyTargetAdversary(base,targetAdversaryEffect(builder(),[]));
  assert.equal(cleared.difficulty,2);assert.equal(cleared.challenge,0);
});

test('ranks exceeding available difficulty dice follow the native upgrade cycle',()=>{
  const base=new DicePoolFFG({difficulty:2,challenge:1});
  const pool=applyTargetAdversary(base,{rank:3});
  assert.equal(pool.difficulty,1);assert.equal(pool.challenge,3);
  const further=applyTargetAdversary(new DicePoolFFG({difficulty:0,challenge:2}),{rank:2});
  assert.equal(further.difficulty,0);assert.equal(further.challenge,3);
});

test('the highest multi-target rank applies once; inactive talents, non-attacks and vehicles do not contribute',()=>{
  assert.equal(targetAdversaryEffect(builder(),[target(1),target(2)]).rank,2);
  const inactive=target(4);inactive.actor.items[0].system.active=false;
  assert.equal(targetAdversaryEffect(builder(),[inactive]).rank,0);
  assert.equal(targetAdversaryEffect(builder('Gunnery',true),[target(2)]).rank,0);
  assert.equal(targetAdversaryEffect(builder(),[target(2,'Adversary','vehicle')]).rank,0);
});

test('learned specialization talents count without double-counting the derived talent list',()=>{
  const selected=target(2,'Adversité');
  selected.actor.talentList=[{name:'Adversité',rank:2,itemId:'t'}];
  assert.equal(targetAdversaryEffect(builder(),[selected]).rank,2);
  selected.actor.items=[{id:'spec',name:'Specialization',type:'specialization',system:{talents:{node:{name:'Adversary',islearned:true,isRanked:true,rank:3}}}}];
  selected.actor.talentList=[];
  assert.equal(targetAdversaryEffect(builder(),[selected]).rank,3);
});

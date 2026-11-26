import assert from 'node:assert/strict';
import test from 'node:test';
import {isAntiFighterWeapon, shipWeaponAttackProfile} from '../../modules/helpers/ship-weapon-profile.mjs';

const marked = {type:'shipweapon', flags:{starwarsffg:{antiFighter:true}}};
const profile = (silhouette, target, weapon=marked, spaceShip=true) =>
  shipWeaponAttackProfile({silhouette, spaceShip}, weapon, target);

test('unmarked ship weapons retain every silhouette difficulty band', () => {
  for(const [target, difficulty] of [[8,1],[7,1],[6,2],[5,2],[4,2],[3,3],[2,4],[1,5]])
    assert.deepEqual(profile(5,target,{}), {effectiveSilhouette:5,difficulty});
});

test('anti-fighter weapons use the reduced silhouette for the whole comparison', () => {
  assert.deepEqual(profile(5,3), {effectiveSilhouette:4,difficulty:2});
  assert.deepEqual(profile(6,3), {effectiveSilhouette:5,difficulty:3});
  assert.deepEqual(profile(5,6), {effectiveSilhouette:4,difficulty:1});
  assert.deepEqual(profile(8,3), {effectiveSilhouette:7,difficulty:5});
  assert.deepEqual(profile('5','3'), {effectiveSilhouette:4,difficulty:2});
});

test('the anti-fighter exception excludes small ships, ground vehicles and personal weapons', () => {
  assert.deepEqual(profile(4,2), {effectiveSilhouette:4,difficulty:3});
  assert.deepEqual(profile(5,3,marked,false), {effectiveSilhouette:5,difficulty:3});
  assert.deepEqual(profile(5,3,{...marked,type:'weapon'}), {effectiveSilhouette:5,difficulty:3});
});

test('anti-fighter marking is explicit and survives plain document copies', () => {
  assert.equal(isAntiFighterWeapon(structuredClone(marked)),true);
  for(const weapon of [undefined, {}, {type:'shipweapon',name:'Laser cannon'},
    {type:'shipweapon',flags:{starwarsffg:{antiFighter:'false'}}},
    {type:'shipweapon',flags:{starwarsffg:{antiFighter:false}}}])
    assert.equal(isAntiFighterWeapon(weapon),false);
});

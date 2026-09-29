import test from 'node:test';
import assert from 'node:assert/strict';
import {summaryTalents} from '../../modules/helpers/talent-summary.js';

test('summary hides creation tools, prioritizes active talents and totals ranked thresholds', () => {
  const talents = [
    {name:'Endurci', isRanked:true, rank:2, activation:'Passive'},
    {name:'Robustesse', isRanked:true, rank:2, activation:'Passive'},
    {name:'Augmenter un attribut', activation:'Passive'},
    {name:'Objet renommé', itemId:'creation'},
    {name:'Visée juste', activation:'Active (Maneuver)'},
    {name:'Entraînement', rank:1, characteristicChoice:'Ruse', activation:'Passive'}
  ];
  const actor = {talentList:talents, items:new Map([['creation',{flags:{starwarsffg:{characteristicIncrease:{creationTool:true}}}}]])};
  const rows = summaryTalents(actor);
  assert.equal(rows.length,4);
  assert.equal(rows[0].name,'Visée juste');
  assert.equal(rows[0].active,true);
  assert.equal(rows.find(r=>r.name==='Endurci').total,'Bonus total : +4 au seuil de blessures.');
  assert.equal(rows.find(r=>r.name==='Robustesse').total,'Bonus total : +2 au seuil de stress.');
  assert.equal(rows.find(r=>r.name==='Entraînement').characteristicChoice,'Ruse');
  assert.equal(talents.length,6);
  assert.equal(talents[0].total,undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {FACTIONS,suggestVehicleAffiliations,getVehicleAffiliations} from '../../modules/helpers/vehicle-factions-model.mjs';
test('known families get conservative suggestions while unknown models stay unclassified',()=>{
  assert.deepEqual(suggestVehicleAffiliations({name:'T-65B X-wing Starfighter'}),['alliance']);
  assert.deepEqual(suggestVehicleAffiliations({key:'vehicle.btl-s3',name:'BTL-S3 Y-wing Starfighter'}),['alliance']);
  assert.deepEqual(suggestVehicleAffiliations({name:'Chasseur TIE/LN'}),['empire']);
  assert.deepEqual(suggestVehicleAffiliations({name:'Imperial I-class Star Destroyer'}),['empire']);
  assert.deepEqual(suggestVehicleAffiliations({name:'Vaisseau personnel inconnu'}),[]);
  assert.deepEqual(suggestVehicleAffiliations({name:'Frontier Explorer'}),[]);
});
test('Nebulon-B is available to every faction, without treating other Nebulon models likewise',()=>{
  const all=FACTIONS.map(f=>f.id);assert.deepEqual(suggestVehicleAffiliations({name:'EF76 Nebulon-B Escort Frigate'}),all);
  assert.deepEqual(suggestVehicleAffiliations({name:'Nebulon-Q Racing Swoop'}),[]);
});
test('explicit model metadata and UUID overrides take priority over suggestions',()=>{
  const entry={uuid:'Actor.ship',name:'TIE/LN',flags:{starwarsffg:{fleetAffiliations:['alliance','pirates']}}};
  assert.deepEqual(getVehicleAffiliations(entry),['alliance','pirates']);
  assert.deepEqual(getVehicleAffiliations(entry,{'Actor.ship':['hutt']}),['hutt']);
  assert.deepEqual(getVehicleAffiliations(entry,{'Actor.ship':[]}),[]);
  assert.deepEqual(getVehicleAffiliations({name:'Inconnu'}),[]);
});

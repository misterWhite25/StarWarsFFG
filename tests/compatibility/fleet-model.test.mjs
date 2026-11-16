import test from 'node:test';
import assert from 'node:assert/strict';
import {FACTIONS,FLEET_PRESETS,suggestFleetAffiliations,getFleetAffiliations,matchesFleetFaction,validateFleetRows,getFleetPreset,vehicleClass} from '../../modules/helpers/fleet-model.mjs';
test('known families get conservative suggestions while unknown models stay unclassified',()=>{
  assert.deepEqual(suggestFleetAffiliations({name:'T-65B X-wing Starfighter'}),['alliance']);
  assert.deepEqual(suggestFleetAffiliations({key:'vehicle.btl-s3',name:'BTL-S3 Y-wing Starfighter'}),['alliance']);
  assert.deepEqual(suggestFleetAffiliations({name:'Chasseur TIE/LN'}),['empire']);
  assert.deepEqual(suggestFleetAffiliations({name:'Imperial I-class Star Destroyer'}),['empire']);
  assert.deepEqual(suggestFleetAffiliations({name:'Vaisseau personnel inconnu'}),[]);
  assert.deepEqual(suggestFleetAffiliations({name:'Frontier Explorer'}),[]);
});
test('vehicle categories use known craft or useful scale while leaving small unknown transports unclassified',()=>{
  assert.equal(vehicleClass({name:'BTL-A4 Y-Wing'}),'fighter');
  assert.equal(vehicleClass({name:'EF76 Nebulon-B',silhouette:5}),'escort');
  assert.equal(vehicleClass({name:'Imperial Star Destroyer'}),'capital');
  assert.equal(vehicleClass({name:'Navette inconnue',silhouette:3}),'unknown');
  assert.equal(vehicleClass({name:'Chasseur terrestre',spaceShip:false}),'unknown');
});
test('Nebulon-B is available to every faction, without treating other Nebulon models likewise',()=>{
  const all=FACTIONS.map(f=>f.id);assert.deepEqual(suggestFleetAffiliations({name:'EF76 Nebulon-B Escort Frigate'}),all);
  assert.deepEqual(suggestFleetAffiliations({name:'Nebulon-Q Racing Swoop'}),[]);
});
test('explicit model metadata and UUID overrides take priority over suggestions',()=>{
  const entry={uuid:'Actor.ship',name:'TIE/LN',flags:{starwarsffg:{fleetAffiliations:['alliance','pirates']}}};
  assert.deepEqual(getFleetAffiliations(entry),['alliance','pirates']);assert.equal(matchesFleetFaction(entry,'empire'),false);
  assert.deepEqual(getFleetAffiliations(entry,{'Actor.ship':['hutt']}),['hutt']);
  assert.deepEqual(getFleetAffiliations(entry,{'Actor.ship':[]}),[]);
  assert.equal(matchesFleetFaction({affiliations:['alliance']},'alliance'),true);
  assert.deepEqual(getFleetAffiliations({name:'Inconnu'}),[]);
});
test('editable presets are fresh copies and the squadron starts at six fighters',()=>{
  assert.equal(FLEET_PRESETS.squadron.fighters,6);const preset=getFleetPreset('squadron');preset.fighters=4;assert.equal(getFleetPreset('squadron').fighters,6);
  assert.throws(()=>getFleetPreset('__proto__'));
});
test('fleet row validation admits mixed crew types and rejects unsafe quantities and document references',()=>{
  const rows=validateFleetRows([{uuid:'Actor.xwing',count:'4',crewType:'minion'},{uuid:'Compendium.mod.actors.Actor.ship',count:2,crewType:'rival',astromech:'yes'}]);
  assert.deepEqual(rows[0],{uuid:'Actor.xwing',count:4,crewType:'minion',quality:'standard',astromech:'auto'});assert.equal(rows[1].count,2);
  for(const count of [0,-1,1.5,Infinity,101])assert.throws(()=>validateFleetRows([{uuid:'Actor.ship',count}]));
  assert.throws(()=>validateFleetRows([{uuid:'Scene.scene.Token.token',count:1}]));
  assert.throws(()=>validateFleetRows([{uuid:'Actor.ship',count:1,crewType:'vehicle'}]));
  assert.throws(()=>validateFleetRows([{uuid:'Actor.ship',count:100},{uuid:'Actor.ship2',count:100}],{maxShips:199}));
});

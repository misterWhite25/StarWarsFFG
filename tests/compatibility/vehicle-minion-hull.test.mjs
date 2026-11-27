import {linkWithSystemLocalization} from '../load-system-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {vehicleMinionGroup,vehicleDamageResource,convertVehicleMinionStress} from '../../modules/helpers/vehicle-minion-group.mjs';
const vehicle=(enabled=true)=>({type:'vehicle',flags:{starwarsffg:{vehicleMinionGroup:{enabled,count:3}}},system:{stats:{hullTrauma:{max:10,value:4},systemStrain:{max:8,value:0}}}});
test('group hull is aggregate without overwriting the individual threshold',()=>{
 const actor=vehicle(),data=vehicleMinionGroup(actor);assert.equal(data.totalHull,30);assert.equal(actor.system.stats.hullTrauma.max,10);
 actor.flags.starwarsffg.vehicleMinionGroup.count=5;assert.equal(vehicleMinionGroup(actor).totalHull,50);assert.equal(actor.system.stats.hullTrauma.max,10);
});
test('mechanical stress damage targets hull, preserving individual vehicles',()=>{
 assert.equal(vehicleDamageResource(vehicle(),'systemStrain'),'hullTrauma');assert.equal(vehicleDamageResource(vehicle(false),'systemStrain'),'systemStrain');
 assert.equal(vehicleDamageResource(vehicle(),'hullTrauma'),'hullTrauma');
 for(const changes of [{'system.stats.systemStrain.value':2},{system:{stats:{systemStrain:{value:2}}}}]){
  convertVehicleMinionStress(vehicle(),changes);
  assert.equal(changes.system?.stats?.hullTrauma?.value??changes['system.stats.hullTrauma.value'],6);
  assert.equal(changes.system?.stats?.systemStrain?.value??changes['system.stats.systemStrain.value'],0);
 }
 const mixed={'system.stats.hullTrauma.value':9,'system.stats.systemStrain.value':3};convertVehicleMinionStress(vehicle(),mixed);assert.equal(mixed['system.stats.hullTrauma.value'],12);
 const negative={'system.stats.systemStrain.value':-2};convertVehicleMinionStress(vehicle(),negative);assert.equal(negative['system.stats.systemStrain.value'],0);assert.equal(negative.system,undefined);
 const regular={'system.stats.systemStrain.value':2};convertVehicleMinionStress(vehicle(false),regular);assert.equal(regular['system.stats.systemStrain.value'],2);
});
test('native token bars use group hull and suppress mechanical strain only for groups',async()=>{
 const context=vm.createContext({CONFIG:{Token:{documentClass:class{getBarAttribute(_name,{alternative}={}){return {attribute:alternative,value:4,max:10};}}}}});
 const helper=new vm.SourceTextModule(await fs.readFile(new URL('../../modules/helpers/vehicle-minion-group.mjs',import.meta.url),'utf8'),{context});await linkWithSystemLocalization(helper, context, ()=>{});
 const tokens=new vm.SourceTextModule(await fs.readFile(new URL('../../modules/helpers/vehicle-minion-tokens.mjs',import.meta.url),'utf8'),{context});await tokens.link(()=>helper);await tokens.evaluate();tokens.namespace.registerVehicleMinionTokens();
 const token=new context.CONFIG.Token.documentClass();token.actor=vehicle();assert.equal(token.getBarAttribute('bar1',{alternative:'stats.hullTrauma'}).max,30);assert.equal(token.getBarAttribute('bar2',{alternative:'stats.systemStrain'}),null);
 token.actor=vehicle(false);assert.equal(token.getBarAttribute('bar1',{alternative:'stats.hullTrauma'}).max,10);assert.notEqual(token.getBarAttribute('bar2',{alternative:'stats.systemStrain'}),null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadActorModule} from '../load-system-module.mjs';
const ledger='swffg-compendium-bilingual-steelers-core_rule';
async function create({type='vehicle',capacity,pack=null,parent=null}={}){
  const updates=[],context=vm.createContext({Actor:class {toObject(){return {type:this.type,flags:this.flags,system:this.system};}updateSource(update){if(Object.keys(update).length)updates.push(update);}},game:{user:{id:'gm'}}});
  const {ActorFFG}=(await loadActorModule(context)).namespace,actor=new ActorFFG();
  Object.assign(actor,{type,pack,parent,flags:{starwarsffg:{...(capacity===undefined?{}:{fuelCapacity:capacity})},[ledger]:{voyageResources:{resources:{fuel:3,hours:24}}}}});
  await actor._preCreate({type,img:'ship.webp'},{},{id:'gm'});return {updates,actor};
}
test('new world vehicles start at default or custom maximum without touching consumables',async()=>{
  const path='flags.'+ledger+'.voyageResources.resources.fuel';
  for(const [capacity,expected]of [[undefined,50],[120,120],[0,0]]){
    const {updates,actor}=await create({capacity});
    assert.equal(updates.length,1);assert.equal(updates[0][path],expected);assert.equal(Object.keys(updates[0]).length,1);
    assert.equal(actor.flags[ledger].voyageResources.resources.hours,24);
  }
});
test('compendium documents, embedded actors and characters do not get refueled',async()=>{
  for(const options of [{pack:'world.models'},{parent:{}},{type:'rival'},{capacity:-1},{capacity:'invalid'}])assert.equal((await create(options)).updates.length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('training acquisitions stay separate and show their characteristic while ordinary ranked talents merge',async()=>{
 const context=vm.createContext({Actor:class{},CONFIG:{FFG:{theme:'starwars'}},game:{settings:{get:()=>false}}});
 const read=path=>readFile(new URL('../../modules/'+path,import.meta.url),'utf8');
 const mod=new vm.SourceTextModule(await read('actors/actor-ffg.js'),{context});
 await mod.link(async spec=>spec.includes('characteristic-increase')?new vm.SourceTextModule(await read('helpers/characteristic-increase.js'),{context}):new vm.SyntheticModule(['default','getPreparedActiveEffectChanges'],function(){this.setExport('default',class{});this.setExport('getPreparedActiveEffectChanges',()=>[]);},{context}));
 await mod.evaluate();const actor=new mod.namespace.ActorFFG();
 const item=(id,name,choice)=>({id,name,type:'talent',system:{activation:{value:'Passive'},ranks:{ranked:true,current:1}},flags:choice?{starwarsffg:{characteristicIncrease:{characteristic:choice}}}:{}});
 actor.items=[item('one','Entraînement','Brawn'),item('two','Entraînement','Willpower'),item('three','Ordinaire'),item('four','Ordinaire')];
 actor._prepareCharacterData(actor);
 assert.equal(actor.talentList.length,3);
 assert.deepEqual(Array.from(actor.talentList.filter(i=>i.name==='Entraînement'),i=>i.characteristicChoice),['Vigueur','Volonté']);
 assert.equal(actor.talentList.find(i=>i.name==='Ordinaire').rank,2);
});

test('a configured training acquisition replaces its matching specialization row',async()=>{
 const context=vm.createContext({Actor:class{},CONFIG:{FFG:{theme:'starwars'}},game:{settings:{get:()=>false}}});
 const read=path=>readFile(new URL('../../modules/'+path,import.meta.url),'utf8');
 const mod=new vm.SourceTextModule(await read('actors/actor-ffg.js'),{context});
 await mod.link(async spec=>spec.includes('characteristic-increase')?new vm.SourceTextModule(await read('helpers/characteristic-increase.js'),{context}):new vm.SyntheticModule(['default','getPreparedActiveEffectChanges'],function(){this.setExport('default',class{});this.setExport('getPreparedActiveEffectChanges',()=>[]);},{context}));
 await mod.evaluate();const actor=new mod.namespace.ActorFFG();
 actor.items=[
  {id:'commando',name:'Commando',type:'specialization',system:{talents:{talent7:{name:'Entraînement',islearned:true,isRanked:true,activation:'Passive'}}}},
  {id:'training',name:'Entraînement',type:'talent',system:{activation:{value:'Passive'},ranks:{ranked:true,current:1}},flags:{starwarsffg:{characteristicIncrease:{characteristic:'Agility',sourceSpecializationId:'commando',sourceTalentKey:'talent7'}}}}
 ];
 actor._prepareCharacterData(actor);
 assert.equal(actor.talentList.length,1);
 assert.equal(actor.talentList[0].itemId,'training');
 assert.equal(actor.talentList[0].characteristicChoice,'Agilité');
});

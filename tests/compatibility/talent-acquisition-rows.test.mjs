import {systemI18n} from '../system-i18n.mjs';
const i18n=await systemI18n('fr');
import {loadActorModule} from '../load-system-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
test('training acquisitions stay separate and show their characteristic while ordinary ranked talents merge',async()=>{
 const context=vm.createContext({Actor:class{},CONFIG:{FFG:{theme:'starwars'}},game:{i18n,settings:{get:()=>false}}});
 const mod = await loadActorModule(context);const actor=new mod.namespace.ActorFFG();
 const item=(id,name,choice)=>({id,name,type:'talent',system:{activation:{value:'Passive'},ranks:{ranked:true,current:1}},flags:choice?{starwarsffg:{characteristicIncrease:{characteristic:choice}}}:{}});
 actor.items=[item('one','Entraînement','Brawn'),item('two','Entraînement','Willpower'),item('three','Ordinaire'),item('four','Ordinaire')];
 actor._prepareCharacterData(actor);
 assert.equal(actor.talentList.length,3);
 assert.deepEqual(Array.from(actor.talentList.filter(i=>i.name==='Entraînement'),i=>i.characteristicChoice),['Vigueur','Volonté']);
 assert.equal(actor.talentList.find(i=>i.name==='Ordinaire').rank,2);
});

test('a configured training acquisition replaces its matching specialization row',async()=>{
 const context=vm.createContext({Actor:class{},CONFIG:{FFG:{theme:'starwars'}},game:{i18n,settings:{get:()=>false}}});
 const mod = await loadActorModule(context);const actor=new mod.namespace.ActorFFG();
 actor.items=[
  {id:'commando',name:'Commando',type:'specialization',system:{talents:{talent7:{name:'Entraînement',islearned:true,isRanked:true,activation:'Passive'}}}},
  {id:'training',name:'Entraînement',type:'talent',system:{activation:{value:'Passive'},ranks:{ranked:true,current:1}},flags:{starwarsffg:{characteristicIncrease:{characteristic:'Agility',sourceSpecializationId:'commando',sourceTalentKey:'talent7'}}}}
 ];
 actor._prepareCharacterData(actor);
 assert.equal(actor.talentList.length,1);
 assert.equal(actor.talentList[0].itemId,'training');
 assert.equal(actor.talentList[0].characteristicChoice,'Agilité');
});

test('a ranked specialization talent keeps the slots of both acquisitions for its choice controls', async () => {
 const context = vm.createContext({Actor:class{},CONFIG:{FFG:{theme:'starwars'}},game:{i18n,settings:{get:()=>false}}});
 const mod = await loadActorModule(context);
 const actor = new mod.namespace.ActorFFG();
 const node = {name:'Entraînement',islearned:true,isRanked:true};
 actor.items = [{id:'spec',name:'Spécialisation',type:'specialization',system:{talents:{talent3:node,talent9:node}}}];
 actor._prepareCharacterData(actor);
 assert.equal(actor.talentList.length,1);
 assert.deepEqual(Array.from(actor.talentList[0].source, s=>[s.id,s.slot]),[['spec','talent3'],['spec','talent9']]);
});

test('activation grouping keeps the name order within each group and accepts missing legacy activations', async () => {
  const context = vm.createContext({Actor:class{},CONFIG:{FFG:{theme:'starwars'}},game:{i18n,settings:{get:()=>true}}});
  const {ActorFFG} = (await loadActorModule(context)).namespace;
  const actor = new ActorFFG();
  actor.items = [
    ['Zulu', 'Passive'], ['Beta', 'Active (Maneuver)'], ['Legacy'], ['Foxtrot', 'Active (Incidental)'],
    ['Alpha', 'Passive'], ['Romeo', 'Active (Incidental, Out of Turn)'], ['Echo', 'Active (Action)'],
    ['Able', 'Active (Maneuver)']
  ].map(([name,activation])=>({id:name, type:'talent', name, system:{activation:{value:activation}}}));
  actor._prepareCharacterData(actor);
  assert.deepEqual(Array.from(actor.talentList,row=>row.name), ['Romeo','Able','Beta','Foxtrot','Echo','Alpha','Zulu','Legacy']);
  actor.flags = {config:{talentSorting:'2'}};
  actor._prepareCharacterData(actor);
  assert.deepEqual(Array.from(actor.talentList,row=>row.name), ['Able','Alpha','Beta','Echo','Foxtrot','Legacy','Romeo','Zulu']);
});

test('minion talent rows retain unranked copies, source order and the combined tier', async () => {
  const context = vm.createContext({Actor:class{},CONFIG:{FFG:{theme:'genesys'}},game:{i18n,settings:{get:()=>false}}});
  const {ActorFFG} = (await loadActorModule(context)).namespace;
  const actor = new ActorFFG();
  actor.system = {unit_wounds:{value:2},quantity:{max:3},stats:{wounds:{value:0}},skills:{}};
  const talent = (id,name,ranked)=>({id,type:'talent',name,system:{tier:2,ranks:{ranked,current:1}}});
  actor.items = [talent('a','Repeat',false),talent('b','Tough',true),talent('c','Repeat',false),talent('d','Tough',true)];
  actor._prepareMinionData(actor);
  assert.deepEqual(Array.from(actor.talentList,row=>[row.name,row.rank,row.tier,Array.from(row.source,source=>source.id)]),[
    ['Repeat','N/A',2,['a']], ['Repeat','N/A',2,['c']], ['Tough',2,3,['b','d']]
  ]);
});

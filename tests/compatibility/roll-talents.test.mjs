import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
async function load() {
 const context=vm.createContext({game:{i18n:{lang:'fr'},combat:{id:'fight',round:2,started:true}},foundry:{utils:{getProperty:(object,path)=>path.split('.').reduce((value,key)=>value?.[key],object)}}});
 const module=new vm.SourceTextModule(await readFile(new URL('../../modules/helpers/roll-talents.js',import.meta.url),'utf8'),{context});await module.link(()=>{});await module.evaluate();
 return {api:module.namespace,game:context.game};
}
function actor() {
 return {isOwner:true,system:{stats:{strain:{value:2}}},flags:{starwarsffg:{rollTalentUsage:{}}},
 talentList:[{name:'Concentration Intense',isRanked:false},{name:'Attaque frénétique',isRanked:true,rank:2},{name:'Visée précise',isRanked:true,rank:2}],
 getFlag(_scope,key){return this.flags.starwarsffg[key];},
 async update(data){for(const [path,value]of Object.entries(data)){const parts=path.split('.');let target=this;for(const part of parts.slice(0,-1)){target[part]??={};target=target[part];}target[parts.at(-1)]=value;}}};
}
test('only acquired and compatible talents are available; preview does not mutate pool or charge strain',async()=>{
 const {api}=await load(),pc=actor();
 assert.equal(api.rollTalentOptions(pc,'Melee').length,2);assert.equal(api.rollTalentOptions(pc,'Computers').length,1);
 assert.equal(api.rollTalentOptions(pc,'Melee').some(option=>option.id==='true-aim'),false);
 assert.equal(api.rollTalentOptions(pc,'Lightsaber').some(option=>option.id==='true-aim'),false);
 assert.equal(api.rollTalentOptions(pc,'SWFFG.SkillsNameRangedHeavy').length,2);
 assert.equal(api.rollTalentOptions({talentList:[]},'Melee').length,0);
 const selected=api.selectedRollTalents(pc,'Melee',[{id:'frenzied-attack',amount:2}]);
 const pool={ability:1,proficiency:1,boost:0,difficulty:2};
 const preview=api.rollTalentPool(pool,selected);
 assert.equal(preview.ability,1);assert.equal(preview.proficiency,2);assert.equal(preview.difficulty,2);
 assert.equal(pool.proficiency,1);assert.equal(pc.system.stats.strain.value,2);
 assert.throws(()=>api.selectedRollTalents(pc,'Melee',[{id:'frenzied-attack',amount:3}]));
 assert.throws(()=>api.selectedRollTalents(pc,'Computers',[{id:'frenzied-attack',amount:1}]));
 assert.equal(api.selectedRollTalents(pc,'Melee',[{id:'intense-focus'}])[0].maneuvers,1);
});
test('posting charges exact strain and round usage, blocks repeat True Aim, and failure restores costs',async()=>{
 const {api,game}=await load(),pc=actor();
 const selections=[{id:'intense-focus',confirmed:true},{id:'frenzied-attack',amount:2}];
 const transaction=await api.commitRollTalents(pc,'Melee',selections);
 const aim=await api.commitRollTalents(pc,'Ranged: Light',[{id:'true-aim',confirmed:true}]);
 assert.equal(pc.system.stats.strain.value,5);assert.equal(pc.getFlag('starwarsffg','rollTalentUsage')['true-aim'],'fight:2');
 assert.equal(api.rollTalentPool({ability:2,proficiency:1,boost:0},aim.selections).boost,1);
 await assert.rejects(()=>api.commitRollTalents(pc,'Ranged: Light',[{id:'true-aim',confirmed:true}]));
 await api.rollbackRollTalents(pc,aim);
 await api.rollbackRollTalents(pc,transaction);assert.equal(pc.system.stats.strain.value,2);
 assert.equal(api.rollTalentOptions(pc,'Ranged: Light').find(option=>option.id==='true-aim').blocked,false);
 await api.commitRollTalents(pc,'Ranged: Light',[{id:'true-aim',confirmed:true}]);game.combat.round=3;
 assert.equal(api.rollTalentOptions(pc,'Ranged: Light').find(option=>option.id==='true-aim').blocked,false);
 pc.isOwner=false;await assert.rejects(()=>api.commitRollTalents(pc,'Melee',[{id:'intense-focus',confirmed:true}]));
});
test('rollback preserves later actor changes and ranks are summed from acquired talents',async()=>{
 const {api}=await load(),pc=actor();pc.talentList.push({name:'Attaque frénétique',isRanked:true,rank:1});
 assert.equal(api.talentRank(pc,['Frenzied Attack','Attaque frénétique']),3);
 const transaction=await api.commitRollTalents(pc,'Melee',[{id:'frenzied-attack',amount:3}]);
 pc.system.stats.strain.value=9;await assert.rejects(()=>api.rollbackRollTalents(pc,transaction));assert.equal(pc.system.stats.strain.value,9);
});

test('Visée juste from the French compendium is available on ranged rolls and previews its rank without charging',async()=>{
 const {api}=await load(),pc=actor();
 pc.talentList=[{name:'Visée juste',isRanked:true,rank:1}];
 for(const skill of ['Armes légères','Ranged: Light','SWFFG.SkillsNameRangedLight','Armes lourdes','Artillerie']) {
  const options=api.rollTalentOptions(pc,skill);
  assert.equal(options.length,1,skill);assert.equal(options[0].name,'Visée juste');assert.equal(options[0].rank,1);
  const selected=api.selectedRollTalents(pc,skill,[{id:'true-aim',confirmed:true}]);
  const pool={ability:1,proficiency:2,boost:0,difficulty:2};
  const preview=api.rollTalentPool(pool,selected);
  assert.equal(preview.ability,0);assert.equal(preview.proficiency,3);assert.equal(preview.boost,1);
  assert.equal(pool.ability,1);assert.equal(pool.boost,0);assert.equal(pc.system.stats.strain.value,2);
 }
 assert.equal(api.rollTalentOptions(pc,'Corps à corps').length,0);
 assert.equal(api.rollTalentOptions(pc,'Informatique').length,0);
 for(const name of ['True Aim','Visée précise']) {
  pc.talentList[0].name=name;assert.equal(api.rollTalentOptions(pc,'Armes légères')[0].id,'true-aim');
 }
});

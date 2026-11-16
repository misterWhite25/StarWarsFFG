import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeItemQualities,careerSkillChoices,actorItemDescriptions} from '../../modules/helpers/item-view-data.mjs';
const mod=(name,rank,active=true)=>({_id:name,name,img:name+'.svg',system:{rank,active,description:'Description '+name}});

test('qualities combine direct and active attached ranks without changing source records',()=>{
  const system={itemmodifier:[mod('Accurate',1),mod('Accurate',2),null],itemattachment:[null,{name:'Scope',system:{itemmodifier:[mod('Accurate',2),mod('Pierce',1),mod('Inaccurate',3,false)]}},{name:'Barrel',system:{itemmodifier:[mod('Pierce',2)]}}]};
  const before=structuredClone(system),result=summarizeItemQualities(system);
  assert.equal(result.length,2);assert.deepEqual(result[0],{name:'Accurate',img:'Accurate.svg',description:'Description Accurate',itemIndex:0,totalRanks:5,modId:'Accurate',includeControls:true,summarizedRanks:{mods:3,Scope:2}});
  assert.equal(result[1].totalRanks,3);assert.equal(result[1].includeControls,false);assert.deepEqual(result[1].summarizedRanks,{Scope:1,Barrel:2});
  assert.deepEqual(system,before);result[0].summarizedRanks.mods=999;assert.equal(system.itemmodifier[0].system.rank,1);
});
test('missing modifiers and special source names stay valid',()=>{
  assert.deepEqual(summarizeItemQualities(),[]);
  const result=summarizeItemQualities({itemmodifier:[mod('Accurate',1)],itemattachment:[{name:'__proto__',system:{itemmodifier:[mod('Accurate',2)]}}]});
  assert.equal(result[0].totalRanks,3);assert.equal(Object.getPrototypeOf(result[0].summarizedRanks),Object.prototype);assert.equal(result[0].summarizedRanks.__proto__,2);
});
test('career choices contain only select-menu fields and reflect current custom skills',()=>{
  const source={Custom:{value:0,label:'Custom skill',rank:3,ranksource:[{name:'Big source',data:'x'.repeat(10000)}]}};
  const choices=careerSkillChoices(source);assert.deepEqual(choices.Custom,{value:0,label:'Custom skill'});assert.equal(choices['(none)'].label,'SWFFG.CareerSkills.None');
  choices.Custom.label='Display only';assert.equal(source.Custom.label,'Custom skill');source.Custom.label='Renamed';assert.equal(careerSkillChoices(source).Custom.label,'Renamed');
  assert(JSON.stringify(choices).length<JSON.stringify(source).length/20);
});
test('only displayed narrative descriptions are rendered with the correct actor, never persisted',async()=>{
  const actor={id:'a'},items=Array.from({length:300},(_,i)=>({id:'w'+i,type:'weapon',system:{description:'Large weapon description',renderedDesc:'Unchanged'}}));
  for(const type of ['obligation','duty','morality','motivation','background'])items.push({id:type,type,system:{description:'[AB] '+type}});
  items.push({id:'empty',type:'background',system:{description:''}});
  const before=structuredClone(items),calls=[];
  const descriptions=await actorItemDescriptions(items,actor,async(description,owner)=>{calls.push(description);assert.equal(owner,actor);return 'HTML '+description;});
  assert.equal(calls.length,5);assert.equal(Object.keys(descriptions).length,6);assert.equal(descriptions.background,'HTML [AB] background');assert.equal(descriptions.empty,'');assert.equal(descriptions.w0,undefined);assert.deepEqual(items,before);
});

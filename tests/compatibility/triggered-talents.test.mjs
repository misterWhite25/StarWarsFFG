import test from 'node:test';
import assert from 'node:assert/strict';
import {triggeredTalentOptions as options,launchTriggeredTalent as launch} from '../../modules/helpers/triggered-talents.js';
const item=(name,rank=1)=>({id:name,type:'talent',name,system:{description:'Règle du talent',ranks:{ranked:true,current:rank}}});
function actor(items=[]){return {id:'a',uuid:'Actor.a',isOwner:true,items,system:{stats:{strain:{value:2,max:12},forcePool:{value:0,max:0}},characteristics:{Intellect:{value:3},Presence:{value:4},Brawn:{value:2},Willpower:{value:2}},skills:{Mechanics:{value:'Mechanics',label:'Mécanique',rank:1,boost:2,remsetback:1,characteristic:'Intellect'},Medicine:{value:'Medicine',rank:1,characteristic:'Intellect'},Leadership:{value:'Leadership',rank:2,characteristic:'Presence'},Discipline:{value:'Discipline',rank:1,characteristic:'Willpower'},PilotingPlanetary:{value:'PilotingPlanetary',rank:1,characteristic:'Intellect'},PilotingSpace:{value:'PilotingSpace',rank:1,characteristic:'Intellect'},Education:{value:'Education',rank:1,type:'Knowledge',characteristic:'Intellect'},Lightsaber:{value:'Lightsaber',rank:2,characteristic:'Brawn'},Resilience:{value:'Resilience',rank:1,characteristic:'Brawn'},Underworld:{value:'Underworld',rank:2,characteristic:'Intellect'},Streetwise:{value:'Streetwise',rank:2,characteristic:'Intellect'}}}};}
test('Bad Motivator and its English name open the real Mechanics check at Hard',async()=>{
 for(const name of ['Défaut de motivateur','Bad Motivator']){const a=actor([item(name)]);assert.equal(options(a).length,1);assert.equal(options(a)[0].difficulty,3);let args;
 await launch({actor:a},'badm','Mechanics',(...values)=>{args=values;return 'normal dialog';});
 assert.equal(args[0].rank,1);assert.equal(args[0].boost,2);assert.equal(args[0].remsetback,1);assert.equal(args[1],a.system.characteristics.Intellect);assert.equal(args[2],3);assert.equal(args[3].document,a);assert.equal(args[6].actor,a);assert.equal(args[6].nonAttack,true);
 }
});
test('only acquired active talents appear, including learned specialization slots, without duplicate buttons',()=>{
 const a=actor([{id:'tree',type:'specialization',system:{talents:{a:{name:'Défaut de motivateur',islearned:true},b:{name:'Bricoleur',islearned:false}}}},item('Défaut de motivateur')]);
 assert.deepEqual(options(a).map(o=>o.id),['badm']);a.items[0].system.talents.a.islearned=false;a.items[1].system.active=false;assert.equal(options(a).length,0);
 a.isOwner=false;assert.equal(options(a).length,0);
});
test('a removed or disabled talent cannot be launched from a stale picker and invalid skills are rejected',async()=>{
 const a=actor([item('Défaut de motivateur')]);const selected=options(a)[0];a.items=[];let called=0;
 await assert.rejects(()=>launch({actor:a},selected.id,'Mechanics',()=>called++));assert.equal(called,0);
 a.items=[item('Défaut de motivateur')];await assert.rejects(()=>launch({actor:a},'badm','Medicine',()=>called++));assert.equal(called,0);
});
test('opening and cancelling preparation changes neither strain nor actor or talent data',async()=>{
 const a=actor([item('Pleins Gaz'),item('Pleins Gaz (Amélioré)')]);const before=JSON.stringify(a);
 assert.equal(options(a).find(o=>o.id==='fullthimp').difficulty,2);await launch({actor:a},'fullthimp','PilotingSpace',()=>null);assert.equal(JSON.stringify(a),before);
});
test('improved options require their base action and allow the actual eligible skills',()=>{
 const a=actor([item('Dose de Stimulant (Amélioré)')]);assert.equal(options(a).length,0);a.items.push(item('Dose de Stimulant'));
 assert.equal(options(a).find(o=>o.id==='stimap').difficulty,2);assert.equal(options(a).find(o=>o.id==='stimapimp').difficulty,3);
 a.items=[item('Pleins Gaz')];assert.deepEqual(options(a)[0].skills,['PilotingPlanetary','PilotingSpace']);
});
test('Hard Headed difficulty follows actual acquired ranks and stops at Easy',()=>{
 const a=actor([item('Tête dure',2)]);assert.equal(options(a)[0].difficulty,3);a.items[0].system.ranks.current=8;assert.equal(options(a)[0].difficulty,1);
});
test('Street Smarts improved uses the base talent ranks rather than the improved talent count',()=>{
 const a=actor([item('Street Smarts (Improved)'),item('Dégourdi',2)]);assert.equal(options(a).find(o=>o.id==='strsmartimp').difficulty,3);
});
test('Makashi Flourish uses Presence without changing the stored Lightsaber skill',async()=>{
 const a=actor([item('Makashi Flourish')]);a.system.stats.forcePool.max=1;let args;await launch({actor:a},'makflour','Lightsaber',(...values)=>args=values);
 assert.equal(args[0].characteristic,'Presence');assert.equal(args[1],a.system.characteristics.Presence);assert.equal(a.system.skills.Lightsaber.characteristic,'Brawn');
});
test('Against All Odds includes available Force dice and non-Force-sensitive actors cannot use Force talents',async()=>{
 const a=actor([item('Against All Odds')]);assert.equal(options(a).length,0);a.system.stats.forcePool={max:3,value:1};let args;
 await launch({actor:a},'aao','Resilience',(...values)=>args=values);assert.equal(args[0].force,2);assert.equal(args[2],3);assert.equal(a.system.skills.Resilience.force,undefined);
});
test('Thorough Assessment offers Knowledge skills only and modifiers of existing checks are not separate actions',()=>{
 const a=actor([item('Thorough Assessment'),item('Expert en Médecine'),item('Concentration Intense')]);assert.deepEqual(options(a).map(o=>o.id),['thorass']);assert.deepEqual(options(a)[0].skills,['Education']);
});

test('improved Hard Headed uses base ranks and never goes below Easy',()=>{const a=actor([item('Hard Headed',2),item('Hard Headed (Improved)')]);assert.equal(options(a).find(o=>o.id==='hardhdimp').difficulty,3);a.items[0].system.ranks.current=9;assert.equal(options(a).find(o=>o.id==='hardhdimp').difficulty,1);});
test('rank zero does not grant a triggered talent',()=>{const a=actor([item('Défaut de motivateur',0)]);assert.equal(options(a).length,0);});

test('the talent picker passes an attribute-free root to Foundry DialogV2, retaining its inner styles',async()=>{
 const {showTriggeredTalents}=await import('../../modules/helpers/triggered-talents.js');
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.attrs=new Map();this.events={};}
  set className(value){this.attrs.set('class',value);}get className(){return this.attrs.get('class')??'';}
  get attributes(){return [...this.attrs];}
  append(...children){this.children.push(...children);}setAttribute(k,v){this.attrs.set(k,v);}
  addEventListener(k,v){this.events[k]=v;}querySelectorAll(){return [];}
 }
 const old={document:globalThis.document,foundry:globalThis.foundry,game:globalThis.game};
 let config;
 try{
  globalThis.document={createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})};
  globalThis.game={i18n:{localize:key=>key}};
  globalThis.foundry={applications:{ux:{TextEditor:{enrichHTML:async html=>html}},api:{DialogV2:class {constructor(options){assert.equal(options.content.attributes.length,0,'Foundry requires an attribute-free content element');config=options;this.element={querySelector:()=>({replaceChildren(){}})};}async render(){this.rendered=true;}}}}};
  const sheet={actor:actor([item('Défaut de motivateur')])};await showTriggeredTalents(sheet);
  assert.equal(config.content.children[0].className,'ffg-triggered-talents');assert(sheet._triggeredTalentsWindow.rendered);
  assert.equal(config.content.children[0].children.filter(child=>child.className==='ffg-triggered-talent').length,1);
 }finally{for(const [key,value]of Object.entries(old))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});

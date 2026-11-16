import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {systemI18n} from '../system-i18n.mjs';

const clone=value=>structuredClone(value);
const plain=value=>JSON.parse(JSON.stringify(value));
const notes=[
 '<p><em>French description lists Vicious 1, while the English archive leaves the rating unspecified. Accurate 9 and Linked 12 are mentioned for source comparison only.</em></p>',
 '<p><em>La source française indique Sanguinaire 1 ; le rang manque dans l\'archive anglaise. Précision 9 et Jumelé 12 sont cités dans cette note de provenance.</em></p>',
];

async function load(){
 const context=vm.createContext({structuredClone,game:{i18n:await systemI18n('en'),user:{isGM:true,targets:new Set()},settings:{get:()=>false},combat:{id:'combat',round:1,started:true}},foundry:{utils:{deepClone:clone,getProperty:(object,path)=>path.split('.').reduce((value,key)=>value?.[key],object)}},CONFIG:{FFG:{theme:'starwars'}}});
 const cache=new Map();
 async function moduleAt(url){
  const key=url.href;if(cache.has(key))return cache.get(key);
  if(url.pathname.endsWith('/helpers/gm-difficulty.js')){
   const mod=new vm.SyntheticModule(['gmDifficulty','effectivePool'],function(){this.setExport('gmDifficulty',()=>({enabled:false}));this.setExport('effectivePool',pool=>pool);},{context,identifier:key});cache.set(key,mod);return mod;
  }
  const mod=new vm.SourceTextModule(await readFile(url,'utf8'),{context,identifier:key});cache.set(key,mod);
  await mod.link((specifier,referencing)=>moduleAt(new URL(specifier,referencing.identifier)));return mod;
 }
 async function helper(name){const mod=await moduleAt(new URL('../../modules/'+name,import.meta.url));if(mod.status!=='evaluated')await mod.evaluate();return mod.namespace;}
 return {weapon:await helper('helpers/weapon-selection.js'),modifiers:(await helper('helpers/modifiers.js')).default,Pool:(await helper('dice/pool.js')).DicePoolFFG,combat:await helper('helpers/combat-actions.js'),critical:await helper('helpers/critical-actions.js'),talents:await helper('helpers/roll-talents.js'),triggered:await helper('helpers/triggered-talents.js')};
}

test('provenance prose cannot create a quality or a roll modifier on a crystal',async()=>{
 const api=await load();
 for(const description of ['',...notes]){
  const crystal={name:'Cracked Crystal',type:'itemattachment',system:{description,attributes:{}}};
  const pool=await api.modifiers.getDicePoolModifiers(new api.Pool({ability:2,difficulty:2}),crystal,[]);
  assert.equal(pool.boost,0);assert.equal(pool.advantage,0);assert.equal(pool.success,0);
  const weapon={type:'weapon',system:{description,itemattachment:[crystal],itemmodifier:[]}};
  assert.equal(api.critical.criticalModifiers({type:'character',items:{contents:[]}},null,weapon).vicious,0);
  assert.equal(api.weapon.missingAccurateBoost(crystal),0);
  assert.equal(api.combat.weaponEffects(weapon,true).length,0);
 }
});

test('Accurate uses structured ranks and attributes before and after bilingual provenance notes',async()=>{
 const api=await load();
 for(const configured of [false,true])for(const description of ['',...notes]){
  const quality={name:'Accurate Quality',type:'itemmodifier',system:{description,rank:2,rank_current:2,attributes:configured?{boost:{mod:'Add Boost',modtype:'Roll Modifiers',value:1}}:{}}};
  const pool=await api.modifiers.getDicePoolModifiers(new api.Pool({boost:0}),quality,[]);
  pool.boost+=api.weapon.missingAccurateBoost(quality,pool.boost);
  assert.equal(pool.boost,2,'Notes must neither supply a different rank nor duplicate configured Boost dice');
 }
});

test('Vicious critical modifier and Linked activation limit ignore description ranks',async()=>{
 const api=await load(),target={type:'character',items:{contents:[]}},baseline=[];
 for(const description of ['',...notes]){
  const weapon={type:'weapon',system:{description,crit:{value:3},itemmodifier:[{name:'Vicious',system:{description,rank:2,rank_current:2}},{name:'Linked',system:{description,rank:2,rank_current:2}}]}};
  const critical=plain(api.critical.criticalModifiers(target,null,weapon));
  assert.equal(critical.vicious,20);
  const options=plain(api.combat.spendingOptions(weapon,{success:1,advantage:8}));
  const linked=options.find(option=>option.id==='quality-1');assert.equal(linked.max,2);assert.equal(linked.payments.advantage,2);
  baseline.push({critical,options});
 }
 assert.deepEqual(baseline[1],baseline[0]);assert.deepEqual(baseline[2],baseline[0]);
});

test('talent rank, cost, roll preview and triggered difficulty use acquired data despite contradictory prose',async()=>{
 const api=await load(),results=[];
 for(const description of ['',...notes.map(note=>note+'<p>Precise Aim 99; Hard Headed 99; Lethal Blows 99.</p>')]){
  const items=[{id:'aim',type:'talent',name:'Precise Aim',system:{description,active:true,ranks:{ranked:true,current:2}}},{id:'head',type:'talent',name:'Hard Headed',system:{description,active:true,ranks:{ranked:true,current:3}}}];
  const actor={type:'character',isOwner:true,system:{description,biography:description,skills:{Discipline:{value:'Discipline'}},stats:{strain:{value:0,max:10}}},items:{contents:items,get:id=>items.find(item=>item.id===id)},talentList:items.map(item=>({itemId:item.id,name:item.name,description,isRanked:true,rank:item.system.ranks.current})),getFlag:()=>undefined};
  assert.equal(api.talents.talentRank(actor,['Precise Aim']),2);
  assert.equal(api.talents.talentRank(actor,['Lethal Blows']),0,'A talent named only in prose is not acquired');
  const selected=api.talents.selectedRollTalents(actor,'Ranged: Light',[{id:'precise-aim',amount:2,targetDefence:3}]);
  assert.equal(selected[0].cost,2);assert.equal(selected[0].removeSetback,2);
  assert.throws(()=>api.talents.selectedRollTalents(actor,'Ranged: Light',[{id:'precise-aim',amount:3,targetDefence:3}]));
  const pool=plain(api.talents.rollTalentPool({ability:2,proficiency:1,setback:3},selected));
  const head=api.triggered.triggeredTalentOptions(actor).find(option=>option.id==='hardhd');assert.equal(head.rank,3);
  results.push({pool,rank:head.rank,difficulty:head.difficulty,cost:head.cost});
 }
 assert.deepEqual(results[1],results[0]);assert.deepEqual(results[2],results[0]);
});

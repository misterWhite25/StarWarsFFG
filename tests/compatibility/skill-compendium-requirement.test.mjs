import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../modules/helpers/skill-information-ui.js',import.meta.url),'utf8');
async function load(modules){
 const seen={descriptions:0,tables:0,dialogs:[]};
 const context=vm.createContext({game:{modules},window:{innerWidth:1500,innerHeight:900},document:{createElement:()=>({innerHTML:''})},requestAnimationFrame:fn=>fn(),foundry:{applications:{api:{DialogV2:class {
  constructor(options){seen.dialogs.push(options);this.element={getBoundingClientRect:()=>({height:300}),querySelectorAll:()=>[]};}async render(){}setPosition(){}
 }}}}});
 const module=new vm.SourceTextModule(source,{context});
 await module.link(spec=>new vm.SyntheticModule(spec.includes('mapping')?['suggestTables']:spec.includes('pilotage-core')?['adjacentPlacement']:['skillDescriptor','skillDescription'],function(){
  if(spec.includes('mapping'))this.setExport('suggestTables',()=>{seen.tables++;return [];});
  else if(spec.includes('pilotage-core'))this.setExport('adjacentPlacement',()=>({left:500,top:30,width:600}));
  else{this.setExport('skillDescriptor',()=>({key:'Medicine',label:'Médecine'}));this.setExport('skillDescription',()=>{seen.descriptions++;throw Error('Unexpected description lookup');});}
 },{context}));await module.evaluate();return {api:module.namespace,seen};
}
test('absent module requests installation and activation',async()=>{const {api}=await load(new Map());assert.match(api.skillCompendiumRequirement(),/installer le compendium/);});
test('installed inactive module requests activation, not reinstallation',async()=>{const {api}=await load(new Map([['swffg-compendium-bilingual',{active:false}]]));assert.match(api.skillCompendiumRequirement(),/installé mais désactivé/);});
test('active correct module allows normal lookup',async()=>{const {api}=await load(new Map([['swffg-compendium-bilingual',{active:true}]]));assert.equal(api.skillCompendiumRequirement(),null);});
test('another compendium does not satisfy the requirement',async()=>{const {api}=await load(new Map([['star-wars-all-compendia',{active:true}]]));assert.match(api.skillCompendiumRequirement(),/installer/);});
for(const active of [null,false])test(`missing or disabled dependency opens informative panel before any lookup (${active})`,async()=>{
 const {api,seen}=await load(new Map(active===null?[]:[['swffg-compendium-bilingual',{active}]]));const pool={ability:2,boost:1,difficulty:2};const builder={dicePool:pool,element:{getBoundingClientRect:()=>({left:100,top:30,width:350,right:450})},setPosition(){}};
 await api.openSkillInformation(builder);assert.equal(seen.descriptions,0);assert.equal(seen.tables,0);assert.equal(seen.dialogs.length,1);assert.match(seen.dialogs[0].content.innerHTML,/Compendium requis/);assert(seen.dialogs[0].classes.includes('themed'));assert(!seen.dialogs[0].classes.includes('theme-light'));assert(!seen.dialogs[0].classes.includes('theme-dark'));assert.deepEqual(pool,{ability:2,boost:1,difficulty:2});
});

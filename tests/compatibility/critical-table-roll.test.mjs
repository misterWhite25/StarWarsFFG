import {loadSystemModule} from '../load-system-module.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

async function setup(modifier) {
  const draws=[], warnings=[]; let dialog, evaluations=0;
  const context=vm.createContext({
    game:{i18n:{localize:k=>k}}, ui:{notifications:{warn:m=>warnings.push(m)}},
    foundry:{applications:{api:{DialogV2:{prompt:async config=>{dialog=config;return modifier;}}}}},
    Roll:class {constructor(formula,data){this.formula=formula;this.data=data;} async evaluate(){evaluations++;this.total=Math.max(1,100+this.data.modifier);return this;}},
    Hooks:{on(){},once(){}},
  });
  const module = await loadSystemModule('helpers/critical-table-roll.js', context);
  const table={formula:'1d100',getResultsForRoll:total=>[{name:total>150?'Mort':'Résultat',total}],draw:async args=>{draws.push(args);return args;}};
  return {api:module.namespace,table,draws,warnings,dialog:()=>dialog,evaluations:()=>evaluations};
}
for(const modifier of [0,5,10,20,60])test(`critical draw adds ${modifier} without capping at 100 or changing the table`,async()=>{
  const s=await setup(modifier);await s.api.drawCriticalTable(s.table);
  assert.equal(s.draws.length,1);assert.equal(s.draws[0].roll.total,100+modifier);
  assert.equal(s.draws[0].results[0].total,100+modifier);assert.equal(s.table.formula,'1d100');
  if(modifier===60)assert.equal(s.draws[0].results[0].name,'Mort');
});
test('closing the critical dialog cancels without rolling',async()=>{
  const s=await setup(null);await s.api.drawCriticalTable(s.table);
  assert.equal(s.draws.length,0);assert.equal(s.evaluations(),0);assert.equal(s.dialog().rejectClose,false);
});
test('invalid modifiers and missing ranges do not draw a different result',async()=>{
  for(const value of [-1000000,1.5,NaN,Infinity,1000000]){const s=await setup(value);await s.api.drawCriticalTable(s.table);assert.equal(s.draws.length,0);assert.equal(s.warnings.length,1);}
  const s=await setup(20);s.table.getResultsForRoll=()=>[];await s.api.drawCriticalTable(s.table);assert.equal(s.draws.length,0);assert.equal(s.evaluations(),1);
});
test('recognition is explicit and persists when a flagged table is copied',async()=>{
  const {api}=await setup(0);
  assert.equal(api.isCriticalTable({getFlag:()=>true}),true);
  assert.equal(api.isCriticalTable({name:'Critique',uuid:'RollTable.other'}),false);
  assert.equal(api.isCriticalTable({_stats:{compendiumSource:'Compendium.swffg-reference-tables-fr.tables.RollTable.1b76a8e54ab5851a'}}),true);
});

test('vehicle criticals use their own dialog and resolve totals above 153',async()=>{
  const s=await setup(150);
  s.table.getFlag=(_scope,key)=>key==='criticalKind'?'vehicle':undefined;
  s.table.getResultsForRoll=total=>total>=154?[{name:'Désintégré',total}]:[];
  await s.api.drawCriticalTable(s.table);
  assert.equal(s.dialog().window.title,'SWFFG.CriticalTable.VehicleTitle');
  assert.match(s.dialog().content,/VehicleHint/);
  assert.equal(s.draws[0].roll.total,250);
  assert.equal(s.draws[0].results[0].name,'Désintégré');
});

for(const [modifier,total] of [[-20,80],[-200,1]])test(`signed critical modifier ${modifier} resolves to ${total}`,async()=>{
 const s=await setup(modifier);await s.api.drawCriticalTable(s.table);
 assert.equal(s.draws[0].roll.total,total);assert.equal(s.draws[0].roll.formula,'max(1, 1d100 + @modifier)');
 assert.match(s.dialog().content,/min="-999899"/);assert.equal(s.table.formula,'1d100');
});

test('an unflagged malfunction table opens the ship prompt through the native draw button', async () => {
  let render, click, warned;
  const context = vm.createContext({Hooks:{on:(_name,fn)=>{render=fn;},once(){}},
    game:{actors:[],i18n:{lang:'en'}},ui:{notifications:{warn:s=>{warned=s;}}}});
  const module = await loadSystemModule('helpers/critical-table-roll.js',context);
  module.namespace.registerCriticalTableRolls();
  const button = {dataset:{}, disabled:false, addEventListener:(_name,fn)=>{click=fn;}};
  render({document:{id:'0a15c1b507abd55d'}},{querySelector:()=>button});
  await click({preventDefault(){},stopImmediatePropagation(){}});
  assert.equal(warned,'No editable vehicle.');
  assert.equal(button.disabled,false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {loadSystemModule} from '../load-system-module.mjs';
import {ProbabilityEstimator,probabilityOptions,simulationVisible} from '../../modules/helpers/probability-estimator.mjs';
import {ProbabilityPreview} from '../../modules/helpers/probability-preview.mjs';
import {CompendiumIndexLoader} from '../../modules/helpers/compendium-index-loader.mjs';
import {lazyApplication} from '../../modules/helpers/lazy-application.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('probability visibility and options preserve the complete effective pool, with 10000 iterations',()=>{
  assert.equal(simulationVisible('All',false),true);assert.equal(simulationVisible('GM',false),false);
  assert.equal(simulationVisible('GM',true),true);assert.equal(simulationVisible('None',true),false);
  const options=probabilityOptions({ability:2,proficiency:3,difficulty:1,challenge:2,boost:1,setback:4,remsetback:2,success:2,failure:1,advantage:3,threat:1,triumph:2,despair:1});
  assert.equal(options.iterations,10000);assert.equal(options.runSimulate,false);
  assert.deepEqual(options.dicePool,{abilityDice:2,proficiencyDice:3,difficultyDice:1,challengeDice:2,boostDice:1,setbackDice:2});
  assert.deepEqual(options.modifiers,{automaticSuccesses:2,automaticFailures:1,automaticAdvantages:3,automaticThreats:1,automaticTriumphs:2,automaticDespairs:1});
});

test('probability cache shares in-flight work, bounds memory, and retries failures',async()=>{
  let calls=0,fail=false;const gate=deferred();
  const estimator=new ProbabilityEstimator({maxEntries:2,createWorker:()=>null,compute:async()=>{calls++;await gate.promise;if(fail)throw Error('offline');return .8;}});
  const a=estimator.estimate({a:1}),b=estimator.estimate({a:1});assert.equal(a,b);gate.resolve();
  assert.equal(await a,.8);assert.equal(calls,1);await estimator.estimate({a:2});await estimator.estimate({a:3});assert.equal(estimator.cache.size,2);
  await estimator.estimate({a:1});assert.equal(calls,4);
  fail=true;await assert.rejects(estimator.estimate({bad:1}));assert.equal(estimator.cache.size,1);
  fail=false;assert.equal(await estimator.estimate({bad:1}),.8);
});

test('worker messages resolve independently and worker failure falls back without changing inputs',async()=>{
  const listeners={},jobs=[];let fallback=0,terminated=0;
  const worker={addEventListener:(key,fn)=>listeners[key]=fn,postMessage:job=>jobs.push(job),terminate:()=>terminated++};
  const estimator=new ProbabilityEstimator({createWorker:()=>worker,compute:options=>{fallback++;assert.deepEqual(options,{c:3});return .3;}});
  const a=estimator.estimate({a:1}),b=estimator.estimate({b:2});
  listeners.message({data:{id:jobs[1].id,probability:.6}});listeners.message({data:{id:jobs[0].id,probability:.8}});
  assert.equal(await a,.8);assert.equal(await b,.6);assert.equal(fallback,0);
  const c=estimator.estimate({c:3});listeners.error({message:'worker unavailable',preventDefault(){}});
  assert.equal(await c,.3);assert.equal(terminated,1);assert.equal(estimator.pending.size,0);assert.equal(fallback,1);
});

test('preview avoids hidden work, debounces edits, rejects stale results, and cancels on close',async()=>{
  const callbacks=new Map(),results=[],classes=new Set();let sequence=0;
  const target={textContent:'',classList:{remove:(...keys)=>keys.forEach(key=>classes.delete(key)),toggle:(key,value)=>value?classes.add(key):classes.delete(key)}};
  const preview=new ProbabilityPreview({schedule:fn=>{callbacks.set(++sequence,fn);return sequence;},cancel:id=>callbacks.delete(id),estimate:options=>{const job=deferred();results.push({options,...job});return job.promise;}});
  preview.update({a:0},{target,show:false});assert.equal(callbacks.size,0);
  preview.update({a:1},{target,show:true});preview.update({a:2},{target,show:true});assert.equal(callbacks.size,1);
  const run=async()=>{const [key,fn]=callbacks.entries().next().value;callbacks.delete(key);void fn();await tick();};
  await run();assert.deepEqual(results[0].options,{a:2});
  preview.update({a:3},{target,show:true,format:value=>Math.round(value*100)+'%'});await run();
  results[0].resolve(.1);await tick();assert.equal(target.textContent,'…');
  results[1].resolve(.9);await tick();assert.equal(target.textContent,'90%');assert.ok(classes.has('likely'));
  preview.update({a:4},{target,show:true});await run();preview.cancel();results[2].resolve(.2);await tick();assert.equal(target.textContent,'…');
});

test('index loader limits overlapping requests globally, shares work, preserves pack order, and retries unreadable packs',async()=>{
  const loader=new CompendiumIndexLoader(4),gates=Array.from({length:6},deferred);let active=0,max=0,calls=0;
  const packs=gates.map((gate,index)=>({getIndex:async()=>{calls++;max=Math.max(max,++active);await gate.promise;active--;return [{name:String(index)}];}}));
  const first=loader.load(packs,['type','img']),second=loader.load(packs,['img','type']);await tick();assert.equal(calls,4);assert.equal(max,4);
  gates[3].resolve();gates[2].resolve();await tick();assert.equal(calls,6);gates.forEach(gate=>gate.resolve());
  assert.deepEqual((await first).map(value=>value.index[0].name),['0','1','2','3','4','5']);await second;assert.equal(calls,6);
  let fails=true;const broken={getIndex:()=>{if(fails)throw Error('permission');return ['ok'];}};
  assert.deepEqual((await loader.load([broken],[]))[0].index,[]);fails=false;assert.deepEqual((await loader.load([broken],[]))[0].index,['ok']);
});

test('lazy application opens once on rapid clicks, restores the button, and permits retry after import failure',async()=>{
  let loads=0,created=0,renders=0,front=0,fail=true;const errors=[],gate=deferred();
  class App{constructor(){created++;}async render(){renders++;await gate.promise;this.rendered=true;}bringToFront(){front++;}}
  const open=lazyApplication(async()=>{loads++;if(fail)throw Error('network');return {default:App};},{onError:error=>errors.push(error.message)}),button={disabled:false};
  assert.equal(await open({currentTarget:button}),null);assert.equal(button.disabled,false);assert.deepEqual(errors,['network']);
  fail=false;const a=open({currentTarget:button}),b=open({currentTarget:button});assert.equal(a,b);assert.equal(button.disabled,true);gate.resolve();
  const instance=await a;assert.equal(button.disabled,false);assert.equal(loads,2);assert.equal(created,1);assert.equal(renders,1);
  assert.equal(await open(),instance);assert.equal(front,1);instance.rendered=false;await open();assert.equal(created,1);assert.equal(renders,2);
});

test('pilot updates coalesce across actors, skip cosmetic edits, and never construct a closed sheet or prepare twice',async()=>{
  const context=vm.createContext({queueMicrotask,console});
  const module=await loadSystemModule('helpers/pilot-vehicle-refresh.mjs',context,{'space-combat/crew-access.mjs':{isPilotRole:member=>/^(pilot|pilote)$/i.test(member.role)}});
  const {pilotItemAffectsVehicles,pilotVehicleRefresher}=module.namespace;
  assert.equal(pilotItemAffectsVehicles({'system.description':'new','img':'new.webp'}),false);
  assert.equal(pilotItemAffectsVehicles({system:{metadata:{tags:['new']}}}),false);
  assert.equal(pilotItemAffectsVehicles({system:{ranks:{current:2}}}),true);assert.equal(pilotItemAffectsVehicles({effects:[]}),true);
  assert.equal(pilotItemAffectsVehicles({_id:'item',_stats:{modifiedTime:123},system:{description:'Cosmetic'}}),false);
  assert.equal(pilotItemAffectsVehicles({_id:'item',_stats:{modifiedTime:123}}),false);
  assert.equal(pilotItemAffectsVehicles({'system.-=description':null}),false);
  assert.equal(pilotItemAffectsVehicles({'system.metadata.tagsBonus':3}),true);
  assert.equal(pilotItemAffectsVehicles({}),true);
  let scans=0,resets=0,prepares=0,renders=0;
  const vehicle={type:'vehicle',flags:{starwarsffg:{crew:[{role:'Pilote',actor_id:'a'},{role:'Pilot',actor_id:'b'}]}},reset(){resets++;},prepareData(){prepares++;},apps:{open:{rendered:true,render(){renders++;}},closed:{rendered:false,render(){throw Error('closed');}}},get sheet(){throw Error('sheet getter must remain unused');}};
  const refresh=pilotVehicleRefresher({actors:()=>{scans++;return [vehicle];}});
  refresh({id:'a'});refresh({id:'a'});refresh({id:'b'});await tick();assert.equal(scans,1);assert.equal(resets,1);assert.equal(prepares,0);assert.equal(renders,1);
  refresh({id:'other'});await tick();assert.equal(resets,1);
});

test('compendium browser ignores previous tabs and closed windows, with no late render or overwritten loading state',async()=>{
  class App{async close(){this.rendered=false;}async render(){this.renders=(this.renders??0)+1;}}
  const context=vm.createContext({clearTimeout,setTimeout,foundry:{applications:{api:{ApplicationV2:App,HandlebarsApplicationMixin:Base=>Base}}}});
  const module=await loadSystemModule('compendium/compendium-browser.js',context),Browser=module.namespace.default,browser=new Browser();
  const old=deferred(),latest=deferred();let calls=0;Browser._fetchIndex=()=>++calls===1?old.promise:latest.promise;
  const pendingOld=browser._loadTab();browser._activeTab='armour';browser._resetForNewTab();const pendingNew=browser._loadTab();
  old.resolve([{name:'obsolete',tags:[]}]);await pendingOld;assert.equal(browser._loading,true);assert.equal(browser._fullIndex.length,0);assert.equal(browser.renders,undefined);
  latest.resolve([{name:'current',tags:[]}]);await pendingNew;assert.equal(browser._loading,false);assert.equal(browser._fullIndex[0].name,'current');assert.equal(browser.renders,1);
  const closed=deferred();Browser._fetchIndex=()=>closed.promise;const pendingClosed=browser._loadTab();await browser.close();closed.resolve([{name:'late',tags:[]}]);await pendingClosed;assert.equal(browser._fullIndex[0].name,'current');assert.equal(browser.renders,1);
});

test('SlimSelect is included once as a classic script and is not evaluated again as an ES module',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../../system.json',import.meta.url),'utf8'));
  assert.equal(manifest.scripts.filter(path=>path==='lib/slimselect/slimselect.js').length,1);
  assert.equal(manifest.esmodules.includes('lib/slimselect/slimselect.js'),false);
});

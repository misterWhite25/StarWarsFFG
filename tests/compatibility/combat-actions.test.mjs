import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
async function load(){
 const source=await readFile(new URL('../../modules/helpers/combat-actions.js',import.meta.url),'utf8');
 let flags={pending:[],used:[]};
 const entries=[{id:'offer',kind:'aid',recipient:'p2'}];
 const context=vm.createContext({game:{user:{id:'p2',getFlag:()=>flags,setFlag:async(_s,_k,value)=>{flags=value;}},messages:{get:()=>({getFlag:()=>({entries})})},i18n:{lang:'fr'}},foundry:{utils:{deepClone:structuredClone}}});
 const selection=new vm.SourceTextModule(await readFile(new URL('../../modules/helpers/weapon-selection.js',import.meta.url),'utf8'),{context});await selection.link(()=>{});await selection.evaluate();
 const mod=new vm.SourceTextModule(source,{context});await mod.link(()=>selection);await mod.evaluate();return {api:mod.namespace,entries,setFlags:value=>{flags=value;},flags:()=>flags};
}
test('post-roll damage never heals, supports soak/pierce and vehicle scale',async()=>{
 const {api}=await load();
 assert.equal(api.calculateDamage({base:7,successes:3,soak:5,pierce:2}).wounds,7);
 assert.equal(api.calculateDamage({base:3,successes:1,soak:10}).wounds,0);
 assert.equal(api.calculateDamage({base:7,successes:3,soak:3,breach:1,vehicle:true}).wounds,8);
 assert.equal(api.calculateDamage({base:7,successes:3,soak:5,scale:10}).wounds,95);
 assert.equal(api.calculateDamage({base:0,successes:1,soak:0}).wounds,1);
});
test('symbol budget accounts for spending and refunds independently',async()=>{
 const {api}=await load();const left=api.remainingSymbols({advantage:4,triumph:1},[{currency:'advantage',cost:2},{currency:'advantage',cost:2,undone:true},{currency:'triumph',cost:1}]);
 assert.equal(left.advantage,2);assert.equal(left.triumph,0);
});
test('weapon effects exclude passive qualities and respect hit/miss activation',async()=>{
 const {api}=await load();const item={system:{itemmodifier:[{name:'Pierce',system:{rank:2}},{name:'Blast',system:{rank:5}},{name:'Guided',system:{rank:3}},{name:'Concussive',system:{rank:1}}]}};
 const hit=api.weaponEffects(item,true);assert.equal(hit.length,2);assert.equal(hit.find(q=>q.name==='Blast').cost,2);
 const miss=api.weaponEffects(item,false);assert.equal(miss.length,2);assert.equal(miss.find(q=>q.name==='Blast').cost,3);assert.equal(miss.some(q=>q.name==='Guided'),true);
});
test('aid is single use, survives cancelled preparation, restores after failed posting',async()=>{
 const {api,setFlags,flags,entries}=await load();const aid={id:'msg:offer',message:'msg',entry:'offer'};setFlags({pending:[aid],used:[]});
 assert.equal(api.pendingAid().length,1);assert.equal(api.pendingAid().length,1);
 await api.consumeAid([aid]);assert.equal(flags().pending.length,0);assert.equal(flags().used.length,1);
 await assert.rejects(()=>api.consumeAid([aid]));await api.restoreAid([aid]);assert.equal(api.pendingAid().length,1);
 entries[0].undone=true;assert.equal(api.pendingAid().length,0);await assert.rejects(()=>api.consumeAid([aid]));
});

test('batch spending supports mixed currencies and rejects cumulative overspending',async()=>{
 const {api}=await load(); const r={advantage:3,triumph:1};
 const opts=api.spendingOptions(null,r,{strain:5,canStrain:true});
 const selected=[{effect:'strain',quantity:1,currency:'advantage'}, {effect:'aid-chosen',quantity:1,currency:'advantage',target:'Dodge'}, {effect:'vital',quantity:1,currency:'triumph'}];
 assert.equal(api.validateSpending(r,[],opts,selected).length,3);
 assert.throws(()=>api.validateSpending(r,[],opts,[...selected,{effect:'strain',quantity:1,currency:'advantage'}]));
 assert.throws(()=>api.validateSpending(r,[],opts,[{effect:'strain',quantity:-1,currency:'advantage'}]));
 assert.throws(()=>api.validateSpending(r,[],opts,[{effect:'strain',quantity:1.5,currency:'advantage'}]));
 assert.throws(()=>api.validateSpending(r,[{currency:'advantage',cost:2}],opts,selected));
});

test('critical equipment destruction costs two triumphs and requires damage confirmation',async()=>{
 const {api}=await load(); const item={system:{crit:{value:3}}},r={success:1,triumph:2};
 const opts=api.spendingOptions(item,r);
 const selection={effect:'destroy',quantity:1,currency:'triumph',target:'Blaster',confirmed:true};
 assert.equal(api.validateSpending(r,[],opts,[selection])[0].cost,2);
 assert.throws(()=>api.validateSpending({...r,triumph:1},[],opts,[selection]));
 assert.throws(()=>api.validateSpending(r,[],opts,[{...selection,confirmed:false}]));
 assert.equal(api.spendingOptions(item,{success:0}).some(o=>o.id==='critical'||o.id==='destroy'),false);
});

test('negative symbols and repeat limits remain independent',async()=>{
 const {api}=await load(); const r={advantage:8,triumph:2,threat:2,despair:1};
 const opts=api.spendingOptions(null,r,{strain:2,canStrain:true});
 assert.equal(api.validateSpending(r,[],opts,[{effect:'suffer-strain',quantity:2,currency:'threat'}])[0].cost,2);
 assert.throws(()=>api.validateSpending(r,[],opts,[{effect:'strain',quantity:2,currency:'advantage'},{effect:'strain',quantity:1,currency:'triumph'}]));
 assert.throws(()=>api.validateSpending(r,[],opts,[{effect:'maneuver',quantity:2,currency:'advantage',confirmed:true}]));
 assert.equal(api.spendingOptions(null,r,{negative:false}).some(o=>o.payments.threat||o.payments.despair),false);
});

test('imported Quality suffix is recognized without treating Stun Setting as active Stun',async()=>{
 const {api}=await load();
 const item={system:{crit:{value:3},itemmodifier:[{name:'Auto-Fire Quality',system:{rank:1}},{name:'Stun Setting Quality',system:{rank:1}}]}};
 const effects=api.weaponEffects(item,true,true);assert.equal(effects.length,1);assert.equal(effects[0].cost,2);
 assert.equal(api.weaponEffects(item,false).length,0);
 const opts=api.spendingOptions(item,{success:1,advantage:3});
 assert.equal(api.validateSpending({success:1,advantage:3},[],opts,[{effect:'critical',currency:'advantage',quantity:1,confirmed:true}])[0].cost,3);
 assert.equal(api.spendingOptions(null,{success:1,advantage:3}).some(o=>o.id==='critical'),false);
});

test('Auto-fire spending requires the pre-roll choice and a successful attack',async()=>{
 const {api}=await load();const item={system:{itemmodifier:[{name:'Auto-fire Quality 1'}]}};
 assert.equal(api.weaponEffects(item,true).length,0);
 assert.equal(api.weaponEffects(item,false,true).length,0);
 assert.equal(api.weaponEffects(item,true,true)[0].cost,2);
 assert.equal(api.spendingOptions(item,{success:1}).some(o=>o.id==='quality-0'),false);
 assert.equal(api.spendingOptions(item,{success:1},{autoFire:true}).some(o=>o.id==='quality-0'),true);
});

test('preselected Auto-fire spends symbols without a second confirmation',async()=>{
 const {api}=await load();const item={system:{itemmodifier:[{name:'Auto-fire Quality 1'}]}};
 const results={success:1,advantage:4};
 const opts=api.spendingOptions(item,results,{autoFire:true});
 assert.equal(opts.find(o=>o.id==='quality-0').condition,undefined);
 assert.equal(api.validateSpending(results,[],opts,[{effect:'quality-0',currency:'advantage',quantity:2,confirmed:false}])[0].cost,4);
 assert.throws(()=>api.validateSpending(results,[],api.spendingOptions(item,results,{autoFire:false}),[{effect:'quality-0',currency:'advantage',quantity:1}]));
});

test('vehicle spending follows tables 7-5 and 7-6, without personal strain recovery',async()=>{
 const {api}=await load(),opts=api.spendingOptions(null,{success:1},{combatMode:'vehicle',strain:5,canStrain:true});
 const byId=id=>opts.find(o=>o.id===id);
 for(const id of ['vehicle-aid-next','vehicle-notice'])assert.deepEqual({...byId(id).payments},{advantage:1,triumph:1});
 for(const id of ['vehicle-maneuver','vehicle-setback','vehicle-aid-chosen'])assert.deepEqual({...byId(id).payments},{advantage:2,triumph:1});
 for(const id of ['vehicle-environment','vehicle-pilot-maneuver','vehicle-change-course'])assert.deepEqual({...byId(id).payments},{advantage:3,triumph:1});
 for(const id of ['vehicle-enemy-difficulty','vehicle-ally-upgrade','vehicle-vital'])assert.deepEqual({...byId(id).payments},{triumph:1});
 for(const id of ['vehicle-reduce-speed','vehicle-lose-maneuver','vehicle-system-strain'])assert.deepEqual({...byId(id).payments},{threat:1,despair:1});
 for(const id of ['vehicle-enemy-maneuver','vehicle-enemy-boost','vehicle-ally-setback'])assert.deepEqual({...byId(id).payments},{threat:2,despair:1});
 for(const id of ['vehicle-last-slot','vehicle-enemy-edge'])assert.deepEqual({...byId(id).payments},{threat:3,despair:1});
 for(const id of ['vehicle-weapon-damaged','vehicle-ally-difficulty','vehicle-minor-collision'])assert.deepEqual({...byId(id).payments},{despair:1});
 assert.equal(opts.some(o=>['strain','suffer-strain','prone','gain-defense','destroy'].includes(o.id)),false);
 const paid=api.validateSpending({threat:3},[],opts,[{effect:'vehicle-system-strain',currency:'threat',quantity:3}]);
 assert.equal(paid[0].cost,3);assert.equal(paid[0].option.id,'vehicle-system-strain');
});
test('vehicle critical and component damage require a successful weapon attack; major collision requires failure',async()=>{
 const {api}=await load(),weapon={system:{crit:{value:4}}};
 const hit=api.spendingOptions(weapon,{success:1},{combatMode:'vehicle'});
 assert.equal(hit.find(o=>o.id==='critical').payments.advantage,4);
 assert.equal(hit.find(o=>o.id==='vehicle-disable-component').payments.advantage,3);
 const destroy=hit.find(o=>o.id==='vehicle-destroy-component');assert.equal(destroy.payments.triumph,2);assert.match(destroy.name,/au lieu/);
 assert.equal(hit.some(o=>o.id==='vehicle-major-collision'),false);
 const miss=api.spendingOptions(weapon,{success:0},{combatMode:'vehicle'});
 assert.equal(miss.some(o=>['critical','vehicle-disable-component','vehicle-destroy-component'].includes(o.id)),false);
 assert.equal(miss.find(o=>o.id==='vehicle-major-collision').payments.despair,1);
 assert.equal(api.spendingOptions(weapon,{success:0},{combatMode:'vehicle',negative:false}).some(o=>o.payments.threat||o.payments.despair),false);
 assert.throws(()=>api.validateSpending({success:0,despair:1},[],hit,[{effect:'vehicle-major-collision',currency:'despair',quantity:1}]));
});
test('vehicle effects retain weapon qualities and enforce shared budgets across mixed effects',async()=>{
 const {api}=await load(),weapon={system:{crit:{value:3},itemmodifier:[{name:'Auto-Fire Quality'}]}};
 const r={success:1,advantage:3,triumph:1},opts=api.spendingOptions(weapon,r,{combatMode:'vehicle',autoFire:true});
 assert.equal(opts.some(o=>o.id==='quality-0'),true);
 const selections=[{effect:'vehicle-aid-next',currency:'advantage',quantity:1},{effect:'quality-0',currency:'advantage',quantity:1},{effect:'vehicle-vital',currency:'triumph',quantity:1}];
 assert.equal(api.validateSpending(r,[],opts,selections).length,3);
 assert.throws(()=>api.validateSpending({...r,advantage:2},[],opts,selections));
 assert.equal(api.spendingOptions(weapon,r,{combatMode:'vehicle',autoFire:false}).some(o=>o.id==='quality-0'),false);
 assert.equal(api.spendingOptions(weapon,r,{combatMode:'personal'}).some(o=>o.id.startsWith('vehicle-')),false);
});

test('saved ship weapon qualities support dictionary imports and vehicle spending',async()=>{
 const {api}=await load();
 const item=JSON.parse(JSON.stringify({type:'shipweapon',system:{crit:{value:3},adjusteditemmodifier:{
   linked:{name:'Linked Quality',system:{rank:2}},
   guided:{name:'Guided Quality',system:{rank:3}},
   breach:{name:'Breach Quality',system:{rank:1}}
 }}}));
 const hit=api.weaponEffects(item,true);
 assert.equal(hit.length,1);assert.equal(hit[0].name,'Linked Quality');assert.equal(hit[0].cost,2);
 const miss=api.weaponEffects(item,false);
 assert.equal(miss.length,1);assert.equal(miss[0].name,'Guided Quality');
 const opts=api.spendingOptions(item,{success:1,advantage:3,triumph:1},{combatMode:'vehicle'});
 assert.ok(opts.some(o=>o.id===hit[0].id));
 assert.equal(api.validateSpending({advantage:3,triumph:1},[],opts,[{effect:hit[0].id,quantity:1,confirmed:true,currency:'advantage'}]).length,1);
});

test('damage picker follows local selection/targeting and removes listeners on close',async()=>{
 const {api}=await load();const handlers=new Map();let serial=0;
 const hooks={on:(name,fn)=>{handlers.set(++serial,{name,fn});return serial;},off:(_name,id)=>handlers.delete(id)};
 const emit=(name,...args)=>{for(const h of handlers.values())if(h.name===name)h.fn(...args);};
 const a={document:{uuid:'a'},visible:true},b={document:{uuid:'b'},visible:true},hidden={document:{uuid:'hidden',hidden:true},visible:false};
 const select={value:'a'};let ready=false;
 const stop=api.watchDamageTarget([a,b,hidden],()=>ready?select:null,hooks,'p2');
 emit('controlToken',b,true);assert.equal(select.value,'a');ready=true;
 emit('controlToken',b,true);assert.equal(select.value,'b');
 emit('controlToken',a,false);assert.equal(select.value,'b');
 emit('targetToken',{id:'other'},a,true);assert.equal(select.value,'b');
 emit('targetToken',{id:'p2'},a,true);assert.equal(select.value,'a');
 emit('controlToken',hidden,true);assert.equal(select.value,'a');
 emit('controlToken',{document:{uuid:'unlisted'},visible:true},true);assert.equal(select.value,'a');
 stop();assert.equal(handlers.size,0);
});

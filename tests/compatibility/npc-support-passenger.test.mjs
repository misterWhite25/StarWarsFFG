import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
async function fixture(){
 let next=0;const actors=[];actors.get=id=>actors.find(a=>a.id===id);
 const context=vm.createContext({structuredClone,game:{user:{isGM:true},actors,i18n:{localize:key=>key},settings:{get:()=>[]}},foundry:{utils:{randomID:()=>String(++next).padStart(16,'p')}}});
 const base=new URL('../../modules/',import.meta.url),cache=new Map();
 async function module(url){
  if(cache.has(url.href))return cache.get(url.href);
  const text=await fs.readFile(url,'utf8');
  const m=new vm.SourceTextModule(text,{context,identifier:url.href});cache.set(url.href,m);return m;
 }
 const entry=await module(new URL('helpers/npc-vehicle.mjs',base));await entry.link((s,m)=>module(new URL(s,m.identifier)));await entry.evaluate();
 function merge(at,changes){for(const [key,value]of Object.entries(changes)){if(key.startsWith('-=')){delete at[key.slice(2)];continue;}if(value&&typeof value==='object'&&!Array.isArray(value))at[key]=merge(at[key]&&typeof at[key]==='object'?at[key]:{},value);else at[key]=structuredClone(value);}return at;}
 function apply(at,path,value){const keys=path.split('.');for(const k of keys.slice(0,-1))at=at[k]??={};const k=keys.at(-1);if(k.startsWith('-='))delete at[k.slice(2)];else if(value&&typeof value==='object'&&!Array.isArray(value))at[k]=merge(at[k]??{},value);else at[k]=structuredClone(value);}
 const ship={id:'ship',uuid:'Actor.ship',name:'Corvette',type:'vehicle',isOwner:true,flags:{starwarsffg:{crew:[]}},system:{stats:{silhouette:{value:4},hullTrauma:{max:10,value:0}}},items:[],updates:0,getFlag(s,k){return k.split('.').reduce((v,key)=>v?.[key],this.flags[s]);},async update(patch){this.updates++;for(const [key,value]of Object.entries(patch))apply(this,key,value);this.items.get=id=>this.items.find(i=>i.id===id||i._id===id);return this;},async updateEmbeddedDocuments(){}};ship.items.get=()=>undefined;actors.push(ship);return {api:entry.namespace,ship,actors,context};
}
test('NPC transports and capital ships generate one support passenger with all three skills',async()=>{
 const {api,ship}=await fixture();for(const size of [4,6]){
  ship.system.stats.silhouette.value=size;const patch=api.npcVehicleData(ship,{quality:'veteran'}),posts=Object.values(patch['flags.starwarsffg.npcVehicle'].stations),passengers=Object.values(patch['flags.starwarsffg.vehicleDeck.passengers']);
  assert.equal(passengers.length,1);assert.equal(passengers[0].name,'Passagers');const support=posts.find(p=>p.kind==='support');assert.deepEqual(Object.keys(support.skills),['Computers','Leadership','Mechanics','Cool','Vigilance']);assert(['Computers','Leadership','Mechanics'].every(key=>support.skills[key].rank===3));assert(['Cool','Vigilance'].every(key=>support.skills[key].ability===2&&support.skills[key].rank===0));assert(!posts.some(p=>['engineer','operator','commander'].includes(p.kind)));
 }
 ship.system.stats.silhouette.value=3;const fighter=api.npcVehicleData(ship,{astromech:'yes'});assert.equal(Object.keys(fighter['flags.starwarsffg.vehicleDeck.passengers']).length,0);assert(Object.values(fighter['flags.starwarsffg.npcVehicle'].stations).some(p=>p.kind==='astromech'));
});
test('legacy passengers merge without changing specialist pools or removing named characters',async()=>{
 const {api,ship,actors}=await fixture();await ship.update(api.npcVehicleData(ship));const config=ship.flags.starwarsffg.npcVehicle,original=Object.values(config.stations).find(p=>p.kind==='support');delete config.stations[original.id];
 const pools={engineer:{Mechanics:{ability:4,rank:3}},operator:{Computers:{ability:5,rank:2}},commander:{Leadership:{ability:3,rank:4}}};const passengers={};
 for(const [kind,skills]of Object.entries(pools)){config.stations[kind]={...structuredClone(original),id:kind,kind,station:kind,name:kind,skills:{...structuredClone(original.skills),...skills}};passengers[kind]={key:kind,actorId:kind,name:kind,role:kind,integrated:true,npcStation:true,vehicle_id:ship.id};}
 passengers.vlad={key:'vlad',actorId:'real-vlad',name:'Vlad',role:'Passager',integrated:false};ship.flags.starwarsffg.vehicleDeck.passengers=passengers;
 const before=JSON.stringify(ship.flags),patch=api.npcPassengerConsolidation(ship);assert(patch);assert.equal(JSON.stringify(ship.flags),before);
 assert.equal(await api.consolidateNpcPassengers(ship),true);const after=ship.flags.starwarsffg,remaining=Object.values(after.vehicleDeck.passengers);assert.equal(remaining.length,2);assert.equal(remaining.filter(p=>p.npcStation).length,1);assert(remaining.some(p=>p.name==='Vlad'));
 const combined=after.npcVehicle.stations.engineer;for(const [kind,skill]of Object.entries(pools))for(const [key,pool]of Object.entries(skill))assert.deepEqual({...combined.skills[key]},pool);
 assert.equal(after.npcVehicle.stationAliases.operator,'engineer');assert.equal(api.npcStationActor({actor_id:'operator'},ship).id,'engineer');assert.equal(actors.length,1);
 const updates=ship.updates;assert.equal(await api.consolidateNpcPassengers(ship),false);assert.equal(ship.updates,updates);
 await api.synchronizeNpcVehicle(ship);assert(Object.values(ship.flags.starwarsffg.vehicleDeck.passengers).some(p=>p.name==='Vlad'));assert.equal(Object.values(ship.flags.starwarsffg.vehicleDeck.passengers).filter(p=>p.npcStation).length,1);
 const copy=api.copyNpcVehicle(ship),stations=copy['flags.starwarsffg.npcVehicle.stations'];assert(Object.values(copy['flags.starwarsffg.npcVehicle.stationAliases']).every(id=>stations[id]));
});

test('lightweight NPC initiative settings migrate idempotently and retain edits through synchronization and copying',async()=>{
 const {api,ship,actors}=await fixture();await ship.update(api.npcVehicleData(ship));
 const pilot=Object.values(ship.flags.starwarsffg.npcVehicle.stations).find(post=>post.kind==='pilot');
 for(const post of Object.values(ship.flags.starwarsffg.npcVehicle.stations)){delete post.skills.Cool;delete post.skills.Vigilance;}
 assert.equal(await api.ensureNpcInitiativeSkills(ship),true);
 assert(Object.values(ship.flags.starwarsffg.npcVehicle.stations).every(post=>post.skills.Cool.ability===2&&post.skills.Vigilance.rank===0));
 const updated=ship.updates;assert.equal(await api.ensureNpcInitiativeSkills(ship),false);assert.equal(ship.updates,updated);
 pilot.skills.Cool={ability:4,rank:2};pilot.skills.Vigilance={ability:3,rank:1};
 await api.synchronizeNpcVehicle(ship);
 const stored=ship.flags.starwarsffg.npcVehicle.stations[pilot.id];assert.deepEqual({...stored.skills.Cool},{ability:4,rank:2});assert.deepEqual({...stored.skills.Vigilance},{ability:3,rank:1});
 const account=api.npcStationActor({actor_id:pilot.id},ship);
 assert.equal(account.system.skills.Cool.rank,2);assert.equal(account.system.characteristics[account.system.skills.Cool.characteristic].value,4);
 assert.equal(account.system.skills.Vigilance.rank,1);assert.equal(account.system.characteristics[account.system.skills.Vigilance.characteristic].value,3);
 const copied=api.copyNpcVehicle(ship),copy=Object.values(copied['flags.starwarsffg.npcVehicle.stations']).find(post=>post.kind==='pilot');assert.deepEqual({...copy.skills.Cool},{ability:4,rank:2});assert.equal(actors.length,1);
});


test('NPC copies rekey crew and support deck positions while retaining named passenger positions',async()=>{
 const {api,ship}=await fixture();await ship.update(api.npcVehicleData(ship));
 const posts=Object.values(ship.flags.starwarsffg.npcVehicle.stations),pilot=posts.find(post=>post.kind==='pilot'),support=posts.find(post=>post.kind==='support');
 ship.flags.starwarsffg.vehicleDeck.positions={['a'+pilot.id]:{x:0.1,y:0.2},['a'+support.id]:{x:0.3,y:0.4},amanual:{x:0.5,y:0.6}};
 const before=JSON.stringify(ship.flags),copied=api.copyNpcVehicle(ship),positions=copied['flags.starwarsffg.vehicleDeck.positions'];
 const copiedPosts=Object.values(copied['flags.starwarsffg.npcVehicle.stations']).filter(Boolean),copiedPilot=copiedPosts.find(post=>post.kind==='pilot'),copiedSupport=copiedPosts.find(post=>post.kind==='support');
 assert.deepEqual({...positions['a'+copiedPilot.id]},{x:0.1,y:0.2});assert.deepEqual({...positions['a'+copiedSupport.id]},{x:0.3,y:0.4});assert.deepEqual({...positions.amanual},{x:0.5,y:0.6});
 assert.equal(positions['a'+pilot.id],undefined);assert.equal(positions['a'+support.id],undefined);assert.equal(positions['-=a'+pilot.id],null);assert.equal(positions['-=a'+support.id],null);assert.equal(JSON.stringify(ship.flags),before);
});

test('NPC synchronization restores a missing support passenger then becomes a no-op',async()=>{
 const {api,ship,actors}=await fixture();await ship.update(api.npcVehicleData(ship,{quality:'veteran'}));
 const support=Object.values(ship.flags.starwarsffg.npcVehicle.stations).find(post=>post.kind==='support');
 delete ship.flags.starwarsffg.vehicleDeck.passengers['a'+support.id];
 const updates=ship.updates;await api.synchronizeNpcVehicle(ship);
 assert.equal(ship.updates,updates+1);assert.equal(ship.flags.starwarsffg.vehicleDeck.passengers['a'+support.id].actorId,support.id);assert.equal(actors.length,1);
 const after=JSON.stringify(ship.flags);await api.synchronizeNpcVehicle(ship);
 assert.equal(ship.updates,updates+1);assert.equal(JSON.stringify(ship.flags),after);
});

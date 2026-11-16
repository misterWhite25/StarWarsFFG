import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';
import {prepareIntegratedCrewCopy} from '../../modules/helpers/integrated-crew-model.mjs';

const clone=value=>structuredClone(value);
function expand(changes){const result={};for(const [key,value]of Object.entries(changes)){const parts=key.split('.');let object=result;for(const part of parts.slice(0,-1))object=object[part]??={};object[parts.at(-1)]=value;}return result;}
function merge(base,changes){for(const [key,value]of Object.entries(changes)){if(key.startsWith('-=')){delete base[key.slice(2)];continue;}if(value&&typeof value==='object'&&!Array.isArray(value))base[key]=merge(base[key]&&typeof base[key]==='object'?base[key]:{},value);else base[key]=clone(value);}return base;}
function collection(items=[]){items.contents=items;items.get=id=>items.find(item=>item.id===id);return items;}
const defaults=()=>({characteristics:Object.fromEntries(['Brawn','Agility','Intellect','Cunning','Willpower','Presence'].map(name=>[name,{value:2}])),skills:Object.fromEntries(['Piloting: Space','Piloting: Planetary','Astrogation','Gunnery','Mechanics','Computers','Athletics','Coordination','Perception','Cool','Vigilance','Discipline','Leadership'].map(name=>[name,{rank:0,characteristic:['Gunnery','Piloting: Space','Piloting: Planetary'].includes(name)?'Agility':'Intellect'}])),stats:{wounds:{value:0,max:12},strain:{value:0,max:12},soak:{value:2}},quantity:{value:1,max:1}});

async function fixture(){
  let counter=0;const actors=collection(),settings=new Map();
  class FakeActor{
    constructor(data){this.documentName='Actor';this.updateSource(clone(data));this.prepareData();}
    updateSource(data){this._source=merge(this._source??{},data);for(const field of ['name','type','system','flags','ownership'])this[field]=this._source[field];this.id=this._source._id;}
    prepareData(){this.items=collection((this._source.items??[]).map(data=>({id:data._id,name:data.name,type:data.type,system:data.system??{},flags:data.flags??{},setFlag(s,k,v){return this.update({['flags.'+s+'.'+k]:v});},getFlag(s,k){return this.flags[s]?.[k];}})));this.effects=collection((this._source.effects??[]).map(data=>({id:data._id,...data})));this.talentList=this.items.filter(item=>item.type==='talent').map(item=>({name:item.name,itemId:item.id,rank:item.system.ranks?.current??1}));}
    getEmbeddedCollection(type){return type==='Item'?this.items:this.effects;}
    getFlag(s,k){return k.split('.').reduce((object,key)=>object?.[key],this.flags?.[s]);}
    setFlag(s,k,v){return this.update({['flags.'+s+'.'+k]:v});}
    toObject(){return clone(this._source);}
  }
  const labels={pilot:'Pilote',copilot:'Copilote',gunner:'Artilleur',engineer:'Mécanicien',operator:'Technicien',astromech:'Astromécano'};
  const context=vm.createContext({console,structuredClone,game:{actors,scenes:[],combats:[],user:{isGM:true},i18n:{localize:key=>labels[key.split('.').at(-1)]??key},settings:{get:(_s,key)=>settings.get(key)}},CONFIG:{Actor:{documentClass:FakeActor}},foundry:{utils:{deepClone:clone,expandObject:expand,mergeObject:(base,changes)=>merge(base,changes),randomID:()=>String(++counter).padStart(16,'x')}}});
  const mocks={'helpers/npc-vehicle.mjs':{npcVehicle:()=>false,npcStationActor:()=>null,removeNpcStation:()=>{}},'data-models/system-data-models.js':{getSystemDataDefaults:defaults},'helpers/vehicle-minion-group.mjs':{vehicleMinionGroup:vehicle=>({enabled:!!vehicle.flags.starwarsffg.vehicleMinionGroup?.enabled,count:vehicle.flags.starwarsffg.vehicleMinionGroup?.count??1,alive:vehicle.flags.starwarsffg.vehicleMinionGroup?.count??1,hullPerVehicle:10}),applyVehicleMinionSkills:(data,vehicle)=>{if(vehicle.flags.starwarsffg.vehicleMinionGroup?.enabled)data.system.skills.Gunnery.rank=vehicle.flags.starwarsffg.vehicleMinionGroup.count-1;return data;}}};
  const api=(await loadSystemModule('helpers/integrated-crew.mjs',context,mocks)).namespace;
  function vehicle(id='ship',size=4){const ship={id,uuid:'Actor.'+id,type:'vehicle',name:'Vaisseau',isOwner:true,flags:{starwarsffg:{crew:[]}},system:{stats:{silhouette:{value:size},hullTrauma:{max:10,value:0},crew:{value:4}}},items:collection([]),updates:0,getFlag(s,k){return this.flags[s]?.[k];},async update(changes){this.updates++;merge(this,expand(changes));return this;},async setFlag(s,k,v){return this.update({['flags.'+s+'.'+k]:v});},async unsetFlag(s,k){return this.update({['flags.'+s+'.-='+k]:null});},async updateEmbeddedDocuments(){return [];}};actors.push(ship);return ship;}
  return {api,actors,vehicle};
}

test('integrated generation creates support from silhouette four, no world Actors, and preserves occupied stations',async()=>{
  const {api,actors,vehicle}=await fixture(),ship=vehicle();
  const result=await api.completeIntegratedCrew(ship);
  assert.equal(actors.length,1);assert.equal(result.mode,'integrated');assert.equal(result.integrated,4);
  assert.deepEqual(Array.from(api.integratedCrewProfiles(ship),profile=>profile.kind),['pilot','copilot','engineer','operator']);
  const pilot=ship.flags.starwarsffg.crew.find(member=>member.role==='Pilot'),actor=api.resolveCrewActor(pilot,ship);
  assert.equal(actor.uuid,'Actor.ship.Crew.'+pilot.actor_id);assert.equal(api.resolveCrewDocument(actor.uuid),actor);
  const again=await api.completeIntegratedCrew(ship);assert.equal(again.integrated,0);assert.equal(actors.length,1);
  const manual={id:'named',name:'Capitaine',documentName:'Actor'};actors.push(manual);
  ship.flags.starwarsffg.crew=ship.flags.starwarsffg.crew.filter(member=>member.actor_id!==pilot.actor_id);ship.flags.starwarsffg.crew.push({actor_id:manual.id,role:'Pilot'});
  assert.equal(api.resolveCrewActor(pilot,ship),null);assert.equal(api.integratedCrewProfiles(ship).length,3);
  assert.equal((await api.completeIntegratedCrew(ship)).integrated,0);
});

test('profile stats, flags and embedded talents persist independently, with refreshed group skills',async()=>{
  const {api,vehicle}=await fixture(),ship=vehicle();await api.completeIntegratedCrew(ship,{actorType:'nemesis'});
  const [first,second]=ship.flags.starwarsffg.crew,actor=api.resolveCrewActor(first,ship),other=api.resolveCrewActor(second,ship);
  await actor.update({'system.stats.strain.value':2,'flags.starwarsffg.rollTalentUsage.focus':'round1'});
  assert.equal(actor.system.stats.strain.value,2);assert.equal(other.system.stats.strain.value,0);
  assert.equal(ship.flags.starwarsffg.integratedCrew.profiles[first.actor_id].data.flags.starwarsffg.rollTalentUsage.focus,'round1');
  await actor.createEmbeddedDocuments('Item',[{_id:'talent',name:'Adversaire',type:'talent',system:{ranks:{current:2}}}]);
  const item=actor.items.get('talent');await item.setFlag('starwarsffg','used',true);
  assert.equal(actor.items.get('talent').getFlag('starwarsffg','used'),true);assert.equal(actor.talentList[0].rank,2);
  ship.flags.starwarsffg.vehicleMinionGroup={enabled:true,count:4};assert.equal(api.resolveCrewActor(first,ship).system.skills.Gunnery.rank,3);
  ship.flags.starwarsffg.vehicleMinionGroup.count=2;assert.equal(api.resolveCrewActor(first,ship).system.skills.Gunnery.rank,1);
  await api.removeIntegratedCrewProfile(ship,first.actor_id);assert.equal(api.resolveCrewActor(first,ship),null);
});

test('copied hulls rekey profiles and references while retaining manual crew',()=>{
  const original={_id:'old',flags:{starwarsffg:{crew:[{actor_id:'p',vehicle_id:'old',integrated:true},{actor_id:'manual',role:'Gunner'}],integratedCrew:{version:1,profiles:{p:{id:'p',data:{_id:'p',flags:{starwarsffg:{autoCrew:{vehicleUuid:'Actor.old'}}},effects:[{origin:'Actor.old.Crew.p.Item.talent'}]}}}}}}};
  const before=JSON.stringify(original),updates=prepareIntegratedCrewCopy(original,'new',()=> 'newprofile');
  const profile=updates['flags.starwarsffg.integratedCrew'].profiles.newprofile;
  assert.equal(profile.data.effects[0].origin,'Actor.new.Crew.newprofile.Item.talent');assert.equal(profile.data._id,'newprofile');
  assert.equal(updates['flags.starwarsffg.crew'][0].vehicle_id,'new');assert.equal(updates['flags.starwarsffg.crew'][1].actor_id,'manual');assert.equal(JSON.stringify(original),before);
});


test('completing an occupied integrated crew preserves data without another vehicle write',async()=>{
  const {api,actors,vehicle}=await fixture(),ship=vehicle();
  await api.completeIntegratedCrew(ship);
  const before=JSON.stringify(ship.flags),updates=ship.updates;
  const result=await api.completeIntegratedCrew(ship);
  assert.equal(result.created,0);assert.equal(result.integrated,0);
  assert.equal(ship.updates,updates);assert.equal(JSON.stringify(ship.flags),before);assert.equal(actors.length,1);
});

test('integrated copies retain deck positions for crew, passengers and manual characters',()=>{
  const original={_id:'old',flags:{starwarsffg:{crew:[{actor_id:'pilot',integrated:true}],integratedCrew:{profiles:Object.fromEntries(['pilot','support'].map(id=>[id,{id,data:{_id:id,flags:{starwarsffg:{autoCrew:{vehicleUuid:'Actor.old'}}}}}]))},vehicleDeck:{passengers:{asupport:{key:'asupport',actorId:'support',integrated:true}},positions:{apilot:{x:0.1,y:0.2},asupport:{x:0.3,y:0.4},amanual:{x:0.5,y:0.6}}}}}};
  const before=JSON.stringify(original);let sequence=0;
  const updates=prepareIntegratedCrewCopy(original,'new',()=> 'copy'+(++sequence)),positions=updates['flags.starwarsffg.vehicleDeck.positions'];
  assert.deepEqual(positions.acopy1,{x:0.1,y:0.2});assert.deepEqual(positions.acopy2,{x:0.3,y:0.4});assert.deepEqual(positions.amanual,{x:0.5,y:0.6});
  assert.equal(positions.apilot,undefined);assert.equal(positions.asupport,undefined);assert.equal(positions['-=apilot'],null);assert.equal(positions['-=asupport'],null);
  assert.equal(JSON.stringify(original),before);
  delete original.flags.starwarsffg.vehicleDeck.passengers;
  assert(prepareIntegratedCrewCopy(original,'new',()=> 'other'+(++sequence))['flags.starwarsffg.vehicleDeck.positions']);
});

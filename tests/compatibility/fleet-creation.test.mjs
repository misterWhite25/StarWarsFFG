import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as fleetModel from '../../modules/helpers/fleet-model.mjs';
const sourceUrl=new URL('../../modules/helpers/fleet-creation.mjs',import.meta.url);
const crewProfileUrl=new URL('../../modules/helpers/auto-crew-model.mjs',import.meta.url);
class Docs extends Map{[Symbol.iterator](){return this.values();}}
function vessel(id='template',affiliations=['alliance']){
  return {_id:id,name:'Y-Wing',type:'vehicle',ownership:{default:3},system:{spaceShip:true,stats:{hullTrauma:{value:4,max:12},systemStrain:{value:3,max:8}}},prototypeToken:{actorId:id,actorLink:true,texture:{src:'art.webp'},delta:{old:true}},flags:{starwarsffg:{crew:[{actor_id:'oldPilot',role:'Pilot'}],vehicleOwners:[{uuid:'Actor.oldPilot'}],vehicleDeck:{image:'deck.webp',passengers:{old:{actorId:'oldPilot'}}},groundMovementState:{used:2},fleetAffiliations:affiliations}},items:[{_id:'weapon',name:'Torpedo',type:'shipweapon',system:{damage:{value:6}},effects:[{_id:'effect',origin:'Actor.'+id+'.Item.weapon',duration:{}}]},{_id:'critical',type:'criticaldamage'}],effects:[{_id:'temporary',duration:{rounds:2}},{_id:'permanent',duration:{}}]};
}
async function engine({models=[vessel()],overrides={},failShipAt=Infinity,failCrewAt=Infinity,isGM=true}={}){
  let serial=0,shipCalls=0,crewCalls=0,folderCalls=0;const actors=new Docs(),folders=new Docs(),progress=[],crewOptions=[];
  const id=()=>String(++serial).padStart(16,'0');
  const actorDoc=data=>{const doc={...structuredClone(data),id:data._id,uuid:'Actor.'+data._id,getFlag(scope,key){return this.flags?.[scope]?.[key];},toObject(){const {_id,name,type,system,items,effects,prototypeToken,flags,ownership}=this;return structuredClone({_id,name,type,system,items,effects,prototypeToken,flags,ownership});},async delete(){actors.delete(this.id);}};doc.folder=data.folder?folders.get(data.folder):null;return doc;};
  for(const data of models)actors.set(data._id,actorDoc(data));
  const game={user:{isGM},actors,folders,settings:{get:()=>overrides},i18n:{localize:key=>key,format:(key,data)=>key+' '+JSON.stringify(data)}};
  const Actor={create:async data=>{shipCalls++;if(shipCalls===failShipAt)throw Error('ship failure');const doc=actorDoc(data);actors.set(doc.id,doc);return doc;}};
  const Folder={create:async data=>{folderCalls++;const folder={...data,id:id(),folder:data.folder?folders.get(data.folder):null,async delete(){folders.delete(this.id);}};folders.set(folder.id,folder);return folder;}};
  const createCrew=async(ship,options)=>{
    crewCalls++;crewOptions.push({...options});const crew=actorDoc({_id:id(),name:'Pilot',type:options.actorType,folder:options.folderId,flags:{starwarsffg:{autoCrew:{vehicleUuid:ship.uuid}}}});actors.set(crew.id,crew);
    if(crewCalls===failCrewAt)throw Error('crew failure');return {actors:[crew.id]};
  };
  const ctx=vm.createContext({console,structuredClone,game,Actor,Folder,foundry:{utils:{randomID:id}}});
  const mod=new vm.SourceTextModule(await fs.readFile(sourceUrl,'utf8'),{context:ctx});
  await mod.link(path=>{
    const exports=path.includes('fleet-model')?fleetModel:path.includes('fleet-catalogue')?{AFFILIATION_OVERRIDES_SETTING:'fleetAffiliationOverrides',getFleetVehicleDocument:async uuid=>{const doc=actors.get(uuid.slice(6));if(doc?.type!=='vehicle')throw Error('missing template');return doc;}}:{completeAutoCrew:createCrew};
    return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context:ctx});
  });await mod.evaluate();
  return {api:mod.namespace,game,actors,folders,progress,crewOptions,calls:()=>({shipCalls,crewCalls,folderCalls})};
}
const request=(rows=[{uuid:'Actor.template',count:1,crewMode:'detailed'}])=>({name:'Raid Alliance',faction:'alliance',disposition:1,rows:rows.map(row=>({...row,crewMode:row.crewMode??'detailed'}))});
test('a mixed detachment creates independent hulls and crew in a named fleet folder',async()=>{
  const e=await engine(),source=JSON.stringify(e.actors.get('template').toObject());
  const result=await e.api.createFleet(request([{uuid:'Actor.template',count:4,crewType:'minion'},{uuid:'Actor.template',count:2,crewType:'rival'}]),{onProgress:entry=>e.progress.push(entry)});
  assert.equal(result.shipIds.length,6);assert.equal(result.crewIds.length,6);assert.equal(e.folders.size,2);
  assert.equal(e.folders.get(result.folderId).name,'Raid Alliance');assert.equal(e.crewOptions.filter(o=>o.actorType==='minion').length,4);
  assert.ok(result.shipIds.every(id=>e.actors.get(id).type==='vehicle'));
  assert.equal(new Set(result.shipIds.map(id=>e.actors.get(id).items[0]._id)).size,6);
  assert.ok(result.crewIds.every(id=>e.actors.get(id).folder.folder.id===result.folderId));
  assert.deepEqual(e.progress.map(p=>p.done),[1,2,3,4,5,6]);assert.equal(JSON.stringify(e.actors.get('template').toObject()),source);
});
test('fresh copies keep model art and weapons, remove old identities, and rewrite embedded origins',async()=>{
  const e=await engine(),source=e.actors.get('template');let serial=0;
  const data=e.api.fleetVehicleData(source,{name:'Raid 01',newId:'newHull',folderId:'fleet',faction:'alliance',crewType:'minion',disposition:1,randomID:()=>String(++serial),affiliations:['alliance']});
  assert.equal(data.prototypeToken.texture.src,'art.webp');assert.equal(data.prototypeToken.actorLink,false);assert.equal(data.prototypeToken.delta,undefined);assert.equal(data.flags.starwarsffg.vehicleOwners,undefined);
  assert.equal(data.flags.starwarsffg.vehicleDeck.image,'deck.webp');assert.equal(Object.keys(data.flags.starwarsffg.vehicleDeck.passengers).length,0);assert.equal(data.flags.starwarsffg.crew.length,0);assert.equal(data.flags.starwarsffg.groundMovementState,undefined);
  assert.equal(data.items.length,1);assert.equal(data.items[0].system.damage.value,6);assert.equal(data.items[0].effects[0].origin,'Actor.newHull.Item.'+data.items[0]._id);
  assert.equal(data.effects.length,1);assert.equal(data.system.stats.hullTrauma.value,0);assert.equal(data.ownership.default,0);
});
test('fresh hulls drop malfunctions and voyage receipts but keep configured resources and upgrades',async()=>{
  const data=vessel();data.flags.starwarsffg.vehicleMalfunctions=[{id:'old'}];data.flags.starwarsffg.vehicleMaintenance={adjustment:100};data.flags.starwarsffg.vehicleLogbook=[{shipUuid:'Actor.template'}];
  data.flags['swffg-compendium-bilingual-steelers-core_rule']={key:'import-key',voyageResources:{history:{old:{breakdown:{title:'Panne'}}},revision:4,resources:{fuel:50},rates:{daysPerMonth:30}}};
  data.effects.push({_id:'malfunction',flags:{starwarsffg:{vehicleMalfunction:'old'}},duration:{}});data.system.biography='Profil \u2014 modèle';data.items[0].name='Arme \u2014 torpille';data.prototypeToken.texture.src='art\u2014path.webp';data.prototypeToken.flags={starwarsffg:{campOverride:-1}};
  const e=await engine(),copy=e.api.fleetVehicleData({...data,uuid:'Actor.template'},{newId:'new',disposition:1});
  assert.equal(copy.flags.starwarsffg.vehicleMalfunctions,undefined);assert.equal(copy.flags.starwarsffg.vehicleMaintenance,undefined);assert.equal(copy.flags.starwarsffg.vehicleLogbook,undefined);assert.equal(copy.effects.length,1);
  const voyage=copy.flags['swffg-compendium-bilingual-steelers-core_rule'];assert.equal(voyage.key,'import-key');assert.equal(voyage.voyageResources.history,undefined);assert.equal(voyage.voyageResources.resources.fuel,50);
  assert.equal(copy.system.biography,'Profil - modèle');assert.equal(copy.items[0].name,'Arme - torpille');assert.equal(copy.prototypeToken.texture.src,'art\u2014path.webp');assert.equal(copy.prototypeToken.flags.starwarsffg.campOverride,1);
});
test('every source and faction is checked before the first mutation',async()=>{
  const e=await engine({models:[vessel(),{...vessel('imperial',['empire']),name:'Imperial cruiser'}]});
  await assert.rejects(e.api.createFleet(request([{uuid:'Actor.template',count:1},{uuid:'Actor.imperial',count:1}])),/FactionMismatch/);
  assert.deepEqual(e.calls(),{shipCalls:0,crewCalls:0,folderCalls:0});
  await assert.rejects(e.api.createFleet(request([{uuid:'Actor.missing',count:1}])),/missing template/);assert.equal(e.folders.size,0);
  const unknown=await engine({models:[{...vessel('unknown',[]),name:'Unknown craft'}]});await assert.rejects(unknown.api.createFleet(request([{uuid:'Actor.unknown',count:1}])),/FactionMismatch/);
});
test('failure removes only newly created hulls, even partially created crew, and their folders',async()=>{
  const e=await engine({failCrewAt:2}),before=JSON.stringify(e.actors.get('template').toObject());
  await assert.rejects(e.api.createFleet(request([{uuid:'Actor.template',count:3}])),/crew failure/);
  assert.equal(e.actors.size,1);assert.equal(e.folders.size,0);assert.equal(JSON.stringify(e.actors.get('template').toObject()),before);
});
test('identical concurrent requests share one transaction and player calls never mutate documents',async()=>{
  const e=await engine();const [first,second]=await Promise.all([e.api.createFleet(request()),e.api.createFleet(request())]);assert.equal(first.folderId,second.folderId);assert.equal(e.calls().shipCalls,1);
  const player=await engine({isGM:false});assert.throws(()=>player.api.createFleet(request()),/GMOnly/);assert.equal(player.folders.size,0);
  assert.throws(()=>e.api.createFleet(request([{uuid:'Actor.template',count:101}])));assert.throws(()=>e.api.createFleet({...request(),name:' '}),/InvalidName/);
});
test('saved multi-faction overrides take precedence over the template labels',async()=>{
  const e=await engine({models:[vessel('template',['empire'])],overrides:{'Actor.template':['alliance','empire']}});
  const result=await e.api.createFleet(request());assert.equal(result.shipIds.length,1);assert.deepEqual([...e.actors.get(result.shipIds[0]).flags.starwarsffg.fleetAffiliations],['empire','alliance']);
});
test('minion pilots have one body and group skills, while nemeses retain their own strain pool',async()=>{
  const ctx=vm.createContext({console,structuredClone});const mod=new vm.SourceTextModule(await fs.readFile(crewProfileUrl,'utf8'),{context:ctx});
  await mod.link(()=>new vm.SyntheticModule(['bindGunners'],function(){this.setExport('bindGunners',crew=>crew);},{context:ctx}));await mod.evaluate();
  const base={characteristics:Object.fromEntries(['Brawn','Agility','Intellect','Presence'].map(key=>[key,{value:2}])),skills:Object.fromEntries(['Piloting: Space','Gunnery','Cool'].map(key=>[key,{rank:0,characteristic:'Agility'}])),stats:{wounds:{},strain:{},soak:{}}};
  const minion=mod.namespace.autoCrewProfile(base,{kind:'pilot'},'veteran','minion');assert.equal(minion.quantity.value,1);assert.equal(minion.quantity.max,1);assert.equal(minion.skills['Piloting: Space'].rank,0);assert.equal(minion.skills['Piloting: Space'].groupskill,true);assert.ok(minion.unit_wounds.value>0);
  const nemesis=mod.namespace.autoCrewProfile(base,{kind:'pilot'},'standard','nemesis');assert.ok(nemesis.stats.strain.max>0);assert.equal(nemesis.skills['Piloting: Space'].rank,2);
});

test('integrated fleets forward crew mode, avoid a crew folder and validate grouped craft counts',async()=>{
  const e=await engine();
  const result=await e.api.createFleet(request([{uuid:'Actor.template',count:2,crewMode:'integrated',groupSize:3}]));
  assert.equal(e.folders.size,1);assert.equal(result.shipIds.length,2);
  assert.ok(e.crewOptions.every(option=>option.mode==='integrated'&&option.actorType==='minion'&&option.folderId===undefined));
  assert.ok(result.shipIds.every(id=>e.actors.get(id).flags.starwarsffg.vehicleMinionGroup.count===3));
  assert.throws(()=>fleetModel.validateFleetRows([{uuid:'Actor.template',count:2,groupSize:51}],{maxShips:100}),/limite/);
  assert.throws(()=>fleetModel.validateFleetRows([{uuid:'Actor.template',count:1,crewMode:'invalid'}]),/mode/);
  const grouped=fleetModel.validateFleetRows([{uuid:'Actor.template',count:1,groupSize:3,crewMode:'detailed',crewType:'nemesis'}])[0];
  assert.equal(grouped.crewMode,'integrated');assert.equal(grouped.crewType,'minion');
  const invalid=vessel();invalid.system.stats.hullTrauma.max=0;const broken=await engine({models:[invalid]});
  await assert.rejects(broken.api.createFleet(request([{uuid:'Actor.template',count:1,groupSize:3,crewMode:'integrated'}])),/seuil de coque/);assert.equal(broken.folders.size,0);
});

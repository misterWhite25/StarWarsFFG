import test from 'node:test';
import assert from 'node:assert/strict';
import {fullStopVehicle} from '../../modules/helpers/triggered-talents.js';
import {strainChange} from '../../modules/helpers/astrogation-spending.js';
const vehicle=()=>({uuid:'Actor.ship',type:'vehicle',isOwner:true,flags:{starwarsffg:{vehicleMinionGroup:{enabled:true,count:3}}},system:{stats:{speed:{value:3},hullTrauma:{value:2,max:10},systemStrain:{value:0,max:8}}},async update(changes){for(const [path,value]of Object.entries(changes)){const keys=path.split('.');let at=this;for(const key of keys.slice(0,-1))at=at[key]??={};at[keys.at(-1)]=value;}}});
const pilot=()=>({uuid:'Actor.pilot',isOwner:true,items:[{id:'talent',type:'talent',name:'Roi du freinage',system:{}}],talentList:[],flags:{}});
test('Full Stop applies hull to a minion vehicle and restores that resource if posting fails',async()=>{
 globalThis.game={i18n:{localize:x=>x}};let fail=false;globalThis.ChatMessage={getSpeaker:()=>({}),create:async()=>{if(fail)throw Error('Posting failed');}};
 const ship=vehicle();await fullStopVehicle(pilot(),ship,true);assert.equal(ship.system.stats.hullTrauma.value,5);assert.equal(ship.system.stats.systemStrain.value,0);assert.equal(ship.system.stats.speed.value,0);
 const rollback=vehicle();fail=true;await assert.rejects(fullStopVehicle(pilot(),rollback,true),/Posting failed/);assert.equal(rollback.system.stats.hullTrauma.value,2);assert.equal(rollback.system.stats.speed.value,3);assert.equal(rollback.system.stats.systemStrain.value,0);
});
test('astrogation damage records hull for group undo and strain recovery cannot repair hull',()=>{
 globalThis.game={i18n:{localize:x=>x}};const ship=vehicle();assert.deepEqual(strainChange(ship,{amount:2,shipOnly:true},2),{actor:'Actor.ship',path:'system.stats.hullTrauma.value',before:2,after:6});assert.throws(()=>strainChange(ship,{amount:-1},1));
 ship.flags.starwarsffg.vehicleMinionGroup.enabled=false;assert.equal(strainChange(ship,{amount:2},1).path,'system.stats.systemStrain.value');
});

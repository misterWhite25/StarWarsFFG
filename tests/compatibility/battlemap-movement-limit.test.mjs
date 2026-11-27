import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';

async function setup(){
 const flags={mode:'battlemap'},updates=[];
 const settings={enableBattlemapMovement:true,enableNarrativeMovement:true,groundMovementModesMigrated:true};
 const user={id:'gm',isGM:true,active:true};
 const scene={id:'scene',documentName:'Scene',grid:{distance:5,units:'m',measurePath:()=>({distance:15})},getFlag:()=>flags,update:async change=>{updates.push(change);flags.limitMovement=change['flags.starwarsffg.groundMovement.limitMovement'];}};
 const context=vm.createContext({Hooks:{on(){},once(){}},game:{user,users:{activeGM:user},combats:[],settings:{get:(_scope,key)=>settings[key]},i18n:{localize:key=>key}},canvas:{scene},structuredClone});
 const api=(await loadSystemModule('helpers/ground-movement-state.mjs',context)).namespace;
 return {context,api,scene,flags,updates,user};
}

test('Battlemap movement limits default on, are scene-specific and leave measured ranges active',async()=>{
 const {api,scene,flags}=await setup();
 const token=id=>({id,documentName:'Token',parent:scene,actor:{type:'character'},x:id==='a'?0:15,y:0,elevation:0,getFlag:()=>null,getCenterPoint:()=>({x:0,y:0})});
 const a=token('a'),b=token('b');
 assert.equal(api.battlemapMovementLimited(scene),true);
 const before=structuredClone(api.rangeFor(a,b));
 await api.setSceneMovementLimit(scene,false);
 assert.equal(api.movementMode(scene),'battlemap');
 assert.equal(api.battlemapMovementLimited(scene),false);
 assert.deepEqual(structuredClone(api.rangeFor(a,b)),before);
 assert.equal(before.distance,15);
 assert.equal(api.battlemapMovementLimited({...scene,getFlag:()=>({mode:'battlemap'})}),true);
 flags.mode='narrative';assert.equal(api.battlemapMovementLimited(scene),false);
 flags.mode='none';assert.equal(api.battlemapMovementLimited(scene),false);
 flags.mode='battlemap';await api.setSceneMovementLimit(scene,true);
 assert.equal(api.battlemapMovementLimited(scene),true);
});

test('Only a GM can change the scene movement limit; free movement cannot be charged by an old distance command',async()=>{
 const {api,context,scene,user,updates}=await setup();
 user.isGM=false;
 await assert.rejects(api.setSceneMovementLimit(scene,false),/GMOnlyMode/);
 assert.equal(updates.length,0);
 user.isGM=true;
 await api.setSceneMovementLimit(scene,false);
 const token={id:'token',uuid:'Scene.scene.Token.token',documentName:'Token',parent:scene,actor:{type:'character',testUserPermission:()=>true},getFlag:()=>null};
 context.fromUuidSync=()=>token;
 const before=structuredClone(api.stateFor(token));
 for(const kind of ['record','unrecord']){
  const after=await api.applyMovementCommand({id:'test-'+kind,kind,tokenUuid:token.uuid,distance:100,native:true});
  assert.deepEqual(structuredClone(after),before);
 }
 await assert.rejects(api.applyMovementCommand({id:'test-validate',kind:'validate',tokenUuid:token.uuid}),/BattlemapValidationRequired/);
});

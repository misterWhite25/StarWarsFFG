import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';

test('technical space scenes are stored by default while ordinary scenes and folders remain available',async()=>{
 const context=vm.createContext({Hooks:{once(){},on(){}}});
 const {isStored}=(await loadSystemModule('helpers/scene-storage.mjs',context)).namespace;
 const technical={documentName:'Scene',id:'space',uuid:'Scene.space',getFlag:()=>true};
 const normal={documentName:'Scene',id:'play',uuid:'Scene.play',name:'Combat spatial',getFlag:()=>undefined};
 const folder={documentName:'Folder',id:'group',uuid:'Folder.group',type:'Scene'};
 assert.equal(isStored(technical,{}),true);
 assert.equal(isStored(normal,{}),false);
 assert.equal(isStored(folder,{}),false);
});

test('personal restore and folder preferences override the technical scene default',async()=>{
 const context=vm.createContext({Hooks:{once(){},on(){}}});
 const {isStored}=(await loadSystemModule('helpers/scene-storage.mjs',context)).namespace;
 const folder={documentName:'Folder',id:'group',uuid:'Folder.group',type:'Scene'};
 const technical={documentName:'Scene',id:'space',uuid:'Scene.space',getFlag:()=>true,folder};
 assert.equal(isStored(technical,{Scene:{space:false}}),false);
 assert.equal(isStored(technical,{Folder:{group:false}}),false);
 assert.equal(isStored(technical,{Scene:{space:true},Folder:{group:false}}),true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneDirectoryTokens} from '../../modules/helpers/scene-token-directory.mjs';
test('each token is an independent scene entry and legacy actor flags cannot create membership',()=>{
  const actor={id:'a',visible:true,getFlag:()=>({old:true})},scene={id:'s',tokens:[]};
  globalThis.game={user:{isGM:true}};
  assert.equal(sceneDirectoryTokens(actor,scene).length,0);
  const one={actorId:'a',actor:{visible:true}},two={actorId:'a',actor:{visible:true}},other={actorId:'b',actor:{visible:true}};
  scene.tokens.push(one,two,other);assert.deepEqual(sceneDirectoryTokens(actor,scene),[one,two]);
  scene.tokens.shift();assert.deepEqual(sceneDirectoryTokens(actor,scene),[two]);
  delete globalThis.game;
});
test('players cannot discover hidden or invisible scene tokens through the directory',()=>{
  const actor={id:'a',visible:true},scene={id:'s',tokens:[
    {actorId:'a',actor:{visible:true},hidden:true},
    {actorId:'a',actor:{visible:false},hidden:false},
    {actorId:'a',actor:{visible:true},hidden:false,object:{isVisible:false}},
    {actorId:'a',actor:{visible:true},hidden:false,object:{isVisible:true}}
  ]};
  globalThis.game={user:{isGM:false}};globalThis.canvas={ready:true,scene};
  assert.deepEqual(sceneDirectoryTokens(actor,scene),[scene.tokens[3]]);
  delete globalThis.game;delete globalThis.canvas;
});

import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const core=await import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('../../modules/helpers/pilotage-core.js',import.meta.url))).toString('base64'));
test('identical linked actors are separated by token UUID; aliases match',()=>{
 const effects=[{id:'a',subjectUuid:'Scene.s.Token.a',state:'pending',skill:'RangedLight',boost:1,setback:2},{id:'b',subjectUuid:'Scene.s.Token.b',state:'pending',boost:2,setback:0}];
 assert.deepEqual(core.modifierTotals(core.matchingModifiers(effects,'Scene.s.Token.a','Armes légères')),{boost:1,setback:2});
 assert.equal(core.matchingModifiers(effects,'Scene.s.Token.a','Medicine').length,0);
 assert.equal(core.matchingModifiers([{...effects[0],state:'used'}],'Scene.s.Token.a','Ranged: Light').length,0);
});
test('negative, fraction and non-numeric modifier counts are rejected',()=>{
 for(const value of [-1,1.5,NaN,Infinity,21])assert.throws(()=>core.modifierCounts({boost:value,setback:0}));
 assert.deepEqual(core.modifierCounts({boost:'2',setback:'1'}),{boost:2,setback:1});
});
test('table chooses right when left blocked, left when right blocked',()=>{
 const viewport={width:1280,height:900};
 const right=core.adjacentPlacement({left:20,right:370,top:80,bottom:600},viewport);
 assert.equal(right.side,'right');assert.ok(right.left>=382);assert.ok(right.left+right.width<=1268);
 const left=core.adjacentPlacement({left:900,right:1250,top:80,bottom:600},viewport);
 assert.equal(left.side,'left');assert.ok(left.left+left.width<=888);assert.ok(left.left>=12);
});
test('no room uses a bounded fallback instead of pretending two windows fit',()=>{
 const p=core.adjacentPlacement({left:10,right:360,top:10,bottom:700},{width:400,height:750});
 assert.equal(p.side,'fallback');assert.ok(p.left+p.width<=388);
});
test('centered roll is shifted slightly when two windows fit a narrow viewport',()=>{
 const p=core.adjacentPlacement({left:218,right:568,top:70,bottom:780},{width:787,height:1404});
 assert.equal(p.side,'right');assert.equal(p.jetLeft,12);assert.ok(p.left>=p.jetLeft+350+12);assert.ok(p.left+p.width<=775);
});

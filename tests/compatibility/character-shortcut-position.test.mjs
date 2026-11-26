import test from 'node:test';
import assert from 'node:assert/strict';
import {shortcutPositionKey,shortcutPosition,boundedShortcutPosition} from '../../modules/helpers/character-shortcut-position.mjs';

test('positions belong to a particular user and world',()=>{
  assert.notEqual(shortcutPositionKey('one','gm'),shortcutPositionKey('two','gm'));
  assert.notEqual(shortcutPositionKey('one','gm'),shortcutPositionKey('one','player'));
});

test('malformed positions are ignored while valid zero coordinates are retained',()=>{
  for(const value of [null,{},[],{left:'10',top:20},{left:NaN,top:20},{left:10,top:Infinity}])assert.equal(shortcutPosition(value),null);
  assert.deepEqual(shortcutPosition({left:0,top:0,extra:true}),{left:0,top:0});
});

test('a smaller viewport keeps the whole shortcut block reachable',()=>{
  const viewport={width:1000,height:600},bounds={width:300,height:100};
  assert.deepEqual(boundedShortcutPosition({left:1200,top:900},bounds,viewport),{left:700,top:500});
  assert.deepEqual(boundedShortcutPosition({left:-100,top:-20},bounds,viewport),{left:0,top:0});
  assert.deepEqual(boundedShortcutPosition({left:20,top:30},{width:1200,height:800},viewport),{left:0,top:0});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {actorDirectoryGroup} from '../../modules/helpers/actor-directory-group.mjs';
import {usesAlliedDirectoryDefault,hasCampOverride} from '../../modules/helpers/directory-camps.mjs';
test('all characters and vehicles classified in Actors use the allied default',()=>{
  for(const actor of [{type:'character'},{type:'rival',flags:{starwarsffg:{npcDirectory:false}}},{type:'vehicle',flags:{starwarsffg:{vehicleDirectory:'actors'}}},{type:'vehicle',flags:{starwarsffg:{vehicleInActors:true}}}]){
    assert.equal(actorDirectoryGroup(actor),'actors');assert.equal(usesAlliedDirectoryDefault(actor),true);
  }
});
test('NPC and vehicle directories keep their native disposition defaults',()=>{
  for(const actor of [{type:'nemesis'},{type:'minion'},{type:'character',flags:{starwarsffg:{npcDirectory:true}}},{type:'vehicle',flags:{starwarsffg:{vehicleDirectory:'npcs'}}},{type:'vehicle',flags:{starwarsffg:{vehicleDirectory:'vehicles'}}}])assert.equal(usesAlliedDirectoryDefault(actor),false);
});
test('explicit choices survive defaults, including zero for neutral tokens',()=>{
  for(const value of [-2,-1,0,1]){
    const flags={starwarsffg:{campOverride:value}};assert.equal(hasCampOverride({flags}),true);
    assert.equal(usesAlliedDirectoryDefault({type:'character',flags}),false);
    assert.equal(usesAlliedDirectoryDefault({type:'character'},{flags}),false);
  }
  assert.equal(usesAlliedDirectoryDefault({type:'character'}),true);assert.equal(usesAlliedDirectoryDefault({type:'character',pack:'source.pack'}),false);
});
test('badge colors retain high contrast on both light and dark themes',()=>{
  const linear=value=>{const c=parseInt(value,16)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
  const luminance=hex=>{const c=hex.match(/../g).map(linear);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
  for(const [background,text] of [['1d5138','effff5'],['713027','fff4ef'],['514828','fff8dd'],['414750','fafcff']]){const ratio=(luminance(text)+.05)/(luminance(background)+.05);assert.ok(ratio>=7,String(ratio));}
});

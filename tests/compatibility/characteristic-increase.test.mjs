import assert from 'node:assert/strict';
import test from 'node:test';
import Increase from '../../modules/helpers/characteristic-increase.js';
const actor={system:{characteristics:{Brawn:{value:3},Willpower:{value:2},Agility:{value:6}}}};
const item={_id:'old',name:'Entraînement',type:'talent',system:{ranks:{ranked:true,current:2},attributes:{old:{mod:'Presence'}}},effects:[{name:'old'}]};
test('recognizes both names and replaces previous selected effects with one acquisition',()=>{
 assert.ok(Increase.matches(item));assert.ok(Increase.matches({...item,name:'Dedication'}));assert.ok(!Increase.matches({...item,name:'Autre talent'}));
 const result=Increase.configure(item,actor,'Brawn','progression');
 assert.equal(result._id,undefined);assert.equal(result.system.ranks.current,1);assert.equal(result.effects.length,1);
 assert.deepEqual(result.effects[0].system.changes.map(c=>c.key),['system.characteristics.Brawn.value','system.stats.soak.value','system.stats.encumbrance.max']);
 assert.equal(Increase.label(result),'Vigueur');assert.equal(item.effects[0].name,'old');
});
test('creation increases appropriate threshold, progression does not; max six enforced',()=>{
 const paths=(key,phase)=>Increase.configure(item,actor,key,phase).effects[0].system.changes.map(c=>c.key);
 assert.ok(paths('Brawn','creation').includes('system.stats.wounds.max'));
 assert.ok(paths('Willpower','creation').includes('system.stats.strain.max'));
 assert.deepEqual(paths('Willpower','progression'),['system.characteristics.Willpower.value']);
 assert.throws(()=>Increase.configure(item,actor,'Agility','progression'),/6/);
 assert.throws(()=>Increase.configure(item,actor,'Foo','creation'));
});
test('existing talents display their configured characteristic without changing their bonuses',()=>{
 assert.equal(Increase.label({system:{attributes:{a:{modtype:'Characteristic',mod:'Presence',value:1}}}}),'Présence');
 assert.equal(Increase.label({system:{attributes:{}}}),'Non renseigné');
});

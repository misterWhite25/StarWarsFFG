import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';
import {systemI18n} from '../system-i18n.mjs';

test('repair metadata follows the UI language for current and saved French rules without changing prices',async()=>{
  const game={i18n:await systemI18n('en')};
  const context=vm.createContext({game,structuredClone});
  const engine=(await loadSystemModule('helpers/vehicle-malfunction-engine.js',context)).namespace;
  const rules=(await loadSystemModule('helpers/vehicle-malfunction-rules.js',context)).namespace;
  const actor={system:{stats:{silhouette:{value:4},cost:{value:100000}}}};
  const current=rules.MALFUNCTION_RULES['91c17ccc05c525da'];
  const before=JSON.stringify(current);
  const quote=engine.repairQuote(actor,current);
  assert.equal(quote.total,600);
  assert.equal(quote.time,'2 hours');
  assert.equal(quote.test,'Mechanics (2)');
  const saved={...current,repairTime:'2 heure',repairTest:'Mécanique (2)'};
  assert.equal(engine.repairQuote(actor,saved).time,'2 hours');
  assert.equal(engine.repairQuote(actor,saved).test,'Mechanics (2)');
  game.i18n=await systemI18n('fr');
  assert.equal(engine.repairQuote(actor,current).time,'2 heures');
  assert.equal(engine.repairQuote(actor,current).test,'Mécanique (2)');
  assert.equal(engine.repairQuote(actor,current).total,600);
  assert.equal(JSON.stringify(current),before);
  assert.equal(rules.malfunctionRepairText('Custom engineering procedure'),'Custom engineering procedure');
  assert.equal(rules.malfunctionRepairText('-'),'-');
  assert.equal(rules.malfunctionRepairText('toString'),'toString');
  assert.equal(rules.malfunctionRepairText('__proto__'),'__proto__');
});

test('all repair metadata resolves strictly in EN and FR while mechanical units stay intact',async()=>{
  const game={i18n:await systemI18n('en')};
  const context=vm.createContext({game});
  const {MALFUNCTION_RULES,malfunctionRepairText}=(await loadSystemModule('helpers/vehicle-malfunction-rules.js',context)).namespace;
  assert.equal(Object.keys(MALFUNCTION_RULES).length,35);
  for(const lang of ['en','fr']){
    game.i18n=await systemI18n(lang);
    for(const rule of Object.values(MALFUNCTION_RULES))for(const property of ['repairTime','repairTest']){
      const text=malfunctionRepairText(rule[property]);
      assert.ok(!text.startsWith('SWFFG.'),`${lang}: ${rule.resultId}.${property}`);
      assert.ok(!text.includes('\u2014'));
    }
  }
  assert.equal(MALFUNCTION_RULES['0e2d18ce3aaa9e49'].timer,'1d6');
  assert.equal(MALFUNCTION_RULES['0e2d18ce3aaa9e49'].unit,'°C/h');
  assert.equal(MALFUNCTION_RULES['0aa7510057b401e3'].repair.value,50);
});

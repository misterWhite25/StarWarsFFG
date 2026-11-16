import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';
import {systemI18n} from '../system-i18n.mjs';

for (const language of ['en', 'fr']) {
  test(language + ': ground labels and errors are localized without changing movement costs', async() => {
    const context = vm.createContext({});
    const model = (await loadSystemModule('helpers/ground-movement-model.mjs', context)).namespace;
    const i18n = await systemI18n(language);
    context.game = {i18n, settings:{get:() => ({contact:1.5, short:10, medium:50, long:250, extreme:1000})}};
    assert.equal(i18n.localize(model.bands[1]), language === 'en' ? 'Short' : 'Courte');
    assert.equal(i18n.localize(model.modes.narrative), language === 'en' ? 'Narrative' : 'Narratif');
    const state = {used:1, actionUsed:false};
    assert.deepEqual(structuredClone(model.spend(state, 1, 'strain')), {used:2, actionUsed:false, strainCost:2});
    assert.deepEqual(state, {used:1, actionUsed:false});
    assert.throws(() => model.spend({used:2}, 1), error => error.message === i18n.localize('SWFFG.UI.Ground.TwoManeuverLimitGM'));
    const metric = model.calibration({grid:{distance:5, units:'m'}});
    const imperial = model.calibration({grid:{distance:5, units:'ft'}});
    assert.equal(metric.short, 10);
    assert.ok(Math.abs(imperial.short * .3048 - 10) < 1e-9);
  });

  test(language + ': dice source descriptions translate while imported names and rolled dice remain intact', async() => {
    const i18n = await systemI18n(language), context = vm.createContext({game:{i18n}});
    const {DicePoolFFG} = (await loadSystemModule('dice/pool.js', context, {
      'helpers/gm-difficulty.js':{gmDifficulty:() => ({enabled:false}), effectivePool:pool => pool}
    })).namespace;
    const input = {ability:2, setback:2, remsetback:1, source:{
      skill:[{name:'purchased', value:2}],
      boost:[{modtype:'Skill Boost', name:'My Imported Talent', type:'Talent', value:1}]
    }};
    const pool = new DicePoolFFG(input);
    assert.equal(pool.renderDiceExpression(), '2da+1ds');
    assert.equal(pool.source.skill[0], i18n.format('SWFFG.UI.Dice.SourcePurchased', {value:2}));
    assert.ok(pool.source.boost[0].includes('My Imported Talent'));
    assert.match(pool.source.boost[0], language === 'en' ? /boost dice/ : /Fortune/);
    assert.equal(input.source.boost[0].modtype, 'Skill Boost');
    assert.equal(input.source.skill[0].name, 'purchased');
  });
}

test('Ground and Dice keys have matching EN/FR parameters and no em dash', async() => {
  const dictionaries = {};
  for (const language of ['en', 'fr']) dictionaries[language] = JSON.parse(await readFile(new URL('../../lang/' + language + '.json', import.meta.url), 'utf8'));
  const keys = Object.keys(dictionaries.en).filter(key => /^SWFFG\.UI\.(Ground|Dice)\./.test(key));
  assert.ok(keys.length >= 233);
  const parameters = value => [...new Set([...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match => match[1]))].sort();
  for (const key of keys) {
    assert.equal(typeof dictionaries.fr[key], 'string', key);
    assert.deepEqual(parameters(dictionaries.en[key]), parameters(dictionaries.fr[key]), key);
    for (const language of ['en', 'fr']) assert.ok(!dictionaries[language][key].includes(String.fromCodePoint(0x2014)), language + ': ' + key);
  }
});

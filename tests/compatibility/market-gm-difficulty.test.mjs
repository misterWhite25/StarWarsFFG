import {systemI18n} from '../system-i18n.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';
import {applyTargetAdversary} from '../../modules/helpers/target-adversary.mjs';
import {setbackAfterRemovals} from '../../modules/helpers/setback-removal.mjs';

async function fixture() {
  const config = {enabled:true, difficulty:1, challenge:1, setback:2};
  const context = vm.createContext({
    structuredClone, Hooks:{on() {}, off() {}},
    game:{i18n:await systemI18n('fr'), settings:{get:(_scope, key) => key === 'gmDifficulty' ? config : false}, actors:{get() {}}}
  });
  const gm = await loadSystemModule('helpers/gm-difficulty.js', context, {
    'helpers/pilotage-assets.mjs':{setupPilotageAssets() {}},
    'helpers/pilotage-tabs.mjs':{setupPilotageTabs() {}}
  });
  const {DicePoolFFG} = (await loadSystemModule('dice/pool.js', context, {
    'helpers/gm-difficulty.js':{...gm.namespace}
  })).namespace;
  const pool = ignore => new DicePoolFFG({
    _ignoreGMDifficulty:ignore, ability:3, boost:1, difficulty:4, challenge:2, setback:6, remsetback:2
  });
  return {config, context, gm:gm.namespace, DicePoolFFG, pool};
}

test('market pools preserve their own difficulty and setback removals while ordinary pools use common GM difficulty', async() => {
  const f = await fixture(), market = f.pool(true), ordinary = f.pool(false);
  assert.equal(f.gm.gmDifficulty(market).enabled, false);
  assert.equal(f.gm.gmDifficulty().enabled, true);
  assert.equal(market.renderDiceExpression(), '3da+2dc+4di+1db+4ds');
  assert.equal(ordinary.renderDiceExpression(), '3da+1dc+1di+1db+2ds');
  const effective = f.gm.effectivePool(market);
  assert.equal(effective.difficulty, 4);
  assert.equal(effective.challenge, 2);
  assert.equal(effective.setback, 6);
  assert.equal(effective.remsetback, 2);
  assert.equal(effective._ignoreGMDifficulty, true);
  assert.deepEqual(f.config, {enabled:true, difficulty:1, challenge:1, setback:2});
});

test('market bypass survives pool reconstruction and JSON forwarding without changing common difficulty defaults', async() => {
  const f = await fixture(), original = f.pool(true);
  for (const restored of [new f.DicePoolFFG(original), new f.DicePoolFFG(JSON.stringify(original))]) {
    assert.equal(restored._ignoreGMDifficulty, true);
    assert.equal(restored.renderDiceExpression(), original.renderDiceExpression());
  }
  assert.equal(new f.DicePoolFFG()._ignoreGMDifficulty, false);
  assert.equal(new f.DicePoolFFG({_ignoreGMDifficulty:'true'})._ignoreGMDifficulty, false);
  assert.equal(f.gm.effectivePool(f.pool(false)).difficulty, 1);
});

async function builderFixture(ignore) {
  const f = await fixture();
  const source = await readFile(new URL('../../modules/dice/roll-builder.js', import.meta.url), 'utf8');
  const imports = new Map([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)]
    .map(([, names, path]) => [path, names.split(',').map(name => name.trim())]));
  const values = {
    ...f.gm, FormApplicationV2:class {},
    pilotageTotals:() => ({boost:0, setback:0}),
    selectedRollTalents:() => [], rollTalentPool:pool => pool,
    setbackAfterRemovals, applyTargetAdversary
  };
  const module = new vm.SourceTextModule(source, {context:f.context});
  await module.link(path => {
    const names = imports.get(path);
    return new vm.SyntheticModule(names, function() {
      for (const name of names) this.setExport(name, values[name] ?? (() => {}));
    }, {context:f.context});
  });
  await module.evaluate();
  const app = new module.namespace.default({}, f.pool(ignore), 'Market', 'Negotiation', {});
  app._renderWeaponSummary = () => {};
  app._updatePreview = () => {};
  const inputs = ['ability', 'difficulty', 'challenge', 'setback'].map(name => ({name}));
  const notice = {}, removals = {}, buttons = {}, handlers = new Map();
  const html = {
    0:{querySelector:selector => selector === '.ffg-reviewed-removals' ? removals : selector === '.ffg-gm-difficulty-notice' ? notice : null},
    find:selector => ({
      prop:(name, value) => {if (selector === '#upgrade-difficulty, #downgrade-difficulty') buttons[name] = value;},
      each:callback => {if (selector === '.pool-value input') inputs.forEach((input, index) => callback(index, input));},
      on:(event, callback) => handlers.set(selector + ':' + event, callback)
    })
  };
  f.context.$ = node => ({
    attr:name => node[name], hasClass:() => false,
    find:() => [inputs.find(input => input.name === 'difficulty')]
  });
  app._initializeInputs(html);
  app._activateInputs(html);
  return {...f, app, inputs, notice, buttons, handlers};
}

test('market roll controls show local dice, permit edits and hide the common difficulty notice', async() => {
  const market = await builderFixture(true), ordinary = await builderFixture(false);
  for (const f of [market, ordinary]) {
    const exempt = f === market;
    assert.equal(f.notice.hidden, exempt);
    assert.equal(f.buttons.disabled, !exempt);
    for (const name of ['difficulty', 'challenge', 'setback']) assert.equal(f.inputs.find(input => input.name === name).disabled, !exempt);
  }
  assert.equal(market.inputs.find(input => input.name === 'difficulty').value, 4);
  assert.equal(ordinary.inputs.find(input => input.name === 'difficulty').value, 1);
  for (const f of [market, ordinary]) {
    const original = f.app.dicePool.difficulty, event = {currentTarget:{}};
    f.handlers.get('.pool-container, .pool-additional:click')(event);
    assert.equal(f.app.dicePool.difficulty, original + (f === market ? 1 : 0));
    f.handlers.get('.pool-container, .pool-additional:contextmenu')(event);
    assert.equal(f.app.dicePool.difficulty, original);
  }
});

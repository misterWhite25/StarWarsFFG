import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadHelper(file) {
  const context = vm.createContext({CONFIG: {logger: {debug() {}}}});
  const module = new vm.SourceTextModule(await readFile(new URL(`../../modules/helpers/${file}`, import.meta.url), 'utf8'), {context});
  await module.link(() => new vm.SyntheticModule(['default', 'getActiveEffectChanges', 'activeEffectChangesUpdate', 'deleteDataField'], function () {
    this.setExport('default', {});
    this.setExport('getActiveEffectChanges', effect => effect.changes);
    this.setExport('activeEffectChangesUpdate', changes => ({changes}));
    this.setExport('deleteDataField', () => {});
  }, {context}));
  await module.evaluate();
  return module.namespace.default;
}

test('null equipment entries do not prevent valid modifier effects from being synchronized', async () => {
  const helpers = await loadHelper('item-helpers.js');
  const updates = [];
  const effect = {name: 'bonus', changes: [{key: 'system.stats.soak.value', value: 1}], update: async data => updates.push(data)};
  const item = {type: 'armour', system: {
    itemmodifier: [null, {}, {system: {attributes: {bonus: {value: 2}}, rank_current: 3}}],
    itemattachment: [null, {system: {itemmodifier: [null, {system: {attributes: {bonus: {}}, active: false}}]}}]
  }, getEmbeddedCollection: () => [effect]};
  await helpers.syncAEStatus(item, [effect]);
  assert.equal(updates[0].changes[0].value, 6);
  assert.equal(await helpers.shouldUpdateAEStatus(item, effect), false);
  item.system = {};
  await helpers.syncAEStatus(item, [effect]);
  assert.equal(await helpers.shouldUpdateAEStatus(item, effect), true);
});

test('item sheet recursive search skips null entries while retaining nested matching keys', async () => {
  const helpers = await loadHelper('embeddeditem-helpers.js');
  const data = {itemmodifier: [null, {system: {'itemattachment[0]': {}, empty: null}}]};
  assert.deepEqual(Array.from(helpers.findKeysIncludingStringRecursively(data, 'itemattachment')), ['itemattachment[0]']);
  assert.deepEqual(Array.from(helpers.findKeysIncludingStringRecursively(null, 'itemattachment')), []);
});

test('equipping imported armour refreshes stale inherent bonuses without changing custom bonuses', async () => {
  const helpers = await loadHelper('item-helpers.js');
  const item = {type: 'armour', system: {soak: {value: 2}, defence: {value: 1}}};
  const effect = {name: '(inherent)', changes: [
    {key: 'system.stats.soak.value', value: 0},
    {key: 'system.stats.defence.melee', value: 0},
    {key: 'system.stats.defence.ranged', value: 0}
  ], async update(data) { this.changes = data.changes; }};
  await helpers.updateEncumbranceOnEquip(item, effect, true);
  assert.deepEqual(effect.changes.map(c => c.value), [2, 1, 1]);
  effect.name = 'custom';
  item.system.soak.value = 8;
  await helpers.updateEncumbranceOnEquip(item, effect, false);
  assert.equal(effect.changes[0].value, 2);
});

for (const [type,field] of [['specialization','talents'],['forcepower','upgrades']]) {
  test(`${type}: absent traits are skipped while learned and unlearned effect states are synchronized`, async () => {
    const helpers = await loadHelper('item-helpers.js'), updates = [];
    const effect = {name:'bonus', update:async data=>updates.push({...data})};
    const item = {type, system:{[field]:{
      missing:null, noAttributes:{islearned:true}, unrelated:{attributes:{other:{}},islearned:true},
      learned:{attributes:{bonus:{}},islearned:true}, unlearned:{attributes:{bonus:{}},islearned:false}
    }}};
    await helpers.syncAEStatus(item,[effect]);
    assert.deepEqual(updates,[{disabled:false},{disabled:true}]);
  });

  test(`${type}: a matching effect write failure propagates to the awaited caller`, async () => {
    const helpers = await loadHelper('item-helpers.js'), failure = Error('permission denied');
    const item = {type, system:{[field]:{learned:{attributes:{bonus:{}},islearned:true}}}};
    const effect = {name:'bonus', update:async()=>{throw failure;}};
    await assert.rejects(helpers.syncAEStatus(item,[effect]),error=>error===failure);
  });
}

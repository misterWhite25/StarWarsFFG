import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function setup(version, report = null) {
  const saved = [], messages = [], errors = [];
  const context = vm.createContext({
    game: {system: {version: '0.0.2'}, user: {id: 'gm'},
      settings: {get: (_ns, key) => key === 'systemMigrationVersion' ? version : 'mandar',
        set: async (...args) => saved.push(args)},
      i18n: {format: key => key}},
    foundry: {applications: {handlebars: {renderTemplate: async () => 'updated'}}},
    CONFIG: {logger: {log() {}, warn() {}}},
    CONST: {CHAT_MESSAGE_STYLES: {OTHER: 0}},
    ChatMessage: {create: data => messages.push(data)},
    ui: {notifications: {error: (...args) => errors.push(args)}}
  });
  const mod = new vm.SourceTextModule(await readFile(new URL('../../modules/swffg-migration.js', import.meta.url), 'utf8'), {context});
  await mod.link(spec => {
    const exports = spec.includes('active-effects-v14') ? {ensureActiveEffectsV14: async () => report}
      : spec.includes('data-operators') ? {deleteDataField() {}} : {default: {}};
    return new vm.SyntheticModule(Object.keys(exports), function() {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, {context});
  });
  await mod.evaluate();
  return {update: mod.namespace.handleUpdate, saved, messages, errors};
}

for (const version of ['0.0.1', '2.3.0', '', '1.907']) {
  test(`world ${version || 'new'} updates to Tonio without unsupported prompt or obsolete conversions`, async () => {
    const run = await setup(version);
    await run.update();
    assert.deepEqual(run.saved, [['starwarsffg', 'systemMigrationVersion', '0.0.2']]);
    assert.equal(run.messages.length, 1);
  });
}
test('current Tonio version does not repeat update notifications', async () => {
  const run = await setup('0.0.2');
  await run.update();
  assert.equal(run.saved.length, 0);
  assert.equal(run.messages.length, 0);
});
test('failed v14 effect migration still blocks version registration', async () => {
  const run = await setup('0.0.1', {failed: ['actor'], lockedPacks: []});
  await run.update();
  assert.equal(run.saved.length, 0);
  assert.equal(run.messages.length, 0);
  assert.equal(run.errors.length, 1);
});

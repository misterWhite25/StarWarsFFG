import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('native tour management separates Legacy while retaining native keys, progress and role filtering', async t => {
  let nativeSource;
  try {
    nativeSource = await readFile('/home/tonio2581/foundry-v14/client/applications/sidebar/apps/tours-management.mjs', 'utf8');
  } catch {
    t.skip('Local Foundry v14 runtime unavailable');
    return;
  }
  const tours = [
    {namespace: 'core', id: 'welcome'},
    ...['systeme', 'voyages', 'des', 'vehicules', 'talents', 'pilotage-mj'].map(id => ({
      namespace: 'starwarsffg', id: 'steelers-' + id, restricted: id === 'pilotage-mj',
    })),
    {namespace: 'starwarsffg', id: 'character', title: 'Actor Guide'},
    {namespace: 'starwarsffg', id: 'edit-mode', title: 'Edit Mode', status: 'in-progress', stepIndex: 1},
    {namespace: 'other-module', id: 'other'},
  ].map(tour => ({title: tour.id, description: 'Description', status: 'unstarted', canStart: true,
    stepIndex: -1, steps: Array(5), ...tour, config: {display: true, restricted: tour.restricted, canBeResumed: true}}));
  const context = vm.createContext({
    game: {system: {id: 'starwarsffg', title: 'Steelers'}, tours, user: {isGM: true},
      modules: new Map([['other-module', {id: 'other-module', title: 'Other module'}]])},
    _loc: (key, values) => values ? JSON.stringify(values) : key,
  });
  vm.runInContext('Array.prototype.filterJoin = function(separator) { return this.filter(Boolean).join(separator); };', context);
  const native = new vm.SourceTextModule(nativeSource, {context});
  await native.link(async specifier => {
    const value = specifier.endsWith('/tour.mjs') ? {STATUS: {UNSTARTED: 'unstarted', IN_PROGRESS: 'in-progress', COMPLETED: 'completed'}} : class {};
    return new vm.SyntheticModule(['default'], function () { this.setExport('default', value); }, {context});
  });
  await native.evaluate();
  const ToursManagement = native.namespace.default;
  context.foundry = {applications: {sidebar: {apps: {ToursManagement}}}};
  const helper = new vm.SourceTextModule(await readFile(new URL('../../modules/helpers/legacy-tour-category.js', import.meta.url), 'utf8'), {context});
  await helper.link(() => {});
  await helper.evaluate();
  const manager = new ToursManagement();
  helper.namespace.registerLegacyTourCategory();
  const prepare = ToursManagement.prototype._prepareCategoryData;
  helper.namespace.registerLegacyTourCategory();
  assert.equal(ToursManagement.prototype._prepareCategoryData, prepare);
  const categories = manager._prepareCategoryData();
  assert.equal(categories.system.entries.length, 6);
  const legacy = categories['starwarsffg-legacy'];
  assert.equal(legacy.label, 'Star Wars FFG - Legacy');
  assert.deepEqual(Array.from(legacy.entries, e => e.id), ['starwarsffg.character', 'starwarsffg.edit-mode']);
  assert.deepEqual(Array.from(legacy.entries, e => e.label), ['Actor Guide', 'Edit Mode']);
  assert.equal(legacy.entries[1].status, '{"current":2,"total":5}');
  assert(legacy.entries[1].canReset);
  assert.equal(categories.core.entries.length, 1);
  assert.equal(categories['other-module'].entries.length, 1);
  context.game.user.isGM = false;
  assert.equal(manager._prepareCategoryData().system.entries.length, 5);
  assert.equal(manager._prepareCategoryData()['starwarsffg-legacy'].entries.length, 2);
  context.game.tours = tours.filter(tour => !['character', 'edit-mode'].includes(tour.id));
  assert(!manager._prepareCategoryData()['starwarsffg-legacy']);
  context.game.tours = [];
  assert.equal(Object.keys(manager._prepareCategoryData()).length, 0);
});

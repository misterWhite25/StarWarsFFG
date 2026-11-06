import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {systemGuideTours} from '../../modules/helpers/system-guide-content.js';

const sourceUrl = name => new URL(`../../modules/helpers/${name}.js`, import.meta.url);

test('Steelers publishes six independent tours with valid images and a GM-only Pilotage tour', async () => {
  assert.deepEqual(systemGuideTours.map(t => t.id), [
    'steelers-systeme', 'steelers-voyages', 'steelers-des', 'steelers-vehicules', 'steelers-talents', 'steelers-pilotage-mj',
  ]);
  assert.deepEqual(systemGuideTours.filter(t => t.restricted).map(t => t.id), ['steelers-pilotage-mj']);
  const images = new Set();
  for (const tour of systemGuideTours) {
    assert(tour.display && tour.canBeResumed && !tour.closeWindows);
    assert(tour.description && tour.steps.length > 1);
    assert.equal(new Set(tour.steps.map(step => step.id)).size, tour.steps.length);
    assert(!JSON.stringify(tour).includes(String.fromCharCode(8212)));
    for (const step of tour.steps) {
      assert(step.title && !step.selector);
      assert(step.content.includes('ffg-guide-path'));
      for (const [, file, alt] of step.content.matchAll(/<img src="systems\/starwarsffg\/([^"]+)" alt="([^"]+)"/g)) {
        assert(alt.trim());
        images.add(file);
      }
    }
  }
  assert(images.size >= 5);
  for (const file of images) {
    const bytes = await readFile(new URL(`../../${file}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', file);
  }
});

async function loadGuide(context) {
  const content = new vm.SourceTextModule(await readFile(sourceUrl('system-guide-content'), 'utf8'), {context});
  await content.link(() => {});
  await content.evaluate();
  const module = new vm.SourceTextModule(await readFile(sourceUrl('system-guide'), 'utf8'), {context});
  await module.link(() => content);
  await module.evaluate();
  return module.namespace;
}

test('register once, keep independent progress, and only mark the introduction seen after a successful start', async () => {
  const values = new Map(), tours = new Map(), starts = [];
  let fail = true;
  class Tour {
    static tourInProgress = false;
    constructor(config) { this.config = config; this.steps = config.steps; this.stepIndex = -1; }
    async start() { if (fail) throw Error('start failed'); starts.push(this.config.id); }
  }
  const context = vm.createContext({
    console: {error() {}}, ui: {notifications: {error() {}}},
    foundry: {nue: {Tour}, applications: {instances: new Map()}},
    game: {user: {isGM: false}, system: {version: '1'},
      tours: {has: k => tours.has(k), get: k => tours.get(k), register(scope, id, tour) {
        const key = `${scope}.${id}`;
        assert(!tours.has(key));
        tours.set(key, tour);
      }},
      settings: {register: (_s, k, o) => values.set(k, o.default), get: (_s, k) => values.get(k), set: (_s, k, v) => values.set(k, v)}},
  });
  const guide = await loadGuide(context);
  guide.registerSystemGuide();
  guide.registerSystemGuideTours();
  const vehicles = tours.get('starwarsffg.steelers-vehicules');
  vehicles.stepIndex = 2;
  guide.registerSystemGuideTours();
  assert.equal(tours.size, 6);
  assert.equal(tours.get('starwarsffg.steelers-vehicules'), vehicles);
  await guide.showSystemGuideAfterUpdate();
  assert.equal(values.get('systemGuideSeenVersion'), '');
  fail = false;
  await guide.showSystemGuideAfterUpdate();
  await guide.showSystemGuideAfterUpdate();
  assert.equal(values.get('systemGuideSeenVersion'), '1');
  context.game.system.version = '2';
  Tour.tourInProgress = true;
  await guide.showSystemGuideAfterUpdate();
  assert.equal(values.get('systemGuideSeenVersion'), '1');
  Tour.tourInProgress = false;
  await guide.showSystemGuideAfterUpdate();
  assert.deepEqual(starts, ['steelers-systeme', 'steelers-systeme']);
  assert.equal(vehicles.stepIndex, 2);
  const pilotage = tours.get('starwarsffg.steelers-pilotage-mj');
  await pilotage.start();
  assert.equal(starts.length, 2);
  context.game.user.isGM = true;
  await pilotage.start();
  assert.equal(starts.at(-1), 'steelers-pilotage-mj');
});

test('real Foundry v14 resumes the right tour, recovers stale progress and restores management on failure', async t => {
  let nativeSource;
  try { nativeSource = await readFile('/home/tonio2581/foundry-v14/client/nue/tour.mjs', 'utf8'); }
  catch { t.skip('Local Foundry v14 runtime unavailable'); return; }
  let stored = {starwarsffg: {'system-guide': 3, 'steelers-vehicules': 8}}, shown = 0, restored = 0;
  const tours = new Map();
  const context = vm.createContext({
    structuredClone, console: {debug() {}, error() {}}, _loc: v => v, ui: {notifications: {error() {}}},
    game: {user: {isGM: true}, tooltip: {clearPending() {}, deactivate() {}},
      tours: {has: k => tours.has(k), get: k => tours.get(k), register(scope, id, tour) {
        assert.equal(tour.id, id);
        tour.namespace = scope; tour._reloadProgress(); tours.set(tour.key, tour);
      }},
      settings: {get: () => structuredClone(stored), set: async (_s, _k, v) => { stored = structuredClone(v); }}},
    foundry: {utils: {deepClone: structuredClone}, applications: {instances: new Map([
      ['tours-management', {render() {}, maximize() { restored++; }}],
    ])}},
  });
  vm.runInContext('Number.between = (value, min, max) => value >= min && value <= max;', context);
  const native = new vm.SourceTextModule(nativeSource, {context});
  await native.link(() => {}); await native.evaluate();
  const Tour = native.namespace.default;
  context.foundry.nue = {Tour};
  Tour.prototype._renderStep = async function () {
    shown++;
    this.targetElement = {classList: {add() {}}, remove() {}, querySelector() {}, querySelectorAll: () => []};
  };
  (await loadGuide(context)).registerSystemGuideTours();
  const intro = tours.get('starwarsffg.steelers-systeme'), vehicles = tours.get('starwarsffg.steelers-vehicules');
  assert.equal(intro.stepIndex, -1); // Progress from the retired guide does not enter the new introduction.
  assert.equal(vehicles.stepIndex, 8);
  await vehicles.start();
  assert.equal(vehicles.stepIndex, 0);
  await vehicles.next(); vehicles.exit();
  await intro.start(); intro.exit();
  await vehicles.start();
  assert.equal(vehicles.stepIndex, 1);
  assert.equal(shown, 4);
  assert.equal(stored.starwarsffg['steelers-systeme'], 0);
  vehicles.exit();
  Tour.prototype._renderStep = async () => { throw Error('render blocked'); };
  await assert.rejects(vehicles.start(), /render blocked/);
  assert.equal(restored, 1);
});

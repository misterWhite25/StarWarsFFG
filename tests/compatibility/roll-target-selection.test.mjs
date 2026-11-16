import {systemI18n} from '../system-i18n.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';

const modules = new URL('../../modules/', import.meta.url);
const gate = () => {
  let resolve;
  const promise = new Promise(done => {resolve = done;});
  return {promise, resolve};
};

async function targetFixture() {
  const actor = {id:'source', uuid:'Actor.source'};
  const source = {uuid:'Scene.s.Token.source'};
  const target = (id, defence, band) => ({
    id, name:id, x:0, y:0, isVisible:true,
    actor:{uuid:'Actor.' + id, system:{stats:{defence}}, _stats:{modifiedTime:0}},
    document:{uuid:'Scene.s.Token.' + id, elevation:0, hidden:false, range:{band}}
  });
  const first = target('a', 1, 1), second = target('b', 3, 2);
  const user = {id:'user', isGM:true, targets:new Set([first])};
  const tokens = [source];
  tokens.has = id => [first.id, second.id].includes(id);
  const hooks = [], context = vm.createContext({
    game:{user, actors:{get:() => actor}, i18n:await systemI18n('fr')},
    canvas:{ready:true, scene:{id:'s', tokens}},
    document:{createElement:() => ({style:{}, setAttribute() {}, append() {}})},
    Hooks:{on:(name, callback) => {hooks.push([name, callback]); return hooks.length;}, off() {}}
  });
  const {replaceWeaponPool} = (await loadSystemModule('helpers/weapon-selection.js', context)).namespace;
  const boundaries = {
    'ground-target-picker':{chooseGroundTarget() {}, cancelGroundTarget() {}},
    'ground-movement-state':{
      groundTokenForActor:() => source, rangeFor:(_source, doc) => doc.range,
      bands:['SWFFG.UI.Ground.BandEngaged', 'SWFFG.UI.Ground.BandShort', 'SWFFG.UI.Ground.BandMedium', 'SWFFG.UI.Ground.BandLong', 'SWFFG.UI.Ground.BandExtreme'], groundAttackDifficulty:() => 2
    },
    'weapon-selection':{replaceWeaponPool},
    'metric-distances':{dualDistance:() => ''},
    'target-adversary':(await loadSystemModule('helpers/target-adversary.mjs', context)).namespace
  };
  const text = await readFile(new URL('helpers/roll-target-selection.mjs', modules), 'utf8');
  const module = new vm.SourceTextModule(text + '\nexport {RollTargets};', {context});
  await module.link(specifier => {
    const values = boundaries[Object.keys(boundaries).find(key => specifier.includes(key))];
    return new vm.SyntheticModule(Object.keys(values), function() {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, {context});
  });
  await module.evaluate();
  let calls = 0;
  const builder = {
    roll:{item:{type:'weapon', id:'w'}, data:{document:actor}},
    dicePool:{setback:1, difficulty:1, boost:2},
    _weaponBaseline:{setback:1, difficulty:1, boost:0},
    weaponContext:{actor, makePool:async() => {
      calls++;
      const selected = [...user.targets][0];
      return {setback:selected.actor.system.stats.defence, difficulty:selected.document.range.band, boost:0};
    }},
    _activateShotMode() {}, _initializeInputs() {}
  };
  const view = new module.namespace.RollTargets(builder);
  view.root = {};
  view.name = {}; view.clear = {}; view.pick = {}; view.info = {append() {}};
  return {builder, view, user, first, second, hooks, calls:() => calls};
}

test('target changes during publication keep the saved targets, range and pool until publication ends', async() => {
  const f = await targetFixture();
  await f.view.sync(true);
  assert.deepEqual(Array.from(f.builder.roll.targetTokenUuids), [f.first.document.uuid]);
  f.builder._postingRoll = true;
  f.user.targets = new Set([f.second]);
  await f.view.sync();
  f.view.refreshUI();
  assert.equal(f.calls(), 1);
  assert.equal(f.builder.dicePool.setback, 1);
  assert.equal(f.builder.roll.shotRange, 'short');
  assert.deepEqual(Array.from(f.builder.roll.targetTokenUuids), [f.first.document.uuid]);
  assert.equal(f.view.pick.disabled, true);
  f.builder._postingRoll = false;
  await f.view.sync();
  assert.equal(f.calls(), 2);
  assert.equal(f.builder.dicePool.setback, 3);
  assert.equal(f.builder.dicePool.boost, 2);
  assert.equal(f.builder.roll.shotRange, 'beyond');
  assert.deepEqual(Array.from(f.builder.roll.targetTokenUuids), [f.second.document.uuid]);
  assert.equal(f.view.pick.disabled, false);
});

test('a forced refresh deferred during publication runs even when the target signature is unchanged', async() => {
  const f = await targetFixture();
  await f.view.sync(true);
  f.builder._postingRoll = true;
  await f.view.sync(true);
  assert.equal(f.calls(), 1);
  f.builder._postingRoll = false;
  await f.view.sync();
  assert.equal(f.calls(), 2);
});

test('an obsolete asynchronous target pool is discarded and the latest target is used', async() => {
  const f = await targetFixture(), pending = gate();
  const makePool = f.builder.weaponContext.makePool;
  let first = true;
  f.builder.weaponContext.makePool = async() => {
    const next = await makePool();
    if (first) {first = false; await pending.promise;}
    return next;
  };
  const updating = f.view.sync(true);
  f.user.targets = new Set([f.second]);
  const queued = f.view.sync();
  pending.resolve();
  await Promise.all([updating, queued]);
  assert.equal(f.builder.dicePool.setback, 3);
  assert.equal(f.builder.roll.shotRange, 'beyond');
  assert.equal(f.builder._selectingTarget, false);
});

test('closing a target view prevents an in-flight pool from modifying the roll', async() => {
  const f = await targetFixture(), pending = gate();
  f.builder.weaponContext.makePool = async() => {await pending.promise; return {setback:9};};
  const updating = f.view.sync(true);
  f.view.destroy();
  pending.resolve();
  await updating;
  assert.equal(f.builder.dicePool.setback, 1);
  assert.equal(f.builder._selectingTarget, false);
});

async function builderFixture(overrides = {}) {
  const text = await readFile(new URL('dice/roll-builder.js', modules), 'utf8');
  const imports = new Map([...text.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)]
    .map(([, names, path]) => [path, names.split(',').map(name => name.trim())]));
  const notices = [];
  let closed = 0, refunds = 0;
  const context = vm.createContext({
    Hooks:{on() {}, off() {}},
    game:{actors:{get() {}}, i18n:await systemI18n('fr')}, foundry:{},
    ui:{notifications:{warn:message => notices.push(message), error:message => notices.push(message)}}
  });
  const module = new vm.SourceTextModule(text, {context, importModuleDynamically:async specifier => {
    assert.match(specifier, /roll-talents/);
    const dynamic = new vm.SyntheticModule(['cancelFrenziedAttack'], function() {
      this.setExport('cancelFrenziedAttack', async builder => {refunds++; builder._frenziedPaid = null;});
    }, {context});
    await dynamic.link(() => {});
    await dynamic.evaluate();
    return dynamic;
  }});
  await module.link(specifier => {
    const names = imports.get(specifier);
    return new vm.SyntheticModule(names, function() {
      for (const name of names) this.setExport(name, overrides[name] ?? (
        name === 'FormApplicationV2' ? class {activateListeners() {} async close() {closed++; return this;}}
        : name === 'gmDifficulty' ? () => ({enabled:false})
        : name === 'renderRollTalents' ? async() => {}
        : () => {}
      ));
    }, {context});
  });
  await module.evaluate();
  const app = new module.namespace.default({}, {ability:2}, 'Test', 'RangedLight', {});
  return {app, context, notices, closed:() => closed, refunds:() => refunds};
}

test('manual dice controls cannot change a pool during publication or an asynchronous selection', async() => {
  const {app, context} = await builderFixture();
  const handlers = new Map();
  app._activateInputs({find:selector => ({on:(event, callback) => handlers.set(selector + ':' + event, callback)})});
  let refreshes = 0;
  app._initializeInputs = () => {refreshes++;};
  const input = {name:'ability', disabled:false};
  context.$ = node => ({hasClass:() => false, find:() => [input], attr:key => key === 'id' ? node.id : undefined});
  app.dicePool.upgrade = () => {app.dicePool.ability++;};
  const event = {currentTarget:{id:'upgrade-ability'}, preventDefault() {}, stopPropagation() {}};
  for (const lock of ['_postingRoll', '_selectingWeapon', '_selectingTarget']) {
    app[lock] = true;
    for (const handler of handlers.values()) handler(event);
    assert.equal(app.dicePool.ability, 2, lock);
    assert.equal(refreshes, 0, lock);
    app[lock] = false;
  }
  handlers.get('.upgrade-buttons button:click')(event);
  handlers.get('.pool-container, .pool-additional:click')(event);
  handlers.get('.pool-container, .pool-additional:contextmenu')(event);
  assert.equal(app.dicePool.ability, 3);
  assert.equal(refreshes, 3);
});

test('closing during publication retains the paid talent until posting completes', async() => {
  const f = await builderFixture();
  const paid = {selection:{id:'frenzied-attack'}};
  f.app._frenziedPaid = paid;
  f.app._postingRoll = true;
  assert.equal(await f.app.close(), f.app);
  assert.equal(f.app._frenziedPaid, paid);
  assert.equal(f.app._reviewedClosed, undefined);
  assert.equal(f.closed(), 0);
  assert.equal(f.refunds(), 0);
  assert.equal(f.notices.length, 1);
  f.app._postingRoll = false;
  assert.equal(await f.app.close(), f.app);
  assert.equal(f.closed(), 1);
  assert.equal(f.refunds(), 1);
  assert.equal(f.app._frenziedPaid, null);
});

test('a posting error releases the close guard in the actual publication handler', async() => {
  const f = await builderFixture({commitRollTalents:async() => {throw Error('Rejected talent cost');}});
  const noop = () => {};
  for (const method of ['_initializeInputs', '_activateInputs', '_activateFixedWeapon', '_activateAutoFire', '_activateShotMode', '_activateCombatContext']) f.app[method] = noop;
  let click;
  const html = {0:{querySelector:() => null}, find:selector => ({click:callback => {if (selector === '.btn') click = callback;}, on:noop})};
  f.app.activateListeners(html);
  await click({});
  assert.equal(f.app._postingRoll, false);
  assert.ok(f.notices.includes('Rejected talent cost'));
  await f.app.close();
  assert.equal(f.closed(), 1);
});

test('Adversary follows targeting and talent edits, and stays frozen during publication', async() => {
  const f = await targetFixture();
  const talent = {id:'adversary',name:'Adversaire',type:'talent',system:{active:true,ranks:{current:2}}};
  f.first.actor.items = [talent];
  await f.view.sync(true);
  assert.equal(f.builder.roll.targetAdversary.rank, 2);
  f.builder._postingRoll = true;
  f.user.targets = new Set([f.second]);
  await f.view.sync();
  assert.equal(f.builder.roll.targetAdversary.rank, 2);
  f.builder._postingRoll = false;
  await f.view.sync();
  assert.equal(f.builder.roll.targetAdversary.rank, 0);
  f.user.targets = new Set([f.first]);
  await f.view.sync();
  assert.equal(f.builder.roll.targetAdversary.rank, 2);
  talent.system.ranks.current = 3;
  const update = f.hooks.find(([name]) => name === 'updateItem')[1];
  update({parent:f.first.actor});
  await f.view.promise;
  assert.equal(f.builder.roll.targetAdversary.rank, 3);
  f.user.targets.clear();
  f.builder.weaponContext = null;
  await f.view.sync();
  assert.equal(f.builder.roll.targetAdversary.rank, 0);
});

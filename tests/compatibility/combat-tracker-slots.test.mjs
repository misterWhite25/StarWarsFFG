import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';

async function fixture() {
  const context = vm.createContext({
    Combat: class { prepareDerivedData() {} }, Combatant: class {},
    foundry: {utils: {debounce: fn => fn}, applications: {api: {}, sidebar: {tabs: {CombatTracker: class {}}}}},
    CONST: {TOKEN_DISPOSITIONS: {FRIENDLY: 1, HOSTILE: -1, SECRET: -2, NEUTRAL: 0}},
    game: {user: {isGM: false}}, canvas: {tokens: {controlled: [], ownedTokens: []}}
  });
  const {namespace} = await loadSystemModule('combat-ffg.js', context, {
    'helpers/integrated-crew.mjs': {resolveCrewActor() {}},
    'applications/legacy-dialog-v2.js': {LegacyDialogV2: class {}},
    'helpers/chat.js': {getMessageMode() {}}, 'dice-pool-ffg.js': {DicePoolFFG: class {}, RollFFG: class {}}
  });
  const actor = {id: 'shared', temporaryEffects: [{img: 'effect.webp'}]};
  const turns = ['a','b'].map((id,i) => Object.freeze({
    id, actor, actorId: actor.id, name: id, img: id + '.webp', hidden: false, disposition: 1,
    initiative: i ? 2 : 3.12, isOwner: true, token: {uuid: 'Scene.s.Token.' + id, hidden: Boolean(i), disposition: 1}
  }));
  const combat = new namespace.CombatFFG();
  const claims = {};
  Object.assign(combat, {turns, started: true, turn: 0, round: 1, combatants: turns,
    getClaims: () => claims, getSlotClaims: (_round,id) => claims[id],
    claimSlot: (_round,slot,id) => { claims[slot] = id; }});
  combat.combatants.get = id => turns.find(turn => turn.id === id);
  return {combat, claims, context, Tracker: namespace.CombatTrackerFFG};
}

test('claiming a slot uses the selected token when multiple tokens share an actor', async () => {
  const {combat, claims, context, Tracker} = await fixture();
  const selected = {document: combat.turns[1].token};
  context.canvas.tokens.controlled = [selected];
  context.canvas.tokens.ownedTokens = [selected, {document: combat.turns[0].token}];
  const tracker = new Tracker();
  tracker.viewed = combat;
  const target = {dataset: {claimSlot: '0'}, closest: () => ({dataset: {altId: 'a'}})};
  await Tracker.DEFAULT_OPTIONS.actions.claimSlot.call(tracker, {}, target);
  assert.equal(claims.a, 'b');
  combat.prepareDerivedData();
  const row = combat.customTurns[0];
  assert.equal(row.id, 'b');
  assert.equal(row.combatantId, 'a');
  assert.equal(row.hidden, true);
  assert.equal(row.active, true);
  assert.deepEqual([...row.effects], []);
});

test('initiative display keeps all hundredths as advantages and accepts zero or manual values', async () => {
  const {combat} = await fixture();
  combat.prepareDerivedData();
  const row = combat.customTurns[0];
  assert.equal(row.advantages, 'a'.repeat(12));
  assert.equal(row.successes, 'sss');
  for (const initiative of [0, -1, 10000]) {
    combat.turns = [{...combat.turns[0], initiative}];
    combat.prepareDerivedData();
    assert.equal(combat.customTurns[0].numericInitiative, true);
    assert.equal(combat.customTurns[0].initiative, initiative);
  }
});

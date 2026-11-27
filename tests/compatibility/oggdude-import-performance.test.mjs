import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';

async function fixture(globals = {}) {
  let nextId = 0;
  const context = vm.createContext({
    Date: class extends Date { getTime() { return 42; } },
    CONFIG: {temporary: {skills: {BRAWL: 'Brawl'}}, FFG: {skills: {Brawl: {}}}},
    foundry: {utils: {randomID: () => String(++nextId), deepClone: structuredClone}},
    ...globals,
  });
  const {namespace} = await loadSystemModule('importer/import-helpers.js', context, {
    'helpers/effects.js': {default: {}}, 'helpers/migration.js': {migrateDataToSystem() {}},
    'helpers/modifiers.js': {default: {}}, 'data-models/system-data-models.js': {getSystemDataDefaults() {}},
  });
  return {helpers: namespace.default, context};
}

test('OggDude imports all modifiers even when many share the same clock tick', async () => {
  const {helpers} = await fixture();
  const characteristicMods = await helpers.processModsData({Mod: [{Key: 'BR', Count: '1'}, {Key: 'AG', Count: '2'}]});
  assert.deepEqual(Object.values(characteristicMods.attributes).map(a => a.mod), ['Brawn', 'Agility']);
  const dieMods = await helpers.processDieMod({DieModifier: Array.from({length: 1000}, () => ({SkillKey: 'BRAWL', BoostCount: '1'}))});
  const statMods = await helpers.processStatMod({ForceRating: '1', DefenseMelee: '2', UnknownStat: '3'});
  const careerSkills = await helpers.processCareerSkills({Key: 'BRAWL'});
  const rankedSkills = await helpers.processCareerSkills({Key: ['BRAWL']}, true);
  const attributes = {...characteristicMods.attributes, ...dieMods.attributes, ...statMods, ...careerSkills, ...rankedSkills};
  assert.equal(Object.keys(attributes).length, 1006);
  assert.ok(Object.keys(attributes).every(key => key.startsWith('attr')));
  assert.deepEqual(Object.values(statMods).map(a => a.mod), ['ForcePool', 'Defence-Melee']);
  assert.equal(Object.values(careerSkills)[0].value, true);
  assert.equal(Object.values(rankedSkills)[0].value, 0);
});

test('OggDude repeated vehicle pack lookups only change the world setting for a locked pack', async () => {
  let writes = 0;
  const pack = {locked: true, async configure({locked}) { writes++; this.locked = locked; }};
  const {helpers} = await fixture({game: {packs: new Map([['world.oggdudevehiclesspace', pack]])}});
  for (let n = 0; n < 250; n++) assert.equal(await helpers.getCompendiumPack('Actor', 'oggdude.Vehicles.Space'), pack);
  assert.equal(writes, 1);
  pack.locked = true;
  await helpers.getCompendiumPack('Actor', 'oggdude.Vehicles.Space');
  assert.equal(writes, 2);
});

test('OggDude specialization imports singleton XML nodes and resolves repeated talents once per archive', async () => {
  const errors = [];
  const bar = {toggleClass() {}, width() { return this; }, html() {}};
  const {helpers, context} = await fixture({
    $: () => bar, JXON: {xmlToJs: value => value},
    CONFIG: {temporary: {skills: {BRAWL: 'Brawl'}}, logger: {error: (...args) => errors.push(args)}},
    game: {items: [{flags: {}}, {
      name: 'Parry', _id: 'personal', flags: {starwarsffg: {ffgimportid: 'PARRY'}},
      system: {activation: {value: 'passive'}},
    }]},
  });
  const source = {name: 'Toughened', _id: 'talent', system: {
    attributes: {original: {mod: 'Wounds', value: 2}}, activation: {value: 'passive'}, ranks: {ranked: true},
  }};
  const record = {Specialization: {Name: 'Guard', Key: 'GUARD', Type: 'Combat', TalentRows: {TalentRow: [
    {Talents: {Key: ['TOUGH', 'TOUGH', 'PARRY']}, Directions: {Direction: [{Right: 'true'}, {Up: 'true'}]}},
  ]}}};
  const singleton = {Specialization: {Name: 'Sentinel', Key: 'SENT', CareerSkills: {Key: 'BRAWL'}, TalentRows: {
    TalentRow: {Talents: {Key: 'TOUGH'}, Directions: {Direction: {Up: 'true'}}},
  }}};
  const files = [record, singleton].map(entry => ({
    name: 'Specializations/' + entry.Specialization.Key + '.xml', async: async () => entry,
  }));
  const zip = {files, file: name => files.find(file => file.name === name)};
  const imported = [], lookups = [];
  Object.assign(helpers, {
    getCompendiumPack: async () => ({}), stringToXml: value => value,
    findCompendiumEntityByImportId: async (_type, key) => { lookups.push(key); return key === 'TOUGH' ? source : undefined; },
    addImportItemToCompendium: async (_type, data) => { imported.push(data.system ?? data.data); },
  });
  const specialization = await loadSystemModule('importer/oggdude/importers/specializations.js', context, {
    'importer/import-helpers.js': {default: helpers},
  });
  await specialization.namespace.default.Import(zip);
  assert.deepEqual(errors, []);
  assert.deepEqual(lookups, ['TOUGH', 'PARRY']);
  assert.equal(imported.length, 2);
  const [guard, sentinel] = imported;
  assert.deepEqual(Array.from(guard.metadata.tags), ['specialization', 'combat']);
  assert.equal(sentinel.careerSkills.careerSkill0, 'Brawl');
  assert.deepEqual(Object.keys(sentinel.talents), ['talent0']);
  assert.equal(sentinel.talents.talent0['links-top-1'], true);
  const [first, second, personal] = Object.values(guard.talents);
  assert.equal(personal.itemId, 'personal');
  assert.equal(new Set([first, second, sentinel.talents.talent0].map(talent => Object.keys(talent.attributes)[0])).size, 3);
  assert.equal(first['links-right'], true);
  assert.equal(second['links-top-1'], true);
  assert.equal(first.itemId, second.itemId);
  Object.values(first.attributes)[0].value = 10;
  assert.equal(Object.values(second.attributes)[0].value, 2);
  assert.deepEqual(source.system.attributes, {original: {mod: 'Wounds', value: 2}});
});

test('OggDude die modifiers use each matching skill from the active campaign theme once', async () => {
  let themeReads = 0;
  const {helpers} = await fixture({
    CONFIG: {temporary: {skills: {}}, FFG: {alternateskilllists: [
      {id: 'other', skills: {WrongTheme: {characteristic: 'Brawn', type: 'Combat'}}},
      {id: 'campaign', skills: {
        Brawl: {characteristic: 'Brawn', type: 'Combat'},
        Athletics: {characteristic: 'Brawn', type: 'General'},
        Gunnery: {characteristic: 'Agility', type: 'Combat'},
      }},
    ]}},
    game: {settings: {get(_system, key) {
      assert.equal(key, 'skilltheme');
      themeReads++;
      return 'campaign';
    }}},
  });
  const {attributes} = await helpers.processDieMod({DieModifier: [
    {SkillChar: 'BR', BoostCount: '1'}, {SkillType: 'combat', AddSetbackCount: '2'},
  ]});
  assert.deepEqual(Object.values(attributes).map(({mod, modtype, value}) => [mod, modtype, value]), [
    ['Brawl', 'Skill Boost', 1], ['Athletics', 'Skill Boost', 1],
    ['Brawl', 'Skill Setback', 2], ['Gunnery', 'Skill Setback', 2],
  ]);
  assert.equal(themeReads, 1);
});

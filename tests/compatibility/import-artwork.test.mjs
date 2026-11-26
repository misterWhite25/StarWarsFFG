import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';

async function fixture() {
  const uploads = [], errors = [];
  const directories = new Set(['worlds']);
  let fail = true;
  const picker = {
    async browse(_source, path) {
      if (!directories.has(path)) throw Error('Missing directory');
    },
    async createDirectory(_source, path) {
      if (directories.has(path)) throw Error('Already exists');
      directories.add(path);
    },
    async upload(_source, path, file) {
      uploads.push([path, file.name, file.type]);
      if (fail) { fail = false; return false; }
      return {path: 'stored/' + path + '/' + file.name};
    }
  };
  const context = vm.createContext({
    CONFIG: {temporary: {}, logger: {error: (...args) => errors.push(args)}},
    foundry: {applications: {apps: {FilePicker: picker}}}, game: {world: {id: 'test'}}, File
  });
  const {namespace} = await loadSystemModule('importer/import-helpers.js', context, {
    'helpers/effects.js': {default: {}}, 'helpers/migration.js': {migrateDataToSystem() {}},
    'helpers/modifiers.js': {default: {}}, 'data-models/system-data-models.js': {getSystemDataDefaults() {}}
  });
  return {helpers: namespace.default, uploads, errors, directories};
}

test('failed artwork uploads are retried and concurrent requests share the stored image path', async () => {
  const {helpers, uploads, errors, directories} = await fixture();
  const zip = {file: () => ({async: async () => Uint8Array.from([0x89,0x50,0x4e,0x47])})};
  const args = ['images/example.png', zip, {metadata: {name: 'gear'}}];
  assert.equal(await helpers.importImage(...args), undefined);
  assert.equal(errors.length, 1);
  const expected = 'stored/worlds/test/images/packs/gear/example.png';
  assert.deepEqual(await Promise.all([helpers.importImage(...args), helpers.importImage(...args)]), [expected, expected]);
  assert.equal(await helpers.importImage(...args), expected);
  assert.equal(uploads.length, 2);
  assert.equal(uploads[1][2], 'image/png');
  assert.equal(await helpers.importSilhouetteImage(...args), expected.replace('/gear/', '/gearSilhouettes/'));
  assert.ok(directories.has('worlds/test/images/packs/gearSilhouettes'));
});

test('OggDude tags accept mixed category and type lists and preserve following valid tags', async () => {
  const {helpers} = await fixture();
  assert.deepEqual([...helpers.importTags(['Heavy', {}, 'Light'], ['Gear','Armor'])], ['heavy','light','gear','armor']);
  assert.deepEqual([...helpers.importTags(undefined, 'Vehicle')], ['vehicle']);
  assert.deepEqual([...helpers.importTags(undefined, undefined)], []);
});

test('OggDude reads single XML entries and category directories without a wrapper folder', async () => {
  const {helpers} = await fixture();
  const record = {Key: 'DEVICE'};
  assert.deepEqual([...helpers.xmlRecords(record)], [record]);
  assert.deepEqual([...helpers.xmlRecords([record, record])], [record, record]);
  assert.deepEqual([...helpers.xmlRecords(null)], []);
  const files = ['Species/test.xml', 'Bundle/Species/example.XML', 'OtherSpecies/example.xml', 'Species/image.png']
    .map(name => ({name, dir: false}));
  assert.deepEqual([...helpers.xmlFiles({files}, 'Species')], files.slice(0, 2));
});

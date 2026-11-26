import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import {loadSystemModule} from "../load-system-module.mjs";

function zip(files) {
  return {files: Object.fromEntries(Object.entries(files).map(([name, records]) => [
    name, {name, async: async () => typeof records === "string" ? records : JSON.stringify(records)},
  ]))};
}

function makePack(collection, label, documentName = "Actor") {
  const documents = new Map();
  return {
    collection, metadata: {label}, documentName, documents, locked: true, changes: 0,
    async configure({locked}) { this.locked = locked; this.changes++; },
    async getIndex() { return [...documents].map(([_id, {name}]) => ({_id, name})); },
    async getDocument(id) { return documents.get(id); },
    async importDocument(document) {
      this.changes++;
      const id = String(documents.size + 1);
      const stored = {id, name: document.name, items: [], async update(data) { Object.assign(this, data); }};
      documents.set(id, stored);
      return stored;
    },
  };
}

async function fixture() {
  const standard = makePack("world.star-wars-adversaries", "Star Wars Adversaries");
  const system = makePack("starwarsffg.crew", "Crew");
  const packs = [standard, system];
  const context = vm.createContext({
    game: {packs, settings: {get: () => "starwars"}, i18n: {localize: key => key}},
    CONFIG: {Actor: {documentClass: class { constructor(data) { Object.assign(this, data); } }}, FFG: {characteristics: {Brawn: {value:"Brawn"}}}},
    foundry: {utils: {mergeObject: Object.assign,
      getProperty(object, path) { return path.split(".").reduce((value, key) => value?.[key], object); },
      setProperty(object, path, value) {
        const parts = path.split(".");
        const key = parts.pop();
        parts.reduce((parent, part) => parent[part], object)[key] = value;
      },
    }, documents: {collections: {CompendiumCollection: {
      async createCompendium({type, label}) {
        const pack = makePack("world." + label.toLowerCase(), label, type);
        packs.push(pack);
        return pack;
      },
    }}}},
  });
  const module = await loadSystemModule("importer/swa-importer.js", context, {
    "applications/form-application-v2.js": {FormApplicationV2: class {}},
    "importer/import-helpers.js": {default: {getTemplate: () => ({})}},
  });
  const importer = new module.namespace.default();
  importer._updateProgress = () => {};
  return {standard, system, packs, importer};
}

const captain = {name: "Capitaine âgée", type: "Rival", tags: ["crew"]};

test("custom SWA archives only upsert their world Actor pack and preserve its lock and document IDs", async () => {
  const {standard, system, packs, importer} = await fixture();
  const filename = "Crew.zip";
  await importer._importArchive(zip({"adversaries/first.json": [captain, {...captain, name: "Other", tags: []}]}), filename, "crew");
  const custom = packs.find(pack => pack.collection === "world.crew");
  assert.equal(custom.locked, true);
  assert.equal(custom.documents.size, 1);
  const initial = [...custom.documents.values()][0];
  await importer._importArchive(zip({"src/adversaries/first.json": [{...captain, description: "Updated"}]}), filename, "crew");
  assert.equal(custom.documents.get(initial.id).system.biography, "<p>Updated</p>");
  assert.equal(custom.documents.size, 1);
  assert.equal(standard.changes, 0);
  assert.equal(system.changes, 0);
});

test("malformed or empty SWA archives and tags without matches leave existing packs untouched", async () => {
  const {standard, system, packs, importer} = await fixture();
  for (const contents of [
    {"extra/readme.json": []},
    {"adversaries/first.json": [captain], "adversaries/last.json": "[broken"},
    {"adversaries/first.json": [captain, {name: "Missing type"}]},
    {"adversaries/first.json": [captain], "talents.json": {}},
  ]) {
    await assert.rejects(importer._importArchive(zip(contents), "sw-adversaries-master.zip", ""));
  }
  await importer._importArchive(zip({"adversaries/first.json": [captain]}), "Crew.zip", "absent");
  assert.equal(standard.changes, 0);
  assert.equal(system.changes, 0);
  assert.equal(packs.length, 2);
});

test("an existing world Item pack with the custom archive label is never unlocked or modified", async () => {
  const {packs, importer} = await fixture();
  const items = makePack("world.crew", "Crew", "Item");
  packs.push(items);
  await assert.rejects(importer._importArchive(zip({"adversaries/list.json": [captain]}), "Crew.zip", ""));
  assert.equal(items.changes, 0);
  assert.equal(packs.length, 3);
});

test("SWA reimports reuse embedded IDs and prune only previously imported items", async () => {
  const {importer} = await fixture();
  const managed = {starwarsffg: {swaImported: true}};
  let updated, deleted;
  const actor = {
    flags: {starwarsffg: {swaManagedItems: true}},
    items: [
      {id: "player-choice", type: "talent", name: "Toughened", flags: {}},
      {id: "original", type: "talent", name: "Toughened", flags: managed},
      {id: "removed", type: "gear", name: "Comlink", flags: managed},
      {id: "personal", type: "gear", name: "Credit chip", flags: {}},
    ],
    async update(data) { updated = data; },
    async deleteEmbeddedDocuments(type, ids) { assert.equal(type, "Item"); deleted = Array.from(ids); },
  };
  await importer._updateActor(actor, {items: [{type: "talent", name: "Toughened", flags: managed}]});
  assert.equal(updated.items[0]._id, "original");
  assert.deepEqual(deleted, ["removed"]);

  actor.flags = {};
  actor.items = [{id: "legacy", type: "talent", name: "Toughened", flags: {}}];
  deleted = undefined;
  await importer._updateActor(actor, {items: [{type: "talent", name: "Toughened", flags: managed}]});
  assert.equal(updated.items[0]._id, "legacy");
  assert.equal(deleted, undefined);
});

test("SWA published thresholds include the bonuses from imported Toughened and Grit ranks", async () => {
  const {importer} = await fixture();
  const data = await importer._prepareAdversary({
    ...captain, type: "Nemesis", characteristics: {Brawn: 2}, derived: {wounds: 9, strain: 7},
    talents: ["Toughened 2", "Grit 1"],
  }, "adversaries/first.json", {talents: {
    Toughened: {name: "Toughened", ranked: true},
    Grit: {name: "Grit", ranked: true},
  }});
  assert.equal(data.system.stats.wounds.max, 7);
  assert.equal(data.system.stats.strain.max, 6);
  assert.deepEqual(Array.from(data.items, item => item.system.ranks.current), [2, 1]);
});

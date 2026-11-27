import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {loadSystemModule} from "../load-system-module.mjs";
import {systemI18n} from "../system-i18n.mjs";

const root = new URL("../../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const catalog = async lang => JSON.parse(await read(`lang/${lang}.json`));
const placeholders = text => [...text.matchAll(/\{([\w.]+)\}/g)].map(match => match[1]).sort();

test("English and French have matching keys and format arguments", async () => {
  const [en, fr, manifest] = await Promise.all([catalog("en"), catalog("fr"), read("system.json").then(JSON.parse)]);
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  for (const [key, text] of Object.entries(en)) {
    assert.ok(text.trim() && fr[key].trim(), key);
    assert.deepEqual(placeholders(text), placeholders(fr[key]), key);
  }
  for (const lang of ["en", "fr"]) {
    assert.ok(manifest.languages.some(entry => entry.lang === lang && entry.path === `lang/${lang}.json`));
  }
});

test("static translation keys exist throughout the system", async () => {
  const [en, fr] = await Promise.all([catalog("en"), catalog("fr")]);
  const missing = [];
  const prefixes = ["SWFFG.Characteristic", "SWFFG.VehicleRange", "SWFFG.WeaponRange"];
  for (const directory of ["modules", "templates", "gallery"]) {
    const dir = new URL(directory + "/", root);
    for (const file of await readdir(dir, {recursive:true, withFileTypes:true})) {
      if (!file.isFile() || !/\.(?:m?js|hbs|html)$/.test(file.name)) continue;
      const parent = file.parentPath.replaceAll("\\", "/");
      const source = await readFile(parent + "/" + file.name, "utf8");
      for (const [, key] of source.matchAll(/["'`]((?:SWFFG|TYPES\.(?:Actor|Item))\.[\w.-]+)["'`]/g)) {
        if (key.endsWith(".") || prefixes.includes(key)) continue;
        if (!Object.hasOwn(en, key) || !Object.hasOwn(fr, key)) missing.push(`${file.name}: ${key}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("range bands keep their rule index and render in the current locale", async () => {
  const [en, fr] = await Promise.all([systemI18n("en"), systemI18n("fr")]);
  const game = {i18n: en};
  const {shipRanges} = (await loadSystemModule("space-combat/ranges.mjs", vm.createContext({game}))).namespace;
  const origin = {id:"a", x:0, y:0}, target = {id:"b", x:4, y:0};
  const vessel = {items:[{name:"Test", type:"shipweapon", system:{range:{value:"Short"}}}]};
  for (const [locale, label] of [[en, "Short"], [fr, "Courte"]]) {
    game.i18n = locale;
    const result = shipRanges(origin, [origin, target], vessel);
    assert.equal(result.targets[0].band, label);
    assert.equal(result.targets[0].bandKey, "short");
    assert.equal(result.targets[0].index, 1);
    assert.equal(result.targets[0].inRange, true);
  }
});

test("a board error uses the receiving client's locale", async () => {
  const [en, fr] = await Promise.all([systemI18n("en"), systemI18n("fr")]);
  const game = {i18n: fr};
  const {localizedSystemError, errorFromLocalization} = (await loadSystemModule(
    "helpers/system-localization.mjs", vm.createContext({game})
  )).namespace;
  const sent = localizedSystemError("SWFFG.UI.SpaceCombat.CommandGMOnly");
  assert.equal(sent.message, "Cette commande est réservée au MJ.");
  game.i18n = en;
  const received = errorFromLocalization(JSON.parse(JSON.stringify(sent.localization)), sent.message);
  assert.equal(received.message, "Only the GM can use this command.");
});

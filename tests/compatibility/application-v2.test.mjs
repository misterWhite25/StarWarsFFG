import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("actor and item sheets use the v14 Handlebars ApplicationV2 lifecycle", async () => {
  for (const path of [
    "modules/actors/actor-sheet-ffg-v2.js",
    "modules/items/item-sheet-ffg-v2.js",
  ]) {
    const source = await read(path);
    assert.match(source, /extends HandlebarsApplicationMixin\((?:Actor|Item)SheetV2\)/);
    assert.match(source, /static PARTS\s*=/);
  }
});

test("document sheets are registered through DocumentSheetConfig", async () => {
  const source = await read("modules/swffg-main.js");
  assert.match(source, /DocumentSheetConfig\.registerSheet\(Actor/);
  assert.match(source, /DocumentSheetConfig\.registerSheet\(Item/);
  assert.doesNotMatch(source, /collections\.(?:Actors|Items)\.registerSheet/);
  assert.doesNotMatch(source, /Sheet v1/);
});

test("system applications no longer depend directly on FormApplication", async () => {
  const paths = [
    "modules/popout-editor.js",
    "modules/groupmanager-ffg.js",
    "modules/popout-modifiers.js",
    "modules/ffg-destiny-tracker.js",
    "modules/items/item-editor.js",
    "modules/settings/crew-settings.js",
    "modules/settings/ui-settings.js",
    "modules/importer/skills-list-importer.js",
    "modules/importer/swa-importer.js",
    "modules/dice/roll-builder.js",
    "tests/ffg-tests.js",
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.doesNotMatch(source, /extends FormApplication\b/);
    assert.match(source, /FormApplicationV2/);
  }
  const base = await read("modules/applications/form-application-v2.js");
  assert.match(base, /HandlebarsApplicationMixin\(ApplicationV2\)/);
});

test("legacy dialog call sites are hosted by DialogV2", async () => {
  const bridge = await read("modules/applications/legacy-dialog-v2.js");
  assert.match(bridge, /extends DialogV2/);
  const paths = [
    "modules/actors/actor-ffg-options.js",
    "modules/actors/actor-sheet-ffg.js",
    "modules/combat-ffg.js",
    "modules/groupmanager-ffg.js",
    "modules/helpers/character-creator.js",
    "modules/helpers/crew.js",
    "modules/items/item-ffg-options.js",
    "modules/items/item-sheet-ffg.js",
    "modules/swffg-main.js",
    "modules/swffg-migration.js",
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.doesNotMatch(source, /\bnew Dialog\s*\(/);
  }
});


test("v14 removed application and collection aliases are not used", async () => {
  const tours = await read("modules/helpers/tours.js");
  const main = await read("modules/swffg-main.js");
  assert.doesNotMatch(tours, /\.bringToTop\s*\(/);
  assert.match(tours, /\.bringToFront\s*\(/);
  assert.doesNotMatch(main, /game\.macros\.entities/);
});

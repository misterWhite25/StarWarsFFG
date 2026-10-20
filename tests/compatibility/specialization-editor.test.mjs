import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
async function loadSheet() {
  class Base {
    constructor({document, editable = true}) { this.document = this.item = document; this.options = {editable}; }
    get isEditable() { return true; }
    async _onRender() {}
  }
  class Legacy { _activateFFGListeners() {} }
  const context = vm.createContext({foundry: {applications: {sheets: {ItemSheetV2: Base}, api: {HandlebarsApplicationMixin: value => value}}}, $: value => value});
  const module = new vm.SourceTextModule(fs.readFileSync(root + "modules/items/item-sheet-ffg-v2.js", "utf8"), {
    context,
    importModuleDynamically: async () => {
      const helper = new vm.SyntheticModule(["installBookTreeConnections"], function () { this.setExport("installBookTreeConnections", () => {}); }, {context});
      await helper.link(() => {}); await helper.evaluate(); return helper;
    },
  });
  await module.link(specifier => {
    const legacy = specifier.endsWith("item-sheet-ffg.js");
    const names = legacy ? ["ItemSheetFFG"] : ["activateSheetPortrait", "activateEquipmentImagePreview"];
    return new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name, legacy ? Legacy : () => {}); }, {context});
  });
  await module.evaluate();
  return module.namespace.ItemSheetFFGV2;
}

test("An editable specialization can submit its document name; readonly sheets cannot", async () => {
  const Sheet = await loadSheet();
  const sheet = new Sheet({document: {type: "specialization", flags: {}}});
  let saved;
  sheet._updateObject = (_event, data) => { saved = data; };
  const data = {name: "Custom specialization", "data.universal": true};
  await Sheet._onSubmitForm.call(sheet, {}, {}, {object: data});
  assert.equal(saved.name, "Custom specialization");
  assert.equal(saved["data.universal"], true);
  assert.equal(data.name, "Custom specialization");
  saved = undefined; sheet.options.editable = false;
  await Sheet._onSubmitForm.call(sheet, {}, {}, {object: data});
  assert.equal(saved, undefined);
});

test("Connection controls are exposed only in an editable specialization's edit mode", async () => {
  const Sheet = await loadSheet();
  for (const [type, editing, editable, expected] of [["specialization", true, true, true], ["specialization", false, true, false], ["specialization", true, false, false], ["weapon", true, true, false]]) {
    const sheet = new Sheet({document: {type, flags: {}}, editable});
    const classes = new Set();
    sheet.element = {classList: {toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)}};
    sheet._activateLegacyTabs = () => {};
    await sheet._onRender({data: {isEditing: editing}}, {});
    assert.equal(classes.has("ffg-book-editing"), expected);
  }
});

test("The name editor stays out of the book header and is gated by permission and edit mode", () => {
  const template = fs.readFileSync(root + "templates/items/ffg-specialization-sheet.html", "utf8");
  const header = template.slice(template.indexOf("<header"), template.indexOf("</header>"));
  assert.doesNotMatch(header, /<input/);
  assert.match(template, /{{#unless isReadOnly}}{{#if data\.isEditing}}[\s\S]*?<input name="name" type="text" value="{{item\.name}}"[\s\S]*?{{\/if}}{{\/unless}}/);
  const css = fs.readFileSync(root + "styles/v14-sheets.css", "utf8");
  assert.match(css, /\.ffg-specialization-tree \.specialization-talent \.talent-connections \{display:none;/);
  assert.match(css, /\.ffg-specialization-tree\.ffg-book-editing \.specialization-talent \.talent-connections \{display:block;/);
});

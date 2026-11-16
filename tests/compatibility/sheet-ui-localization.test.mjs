import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {loadSystemModule,loadActorModule} from '../load-system-module.mjs';
import {sheetUiBoundaries} from '../sheet-ui-boundaries.mjs';
import {systemI18n} from '../system-i18n.mjs';

for(const lang of ['en','fr']) {
  test(`${lang}: actor header and sidebar show localized labels without changing action identifiers`,async()=>{
    const i18n=await systemI18n(lang),buttons=[];
    class Base{_getHeaderControls(){return [];}get isEditable(){return true;}}
    const node=()=>({attributes:{},append(){},setAttribute(name,value){this.attributes[name]=value;},addEventListener(){}});
    const context=vm.createContext({game:{i18n},document:{createElement:node},foundry:{applications:{sheets:{ActorSheetV2:Base},api:{HandlebarsApplicationMixin:C=>C}}}});
    const {ActorSheetFFGV2}= (await loadSystemModule('actors/actor-sheet-ffg-v2.js',context,{...sheetUiBoundaries,'actors/actor-sheet-ffg.js':{ActorSheetFFG:class{}}})).namespace;
    const sheet=Object.create(ActorSheetFFGV2.prototype);sheet.actor={type:'character',flags:{}};sheet.options={};
    const controls=sheet._getHeaderControls();
    assert.equal(controls.find(control=>control.action==='ffgCalculationDetails').label,lang==='en'?'Calculation details':'Détail des calculs');
    assert.equal(controls.find(control=>control.action==='ffgCreationGuide').label,lang==='en'?'Creation and XP':'Création et XP');
    sheet.actor.type='vehicle';
    assert.equal(sheet._getHeaderControls().find(control=>control.action==='ffgVehiclePlanSettings').label,lang==='en'?'Configure interior plan':'Configurer le plan intérieur');
    sheet.actor.type='character';
    const sidebar={querySelectorAll:()=>[],append:button=>buttons.push(button)};
    sheet._prepareSidebar({querySelector:()=>sidebar});
    assert.deepEqual(buttons.map(button=>button.title),lang==='en'?['Talent summary','Trigger a talent','Equipment summary']:['Récapitulatif des talents','Déclencher un talent','Récapitulatif de l’équipement']);
    assert.ok(buttons.every(button=>button.type==='button'&&button.attributes['aria-label']===button.title));
  });

  test(`${lang}: edit-mode refusal is localized and preserves the permission result`,async()=>{
    const messages=[],i18n=await systemI18n(lang);
    const context=vm.createContext({Actor:class{},game:{i18n},ui:{notifications:{warn:text=>messages.push(text)}}});
    const {ActorFFG}=(await loadActorModule(context)).namespace;
    const actor=Object.create(ActorFFG.prototype);actor.getFlag=()=>true;
    assert.equal(actor.verifyEditModeIsNotEnabled(),false);
    assert.equal(messages[0],lang==='en'?'This action is unavailable while Edit Mode is enabled.':'Cette action est indisponible lorsque le mode édition est activé.');
    assert.equal(actor.verifyEditModeIsNotEnabled(false),false);assert.equal(messages.length,1);
    actor.getFlag=()=>false;assert.equal(actor.verifyEditModeIsNotEnabled(),true);assert.equal(messages.length,1);
  });

  test(`${lang}: default dialog button and imported notes use the selected real catalog`,async()=>{
    const i18n=await systemI18n(lang);
    class Dialog{constructor(options){this.options=options;}}
    const context=vm.createContext({game:{i18n},document:{createElement:()=>({})},foundry:{applications:{api:{DialogV2:Dialog}}}});
    const {LegacyDialogV2}=(await loadSystemModule('applications/legacy-dialog-v2.js',context)).namespace;
    const dialog=new LegacyDialogV2();
    assert.equal(dialog.options.buttons[0].label,lang==='en'?'Close':'Fermer');
    const notes=i18n.localize('SWFFG.UI.Import.GeneratedNotes');
    assert.match(notes,lang==='en'?/<h1>Importer Notes<\/h1>/:/<h1>Notes d’importation<\/h1>/);
    assert.match(notes,/https:\/\/github\.com\/StarWarsFoundryVTT\/StarWarsFFG/);
    const deletion=i18n.format('SWFFG.UI.Actor.DeleteTalentPrompt',{name:'R2-D2'});
    assert.match(deletion,/R2-D2/);assert.doesNotMatch(deletion,/\{name\}/);
  });
}

test('all static system locale keys in sheet UI and templates exist in both catalogs',async()=>{
  const folders=['modules/actors','modules/items','modules/settings','modules/applications','modules/compendium','modules/importer','templates'];
  const roots=folders.map(folder=>new URL('../../'+folder+'/',import.meta.url)),files=[];
  for(const root of roots)for(const entry of await readdir(root,{recursive:true,withFileTypes:true})){
    const parent=entry.parentPath??entry.path;
    if(entry.isFile()&&/\.(?:js|mjs|html|hbs)$/.test(entry.name)&&!parent.replaceAll('\\','/').includes('/templates/dice'))files.push(pathToFileURL(join(parent,entry.name)));
  }
  const keys=new Set();
  for(const file of files)for(const match of (await readFile(file,'utf8')).matchAll(/["'](SWFFG\.[A-Za-z0-9_.-]+)["']/g))keys.add(match[1]);
  for(const lang of ['en','fr']){const i18n=await systemI18n(lang);for(const key of keys)i18n.localize(key);}
});

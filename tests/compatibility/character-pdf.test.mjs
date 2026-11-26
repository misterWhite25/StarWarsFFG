import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {loadSystemModule} from '../load-system-module.mjs';

test('complete character PDF refuses limited or unreadable actors before reading any character data',async()=>{
 const context=vm.createContext({game:{user:{id:'reader'},i18n:{localize:key=>key}}});
 const {buildCharacterPrintDocument}=(await loadSystemModule('helpers/character-pdf.mjs',context)).namespace;
 for(const actor of [null,{type:'vehicle'},{type:'character',limited:true},{type:'character',testUserPermission:()=>false}]){
  await assert.rejects(buildCharacterPrintDocument(actor,null,{base:'http://localhost/game'}),/SWFFG.UI.Pdf.Permission/);
 }
});

test('PDF controls and section labels are translated in French and English without em dashes',async()=>{
 const dictionaries={};for(const lang of ['en','fr'])dictionaries[lang]=JSON.parse(await readFile(new URL('../../lang/'+lang+'.json',import.meta.url),'utf8'));
 const keys=Object.keys(dictionaries.en).filter(key=>key.startsWith('SWFFG.UI.Pdf.'));
 assert.ok(keys.length>=20);
 for(const key of keys){for(const lang of ['en','fr']){assert.equal(typeof dictionaries[lang][key],'string',key);assert.ok(!dictionaries[lang][key].includes(String.fromCodePoint(0x2014)),key);}}
});

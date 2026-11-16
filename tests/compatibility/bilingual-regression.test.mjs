import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {systemI18n} from '../system-i18n.mjs';
import {combatReferences} from '../../modules/helpers/combat-quick-reference-data.mjs';
const read=async path=>JSON.parse(await fs.readFile(new URL('../../'+path,import.meta.url),'utf8'));
const languages={en:await read('lang/en.json'),fr:await read('lang/fr.json')};
const tokens=(text,pattern)=>[...text.matchAll(pattern)].map(m=>m[0]).sort();
test('French and English catalogs have complete matching keys, placeholders and rule dice',()=>{
 assert.deepEqual(Object.keys(languages.en).sort(),Object.keys(languages.fr).sort());
 for(const [key,en]of Object.entries(languages.en)){
  const fr=languages.fr[key];assert.equal(typeof en,'string',key);assert.equal(typeof fr,'string',key);assert(en.trim()&&fr.trim(),key);
  assert.deepEqual(tokens(en,/\{\w+\}/g),tokens(fr,/\{\w+\}/g),key+' placeholders');
  if(key.startsWith('SWFFG.UI.CombatReference.'))assert.deepEqual(tokens(en,/\[(?:BO|SE|DI)\]/g),tokens(fr,/\[(?:BO|SE|DI)\]/g),key+' rule dice');
 }
});
test('both combat references resolve every deferred label and preserve categories in each language',async()=>{
 for(const language of ['en','fr']){
  const i18n=await systemI18n(language);
  function visit(value){if(Array.isArray(value))return value.forEach(visit);if(value&&typeof value==='object')return Object.values(value).forEach(visit);if(typeof value==='string'&&value.startsWith('SWFFG.'))assert.notEqual(i18n.localize(value),value);}
  visit(combatReferences);
  for(const reference of Object.values(combatReferences))assert.deepEqual(reference.groups.map(group=>group.key),['incidentals','maneuvers','actions']);
  assert.deepEqual(combatReferences.space.aids.map(aid=>aid.category),['maneuvers','actions']);
 }
});
test('native reference fallbacks retain the same table identities and reference numbers in English and French',async()=>{
 const en=await read('data/skill-references-en.json'),fr=await read('data/skill-references-fr.json');
 assert.equal(en._id,fr._id);assert.equal(en.pages.length,12);assert.deepEqual(en.pages.map(p=>p._id),fr.pages.map(p=>p._id));
 for(let index=0;index<en.pages.length;index++){
  const a=en.pages[index],b=fr.pages[index],number=a.flags?.starwarsffg?.referenceNumber;
  assert.equal(number,b.flags?.starwarsffg?.referenceNumber);if(number){assert(a.name.startsWith(number+' · '));assert(b.name.startsWith(number+' · '));}assert.notEqual(a.text.content,b.text.content,a._id+' must have translated content');
  assert.equal(a.type,b.type);assert.equal(a.title?.show,b.title?.show);
 }
 assert.match(en.name,/Combat and healing/i);assert.match(fr.name,/combat et soins/i);
});

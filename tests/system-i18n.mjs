import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const catalogs=new Map();
export async function systemI18n(lang='en') {
  if(!catalogs.has(lang))catalogs.set(lang,JSON.parse(await readFile(new URL(`../lang/${lang}.json`,import.meta.url),'utf8')));
  const catalog=catalogs.get(lang);
  const localize=key=>{
    assert.equal(typeof key,'string','A locale key must be a string');
    if(!key.startsWith('SWFFG.')&&!key.startsWith('TYPES.'))return key;
    assert.ok(Object.hasOwn(catalog,key),`Missing ${lang} locale key: ${key}`);
    return catalog[key];
  };
  return {lang,localize,format:(key,values={})=>localize(key).replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,(_all,name)=>{
    assert.ok(Object.hasOwn(values,name),`Missing ${key} parameter: ${name}`);
    return String(values[name]);
  })};
}

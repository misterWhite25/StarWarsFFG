import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
async function load(journals=[],packs=[]){
 const game={user:{id:'player'},actors:{get:()=>null},i18n:{localize:key=>({'SWFFG.SkillsNameMedicine':'Médecine','SWFFG.SkillsNameComputers':'Informatique'}[key]??key)},journal:journals,packs};
 const context=vm.createContext({game});
 const source=await readFile(new URL('../../modules/helpers/skill-information.js',import.meta.url),'utf8');
 const module=new vm.SourceTextModule(source,{context});
 await module.link(()=>new vm.SyntheticModule(['skills'],function(){this.setExport('skills',{Medicine:{label:'SWFFG.SkillsNameMedicine'},Computers:{label:'SWFFG.SkillsNameComputers'}});},{context}));await module.evaluate();return module.namespace;
}
const page=(text,accessible=true)=>({type:'text',name:'Médecine',text:{content:text},isOwner:false,testUserPermission:()=>accessible});
const journal=(text,accessible=true)=>({name:'Médecine',pages:[page(text,accessible)],testUserPermission:()=>accessible});
test('generic roller has no skill; internal and translated labels identify Medicine',async()=>{
 const api=await load();assert.equal(api.skillDescriptor({roll:{data:{}}}),null);
 for(const name of ['Medicine','Médecine','SWFFG.SkillsNameMedicine'])assert.equal(api.skillDescriptor({roll:{skillName:name,data:{}}}).key,'Medicine');
});
test('actor custom skill description overrides fallback and journal',async()=>{
 const api=await load([journal('<p>Journal</p>')]);const actor={system:{skills:{Custom:{label:'Custom',description:'<p>Description personnalisée</p>'}}}};
 const skill=api.skillDescriptor({roll:{skillName:'Custom',data:{document:actor}}});assert.equal((await api.skillDescription(skill)).html,'<p>Description personnalisée</p>');
});
test('accessible journal is preferred to abbreviated fallback',async()=>{
 const api=await load([journal('<p>Description importée</p>')]);const result=await api.skillDescription({key:'Medicine',label:'Médecine',data:{}});assert.equal(result.html,'<p>Description importée</p>');assert.equal(result.secrets,false);
});
test('private description is not displayed and valid sourced summary is used',async()=>{
 const api=await load([journal('<p>Texte privé</p>',false)]);const result=await api.skillDescription({key:'Medicine',label:'Médecine',data:{}});assert.ok(!result.html.includes('privé'));assert.ok(result.source.includes('125'));
});
test('import placeholder is ignored',async()=>{
 const api=await load([journal('Dataset did not have a description')]);assert.ok((await api.skillDescription({key:'Medicine',label:'Médecine',data:{}})).html.includes('blessures'));
});
test('visible skill-description compendium is read, hidden one ignored',async()=>{
 let privateRead=false;const publicPack={documentName:'JournalEntry',visible:true,collection:'world.skills',metadata:{label:'Skills'},getIndex:async()=>[{_id:'m',name:'Medicine'}],getDocument:async()=>journal('<p>Description du compendium</p>')};
 const privatePack={...publicPack,visible:false,getIndex:async()=>{privateRead=true;return []}};
 const api=await load([],[privatePack,publicPack]);assert.equal((await api.skillDescription({key:'Medicine',label:'Médecine',data:{}})).html,'<p>Description du compendium</p>');assert.equal(privateRead,false);
});
test('unknown custom skill has explicit missing-description message instead of invented text',async()=>{
 const api=await load();assert.ok((await api.skillDescription({key:'Custom',label:'Custom',data:{}})).html.includes('pas encore été renseignée'));
});

test('bilingual references journal exposes its skill page without reading a hidden pack',async()=>{
 const pack={documentName:'JournalEntry',visible:true,collection:'swffg-compendium-bilingual.en-references-steelers',metadata:{label:'Reference guides'},getIndex:async()=>[{_id:'skills',name:'Skills'}],getDocument:async()=>({...journal('<p>Description intégrée de Médecine</p>'),name:'Skills'})};
 const api=await load([],[pack]);assert.equal((await api.skillDescription({key:'Medicine',label:'Médecine',data:{}})).html,'<p>Description intégrée de Médecine</p>');
});

for(const [key,label,pageName] of [['Ranged: Light','Armes légères','Distance (armes légères)'],['Ranged: Heavy','Armes lourdes','Distance (armes lourdes)']]){
 test(`translated compendium page is matched exactly for ${key}`,async()=>{
  const matching={...journal('<p>Description complète</p>'),name:'Compétences',pages:[{...page('<p>Description complète</p>'),name:pageName}]};
  const pack={documentName:'JournalEntry',visible:true,collection:'swffg-compendium-bilingual.en-references-steelers',metadata:{label:'Références'},getIndex:async()=>[{_id:'skills',name:'Compétences'}],getDocument:async()=>matching};
  const api=await load([],[pack]);assert.equal((await api.skillDescription({key,label,data:{}})).html,'<p>Description complète</p>');
 });
}
test('ranged aliases do not expose private pages or confuse light and heavy weapons',async()=>{
 const j={...journal('<p>Autre</p>'),name:'Compétences',pages:[{...page('<p>Texte privé</p>',false),name:'Distance (armes légères)'},{...page('<p>Armes lourdes seulement</p>'),name:'Distance (armes lourdes)'}]};
 const api=await load([j]);const result=await api.skillDescription({key:'Ranged: Light',label:'Armes légères',data:{}});assert(!result.html.includes('privé'));assert(!result.html.includes('lourdes seulement'));
});

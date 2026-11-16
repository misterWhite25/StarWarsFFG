import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';

// Inputs are an EN journal export and the same journal after its real FR Babele converters.
// Regenerates both fallback languages from one authoritative compendium snapshot.
const [englishPath,frenchPath]=process.argv.slice(2);
if(!englishPath||!frenchPath)throw Error('Usage: node scripts/generate-reference-fallbacks.mjs <english-journal.json> <french-journal.json>');
const root=new URL('../',import.meta.url),basis=JSON.parse(await fs.readFile(new URL('data/skill-references-fr.json',root),'utf8'));
const pages=new Map(basis.pages.map(page=>[page._id,/^(\d+-\d+)\s*·\s*/.exec(page.name)?.[1]??page.flags?.starwarsffg?.referenceNumber??null]));
for(const [language,path]of [['en',englishPath],['fr',frenchPath]]){
 const bytes=await fs.readFile(path),journal=JSON.parse(bytes);if(journal._id!==basis._id)throw Error('Journal ID mismatch');
 const available=new Map(journal.pages.map(page=>[page._id,page]));
 journal.pages=[...pages].map(([id,number])=>{
  const original=available.get(id);if(!original)throw Error('Missing native page '+id);const page=structuredClone(original);
  if(number){page.name=number+' · '+page.name.replace(/^\d+-\d+\s*·\s*/,'');page.flags={...page.flags,starwarsffg:{...page.flags?.starwarsffg,referenceNumber:number}};}
  return page;
 });
 journal.flags={...journal.flags,starwarsffg:{...journal.flags?.starwarsffg,referenceFallbackSource:{module:'swffg-compendium-bilingual-steelers-core_rule',journalId:journal._id,language,sha256:createHash('sha256').update(bytes).digest('hex')}}};
 await fs.writeFile(new URL('data/skill-references-'+language+'.json',root),JSON.stringify(journal,null,2)+'\n');
 console.log(language+': '+journal.pages.length+' native pages, IDs and canonical table numbers preserved.');
}

import {DocumentAsyncCache} from './document-async-cache.mjs';
import {fieldsAffect} from './actor-change-fields.mjs';

const cache=new DocumentAsyncCache();
export function enrichedSheetText(document,text,options={}){
  if(!text)return Promise.resolve('');
  // Active rolls and custom enrichers may depend on state outside this document.
  if(/\[\[|@(?!UUID\[|Compendium\[|Actor\[|Item\[|JournalEntry\[|JournalEntryPage\[|RollTable\[|Scene\[)/i.test(text))return foundry.applications.ux.TextEditor.enrichHTML(text,options);
  const context=[game.i18n.lang,game.user?.id,game.user?.role,document.isOwner,options,text];
  return cache.get(document,JSON.stringify(context),()=>foundry.applications.ux.TextEditor.enrichHTML(text,options));
}
export async function enrichTreeDescriptions(document,nodes){
  await Promise.all(nodes.map(async node=>{node.enrichedDescription=await enrichedSheetText(document,node.description);}));
}
export function invalidateSheetText(){cache.invalidate();}
if(globalThis.Hooks){
  for(const type of ['Actor','Item','JournalEntry','JournalEntryPage','RollTable','Scene']){
    Hooks.on('update'+type,(_document,changes)=>{if(fieldsAffect(changes,['name','img','ownership','permission','text','flags']))invalidateSheetText();});
    for(const event of ['create','delete'])Hooks.on(event+type,invalidateSheetText);
  }
  for(const event of ['updateUser','updateCompendium'])Hooks.on(event,invalidateSheetText);
}

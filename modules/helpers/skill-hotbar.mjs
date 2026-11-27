import {pageSlots,hotbarPatch,shortcutSkills,skillIcon,needsSkillIconUpdate,FALLBACK_SKILL_ICON} from './skill-hotbar-model.mjs';
const tr=(key,data)=>data?game.i18n.format('SWFFG.UI.SkillHotbar.'+key,data):game.i18n.localize('SWFFG.UI.SkillHotbar.'+key);
const owned=actor=>actor?.type==='character'&&!actor.pack&&actor.testUserPermission(game.user,'OWNER');
export const canInstallSkillHotbar=()=>game.user.can('MACRO_SCRIPT')&&CONFIG.Macro.documentClass.canUserCreate(game.user);
const commandFor=(actorUuid,key)=>`await game.ffg.SkillHotbar.roll(${JSON.stringify(actorUuid)}, ${JSON.stringify(key)});`;
let installing=false;
export async function rollSkillShortcut(actorUuid,key){
 const actor=await fromUuid(actorUuid);
 if(!owned(actor)||!actor.system.skills?.[key]){ui.notifications.warn(tr('Unavailable'));return null;}
 const reference=actor.isToken?{tokenUuid:actor.token.uuid}:actor.id;
 return game.ffg.DiceHelpers.rollSkillByKey(reference,key,2);
}
export async function installSkillHotbar(actor,{page,keys,expected}){
 if(installing)throw Error(tr('Busy'));
 if(!owned(actor))throw Error(tr('Unavailable'));
 if(!canInstallSkillHotbar())throw Error(tr('Permission'));
 let previous;try{previous=pageSlots(game.user.hotbar,page);}catch{throw Error(tr('InvalidPage'));}
 if(!Array.isArray(keys)||keys.length!==10||!keys.some(Boolean)||keys.some(key=>key&&!actor.system.skills?.[key])||new Set(keys.filter(Boolean)).size!==keys.filter(Boolean).length)throw Error(tr('InvalidSkills'));
 const unchanged=()=>!expected||JSON.stringify(pageSlots(game.user.hotbar,page))===JSON.stringify(expected);
 if(!unchanged())throw Error(tr('Changed'));
 const choices=new Map(shortcutSkills(actor,key=>game.i18n.localize(key)).map(skill=>[skill.key,skill]));
 if(keys.some(key=>key&&!choices.has(key)))throw Error(tr('InvalidSkills'));
 installing=true;
 const MacroClass=CONFIG.Macro.documentClass,macros=new Map(),missing=[],iconUpdates=[];let created=[],committed=false;
 try{
  for(const key of keys.filter(Boolean)){
   const command=commandFor(actor.uuid,key),existing=game.macros.find(macro=>macro.isOwner&&(macro.author?.id??macro.author)===game.user.id&&macro.type==='script'&&macro.command===command&&macro.getFlag('starwarsffg','skillShortcut')?.actorUuid===actor.uuid&&macro.getFlag('starwarsffg','skillShortcut')?.skillKey===key);
   const skill=choices.get(key);
   if(existing){
    macros.set(key,existing);
    if(needsSkillIconUpdate(existing.img,skill.icon))iconUpdates.push({_id:existing.id,img:skill.icon});
    continue;
   }
   missing.push({name:actor.name+' - '+skill.name,type:'script',img:skill.icon,command,author:game.user.id,ownership:{default:0,[game.user.id]:3},flags:{starwarsffg:{skillShortcut:{version:1,actorUuid:actor.uuid,skillKey:key}}}});
  }
  if(missing.length){created=await MacroClass.createDocuments(missing);if(created.length!==missing.length)throw Error(tr('Failed'));for(const macro of created)macros.set(macro.getFlag('starwarsffg','skillShortcut').skillKey,macro);}
  if(!owned(actor))throw Error(tr('Unavailable'));
  if(!canInstallSkillHotbar())throw Error(tr('Permission'));
  if(!unchanged())throw Error(tr('Changed'));
  if(iconUpdates.length)await MacroClass.updateDocuments(iconUpdates);
  if(!unchanged())throw Error(tr('Changed'));
  await game.user.update(hotbarPatch(page,keys.map(key=>key?macros.get(key).id:null)));
  committed=true;
 }finally{
  if(!committed&&created.length)try{await MacroClass.deleteDocuments(created.map(macro=>macro.id));}catch(error){console.warn('Star Wars FFG | Shortcut cleanup',error);}
  installing=false;
 }
 // The page is committed before refreshing the native UI. A display error must not delete its macros.
 try{await ui.hotbar?.changePage(page);}catch(error){console.warn('Star Wars FFG | Hotbar display',error);}
 return {page,assigned:keys.filter(Boolean).length,created:created.length,replaced:previous.filter(Boolean).length};
}
async function refreshAssignedSkillIcons() {
 const updates = [];
 for (const id of new Set(Object.values(game.user.hotbar))) {
  const macro = game.macros.get(id);
  const shortcut = macro?.getFlag('starwarsffg','skillShortcut');
  if (!macro?.isOwner || shortcut?.version !== 1 || !shortcut.skillKey) continue;
  // Only resolve the actor when an existing shortcut still has a placeholder.
  if (!needsSkillIconUpdate(macro.img, FALLBACK_SKILL_ICON)) continue;
  const actor = fromUuidSync(shortcut.actorUuid);
  const img = skillIcon(shortcut.skillKey, actor?.system?.skills?.[shortcut.skillKey]);
  updates.push({_id: id, img});
 }
 if (updates.length) await CONFIG.Macro.documentClass.updateDocuments(updates);
}

Hooks.once('ready', () => {
 game.ffg.SkillHotbar = {roll: rollSkillShortcut, install: installSkillHotbar};
 void refreshAssignedSkillIcons().catch(error => console.warn('Star Wars FFG | Skill shortcut images', error));
});

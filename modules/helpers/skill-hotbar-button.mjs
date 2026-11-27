export function addSkillHotbarButton(sheet,bar){
 const actor=sheet.actor;if(actor.type!=='character'||actor.pack||actor.limited||!actor.testUserPermission(game.user,'OWNER'))return;
 const doc=bar.ownerDocument,button=doc.createElement('button'),icon=doc.createElement('i');button.type='button';button.setAttribute('form',sheet.id+'-shortcut-action');
 button.className='ffg-sheet-mode ffg-skill-hotbar-button';button.dataset.skillHotbar='';icon.className='fa-solid fa-grip';icon.setAttribute('aria-hidden','true');
 button.append(icon);
 button.setAttribute('aria-label',game.i18n.localize('SWFFG.UI.SkillHotbar.Button'));
 button.title=game.i18n.localize('SWFFG.UI.SkillHotbar.ButtonHint');
 button.addEventListener('click',async event=>{
  event.preventDefault();event.stopPropagation();if(button.disabled)return;button.disabled=true;
  try{const {showSkillHotbar}=await import('./skill-hotbar-ui.mjs');await showSkillHotbar(actor);}
  catch(error){console.error('Star Wars FFG | Skill shortcuts',error);ui.notifications.warn(error.message);}
  finally{if(button.isConnected)button.disabled=false;}
 });bar.append(button);
}

import {shortcutSkills,shortcutPreset,pageSlots,SHORTCUT_PROFILES} from './skill-hotbar-model.mjs';
import {canInstallSkillHotbar,installSkillHotbar} from './skill-hotbar.mjs';
const tr=(key,data)=>data?game.i18n.format('SWFFG.UI.SkillHotbar.'+key,data):game.i18n.localize('SWFFG.UI.SkillHotbar.'+key);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dialogs=new Map();
export async function showSkillHotbar(actor){
 if(dialogs.get(actor.uuid)?.rendered){dialogs.get(actor.uuid).bringToFront();return dialogs.get(actor.uuid);}
 if(!canInstallSkillHotbar())throw Error(tr('Permission'));
 const skills=shortcutSkills(actor,key=>game.i18n.localize(key));if(!skills.length)throw Error(tr('NoSkills'));
 if(!document.querySelector('link[data-skill-hotbar-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../styles/skill-hotbar.css',import.meta.url).href;link.dataset.skillHotbarStyle='';document.head.append(link);}
 let page=ui.hotbar?.page;if(!Number.isInteger(page)||page<1||page>5)page=1;
 let expected=pageSlots(game.user.hotbar,page),keys=shortcutPreset(skills,'main',actor);
 const options=selected=>`<option value="">${esc(tr('Empty'))}</option>`+skills.map(skill=>`<option value="${esc(skill.key)}" ${skill.key===selected?'selected':''}>${esc(skill.name)}</option>`).join('');
 const content=`<section class="ffg-skill-hotbar-setup"><p>${esc(tr('Intro',{name:actor.name}))}</p><div class="ffg-skill-hotbar-options"><label>${esc(tr('Page'))}<select data-shortcut-page>${[1,2,3,4,5].map(value=>`<option value="${value}" ${value===page?'selected':''}>${esc(tr('PageNumber',{page:value}))}</option>`).join('')}</select></label><label>${esc(tr('ProfileLabel'))}<select data-shortcut-profile>${SHORTCUT_PROFILES.map(value=>`<option value="${value}">${esc(tr('Profile.'+value))}</option>`).join('')}</select></label></div><div class="ffg-skill-hotbar-slots">${keys.map((key,index)=>`<label class="ffg-skill-hotbar-slot"><span class="ffg-shortcut-key">${index===9?0:index+1}</span><span class="ffg-shortcut-icon"><img alt="" width="26" height="26"></span><select data-shortcut-slot="${index}" aria-label="${esc(tr('Slot',{slot:index===9?0:index+1}))}">${options(key)}</select><small data-shortcut-rank="${index}"></small></label>`).join('')}</div><p class="ffg-shortcut-warning" role="status" data-shortcut-warning></p></section>`;
 class SkillHotbarDialog extends foundry.applications.api.DialogV2{
  _onRender(context,options){
   super._onRender(context,options);const root=this.element.querySelector('.ffg-skill-hotbar-setup');
   root.addEventListener('change',event=>{
    if(event.target.matches('[data-shortcut-page]')){page=Number(event.target.value);expected=pageSlots(game.user.hotbar,page);}
    if(event.target.matches('[data-shortcut-profile]')&&event.target.value!=='custom'){keys=shortcutPreset(skills,event.target.value,actor);for(const input of root.querySelectorAll('[data-shortcut-slot]'))input.value=keys[Number(input.dataset.shortcutSlot)];}
    if(event.target.matches('[data-shortcut-slot]'))root.querySelector('[data-shortcut-profile]').value='custom';
    this.updatePreview();
   });this.updatePreview();
  }
  updatePreview(){
   for(const select of this.element.querySelectorAll('[data-shortcut-slot]')){
    const skill=skills.find(skill=>skill.key===select.value),row=select.closest('.ffg-skill-hotbar-slot'),img=row.querySelector('img');img.hidden=!skill;if(skill)img.src=skill.icon;
    row.querySelector('small').textContent=skill?tr('Rank',{rank:skill.rank}):'';
   }
   this.element.querySelector('[data-shortcut-warning]').textContent=tr('Warning',{page,count:expected.filter(Boolean).length});
   const button=this.element.querySelector('.form-footer [data-action=install]');button.textContent=tr('Replace',{page});
  }
  async _onSubmit(target,event){try{return await super._onSubmit(target,event);}catch(error){this.element.querySelectorAll('.form-footer button').forEach(button=>button.disabled=false);ui.notifications.warn(error.message);}}
 }
 const dialog=new SkillHotbarDialog({classes:['starwarsffg','themed','ffg-skill-hotbar-dialog'],window:{title:tr('Title'),resizable:true},position:{width:Math.min(520,innerWidth-32),height:'auto'},content,close:()=>dialogs.delete(actor.uuid),buttons:[
  {action:'install',label:tr('Replace',{page}),default:true,callback:async(_event,_button,app)=>{
   keys=[...app.element.querySelectorAll('[data-shortcut-slot]')].map(select=>select.value);
   const result=await installSkillHotbar(actor,{page,keys,expected});ui.notifications.info(tr('Installed',{page,count:result.assigned}));return result;
  }},
  {action:'cancel',label:tr('Cancel')}
 ]});dialogs.set(actor.uuid,dialog);try{await dialog.render({force:true});}catch(error){dialogs.delete(actor.uuid);throw error;}return dialog;
}

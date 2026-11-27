import {cleanPool} from './roll-request-model.mjs';
import {describeSkill} from './skill-information.js';
import {skillDescriptionHTML, skillReferenceHTML} from './skill-information-ui.js';
import {combatModeForRoll} from './weapon-selection.js';
const tr=(key,data)=>data?game.i18n.format('SWFFG.UI.RollRequests.'+key,data):game.i18n.localize('SWFFG.UI.RollRequests.'+key);
const node=(tag,cls,label)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(label!==undefined)el.textContent=label;return el;};
const skillLabel=(actor,key)=>game.i18n.localize(actor?.system.skills?.[key]?.label??CONFIG.FFG.skills?.[key]?.label??key);
const actorsFor=user=>game.actors.filter(actor=>['character','minion','rival','nemesis'].includes(actor.type)&&actor.system?.skills&&actor.testUserPermission(user,'OWNER')&&!actor.pack);
const personalActor=builder=>builder?.weaponContext?.actor??builder?.roll.data?.document;

function skillRulesPanel() {
 const panel = node('aside', 'ffg-request-rules ffg-skill-information-content');
 panel.setAttribute('aria-label', tr('SkillRules'));
 const name = node('h2');name.dataset.requestRuleName = '';
 const description = node('div');description.dataset.requestDescription = '';
 const modifiers = node('ul', 'ffg-request-modifier-list');
 for (const key of ['DifficultyRule','CircumstanceRule','UpgradeRule','OutcomeRule']) modifiers.append(node('li','',tr(key)));
 const references = node('div');references.dataset.requestReferences = '';
 panel.append(name, description, node('h3','',tr('DifficultyAndModifiers')), modifiers,
  node('h3','',game.i18n.localize('SWFFG.UI.SkillInfo.ReferenceTables')), references);
 return panel;
}

function bindSkillRules(root, actorFor, builder) {
 const select = root.querySelector('[data-request-skill]');
 const panel = root.querySelector('.ffg-request-rules');
 const name = panel.querySelector('[data-request-rule-name]');
 const description = panel.querySelector('[data-request-description]');
 const references = panel.querySelector('[data-request-references]');
 let revision = 0;
 const update = () => {
  const current = ++revision;
  const key = select.value;
  const skill = describeSkill(key, actorFor(key));
  const scale = combatModeForRoll(skill.key, builder?.roll.item, builder?.roll.combatMode);
  panel.scrollTop = 0;
  name.textContent = skill.label;
  function replaceWhenReady(target, content) {
   target.textContent = tr('LoadingSkillRules');
   target.setAttribute('aria-busy', 'true');
   void content.then(html => {
    if (current !== revision || !panel.isConnected) return;
    target.innerHTML = html;
    target.removeAttribute('aria-busy');
   }, () => {
    if (current !== revision || !panel.isConnected) return;
    target.textContent = game.i18n.localize('SWFFG.UI.SkillInfo.SkillReferencesUnavailable');
    target.removeAttribute('aria-busy');
   });
  }
  replaceWhenReady(description, skillDescriptionHTML(skill));
  replaceWhenReady(references, skillReferenceHTML(skill, {
   scale, improvised:true, silhouetteDifference:true, collapsible:true, includeCombatSpending:false
  }));
 };
 select.addEventListener('change', update);
 update();
}

export async function showRollRequestDialog({builder,skillKey:initialSkill='Perception'}={}){
 if(!game.user.isGM)throw Error(tr('GMOnly'));
 const fixed=personalActor(builder);
 if(builder&&!fixed?.uuid)throw Error(tr('NoPlayerActor'));
 let skillKey=initialSkill;
 if(builder){const key=builder.weaponContext?.skillKey??builder.roll.skillName;skillKey=Object.keys(fixed.system.skills??{}).find(candidate=>candidate===key||fixed.system.skills[candidate].label===key||skillLabel(fixed,candidate)===key)??key;}
 const players=game.users.filter(user=>user.active&&!user.isGM),choices=new Map(players.map(user=>[user.id,fixed?(fixed.testUserPermission(user,'OWNER')?[fixed]:[]):actorsFor(user)]));
 const root=node('div'),layout=node('div','ffg-roll-request-layout'),form=node('section','ffg-roll-request-form');
 root.append(layout);
 layout.append(form, skillRulesPanel());
 const candidateActors = [...choices.values()].flat();
 const actorFor = key => fixed ?? (Object.hasOwn(CONFIG.FFG.skills ?? {}, key)
  ? null : candidateActors.find(actor => actor.system.skills[key]));
 const heading=node('label','',tr('Skill')),select=node('select');select.dataset.requestSkill='';
 const keys=fixed?[skillKey]:[...new Set([...Object.keys(CONFIG.FFG.skills??{}),...players.flatMap(user=>choices.get(user.id).flatMap(actor=>Object.keys(actor.system.skills??{})))])];
 for(const key of keys.sort((a,b)=>skillLabel(fixed,a).localeCompare(skillLabel(fixed,b)))){const option=node('option','',skillLabel(fixed,key));option.value=key;select.append(option);}
 select.value=skillKey;if(!select.value&&keys.length)select.selectedIndex=0;for(const option of select.options)option.toggleAttribute('selected',option.selected);select.disabled=!!builder;heading.append(select);form.append(heading);
 const toolbar=node('div','ffg-request-selection'),list=node('div','ffg-request-players');toolbar.append(node('strong','',tr('Players')));
 for(const [value,label]of [['all','All'],['none','None']]){const choice=node('button','',tr(label));choice.type='button';choice.dataset.requestSelect=value;toolbar.append(choice);}form.append(toolbar,list);
 for(const user of players){
  const available=choices.get(user.id),row=node('div','ffg-request-player'),label=node('label'),check=node('input');check.type='checkbox';check.value=user.id;check.dataset.requestUser=user.id;check.disabled=!available.length;
  const name=node('span','',user.name);label.append(check,name);
  const actors=node('select');actors.dataset.requestActor=user.id;actors.setAttribute('aria-label',tr('CharacterFor',{name:user.name}));actors.disabled=!available.length;
  for(const actor of available){const option=node('option','',actor.name);option.value=actor.uuid;option.toggleAttribute('selected',user.character?.id===actor.id);actors.append(option);}
  if(!available.length)actors.append(node('option','',tr('NoCharacter')));
  row.append(label,actors);list.append(row);
 }
 const help=node('p','ffg-request-help',tr('ChoosePlayersHint'));form.append(help);
 // Validation errors keep the dialog usable instead of leaving native submit buttons disabled.
 class RequestDialog extends foundry.applications.api.DialogV2{
  _onRender(context,options){super._onRender(context,options);bindSkillRules(this.element,actorFor,builder);this.element.querySelector('.ffg-roll-request-form').addEventListener('click',event=>{const choice=event.target.closest('[data-request-select]');if(!choice)return;for(const input of this.element.querySelectorAll('[data-request-user]'))if(!input.disabled)input.checked=choice.dataset.requestSelect==='all';});}
  async _onSubmit(target,event){try{return await super._onSubmit(target,event);}catch(error){this.element.querySelectorAll('.form-footer button').forEach(button=>button.disabled=false);ui.notifications.warn(error.message);}}
 }
 let resolve;const result=new Promise(done=>resolve=done);
 const app=new RequestDialog({classes:['starwarsffg','themed','ffg-roll-request-dialog'],window:{title:tr('Request'),resizable:true},position:{width:Math.min(900,innerWidth-32)},content:root,submit:value=>resolve(value),close:()=>resolve(null),buttons:[
  {action:'send',label:tr('Send'),default:true,callback:async(_event,_button,dialog)=>{
   const content=dialog.element,recipients=[];
   for(const check of content.querySelectorAll('[data-request-user]:checked'))recipients.push({userId:check.value,actorUuid:content.querySelector('[data-request-actor="'+check.value+'"]').value});
   const chosen=content.querySelector('[data-request-skill]').value;
   const request={skillKey:chosen,title:builder?.description??tr('SkillRequest',{skill:skillLabel(fixed,chosen)}),reason:builder?.roll.flavor??'',recipients};
   if(builder)request.prepared={actorUuid:fixed.uuid,pool:cleanPool(builder.dicePool),item:builder.roll.item?.toObject?.()??builder.roll.item,skipAid:builder._aidPrepared&&!(builder._aidEntries?.length)};
   // DialogV2 clones the content, so selected values must come from the live form.
   const message=await game.ffg.rollRequests.send(request);ui.notifications.info(tr('Sent',{count:recipients.length}));return message;
  }},
  {action:'cancel',label:tr('Cancel'),callback:()=>null}
 ]});await app.render({force:true});return result;
}

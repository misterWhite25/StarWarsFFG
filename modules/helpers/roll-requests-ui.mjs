import {cleanPool} from './roll-request-model.mjs';
import {adjacentPlacement} from './pilotage-core.js';
import {describeSkill} from './skill-information.js';
import {skillDescriptionHTML, skillReferenceHTML} from './skill-information-ui.js';
import {combatModeForRoll} from './weapon-selection.js';
const tr=(key,data)=>data?game.i18n.format('SWFFG.UI.RollRequests.'+key,data):game.i18n.localize('SWFFG.UI.RollRequests.'+key);
const node=(tag,cls,label)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(label!==undefined)el.textContent=label;return el;};
const skillLabel=(actor,key)=>game.i18n.localize(actor?.system.skills?.[key]?.label??CONFIG.FFG.skills?.[key]?.label??key);
const actorsFor=user=>game.actors.filter(actor=>['character','minion','rival','nemesis'].includes(actor.type)&&actor.system?.skills&&actor.testUserPermission(user,'OWNER')&&!actor.pack);
const personalActor=builder=>builder?.weaponContext?.actor??builder?.roll.data?.document;

function appendSkillGroups(select, keys, actorFor) {
 const theme = game.settings.get('starwarsffg', 'skilltheme');
 const themeSkills = CONFIG.FFG.alternateskilllists?.find(list => list.id === theme)?.skills;
 const order = new Map(['General', 'Combat', 'Social', 'Knowledge'].map((type, index) => [type, index]));
 const collator = new Intl.Collator(game.i18n.lang);
 const groups = new Map();
 for (const key of keys) {
  const actor = actorFor(key);
  const type = actor?.system.skills?.[key]?.type || CONFIG.FFG.skills?.[key]?.type || themeSkills?.[key]?.type || 'General';
  if (!groups.has(type)) {
   const translation = 'SWFFG.Skills' + type;
   const label = game.i18n.localize(translation);
   const group = node('optgroup');
   group.label = label === translation ? game.i18n.localize(type) : label;
   groups.set(type, group);
  }
  const option = node('option', '', skillLabel(actor, key));
  option.value = key;
  groups.get(type).append(option);
 }
 const categories = [...groups].sort(([a, groupA], [b, groupB]) =>
  (order.get(a) ?? order.size) - (order.get(b) ?? order.size) || collator.compare(groupA.label, groupB.label));
 for (const [, group] of categories) {
  const options = [...group.children].sort((a, b) => collator.compare(a.text, b.text));
  group.append(...options);
  select.append(group);
 }
}

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

function skillRulesUpdater(panel, actorFor, builder) {
 const name = panel.querySelector('[data-request-rule-name]');
 const description = panel.querySelector('[data-request-description]');
 const references = panel.querySelector('[data-request-references]');
 let revision = 0;
 return key => {
  if (!key) return;
  const current = ++revision;
  const skill = describeSkill(key, actorFor(key));
  const scale = combatModeForRoll(skill.key, builder?.roll.item, builder?.roll.combatMode);
  panel.closest('.dialog-content').scrollTop = 0;
  name.textContent = skill.label;
  async function replaceWhenReady(target, load) {
   target.textContent = tr('LoadingSkillRules');
   target.setAttribute('aria-busy', 'true');
   try {
    const html = await load();
    if (current === revision && panel.isConnected) target.innerHTML = html;
   } catch (_error) {
    if (current === revision && panel.isConnected) {
     target.textContent = game.i18n.localize('SWFFG.UI.SkillInfo.SkillReferencesUnavailable');
    }
   } finally {
    if (current === revision && panel.isConnected) target.removeAttribute('aria-busy');
   }
  }
  void replaceWhenReady(description, () => skillDescriptionHTML(skill));
  void replaceWhenReady(references, () => skillReferenceHTML(skill, {
   scale, improvised: true, silhouetteDifference: true, collapsible: true, includeCombatSpending: false
  }));
 };
}

export async function showRollRequestDialog({builder,skillKey:initialSkill='Perception'}={}){
 if(!game.user.isGM)throw Error(tr('GMOnly'));
 const fixed=personalActor(builder);
 if(builder&&!fixed?.uuid)throw Error(tr('NoPlayerActor'));
 let skillKey=initialSkill;
 if(builder){const key=builder.weaponContext?.skillKey??builder.roll.skillName;skillKey=Object.keys(fixed.system.skills??{}).find(candidate=>candidate===key||fixed.system.skills[candidate].label===key||skillLabel(fixed,candidate)===key)??key;}
 const players=game.users.filter(user=>user.active&&!user.isGM),choices=new Map(players.map(user=>[user.id,fixed?(fixed.testUserPermission(user,'OWNER')?[fixed]:[]):actorsFor(user)]));
 const content = node('div');
 const form = node('div', 'ffg-roll-request-form');
 content.append(form);
 const candidateActors = [...choices.values()].flat();
 const actorFor = key => fixed ?? (Object.hasOwn(CONFIG.FFG.skills ?? {}, key)
  ? null : candidateActors.find(actor => actor.system.skills[key]));
 const heading=node('label','',tr('Skill')),select=node('select');select.dataset.requestSkill='';
 const keys=fixed?[skillKey]:[...new Set([...Object.keys(CONFIG.FFG.skills??{}),...players.flatMap(user=>choices.get(user.id).flatMap(actor=>Object.keys(actor.system.skills??{})))])];
 appendSkillGroups(select, keys, actorFor);
 select.value=skillKey;if(!select.value&&keys.length)select.selectedIndex=0;for(const option of select.options)option.toggleAttribute('selected',option.selected);select.disabled=!!builder;
 const skillRow = node('div', 'ffg-request-skill-row');
 const rulesButton = node('button', 'ffg-request-open-rules');
 rulesButton.type = 'button';
 rulesButton.dataset.requestOpenRules = '';
 rulesButton.disabled = !select.value;
 rulesButton.setAttribute('aria-expanded', 'false');
 const infoIcon = node('i', 'fa-solid fa-circle-info');
 infoIcon.setAttribute('aria-hidden', 'true');
 rulesButton.append(infoIcon, node('span', '', tr('SkillRules')));
 heading.append(select);
 skillRow.append(heading, rulesButton);
 form.append(skillRow);
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
  _onRender(context, options) {
   super._onRender(context, options);
   const select = this.element.querySelector('[data-request-skill]');
   const button = this.element.querySelector('[data-request-open-rules]');
   select.addEventListener('change', () => this.refreshSkillRules?.(select.value));
   button.addEventListener('click', async () => {
    button.disabled = true;
    try { await this.toggleSkillRules(); }
    catch (error) { ui.notifications.warn(error.message); }
    finally { button.disabled = !select.value; }
   });
   this.element.querySelector('.ffg-request-selection').addEventListener('click', event => {
    const choice = event.target.closest('[data-request-select]');
    if (!choice) return;
    for (const input of this.element.querySelectorAll('[data-request-user]:not(:disabled)')) {
     input.checked = choice.dataset.requestSelect === 'all';
    }
   });
  }

  async toggleSkillRules() {
   if (this.skillRules) return this.skillRules.close();
   const host = this.element.ownerDocument.defaultView;
   const placement = adjacentPlacement(this.element.getBoundingClientRect(), {width: host.innerWidth, height: host.innerHeight});
   const height = Math.min(530, host.innerHeight - 24);
   const button = this.element.querySelector('[data-request-open-rules]');
   if (placement.jetLeft !== undefined) this.setPosition({left: placement.jetLeft});
   const content = node('div');
   content.append(skillRulesPanel());
   const view = new foundry.applications.api.DialogV2({
    classes: ['starwarsffg', 'themed', 'ffg-roll-request-rules-window'],
    window: {title: tr('SkillRules'), resizable: true},
    modal: false,
    position: {left: placement.left, top: Math.min(placement.top, host.innerHeight - height - 12), width: placement.width, height},
    content,
    buttons: [{action: 'dismiss', label: game.i18n.localize('SWFFG.UI.SkillInfo.CloseInformation')}]
   });
   view.addEventListener('close', () => {
    this.skillRules = null;
    this.refreshSkillRules = null;
    const toggle = this.element?.querySelector('[data-request-open-rules]');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.removeAttribute('aria-controls');
   }, {once: true});
   this.skillRules = view;
   try {
    await this.renderChild(view);
    if (!view.rendered || this.skillRules !== view) return;
    this.refreshSkillRules = skillRulesUpdater(view.element.querySelector('.ffg-request-rules'), actorFor, builder);
    button.setAttribute('aria-controls', view.id);
    button.setAttribute('aria-expanded', 'true');
    this.refreshSkillRules(this.element.querySelector('[data-request-skill]').value);
   } catch (error) {
    await view.close({animate: false});
    if (this.skillRules === view) this.skillRules = null;
    throw error;
   }
  }

  async _preClose(options) {
   await this.skillRules?.close({animate: false});
   await super._preClose(options);
  }
  async _onSubmit(target,event){try{return await super._onSubmit(target,event);}catch(error){this.element.querySelectorAll('.form-footer button').forEach(button=>button.disabled=false);ui.notifications.warn(error.message);}}
 }
 let resolve;const result=new Promise(done=>resolve=done);
 const app=new RequestDialog({classes:['starwarsffg','themed','ffg-roll-request-dialog'],window:{title:tr('Request'),resizable:true},position:{width:Math.min(485,innerWidth-24)},content,submit:value=>resolve(value==='cancel'?null:value),buttons:[
  {action:'send',label:tr('Send'),default:true,callback:async(_event,_button,dialog)=>{
   const content=dialog.element,recipients=[];
   for(const check of content.querySelectorAll('[data-request-user]:checked'))recipients.push({userId:check.value,actorUuid:content.querySelector('[data-request-actor="'+check.value+'"]').value});
   const chosen=content.querySelector('[data-request-skill]').value;
   const request={skillKey:chosen,title:builder?.description??tr('SkillRequest',{skill:skillLabel(actorFor(chosen),chosen)}),reason:builder?.roll.flavor??'',recipients};
   if(builder)request.prepared={actorUuid:fixed.uuid,pool:cleanPool(builder.dicePool),item:builder.roll.item?.toObject?.()??builder.roll.item,skipAid:builder._aidPrepared&&!(builder._aidEntries?.length)};
   // DialogV2 clones the content, so selected values must come from the live form.
   const message=await game.ffg.rollRequests.send(request);ui.notifications.info(tr('Sent',{count:recipients.length}));return message;
  }},
  {action:'cancel',label:tr('Cancel'),callback:()=>null}
 ]});
 app.addEventListener('close', () => resolve(null), {once: true});
 await app.render({force:true});
 return result;
}

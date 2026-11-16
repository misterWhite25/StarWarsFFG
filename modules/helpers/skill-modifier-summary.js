const fields=[['boost','Fortune','blue'],['setback','Infortune','black'],['remsetback','Retrait d’Infortune','black'],['upgrades','Amélioration d’aptitude',null],['force','Dé de Force','white'],['success','Succès',null],['advantage','Avantage',null],['triumph','Triomphe',null],['failure','Échec',null],['threat','Menace',null],['despair','Désastre',null],['light','Point lumineux',null],['dark','Point obscur',null]];
const modifierLabelKeys={"boost": "SWFFG.UI.Talent.Modifier.boost", "setback": "SWFFG.UI.Talent.Modifier.setback", "remsetback": "SWFFG.UI.Talent.Modifier.remsetback", "upgrades": "SWFFG.UI.Talent.Modifier.upgrades", "force": "SWFFG.UI.Talent.Modifier.force", "success": "SWFFG.UI.Talent.Modifier.success", "advantage": "SWFFG.UI.Talent.Modifier.advantage", "triumph": "SWFFG.UI.Talent.Modifier.triumph", "failure": "SWFFG.UI.Talent.Modifier.failure", "threat": "SWFFG.UI.Talent.Modifier.threat", "despair": "SWFFG.UI.Talent.Modifier.despair", "light": "SWFFG.UI.Talent.Modifier.light", "dark": "SWFFG.UI.Talent.Modifier.dark"};
const flags=actor=>actor.getFlag?.('starwarsffg','pilotageModifiers')??actor.flags?.starwarsffg?.pilotageModifiers??[];
export function collectSkillModifiers(actor,{tokens=[],subjectUuid=actor.token?.uuid,localize=(key,data)=>data.label??key}={}){
 const skills=[];
 for(const [key,data] of Object.entries(actor.system?.skills??{})){
  const values=fields.flatMap(([field,label,color])=>{const value=Number(data[field]??0);return Number.isFinite(value)&&value!==0?[{field,label,color,value}]:[];});
  if(values.length)skills.push({key,label:localize(key,data),values});
 }
 const relevant=tokens.filter(token=>token.actor?.uuid===actor.uuid&&(!subjectUuid||token.uuid===subjectUuid));
 const counts=new Map();const pending=[];
 for(const token of relevant){const ordinal=(counts.get(token.name)??0)+1;counts.set(token.name,ordinal);
  const label=relevant.filter(t=>t.name===token.name).length>1?`${token.name} · ${ordinal}`:token.name;
  for(const entry of flags(token.actor))if(entry.state==='pending'&&entry.subjectUuid===token.uuid)pending.push({id:entry.id,subjectUuid:token.uuid,tokenLabel:label,skill:entry.skill??null,boost:Number(entry.boost)||0,setback:Number(entry.setback)||0,reason:entry.reason??''});
 }
 return {skills,pending,multipleTokens:relevant.length>1};
}
/** Group the already calculated totals without changing their source or mechanics. */
export function groupSkillModifiers(skills,totalSkillCount) {
 const groups=new Map();
 for(const skill of skills)for(const modifier of skill.values){
  const key=JSON.stringify([modifier.field,modifier.value]);
  if(!groups.has(key))groups.set(key,{...modifier,skills:[],keys:new Set()});
  const group=groups.get(key);
  if(!group.keys.has(skill.key)){group.keys.add(skill.key);group.skills.push(skill.label);}
 }
 return Array.from(groups.values(),({keys,...group})=>({...group,skills:[...new Set(group.skills)],allSkills:totalSkillCount>0&&keys.size===totalSkillCount}));
}
const append=(parent,tag,text,className)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;parent.append(el);return el;};
const installed=new WeakSet();
export function renderSkillModifierSummary(sheet){
 const root=sheet.element,skills=root?.querySelector('.skillsTablesGrid');if(!skills)return;
 const anchor=root.querySelector('.ffg-combat-layout')??skills;
 root.querySelector('.ffg-skill-modifier-summary')?.remove();
 const section=document.createElement('section');section.className='ffg-skill-modifier-summary';
 const style=append(section,'style');style.textContent='.ffg-skill-modifier-summary{height:auto;min-height:0;clear:both;box-sizing:border-box;margin-top:14px;padding:12px;border:1px solid #64747780;border-top:3px solid #52686b;border-radius:5px;background:rgba(255,255,255,.24)}.ffg-skill-modifier-summary h3{font-family:inherit;font-size:16px;font-weight:600;margin:0 0 10px}.ffg-skill-modifier-summary h4{font-size:13px;margin:12px 0 6px}.ffg-skill-modifier-summary .modifier-row{padding:7px 0;border-bottom:1px solid #64747730;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.ffg-skill-modifier-summary .modifier-label{min-width:140px;font-weight:bold}.ffg-skill-modifier-summary .modifier-die{display:inline-flex;align-items:center;gap:4px}.ffg-skill-modifier-summary img{width:20px;height:20px;border:0}.ffg-skill-modifier-summary .modifier-note{text-align:justify;font-size:12px;margin:5px 0;opacity:.85}.ffg-skill-modifier-summary .modifier-reason{width:100%;font-size:12px}';
 const heading=append(section,'h3',game.i18n.localize("SWFFG.UI.Talent.ModifierSummary"));
 const information=append(heading,'i',null,'fa-solid fa-circle-info');
 const tooltip=game.i18n.localize("SWFFG.UI.Talent.ModifierSummaryHint");
 information.setAttribute('data-tooltip',tooltip);information.setAttribute('aria-label',tooltip);information.setAttribute('role','img');information.tabIndex=0;
 information.style.cssText='margin-left:7px;font-size:12px;cursor:help;vertical-align:middle';
 const localize=(key,data={})=>game.i18n.localize(data.label??CONFIG.FFG.skills?.[key]?.label??key);
 const tokens=(canvas.scene?.tokens.contents??[]).filter(t=>game.user.isGM||t.object?.visible);
 const actor=sheet.actor;
 const summary=collectSkillModifiers(actor,{tokens,localize});
 const die=(parent,value,label,color)=>{const span=append(parent,'span',null,'modifier-die');if(color){const image=append(span,'img');image.src=`systems/starwarsffg/images/dice/starwars/${color}.png`;image.alt=label;span.title=label;append(span,'span',`${value>0?'+':''}${value}`);}else span.textContent=`${label} ${value>0?'+':''}${value}`;};
 const setting=key=>{try{return game.settings.get('starwarsffg',key);}catch{return null;}};
 const difficulty=setting('gmDifficulty');
 if(summary.pending.length){append(section,'h4',game.i18n.localize("SWFFG.UI.Talent.PendingNextRoll"));
  if(summary.multipleTokens)append(section,'p',game.i18n.localize("SWFFG.UI.Talent.SeparateTokenEffects"),'modifier-note');
  for(const entry of summary.pending){const row=append(section,'div',null,'modifier-row');const scope=entry.skill?({RangedLight:game.i18n.localize('SWFFG.SkillsNameRangedLight'),RangedHeavy:game.i18n.localize('SWFFG.SkillsNameRangedHeavy'),Melee:game.i18n.localize('SWFFG.SkillsNameMelee'),Brawl:game.i18n.localize('SWFFG.SkillsNameBrawl'),Gunnery:game.i18n.localize('SWFFG.SkillsNameGunnery'),Medicine:game.i18n.localize('SWFFG.SkillsNameMedicine')}[entry.skill]??localize(entry.skill)):game.i18n.localize("SWFFG.UI.Talent.AnySkill");append(row,'span',`${entry.tokenLabel} · ${scope}`, 'modifier-label');if(entry.boost)die(row,entry.boost,game.i18n.localize(modifierLabelKeys.boost),'blue');if(entry.setback)die(row,entry.setback,game.i18n.localize(modifierLabelKeys.setback),'black');if(entry.reason)append(row,'span',entry.reason,'modifier-reason');}
 }
 if(summary.skills.length){append(section,'h4',game.i18n.localize("SWFFG.UI.Talent.ExistingSkillModifiers"));append(section,'p',game.i18n.localize("SWFFG.UI.Talent.AlreadyIncludedHint"),'modifier-note');
  for(const modifier of groupSkillModifiers(summary.skills,Object.keys(actor.system?.skills??{}).length)){
   const row=append(section,'div',null,'modifier-row');
   if(modifier.field==='remsetback')append(row,'span',`${game.i18n.localize(modifierLabelKeys[modifier.field])} : ${modifier.value}${difficulty?.enabled?game.i18n.localize("SWFFG.UI.Talent.NotAppliedNextRoll"):''}`);
   else if(modifier.field==='setback'&&difficulty?.enabled)append(row,'span',game.i18n.format("SWFFG.UI.Talent.SetbackNotApplied", {value:modifier.value}));
   else die(row,modifier.value,game.i18n.localize(modifierLabelKeys[modifier.field]),modifier.color);
   append(row,'span',modifier.allSkills?game.i18n.localize("SWFFG.UI.Talent.AllRolls"):`- ${modifier.skills.join(', ')}`,'modifier-scope');
  }
 }
 if(!summary.pending.length&&!summary.skills.length)append(section,'p',game.i18n.localize("SWFFG.UI.Talent.NoIndividualModifiers"),'modifier-note');
 anchor.append(section);
 Hooks.callAll('ffgRenderSkillModifierSummary',sheet,section);
 if(!installed.has(sheet)){
  installed.add(sheet);const ids=['ffgPilotageChanged','ffgGMDifficultyChanged','canvasReady'].map(name=>[name,Hooks.on(name,()=>{if(sheet.rendered)renderSkillModifierSummary(sheet);})]);
  sheet.addEventListener('close',()=>{for(const [name,id]of ids)Hooks.off(name,id);installed.delete(sheet);},{once:true});
 }
}

import {skills as standardSkills} from '../config/ffg-skills.js';

const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
// Localized summaries, paraphrased from the Skills chapter of the supplied
// livre Age of Rebellion fourni (extraction locale migration-work/rules-audit).
const summaries={
  'Astrogation':[116,"SWFFG.UI.SkillInformation.Summary.Astrogation"],
  'Athletics':[117,"SWFFG.UI.SkillInformation.Summary.Athletics"],
  'Brawl':[131,"SWFFG.UI.SkillInformation.Summary.Brawl"],
  'Charm':[117,"SWFFG.UI.SkillInformation.Summary.Charm"],
  'Coercion':[118,"SWFFG.UI.SkillInformation.Summary.Coercion"],
  'Computers':[119,"SWFFG.UI.SkillInformation.Summary.Computers"],
  'Cool':[120,"SWFFG.UI.SkillInformation.Summary.Cool"],
  'Coordination':[121,"SWFFG.UI.SkillInformation.Summary.Coordination"],
  'Deception':[121,"SWFFG.UI.SkillInformation.Summary.Deception"],
  'Discipline':[122,"SWFFG.UI.SkillInformation.Summary.Discipline"],
  'Gunnery':[131,"SWFFG.UI.SkillInformation.Summary.Gunnery"],
  'Leadership':[123,"SWFFG.UI.SkillInformation.Summary.Leadership"],
  'Mechanics':[124,"SWFFG.UI.SkillInformation.Summary.Mechanics"],
  'Medicine':[125,"SWFFG.UI.SkillInformation.Summary.Medicine"],
  'Melee':[133,"SWFFG.UI.SkillInformation.Summary.Melee"],
  'Negotiation':[125,"SWFFG.UI.SkillInformation.Summary.Negotiation"],
  'Perception':[126,"SWFFG.UI.SkillInformation.Summary.Perception"],
  'Piloting: Planetary':[126,"SWFFG.UI.SkillInformation.Summary.PilotingPlanetary"],
  'Piloting: Space':[127,"SWFFG.UI.SkillInformation.Summary.PilotingSpace"],
  'Ranged: Heavy':[133,"SWFFG.UI.SkillInformation.Summary.RangedHeavy"],
  'Ranged: Light':[133,"SWFFG.UI.SkillInformation.Summary.RangedLight"],
  'Resilience':[127,"SWFFG.UI.SkillInformation.Summary.Resilience"],
  'Skulduggery':[128,"SWFFG.UI.SkillInformation.Summary.Skulduggery"],
  'Stealth':[128,"SWFFG.UI.SkillInformation.Summary.Stealth"],
  'Streetwise':[130,"SWFFG.UI.SkillInformation.Summary.Streetwise"],
  'Survival':[130,"SWFFG.UI.SkillInformation.Summary.Survival"],
  'Vigilance':[130,"SWFFG.UI.SkillInformation.Summary.Vigilance"],
  'Knowledge: Core Worlds':[134,"SWFFG.UI.SkillInformation.Summary.KnowledgeCoreWorlds"],
  'Knowledge: Education':[135,"SWFFG.UI.SkillInformation.Summary.KnowledgeEducation"],
  'Knowledge: Lore':[135,"SWFFG.UI.SkillInformation.Summary.KnowledgeLore"],
  'Knowledge: Outer Rim':[135,"SWFFG.UI.SkillInformation.Summary.KnowledgeOuterRim"],
  'Knowledge: Underworld':[136,"SWFFG.UI.SkillInformation.Summary.KnowledgeUnderworld"],
  'Knowledge: Warfare':[136,"SWFFG.UI.SkillInformation.Summary.KnowledgeWarfare"],
  'Knowledge: Xenology':[137,"SWFFG.UI.SkillInformation.Summary.KnowledgeXenology"],
  'Lightsaber':[null,"SWFFG.UI.SkillInformation.Summary.Lightsaber"]
};

export function skillDescriptor(builder){
  const raw=builder.weaponContext?.skillKey??builder.roll.skillName??builder.roll.item?.system?.skill?.value;
  if(!raw)return null;
  const actor=builder.roll.data?.document??game.actors.get(builder.roll.data?.actor?._id);
  return describeSkill(raw, actor);
}

export function describeSkill(raw, actor) {
  const actorSkills=actor?.system?.skills??{};
  const names=[raw,game.i18n.localize(raw)].map(normalize);
  const match=Object.entries({...standardSkills,...actorSkills}).find(([key,data])=>[key,data.value,data.label,game.i18n.localize(data.label??key)].some(value=>names.includes(normalize(value))));
  const key=match?.[0]??raw,data=match?.[1]??{};
  return {key,label:game.i18n.localize(data.label??key),data:actorSkills[key]??data};
}
export function referenceMatchesLocale(journal, page, lang = game.i18n.lang) {
  const language = [page, journal].flatMap(document => [
    document?.flags?.starwarsffg?.language,
    document?.flags?.["swffg-compendium-bilingual"]?.language,
    document?.flags?.["swffg-reference-tables-fr"]?.language
  ]).find(value => typeof value === "string" && value.trim());
  return !language || language.split("-")[0].toLowerCase() === lang?.split("-")[0].toLowerCase();
}

const readable=html=>Boolean(String(html??'').replace(/<[^>]*>/g,'').trim())&&!/Dataset did not have a description/i.test(String(html));
export async function skillDescription(skill){
  if(readable(skill.data.description))return {html:skill.data.description,source:game.i18n.localize('SWFFG.UI.SkillInformation.CharacterSource')};
  const compendiumAliases={rangedlight:['Distance (Armes légères)'],rangedheavy:['Distance (Armes lourdes)']};
  const names=[skill.key,skill.label,...(compendiumAliases[normalize(skill.key)]??[])];
  const matches=name=>names.some(value=>normalize(name)===normalize(value));
  const fromJournal=journal=>{
    if(!journal.testUserPermission(game.user,'OBSERVER'))return null;
    const page=journal.pages.find(page=>page.type==='text'&&page.testUserPermission(game.user,'OBSERVER')&&referenceMatchesLocale(journal,page)&&(matches(page.name)||matches(journal.name))&&readable(page.text?.content));
    return page?{html:page.text.content,source:journal.name,secrets:page.isOwner}:null;
  };
  for(const journal of game.journal){const result=fromJournal(journal);if(result)return result;}
  for(const pack of game.packs){
    if(pack.documentName!=='JournalEntry'||!pack.visible||!(/skill|comp[eé]tence/i.test(pack.collection+' '+pack.metadata.label)||['swffg-compendium-bilingual.en-references-steelers','swffg-compendium-bilingual-steelers-core_rule.en-references-steelers'].includes(pack.collection)))continue;
    const index=await pack.getIndex();const entry=index.find(entry=>matches(entry.name))??index.find(entry=>/^(Skills|Compétences)$/i.test(entry.name));
    if(entry){const result=fromJournal(await pack.getDocument(entry._id));if(result)return result;}
  }
  const summary=summaries[skill.key];
  if(summary)return {html:`<p style="text-align:justify">${game.i18n.localize(summary[1])}</p>`,source:summary[0]?game.i18n.format('SWFFG.UI.SkillInformation.RulebookSource',{page:summary[0]}):game.i18n.localize('SWFFG.UI.SkillInformation.ProjectSource')};
  return {html:`<p style="text-align:justify">${game.i18n.localize('SWFFG.UI.SkillInformation.MissingDescription')}</p>`,source:null};
}

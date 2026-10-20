import {skills as standardSkills} from '../config/ffg-skills.js';

const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
// Descriptifs abrégés en français, reformulés depuis le chapitre Compétences du
// livre Age of Rebellion fourni (extraction locale migration-work/rules-audit).
const summaries={
  'Astrogation':[116,'Calculer une route hyperspatiale et exploiter les données de navigation pour rejoindre une destination.'],
  'Athletics':[117,'Accomplir des efforts physiques tels que courir, grimper, sauter ou nager.'],
  'Brawl':[131,'Combattre à mains nues ou avec des armes conçues pour le pugilat.'],
  'Charm':[117,'Obtenir la sympathie ou la coopération de quelqu’un grâce à son aisance personnelle.'],
  'Coercion':[118,'Faire céder quelqu’un par l’intimidation, les menaces ou la pression.'],
  'Computers':[119,'Exploiter des systèmes informatiques, rechercher des données et intervenir sur des programmes ou leurs protections.'],
  'Cool':[120,'Conserver son sang-froid et réagir avec assurance dans une situation à laquelle on s’est préparé.'],
  'Coordination':[121,'Garder son équilibre et maîtriser des mouvements précis ou acrobatiques.'],
  'Deception':[121,'Tromper un interlocuteur, dissimuler ses intentions ou présenter une fausse version des faits.'],
  'Discipline':[122,'Maintenir sa concentration et sa maîtrise de soi face à la peur, aux distractions ou aux pressions.'],
  'Gunnery':[131,'Utiliser des armes lourdes montées, des tourelles et les systèmes d’armement de véhicules ou de vaisseaux.'],
  'Leadership':[123,'Diriger, inspirer et coordonner d’autres personnes pour les conduire vers un objectif commun.'],
  'Mechanics':[124,'Diagnostiquer et réparer des équipements, des machines ou des véhicules, et intervenir sur leurs composants.'],
  'Medicine':[125,'Évaluer et traiter des blessures ou des maladies, pratiquer les premiers secours et assurer des soins médicaux.'],
  'Melee':[133,'Combattre au contact avec des armes de mêlée, telles que des lames, bâtons ou vibro-armes.'],
  'Negotiation':[125,'Discuter les termes d’un échange, marchander et parvenir à un accord avantageux.'],
  'Perception':[126,'Observer activement son environnement pour repérer des indices, des personnes ou des éléments dissimulés.'],
  'Piloting: Planetary':[126,'Manœuvrer des véhicules terrestres ou atmosphériques dans des conditions exigeantes, notamment lors d’une poursuite.'],
  'Piloting: Space':[127,'Manœuvrer un vaisseau spatial, négocier des obstacles et gérer des poursuites ou des engagements dans l’espace.'],
  'Ranged: Heavy':[133,'Effectuer des attaques à distance avec des armes généralement tenues à deux mains, telles que les fusils.'],
  'Ranged: Light':[133,'Effectuer des attaques à distance avec des armes légères généralement maniées d’une main, telles que les pistolets.'],
  'Resilience':[127,'Résister physiquement à l’épuisement, aux conditions difficiles et aux atteintes à l’organisme.'],
  'Skulduggery':[128,'Accomplir des actions discrètes de manipulation, telles que crocheter une serrure ou subtiliser un objet.'],
  'Stealth':[128,'Se déplacer ou agir sans être remarqué, en utilisant les abris et les distractions disponibles.'],
  'Streetwise':[130,'Trouver des contacts, des renseignements ou des ressources dans les milieux urbains et les réseaux informels.'],
  'Survival':[130,'Se débrouiller dans un environnement sauvage : s’orienter, trouver des ressources et suivre des pistes.'],
  'Vigilance':[130,'Être prêt à réagir à une menace imprévue ou à un changement soudain de situation.'],
  'Knowledge: Core Worlds':[134,'Mobiliser ses connaissances des mondes du Noyau, de leurs cultures, institutions et échanges.'],
  'Knowledge: Education':[135,'Mobiliser des connaissances générales acquises par l’étude, notamment dans les domaines scientifiques et techniques.'],
  'Knowledge: Lore':[135,'Identifier des traditions, récits anciens et connaissances historiques ou ésotériques.'],
  'Knowledge: Outer Rim':[135,'Mobiliser ses connaissances des mondes de la Bordure extérieure, de leurs habitants et particularités.'],
  'Knowledge: Underworld':[136,'Identifier les organisations criminelles, leurs pratiques, leurs activités et leurs relations.'],
  'Knowledge: Warfare':[136,'Comprendre la tactique, les opérations militaires et les moyens employés dans un conflit.'],
  'Knowledge: Xenology':[137,'Identifier les espèces, leurs particularités biologiques et les éléments de leurs cultures.'],
  'Lightsaber':[null,'Manier un sabre laser et employer les techniques de combat associées.']
};

export function skillDescriptor(builder){
  const raw=builder.weaponContext?.skillKey??builder.roll.skillName??builder.roll.item?.system?.skill?.value;
  if(!raw)return null;
  const actor=builder.roll.data?.document??game.actors.get(builder.roll.data?.actor?._id);
  const actorSkills=actor?.system?.skills??{};
  const names=[raw,game.i18n.localize(raw)].map(normalize);
  const match=Object.entries({...standardSkills,...actorSkills}).find(([key,data])=>[key,data.value,data.label,game.i18n.localize(data.label??key)].some(value=>names.includes(normalize(value))));
  const key=match?.[0]??raw,data=match?.[1]??{};
  return {key,label:game.i18n.localize(data.label??key),data:actorSkills[key]??data};
}
const readable=html=>Boolean(String(html??'').replace(/<[^>]*>/g,'').trim())&&!/Dataset did not have a description/i.test(String(html));
export async function skillDescription(skill){
  if(readable(skill.data.description))return {html:skill.data.description,source:'Description de la fiche du personnage.'};
  const compendiumAliases={rangedlight:['Distance (Armes légères)'],rangedheavy:['Distance (Armes lourdes)']};
  const names=[skill.key,skill.label,...(compendiumAliases[normalize(skill.key)]??[])];
  const matches=name=>names.some(value=>normalize(name)===normalize(value));
  const fromJournal=journal=>{
    if(!journal.testUserPermission(game.user,'OBSERVER'))return null;
    const page=journal.pages.find(page=>page.type==='text'&&page.testUserPermission(game.user,'OBSERVER')&&(matches(page.name)||matches(journal.name))&&readable(page.text?.content));
    return page?{html:page.text.content,source:journal.name,secrets:page.isOwner}:null;
  };
  for(const journal of game.journal){const result=fromJournal(journal);if(result)return result;}
  for(const pack of game.packs){
    if(pack.documentName!=='JournalEntry'||!pack.visible||!(/skill|comp[eé]tence/i.test(pack.collection+' '+pack.metadata.label)||pack.collection==='swffg-compendium-bilingual.en-references-steelers'))continue;
    const index=await pack.getIndex();const entry=index.find(entry=>matches(entry.name))??index.find(entry=>/^(Skills|Compétences)$/i.test(entry.name));
    if(entry){const result=fromJournal(await pack.getDocument(entry._id));if(result)return result;}
  }
  const summary=summaries[skill.key];
  if(summary)return {html:`<p>${summary[1]}</p>`,source:summary[0]?`Résumé — Age of Rebellion, livre de base fourni, p. ${summary[0]}.`:'Descriptif abrégé du projet.'};
  return {html:'<p>La description de cette compétence n’a pas encore été renseignée.</p>',source:null};
}

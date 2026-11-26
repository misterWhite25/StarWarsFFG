const normalize=value=>String(value??'').replace(/^SWFFG\.SkillsName/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const SKILL_ICONS=Object.freeze({
 "astrogation": "icons/skills/trades/academics-astronomy-navigation-blue.webp",
 "athletics": "icons/skills/movement/figure-running-gray.webp",
 "brawl": "icons/weapons/fist/knuckles-steel.webp",
 "charm": "icons/skills/social/diplomacy-handshake-blue.webp",
 "coercion": "icons/skills/social/intimidation-impressing.webp",
 "computers": "icons/skills/trades/electronics-tech-circuit-blue.webp",
 "cool": "icons/magic/control/silhouette-aura-energy.webp",
 "coordination": "icons/skills/movement/ball-spinning-blue.webp",
 "deception": "icons/magic/control/control-influence-puppet.webp",
 "discipline": "icons/magic/defensive/shield-barrier-blue.webp",
 "gunnery": "icons/weapons/artillery/cannon-tech-white.webp",
 "knowledgecoreworlds": "icons/environment/settlement/city-night-spire.webp",
 "knowledgebountyhunters": "icons/skills/targeting/crosshair-hex-red.webp",
 "knowledgeengineering": "icons/sundries/documents/blueprints-teal.webp",
 "knowledgeeducation": "icons/skills/trades/academics-study-reading-book.webp",
 "knowledgelore": "icons/skills/trades/academics-study-archaeology-bones.webp",
 "knowledgeouterrim": "icons/tools/navigation/map-nautical-compass.webp",
 "knowledgeunderworld": "icons/commodities/currency/coin-engraved-jolly-roger-gold.webp",
 "knowledgewarfare": "icons/skills/targeting/target-strike-triple-blue.webp",
 "knowledgexenology": "icons/creatures/magical/humanoid-silhoette-alien-gray.webp",
 "leadership": "icons/magic/control/control-influence-rally-purple.webp",
 "lightsaber": "icons/skills/melee/blade-tip-energy-green.webp",
 "mechanics": "icons/tools/hand/wrench-steel.webp",
 "medicine": "icons/tools/medical/medkit-white-red.webp",
 "melee": "icons/skills/melee/hand-grip-sword-white-brown.webp",
 "negotiation": "icons/skills/social/trading-justice-scale-gold.webp",
 "perception": "icons/tools/scribal/magnifying-glass.webp",
 "pilotingplanetary": "icons/tools/nautical/steering-wheel-blue.webp",
 "pilotingspace": "icons/environment/vehicles/plane.webp",
 "rangedheavy": "icons/weapons/guns/rifle-energy-blaster.webp",
 "rangedlight": "icons/weapons/guns/pistol-energy-blaster.webp",
 "resilience": "icons/magic/life/heart-cross-strong-green.webp",
 "skulduggery": "icons/skills/trades/security-locksmith-key-gray.webp",
 "stealth": "icons/magic/perception/silhouette-stealth-shadow.webp",
 "streetwise": "icons/skills/social/theft-pickpocket-bribery-brown.webp",
 "survival": "icons/environment/wilderness/camp-improvised.webp",
 "vigilance": "icons/magic/perception/eye-ringed-glow-angry-teal.webp",
 "explosives": "icons/skills/ranged/bomb-grenade-thrown-gray.webp"
});
export const FALLBACK_SKILL_ICON = 'icons/sundries/gaming/dice-pair-white-green.webp';
const knowledgePrefix = /^(?:knowledge|connaissances?)/;
const knowledgeAliases = new Map([
  ['engineering', 'knowledgeengineering'],
  ['ingenierie', 'knowledgeengineering'],
  ['bountyhunter', 'knowledgebountyhunters'],
  ['bountyhunters', 'knowledgebountyhunters'],
  ['bountyhunting', 'knowledgebountyhunters'],
  ['chasseurdeprimes', 'knowledgebountyhunters'],
  ['chasseursdeprimes', 'knowledgebountyhunters'],
  ['chasseauxprimes', 'knowledgebountyhunters']
]);

export function skillIdentity(key, skill = {}) {
  for (const value of [key, skill.value, skill.label].map(normalize)) {
    const identity = knowledgeAliases.get(value.replace(knowledgePrefix, '')) ?? value;
    if (Object.hasOwn(SKILL_ICONS, identity)) return identity;
  }
  return normalize(key);
}

export function skillIcon(key, skill = {}) {
  const identity = skillIdentity(key, skill);
  if (Object.hasOwn(SKILL_ICONS, identity)) return SKILL_ICONS[identity];
  const isKnowledge = [key, skill.type, skill.label].some(value => knowledgePrefix.test(normalize(value)));
  return isKnowledge ? SKILL_ICONS.knowledgeeducation : FALLBACK_SKILL_ICON;
}

const defaultMacroIcons = new Set(['icons/svg/d20.svg', 'icons/svg/dice-target.svg', 'icons/svg/mystery-man.svg']);
export function needsSkillIconUpdate(current, desired) {
  return current !== desired && (!current?.trim() || defaultMacroIcons.has(current));
}

const profileKeys={
 combat:['rangedlight','rangedheavy','melee','brawl','gunnery','lightsaber','cool','vigilance','athletics','coordination','discipline','resilience'],
 exploration:['perception','vigilance','athletics','coordination','stealth','survival','resilience','skulduggery','streetwise','discipline'],
 social:['charm','negotiation','deception','coercion','leadership','cool','discipline','perception','streetwise','knowledgeunderworld'],
 technical:['pilotingspace','pilotingplanetary','astrogation','gunnery','mechanics','computers','leadership','cool','vigilance','knowledgewarfare']
};
export const SHORTCUT_PROFILES=Object.freeze(['main',...Object.keys(profileKeys),'custom']);
const priority=['perception','vigilance','cool','discipline','athletics','coordination','rangedlight','rangedheavy','mechanics','computers','negotiation'];
export function shortcutSkills(actor,translate=value=>value){
 return Object.entries(actor.system?.skills??{}).flatMap(([key,skill])=>{
  const characteristic=Number(actor.system.characteristics?.[skill.characteristic]?.value);
  if(!Number.isFinite(characteristic))return [];
  return [{key,id:skillIdentity(key,skill),name:translate(skill.label??key),rank:Math.max(0,Number(skill.rank)||0),characteristic,icon:skillIcon(key,skill)}];
 }).sort((a,b)=>a.name.localeCompare(b.name));
}
export function shortcutPreset(skills,profile='main',actor){
 const hasLightsaber=skills.some(skill=>skill.id==='lightsaber'&&skill.rank>0)||[...(actor?.items??[])].some(item=>item.type==='weapon'&&normalize(item.system?.skill?.value)==='lightsaber');
 const eligible=skills.filter(skill=>skill.id!=='lightsaber'||hasLightsaber);
 let selected;
 if(profile==='main')selected=[...eligible].sort((a,b)=>b.rank-a.rank||Math.min(b.rank,b.characteristic)-Math.min(a.rank,a.characteristic)||b.characteristic-a.characteristic||(priority.indexOf(a.id)<0?100:priority.indexOf(a.id))-(priority.indexOf(b.id)<0?100:priority.indexOf(b.id))||a.name.localeCompare(b.name));
 else selected=(profileKeys[profile]??[]).flatMap(id=>eligible.filter(skill=>skill.id===id));
 return Array.from({length:10},(_,index)=>selected[index]?.key??'');
}
export function pageSlots(hotbar,page){
 if(!Number.isInteger(page)||page<1||page>5)throw Error('Invalid hotbar page');
 return Array.from({length:10},(_,index)=>hotbar?.[(page-1)*10+index+1]??null);
}
/** Only this page is patched. A concurrent update of another page is preserved. */
export function hotbarPatch(page,macroIds){
 pageSlots({},page);if(macroIds.length!==10)throw Error('Expected ten hotbar slots');
 return Object.fromEntries(macroIds.map((id,index)=>['hotbar.'+(id?'':'-=')+((page-1)*10+index+1),id??null]));
}

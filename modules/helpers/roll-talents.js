const scope = 'starwarsffg';
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const bands=['Short','Medium','Long','Extreme'];
const rules=[{id:'pressure-point',names:['pressurepoint','pointsnevralgiques'],skills:['brawl','pugilat'],condition:'livingUnarmed',upgrades:0},{id:'greased-palms',names:['greasedpalms','potdevin'],skills:['charm','charme','coercion','deception','tromperie','negotiation','negociation','leadership','commandement'],variable:true,creditPerAmount:50,maneuver:true,condition:'socialBribe'},{id:'creative-killer',names:['creativekiller','tueurinstinctif'],requiresWeapon:true,personalWeaponOnly:true,condition:'improvised',criticalReduction:2,upgrades:0},{id:'overwhelm-emotions',names:['overwhelmemotions','ascendantemotionnel'],skills:['charm','charme','coercion','deception','tromperie'],forceRatingDice:true,forceMode:'overwhelm-emotions',condition:'forceSusceptible',upgrades:0},{id:'barrage',names:['barrage','tirdebarrage'],skills:['gunnery','artillerie','rangedheavy','armeslourdes'],requiresWeapon:true,personalWeaponOnly:true,condition:'longRange',damagePerRank:1,upgrades:0},{id:'dynamic-fire',names:['dynamicfire','tirexpose'],rangedPersonal:true,requiresWeapon:true,personalWeaponOnly:true,condition:'engagedRange',cost:2,difficultyReduction:1,upgrades:0},{id:'balance',names:['balance','serenite'],skills:['cool','discipline','calme','sangfroid'],forceRatingDice:true,perRecovery:true,upgrades:0,condition:'encounterRecovery'},{"id": "master-leader", "names": ["masterleader", "expertcommandant"], "skills": ["leadership", "commandement"], "cost": 2, "perRound": true, "difficultyReduction": 1, "minimumDifficulty": 1, "upgrades": 0}, {"id": "sense-danger", "names": ["sensedanger", "perceptiondudanger"], "removeSetback": 2, "perSession": true, "upgrades": 0}, {"id": "commanding-presence", "names": ["commandingpresence", "poigne"], "skills": ["leadership", "cool", "commandement", "calme"], "removePerRank": 1, "automatic": true, "upgrades": 0}, {"id": "expert-tracker", "names": ["experttracker", "pisteurchevronne"], "removePerRank": 1, "upgrades": 0, "condition": "tracking"}, {"id": "utinni", "names": ["utinni"], "removePerRank": 1, "upgrades": 0, "condition": "salvaging"}, {"id": "hunter", "names": ["hunter", "chasseur"], "boostPerRank": 1, "upgrades": 0, "condition": "animal"}, {"id": "shortcut", "names": ["shortcut", "raccourci"], "boostPerRank": 1, "upgrades": 0, "condition": "chase"}, {"id": "sleight-of-mind", "names": ["sleightofmind", "espritfurtif"], "skills": ["stealth", "discretion"], "boostPerRank": 1, "upgrades": 0, "condition": "forceSusceptible"}, {"id": "sense-emotions", "names": ["senseemotions", "perceptiondesemotions"], "skills": ["charm", "coercion", "deception", "charme", "tromperie"], "boost": 1, "upgrades": 0, "condition": "forceSusceptible"}, {"id": "force-of-will", "names": ["forceofwill", "actedevolonte"], "characteristic": "Willpower", "perSession": true, "upgrades": 0}, {"id": "quick-fix", "names": ["quickfix", "ethop"], "characteristic": "Agility", "perSession": true, "upgrades": 0}, {"id": "clever-solution", "names": ["cleversolution", "solutionastucieuse"], "characteristic": "Cunning", "perSession": true, "upgrades": 0}, {"id": "stroke-of-genius", "names": ["strokeofgenius", "traitdegenie"], "characteristic": "Intellect", "perSession": true, "upgrades": 0}, {"id": "works-like-a-charm", "names": ["workslikeacharm", "worklikeacharm", "quacelanetienne"], "characteristic": "Presence", "perSession": true, "upgrades": 0},
 {id:'dead-to-rights',names:['deadtorights','danslemille'],shipWeapon:true,skills:['gunnery','artillerie'],destinyCost:1,upgrades:0},
 {id:'dead-to-rights-improved',names:['deadtorightsimproved','danslemilleameliore'],shipWeapon:true,skills:['gunnery','artillerie'],destinyCost:1,upgrades:0},
 {id:'master-shadows',names:['masterofshadows','expertendiscretion'],skills:['stealth','skulduggery','discretion','magouilles'],cost:2,perRound:true,difficultyReduction:1,minimumDifficulty:1,upgrades:0},
 {id:'master-slicer',names:['masterslicer','expertslicer'],skills:['computers','informatique'],cost:2,perRound:true,difficultyReduction:1,minimumDifficulty:1,upgrades:0},
 {id:'master-starhopper',names:['masterstarhopper','expertstellaire'],skills:['astrogation'],cost:2,perRound:true,difficultyReduction:1,minimumDifficulty:1,upgrades:0},
 {id:'touch-of-fate',names:['touchoffate','coupdepoucedudestin'],boost:2,perSession:true,upgrades:0},
 {id:'intimidating',names:['intimidating','intimidant'],skills:['coercion'],variable:true,strainPerAmount:true,difficultyDowngrade:true,upgrades:0},
 {id:'inventor-boost',names:['inventor','inventeur'],variable:true,boostAmount:true,upgrades:0},
 {id:'inventor-removal',names:['inventor','inventeur'],variable:true,removalAmount:true,upgrades:0},
 {id:'street-smarts',names:['streetsmarts','degourdi'],skills:['streetwise','systemed','knowledgeunderworld','underworld','connaissancepegre','pegre'],automatic:true,removePerRank:1,upgrades:0},
 {id:'codebreaker-removal',names:['codebreaker','craqueurdecodes'],skills:['computers','informatique'],removePerRank:1,upgrades:0},
 {id:'codebreaker-difficulty',names:['codebreaker','craqueurdecodes'],skills:['computers','informatique'],difficultyReduction:1,upgrades:0},
 {id:'crippling-blow',names:['cripplingblow','couphandicapant'],combat:true,difficultyAddition:1,upgrades:0},
 {id:'stunning-blow',names:['stunningblow','coupassommant'],melee:true,upgrades:0},
 {id:'master-doctor',names:['masterdoctor','expertenmedecine'],skills:['medicine','medecine'],cost:2,perRound:true,difficultyReduction:1,minimumDifficulty:1,upgrades:0},
 {id:'master-merchant',names:['mastermerchant','expertencommerce'],skills:['negotiation','negociation'],cost:2,upgrades:0},

 {id:'precise-aim',names:['preciseaim','coupprecis'],combat:true,maneuver:true,perRound:true,variable:true,upgrades:0,note:'Coût : 1 manœuvre et le stress choisi, une fois par round. Renseignez uniquement la défense de la cible déjà incluse dans les Infortunes de ce jet. Les autres Infortunes ne sont pas réduites.'},
 {id:'confidence',names:['confidence','aplomb'],skills:['discipline','sangfroid'],difficultySteps:true,upgrades:0},
 {id:'command',names:['command','autoritenaturelle'],skills:['leadership','commandement'],boostPerRank:1,upgrades:0,note:'À activer : +1 Fortune par rang en Commandement. Les effets sur l’auditoire pendant 24 heures restent à gérer avec le MJ.'},
 {id:'outdoorsman',names:['outdoorsman','baroudeur'],skills:['athletics','athletisme','coordination'],removePerRank:1,upgrades:0,note:'Confirmer que le test concerne le terrain ou l’environnement. Retire 1 Infortune par rang.'},
 {id:'gearhead',names:['gearhead','asdelamecanique'],skills:['mechanics','mecanique'],removePerRank:1,automatic:true,upgrades:0,note:'Retrait automatique d’Infortunes par rang. La réduction du coût des mods reste manuelle.'},
 {id:'intense-focus',names:['intensefocus','concentrationintense'],maneuver:true,cost:1,upgrades:1},
 {id:'frenzied-attack',names:['frenziedattack','attaquefrenetique','attaquefurieuse'],variable:true,melee:true},
 {id:'true-aim',names:['trueaim','viseejuste','viseeprecise'],maneuver:true,perRound:true,ranged:true,boost:1},
 {id:'sniper-shot',names:['snipershot','tireurdelite'],maneuver:true,perRound:true,ranged:true,requiresWeapon:true,variable:true,upgrades:0},
 {id:'point-blank',names:['pointblank','boutportant'],rangedPersonal:true,requiresWeapon:true,upgrades:0},
];
// These rules are source-checked summaries, not an approval for production delivery.
export const sourceCheckedTalentRules=[
 {id:'physical-training',names:['physicaltraining','entrainementphysique'],skills:['athletics','resilience','athletisme','resistance'],boostPerRank:1,upgrades:0,note:'Passif : +1 Fortune par rang en Athlétisme et Résistance.',source:'AoR p.154 / PDF155'},
 {id:'kill-with-kindness',automatic:true,names:['killwithkindness','irresistible'],skills:['charm','leadership','charme','commandement'],removePerRank:1,upgrades:0,note:'Passif : retirez 1 Infortune par rang en Charme et Commandement.',source:'AoR p.150 / PDF151 ; SWR02 p.139 / PDF150'},
 {id:'plausible-deniability',automatic:true,names:['plausibledeniability','beneficedudoute'],skills:['coercion','deception','tromperie'],removePerRank:1,upgrades:0,note:'Passif : retirez 1 Infortune par rang en Coercition et Tromperie.',source:'AoR p.154 / PDF155 ; SWR02 p.133 / PDF144'},
 {id:'convincing-demeanor',automatic:true,names:['convincingdemeanor','persuasion'],skills:['deception','skulduggery','tromperie','magouilles'],removePerRank:1,upgrades:0,note:'Passif : retirez 1 Infortune par rang en Tromperie et Magouilles.',source:'AoR p.145 / PDF146 ; SWR02 p.141 / PDF152'},
 {id:'skilled-jockey',automatic:true,names:['skilledjockey','pilotechevronne'],skills:['pilotingplanetary','pilotingspace','pilotageplanetaire','pilotagespatial','pilotageespace'],removePerRank:1,upgrades:0,note:'Passif : retirez 1 Infortune par rang aux tests de Pilotage planétaire et spatial.',source:'AoR p.156 / PDF157 ; SWR02 p.141 / PDF152'},
 {id:'stalker',names:['stalker','filature'],skills:['coordination','stealth','discretion'],boostPerRank:1,upgrades:0,note:'Passif : +1 Fortune par rang en Coordination et Discrétion.',source:'AoR p.157 / PDF158 ; SWR02 p.138 / PDF149'},
 {id:'galaxy-mapper',automatic:true,names:['galaxymapper','cartographiedelagalaxie'],skills:['astrogation'],removePerRank:1,upgrades:0,note:'Retirez 1 Infortune par rang en Astrogation ; durée divisée par deux, sans réduction supplémentaire par rang (à gérer manuellement).',source:'AoR p.148 / PDF149 ; SWR02 p.133 / PDF144'},
 {id:'bypass-security',names:['bypasssecurity','systemesdesecurite'],skills:['computers','skulduggery','informatique','magouilles'],removePerRank:1,upgrades:0,note:'À cocher seulement pour désactiver une sécurité ou ouvrir une porte verrouillée : retirez 1 Infortune par rang.',source:'AoR p.144 / PDF145 ; SWR02 p.144 / PDF155'},
 {id:'researcher',automatic:true,names:['researcher','chercheur'],knowledge:true,removePerRank:1,upgrades:0,note:'Retirez 1 Infortune par rang aux tests de Connaissance ; recherches deux fois plus rapides (durée manuelle).',source:'AoR p.154 / PDF155 ; SWR02 p.134 / PDF145'},
 {id:'forager',names:['forager','subsistance'],skills:['survival','survie'],removeSetback:2,upgrades:0,note:'À cocher seulement pour chercher nourriture, eau ou abri : retirez jusqu’à 2 Infortunes. Test de Survie deux fois plus rapide, durée manuelle.',source:'AoR p.147 / PDF148 ; SWR02 p.144 / PDF155'},
 {id:'brace',names:['brace','stabilite'],maneuver:true,variable:true,removalAmount:true,removePerRank:1,upgrades:0,note:'Coût : 1 manœuvre. Retirez 1 Infortune par rang, uniquement celles dues aux conditions physiques ou environnementales ; vérifiez leur nombre avant de cocher.',source:'AoR p.143 / PDF144 ; SWR02 p.144 / PDF155'},
 {id:'quick-strike',names:['quickstrike','coupeclair'],combat:true,boostPerRank:1,upgrades:0,note:'À cocher seulement si la cible n’a pas encore agi dans cette rencontre : +1 Fortune par rang.',source:'AoR p.154 / PDF155 ; SWR02 p.135 / PDF146'},
];
rules.push(...sourceCheckedTalentRules);
const canonicalSkill=value=>{const key=normalize(value).replace(/^swffgskillsname/,'');return ({calme:'cool',sangfroid:'discipline',charme:'charm',commandement:'leadership',tromperie:'deception',magouilles:'skulduggery',athletisme:'athletics',resistance:'resilience',discretion:'stealth',informatique:'computers',survie:'survival',pilotageplanetaire:'pilotingplanetary',pilotagespatial:'pilotingspace',pilotageespace:'pilotingspace'})[key]??key;};
export function configuredTalentImpact(actor,rule,skill){
 const expected=rule.boostPerRank?'skillboost':'skillremovesetback',field=rule.boostPerRank?'boost':'remsetback',key=canonicalSkill(skill),attributes=[],sources=[];
 for(const item of Array.from(actor?.items?.contents??actor?.items??[])){
  if(item.type==='talent'&&rule.names.includes(normalize(item.name))){attributes.push(...Object.values(item.system?.attributes??{}));sources.push(item);}
  if(item.type==='specialization')for(const node of Object.values(item.system?.talents??{}))if(node.islearned===true&&rule.names.includes(normalize(node.name))){attributes.push(...Object.values(node.attributes??{}));sources.push(item);}
 }
 if(attributes.some(a=>a&&normalize(a.modtype)===expected&&canonicalSkill(a.mod)===key&&Number(a.value)>0))return true;
 const effects=sources.flatMap(item=>Array.from(item.effects?.contents??item.effects??[]));
 for(const effect of Array.from(actor?.effects?.contents??actor?.effects??[]))if(sources.some(item=>item.id&&effect.origin?.endsWith('.Item.'+item.id)))effects.push(effect);
 return effects.some(effect=>!effect.disabled&&effect.transfer!==false&&effect.active!==false&&Array.from(effect.system?.changes??effect.changes??[]).some(change=>{const match=/^(?:system|data)\.skills\.(.*)\.(boost|remsetback)$/.exec(change.key??'');return match&&canonicalSkill(match[1])===key&&match[2]===field&&Number(change.value)>0;}));
}
const weaponRange=item=>item?.system?.range?.adjusted || item?.system?.range?.value;
const baseDamage=item=>{const d=item?.system?.damage??{};return Number(d.adjusted)||Number(d.value)||0;};
export function talentRank(actor,names){const keys=names.map(normalize);return (actor?.talentList??[]).filter(talent=>keys.includes(normalize(talent.name))&&actor?.items?.get?.(talent.itemId)?.system?.active!==false).reduce((sum,talent)=>sum+(talent.isRanked?Math.max(0,Number(talent.rank)||0):1),0);}
export function talentCostAccount(actor){
 if(actor?.type==='minion')return null;
 const strain=actor?.system?.stats?.strain;if(strain&&Number(strain.max)>0)return {path:'system.stats.strain.value',stat:strain,label:'stress'};
 const wounds=actor?.system?.stats?.wounds;if(actor?.type==='rival'&&wounds)return {path:'system.stats.wounds.value',stat:wounds,label:'blessures (coût de stress du Rival)'};
 return null;
}
const talentCostAccountLabel=actor=>{const account=talentCostAccount(actor);return !account?game.i18n.localize("SWFFG.UI.Talent.RollExtra041"):account.path==='system.stats.wounds.value'?game.i18n.localize("SWFFG.UI.Talent.RollExtra042"):game.i18n.localize("SWFFG.UI.Talent.RollExtra043");};
export function strainRemaining(actor){const account=talentCostAccount(actor);return account?Math.max(0,(Number(account.stat.max)||0)-(Number(account.stat.value)||0)):0;}
export function combatRoundKey(){const combat=game.combat;return combat?.started?`${combat.id}:${combat.round}`:null;}
export function rollTalentOptions(actor,skill,context={}){
 const key=normalize(skill).replace(/^swffgskillsname/,'');
 const melee=['melee','brawl','corpsacorps','pugilat'].includes(key);
 const personal=['rangedlight','rangedheavy','armeslegeres','armeslourdes','distancearmeslegeres','distancearmeslourdes'].includes(key);
 const ranged=personal||['gunnery','artillerie'].includes(key);
 return rules.flatMap(rule=>{
  const owned=(actor?.talentList??[]).find(talent=>rule.names.includes(normalize(talent.name))),rank=talentRank(actor,rule.names);
  if(!owned||!rank||(rule.melee&&!melee)||(rule.ranged&&!ranged)||(rule.rangedPersonal&&!personal))return [];
  if(rule.skills&&!rule.skills.includes(key))return [];
  if(rule.knowledge&&!/knowledge|connaissance/i.test(actor?.system?.skills?.[skill]?.type??'')&&!/^(knowledge|connaissance)/.test(key)&&!['coreworlds','education','lore','outerrim','underworld','warfare','xenology','mondesdunoyau','culture','bordureexterieure','pegre','strategie','xenologie'].includes(key))return [];
  if(rule.combat&&!melee&&!ranged&&!['lightsaber','sabrelaser'].includes(key))return [];
  const round=combatRoundKey(),item=context.item;
  if(rule.shipWeapon&&item?.type!=='shipweapon'&&!item?.crew?.crew_card)return [];
  if(rule.id==='dead-to-rights'&&talentRank(actor,['deadtorightsimproved','danslemilleameliore'])>0)return [];
  let blockedReason='';
  if(rule.id==='pressure-point'&&(item?.type==='weapon'&&!item.flags?.starwarsffg?.brawlAttack?.unarmed||Array.from(game.user?.targets??[]).length!==1))blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollExtra001");
  if(rule.forceRatingDice&&!(Number(actor.system.stats?.forcePool?.max)>0))blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollExtra002");
  if(rule.perRecovery&&!actor.getFlag?.(scope,'lastCompletedEncounter'))blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollExtra003");
  if(rule.destinyCost&&!game.user?.isGM)blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollText001");
  if(rule.perSession&&actor.getFlag?.(scope,'talentSessionUsage')?.[rule.id])blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollText002");
  if(rule.automatic)blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollText003");
  if(['physical-training','stalker'].includes(rule.id))blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollText004");
  if(!rule.automatic&&!['physical-training','stalker'].includes(rule.id)&&(rule.removePerRank||rule.boostPerRank||rule.removeSetback)&&configuredTalentImpact(actor,rule,skill))blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollText005");
  if(!(rule.id==='precise-aim'&&context.precisePaid)&&rule.perRound&&round&&actor.getFlag?.(scope,'rollTalentUsage')?.[rule.id]===round)blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollText006");
  if(rule.personalWeaponOnly&&(item?.type!=='weapon'||item?.crew?.crew_card))blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollExtra004");
  if(rule.requiresWeapon&&item?.type!=='weapon')blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollText007");
  let maxAmount=rule.variable?rank:1;
  if(rule.creditPerAmount){const credits=Number(actor.system.stats?.credits?.value);maxAmount=Number.isFinite(credits)?Math.min(rank,Math.floor(credits/rule.creditPerAmount)):0;if(maxAmount<1)blockedReason=game.i18n.localize("SWFFG.UI.Talent.TriggeredText077");}
  if(rule.strainPerAmount){maxAmount=Math.min(rank,strainRemaining(actor));if(!maxAmount)blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollText008");}
  if(rule.id==='frenzied-attack'){maxAmount=Math.min(rank,strainRemaining(actor)+(context.frenziedPaid?.amount??0));if(!maxAmount)blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollText009");}
  if(rule.id==='precise-aim'){maxAmount=Math.min(rank,strainRemaining(actor)+(context.precisePaid?.amount??0));if(!maxAmount)blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollText009");}
  if(rule.id==='sniper-shot'){
   const index=bands.indexOf(weaponRange(item));maxAmount=index<0?0:Math.min(rank,bands.length-1-index);
   if(item?.type==='weapon'&&!maxAmount)blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollText010");
   if(item?.system?.isThrown===true||item?.flags?.starwarsffg?.isThrown===true)blockedReason=game.i18n.localize("SWFFG.UI.Talent.RollText011");
  }
  return [{...rule,name:owned.name+(rule.id==='codebreaker-removal'?game.i18n.localize("SWFFG.UI.Talent.RollExtra005"):rule.id==='codebreaker-difficulty'?game.i18n.localize("SWFFG.UI.Talent.RollExtra006"):''),rank,description:owned.description,isRanked:owned.isRanked,maxAmount,blocked:Boolean(blockedReason),blockedReason}];
 });
}
export function selectedRollTalents(actor,skill,selections,context={}){
 const options=rollTalentOptions(actor,skill,context),seen=new Set();
 const chosen=selections.map(selection=>{
  const option=options.find(option=>option.id===selection.id),amount=Number(selection.amount??1);
  if(!option||option.blocked||seen.has(option.id)||!Number.isInteger(amount)||amount<1||amount>(option.variable?option.maxAmount:1))throw Error(game.i18n.localize("SWFFG.UI.Talent.RollText012"));
  if(option.condition&&selection.conditionConfirmed!==true)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollText013"));
  seen.add(option.id);
  const frenzied=option.id==='frenzied-attack',precise=option.id==='precise-aim';
  const targetDefence=Number(selection.targetDefence??0);
  if(precise&&(!Number.isInteger(targetDefence)||targetDefence<0))throw Error(game.i18n.localize("SWFFG.UI.Talent.RollText014"));
  if(precise&&context.precisePaid&&(amount!==context.precisePaid.amount||targetDefence!==context.precisePaid.targetDefence))throw Error(game.i18n.localize("SWFFG.UI.Talent.RollText015"));
  if(frenzied&&context.frenziedPaid&&amount!==context.frenziedPaid.amount)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollExtra007"));
  return {...selection,name:option.name,rank:option.rank,amount,cost:(precise&&context.precisePaid)||(frenzied&&context.frenziedPaid)?0:(frenzied||precise||option.strainPerAmount)?amount:option.cost??0,
   creditCost:option.creditPerAmount?option.creditPerAmount*amount:0,upgrades:frenzied||option.creditPerAmount?amount:option.upgrades??option.rank,destinyCost:option.destinyCost??0,destinyPool:selection.destinyPool??(actor.hasPlayerOwner||actor.type==='character'?'light':'dark'),perSession:option.perSession===true,criticalReduction:option.criticalReduction??0,forceMode:option.forceMode,forceSkill:canonicalSkill(skill),forceDice:option.forceRatingDice?Math.max(0,Number(actor.system.stats.forcePool.max)||0):0,characteristic:option.characteristic,conditionConfirmed:selection.conditionConfirmed===true,difficultyDowngrades:option.difficultyDowngrade?amount:0,boost:option.boostAmount?amount:option.boost??(option.boostPerRank??0)*option.rank,removeSetback:precise?Math.min(amount,targetDefence):option.removalAmount?amount:option.removeSetback??(option.removePerRank??0)*option.rank,perRound:option.perRound,
   difficultyReduction:option.difficultyReduction??0,minimumDifficulty:option.minimumDifficulty??0,difficultyAddition:option.difficultyAddition??0,difficultySteps:option.difficultySteps?option.rank:0,maneuvers:option.maneuver?1:0,difficultyUpgrades:option.id==='sniper-shot'?amount:0,
   damageBonus:option.id==='pressure-point'?Math.max(0,Number(actor.system.skills?.Medicine?.rank)||0):option.damagePerRank?option.damagePerRank*option.rank:option.id==='point-blank'?option.rank:option.id==='dead-to-rights'?Math.ceil(Number(actor.system.characteristics?.Agility?.value??0)/2):option.id==='dead-to-rights-improved'?Number(actor.system.characteristics?.Agility?.value??0):0,
   condition:option.id==='point-blank'?'short-or-engaged':option.condition};
 });
 if(chosen.filter(s=>s.characteristic).length>1)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollExtra008"));
 const inventor=chosen.filter(s=>s.id.startsWith('inventor-'));if(inventor.reduce((n,s)=>n+s.amount,0)>Math.max(0,...inventor.map(s=>s.rank)))throw Error(game.i18n.localize("SWFFG.UI.Talent.RollText016"));
 if(chosen.reduce((sum,option)=>sum+option.maneuvers,0)>2)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollText017"));
 return chosen;
}
export function rollTalentPool(pool,selections,actor=null,skill=null){
 const next=Object.assign(Object.create(Object.getPrototypeOf(pool)),pool);
 const replacement=selections.find(s=>s.characteristic);if(replacement)Object.assign(next,replacementCharacteristicPool(actor,skill,next,replacement.characteristic));
 const automatic=automaticSetbackRemovals(actor,skill,pool);
 let remaining=Math.max(0,(Number(pool.setback)||0)-Math.max(0,(Number(pool.remsetback)||0)-automatic.configured));
 next._reviewedRemovals=automatic.entries.map(e=>{const removed=Math.min(remaining,e.requested);remaining-=removed;return {...e,removed};});
 next.setback=Math.max(0,(Number(next.setback)||0)-automatic.requested);
 next.remsetback=Math.max(0,(Number(next.remsetback)||0)-automatic.configured);
 for(const selection of selections){
  next.difficulty=(Number(next.difficulty)||0)+(selection.difficultyAddition??0);
  for(let i=0;i<(selection.difficultyReduction??0);i++){
   const total=(Number(next.difficulty)||0)+(Number(next.challenge)||0);
   if(total<=(selection.minimumDifficulty??0))break;
   if(Number(next.difficulty)>0)next.difficulty--;
   else if(Number(next.challenge)>0){if(['master-shadows','master-slicer','master-starhopper','master-leader','dynamic-fire'].includes(selection.id))throw Error(game.i18n.localize("SWFFG.UI.Talent.RollText018"));next.challenge--;next.difficulty=(Number(next.difficulty)||0)+1;}
  }
  for(let i=0;i<(selection.difficultyDowngrades??0);i++)if(Number(next.challenge)>0){next.challenge--;next.difficulty=(Number(next.difficulty)||0)+1;}
  for(let i=0;i<(selection.difficultySteps??0);i++)if(Number(next.challenge)>0){next.challenge--;next.difficulty=(Number(next.difficulty)||0)+1;}else if(Number(next.difficulty)>0)next.difficulty--;
  if(selection.forceDice&&Number(next.force)>0)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollExtra009"));
  next.force=(Number(next.force)||0)+(selection.forceDice??0);if(selection.forceMode)next._forceTalent={id:selection.forceMode,skill:selection.forceSkill};
  next.boost=(Number(next.boost)||0)+selection.boost;
  next.setback=Math.max(0,(Number(next.setback)||0)-(selection.removeSetback??0));
  for(let i=0;i<selection.upgrades;i++)if(Number(next.ability)>0){next.ability--;next.proficiency=(Number(next.proficiency)||0)+1;}else next.ability=(Number(next.ability)||0)+1;
  for(let i=0;i<(selection.difficultyUpgrades??0);i++)if(Number(next.difficulty)>0){next.difficulty--;next.challenge=(Number(next.challenge)||0)+1;}else next.difficulty=(Number(next.difficulty)||0)+1;
 }
 if(!selections.some(s=>s.binaryOrder)){const orders=pendingBinaryOrders(actor,skill);next.boost=(Number(next.boost)||0)+Math.max(0,...orders.map(o=>o.rank));}
 const guarded=targetedTalentProtection(skill);
 for(let i=0;i<guarded.amount;i++)if(Number(next.difficulty)>0){next.difficulty--;next.challenge=(Number(next.challenge)||0)+1;}else next.difficulty=(Number(next.difficulty)||0)+1;
 next._talentProtection=guarded;
 return next;
}
export function talentWeaponPreview(item,selections,actor=null,skill=null){
 const baseRange=weaponRange(item),sniper=selections.find(s=>s.id==='sniper-shot'),bonus=selections.reduce((sum,s)=>sum+(s.damageBonus??0),0);
 let range=sniper?bands[Math.min(bands.length-1,bands.indexOf(baseRange)+sniper.amount)]:baseRange;
 const feral=['melee','brawl','corpsacorps','pugilat'].includes(normalize(skill))?talentRank(actor,['feralstrength','forcesurhumaine']):0;
 const sources=Array.from(actor?.items?.contents??actor?.items??[]).filter(i=>i.type==='talent'&&['feralstrength','forcesurhumaine'].includes(normalize(i.name)));
 const represented=sources.some(i=>Object.values(i.system?.attributes??{}).some(a=>/damage/i.test(a.mod??'')&&Number(a.value)>0));
 const extra=(represented?0:feral)+deadlyAccuracyBonus(actor,skill,item);
 if((item?.system?.isThrown===true||item?.flags?.starwarsffg?.isThrown===true)&&talentRank(actor,['strongarm','muscle'])>0&&['Short','Medium'].includes(range))range='Medium';
 return {baseRange,range,baseDamage:baseDamage(item),damage:baseDamage(item)+bonus+extra,damageBonus:bonus+extra,maneuvers:selections.reduce((sum,s)=>sum+(s.maneuvers??0),0)};
}
export function talentWeaponSnapshot(item,selections,actor=null,skill=null){
 const melee=['melee','brawl','corpsacorps','pugilat'].includes(normalize(skill));
 const feral=melee?talentRank(actor,['feralstrength','forcesurhumaine']):0;
 const grenadier=talentRank(actor,['mastergrenadier','expertenexplosifs'])>0,deadly=deadlyAccuracyBonus(actor,skill,item);
 const strong=(item?.system?.isThrown===true||item?.flags?.starwarsffg?.isThrown===true)&&talentRank(actor,['strongarm','muscle'])>0;
 if(!['weapon','shipweapon'].includes(item?.type)||(!selections.some(s=>s.destinyCost)&&!feral&&!strong&&!deadly&&!grenadier&&!selections.some(s=>s.criticalReduction||s.id==='hunter'||s.id==='pressure-point')&&!item.system?.reviewedJuryRigged&&!selections.some(s=>(s.damageBonus??0)>0||s.id==='point-blank'||s.id==='sniper-shot')))return item;
 const snapshot=JSON.parse(JSON.stringify(item.toObject?item.toObject():item));
 snapshot.system=JSON.parse(JSON.stringify(item.system));
 const info=talentWeaponPreview(item,selections,actor,skill);
 snapshot.system.damage={...snapshot.system.damage,adjusted:info.damage};
 const criticalReduction=selections.reduce((n,s)=>n+(s.criticalReduction??0),0);if(criticalReduction){const crit=Number(snapshot.system.crit?.adjusted??snapshot.system.crit?.value);if(!(crit>0))throw Error(game.i18n.localize("SWFFG.UI.Talent.RollExtra010"));snapshot.system.crit={...snapshot.system.crit,adjusted:Math.max(1,crit-criticalReduction)};}
 snapshot.system.range={...snapshot.system.range,value:info.range,adjusted:info.range,label:`SWFFG.WeaponRange${info.range}`};
 snapshot.flags??={};snapshot.flags[scope]??={};snapshot.flags[scope].rollWeaponSnapshot=true;snapshot.flags[scope].masterGrenadier=grenadier;const hunt=selections.find(s=>s.id==='hunter'&&s.conditionConfirmed);const targets=Array.from(game.user?.targets??[]);if(hunt&&targets.length===1)snapshot.flags[scope].hunterCritical={amount:10*hunt.rank,targetUuid:targets[0].actor?.uuid};const pressure=selections.find(s=>s.id==='pressure-point'&&s.conditionConfirmed);if(pressure){if(!item.flags?.starwarsffg?.brawlAttack?.unarmed||targets.length!==1||!targets[0].actor?.uuid)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollExtra011"));snapshot.flags[scope].pressurePointTarget=targets[0].actor.uuid;}snapshot.flags[scope].juryRiggedApplied=item.system?.reviewedJuryRigged??null;snapshot.flags[scope].rollTalentWeapon=info;
 return snapshot;
}
// Activating a checkbox is the choice to spend its maneuver; there is no second confirmation checkbox.
// Maneuver budgets are still counted by the player/MJ; strain is charged only when the roll is posted.
const talentCostQueues=new Map();
async function serializeTalentCost(actor,work){
 const key=actor?.uuid??actor,previous=talentCostQueues.get(key)??Promise.resolve();
 const job=previous.catch(()=>{}).then(work);talentCostQueues.set(key,job);
 try{return await job;}finally{if(talentCostQueues.get(key)===job)talentCostQueues.delete(key);}
}
export async function commitRollTalents(actor,skill,selections,context={}){
 return serializeTalentCost(actor,()=>commitLockedRollTalents(actor,skill,selections,context));
}
async function commitLockedRollTalents(actor,skill,selections,context={}){
 if(!selections.length&&!pendingBinaryOrders(actor,skill).length)return {selections:[],changes:[]};
 if(!actor?.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollText019"));
 const chosen=selectedRollTalents(actor,skill,selections,context),cost=chosen.reduce((sum,s)=>sum+s.cost,0),changes=[],update={};
 if(cost){const account=talentCostAccount(actor);if(!account)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollExtra012"));const before=Number(account.stat.value)||0;if(chosen.some(s=>['precise-aim','frenzied-attack'].includes(s.id))&&cost>strainRemaining(actor))throw Error(game.i18n.localize("SWFFG.UI.Talent.RollText020"));update[account.path]=before+cost;changes.push({path:account.path,before,after:before+cost});}
 const creditCost=chosen.reduce((n,s)=>n+(s.creditCost??0),0);if(creditCost){const before=Number(actor.system.stats?.credits?.value);if(!Number.isFinite(before)||before<creditCost)throw Error(game.i18n.localize("SWFFG.UI.Talent.TriggeredText077"));update['system.stats.credits.value']=before-creditCost;changes.push({path:'system.stats.credits.value',before,after:before-creditCost});}
 const orders=pendingBinaryOrders(actor,skill);if(orders.length){const before=actor.getFlag?.(scope,'binaryOrders')??[],after=before.filter(o=>!orders.some(p=>p.id===o.id));update['flags.starwarsffg.binaryOrders']=after;changes.push({path:'flags.starwarsffg.binaryOrders',before,after});chosen.push({id:'speaks-binary-order',name:game.i18n.localize("SWFFG.UI.Talent.TriggeredText012"),rank:Math.max(...orders.map(o=>o.rank)),boost:Math.max(...orders.map(o=>o.rank)),upgrades:0,cost:0,binaryOrder:true});}
 const round=combatRoundKey();if(round)for(const option of chosen.filter(s=>s.perRound&&!(s.id==='precise-aim'&&context.precisePaid))){const path=`flags.${scope}.rollTalentUsage.${option.id}`,before=actor.getFlag?.(scope,'rollTalentUsage')?.[option.id]??null;update[path]=round;changes.push({path,before,after:round});}
 for(const option of chosen.filter(s=>s.perSession)){const path=`flags.${scope}.talentSessionUsage.${option.id}`,before=actor.getFlag?.(scope,'talentSessionUsage')?.[option.id]??null;update[path]=true;changes.push({path,before,after:true});}
 let destiny;
 if(chosen.some(s=>s.destinyCost)){const options=chosen.filter(s=>s.destinyCost);if(options.length!==1)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollExtra013"));const {reserveTalentDestiny}=await import('./reviewed-destiny.js');destiny=await reserveTalentDestiny(options[0].destinyPool);}
 try{if(Object.keys(update).length)await actor.update(update);}catch(error){if(destiny){const {refundTalentDestiny}=await import('./reviewed-destiny.js');await refundTalentDestiny(destiny);}throw error;}
 return {selections:chosen,changes,destiny};
}
export async function rollbackRollTalents(actor,transaction){if(!transaction)return;const update={};for(const change of transaction.changes){const current=foundry.utils.getProperty(actor,change.path)??null;if(typeof current==='object'?JSON.stringify(current)!==JSON.stringify(change.after):current!==change.after)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollText021"));update[change.path]=change.before;}if(Object.keys(update).length)await actor.update(update);if(transaction.destiny){const {refundTalentDestiny}=await import('./reviewed-destiny.js');await refundTalentDestiny(transaction.destiny);}}

async function talentChoices(builder,html){
 const actor=builder.weaponContext?.actor??builder.roll.data?.document??game.actors.get(builder.roll.data?.actor?._id),skill=builder.weaponContext?.skillKey??builder.roll.skillName;
 const options=rollTalentOptions(actor,skill,{item:builder.roll.item,precisePaid:builder._preciseAimPaid,frenziedPaid:builder._frenziedPaid?.selection});if(!actor?.isOwner||!options.length)return;
 const section=document.createElement('fieldset');section.className='ffg-roll-talents';section.style.cssText='margin:0;padding:8px;font-size:12px;line-height:1.4;display:block';
 const append=(parent,tag,text)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
 append(section,'legend',game.i18n.localize("SWFFG.UI.Talent.RollText022"));
 const summary=append(section,'p','');summary.className='ffg-talent-weapon-preview';summary.style.cssText='margin:0 0 8px;padding:6px;background:#ffffff30;border-radius:3px;white-space:pre-line';
 const selected=builder._talentSelections??[];
 const updateSummary=()=>{
  let selections=[];try{selections=selectedRollTalents(actor,skill,builder._talentSelections??[],{item:builder.roll.item,precisePaid:builder._preciseAimPaid,frenziedPaid:builder._frenziedPaid?.selection});}catch(error){summary.textContent=error.message;return;}
  const info=talentWeaponPreview(builder.roll.item,selections),lines=[];
  if(info.maneuvers)lines.push(`${info.maneuvers} ${game.i18n.localize("SWFFG.UI.Talent.RollText023")}`);
  summary.textContent=lines.join('\n');summary.hidden=!lines.length;
 };
 const read=()=>{
  if(builder._postingRoll||builder._selectingWeapon)return;
  builder._talentSelections=[...section.querySelectorAll('[data-talent]')].filter(row=>row.querySelector('[name=use]')?.checked).map(row=>({id:row.dataset.talent,amount:Number(row.querySelector('[name=amount]')?.value??1),destinyPool:row.querySelector('[name=destinyPool]')?.value,conditionConfirmed:row.querySelector('[name=conditionConfirmed]')?.checked===true,targetDefence:Number(row.querySelector('[name=targetDefence]')?.value??0)}));
  if(builder._preciseAimPaid)builder._talentSelections.push(builder._preciseAimPaid);
  if(builder._frenziedPaid)builder._talentSelections.push(builder._frenziedPaid.selection);
  updateSummary();builder._initializeInputs(html);
 };
 for(const option of options){
  if(['precise-aim','frenzied-attack'].includes(option.id))continue;
  const row=document.createElement('div');row.dataset.talent=option.id;row.style.cssText='margin:10px 0;padding-top:10px;border-top:1px solid #748a9144;display:block;flex:0 0 auto';
  const label=document.createElement('label'),input=document.createElement('input');label.style.cssText='display:flex;align-items:center;gap:7px;font-weight:600;color:#496573;line-height:1.3';input.style.cssText='margin:0;flex:0 0 auto';input.type='checkbox';input.name='use';input.disabled=option.blocked;input.checked=selected.some(s=>s.id===option.id)&&!option.blocked;
  const labels={'true-aim':'Visée Juste','sniper-shot':'Tireur d’Élite','point-blank':'Bout Portant'};
  if(option.id.startsWith('inventor-'))label.title=option.id==='inventor-boost'?game.i18n.localize("SWFFG.UI.Talent.RollText024"):game.i18n.localize("SWFFG.UI.Talent.RollText025");
  label.append(input,document.createTextNode(`${game.i18n.lang==='fr'?(labels[option.id]??option.name):option.name}${option.isRanked===false?'':` (${game.i18n.localize("SWFFG.UI.Talent.RollText026")} ${option.rank})`}`));row.append(label);
  const description=append(row,'div','');description.className='ffg-associated-talent-description';description.style.cssText='margin-top:5px;line-height:1.4';
  description.innerHTML=await foundry.applications.ux.TextEditor.enrichHTML(option.description||game.i18n.localize("SWFFG.UI.Talent.RollText027"),{secrets:actor.isOwner,relativeTo:actor});
  // The selection dialog shows the rule text only. Source/review annotations
  // remain intact on the talent document and its compendium sheet.
  description.querySelectorAll('.ffg-talent-source, .ffg-talent-review-status, .ffg-talent-choice-description').forEach(node=>node.remove());
  description.querySelectorAll('p').forEach(node=>node.style.textAlign='justify');
  if(option.blockedReason)input.title=option.blockedReason;
  if(option.destinyCost){const select=document.createElement('select');select.name='destinyPool';select.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Talent.RollExtra014"));for(const [value,text]of [['light',game.i18n.localize("SWFFG.UI.Talent.RollExtra015")],['dark',game.i18n.localize("SWFFG.UI.Talent.RollExtra016")]]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}select.value=selected.find(s=>s.id===option.id)?.destinyPool??(actor.hasPlayerOwner||actor.type==='character'?'light':'dark');row.append(select);}
  if(option.id.startsWith('inventor-')){const effect=append(row,'small',option.id==='inventor-boost'?game.i18n.localize("SWFFG.UI.Talent.RollText028"):game.i18n.localize("SWFFG.UI.Talent.RollText029"));effect.style.display='block';}
  if(option.variable&&option.maxAmount>1){const amount=document.createElement('input');amount.type='number';amount.name='amount';amount.min='1';amount.max=String(option.maxAmount||1);amount.value=String(selected.find(s=>s.id===option.id)?.amount??1);amount.disabled=option.blocked;amount.style.width='56px';amount.setAttribute('aria-label',option.removalAmount?game.i18n.localize("SWFFG.UI.Talent.RollText030"):option.id==='sniper-shot'?game.i18n.localize("SWFFG.UI.Talent.RollText031"):game.i18n.localize("SWFFG.UI.Talent.RollText032"));label.append(amount);}
  if(option.id==='precise-aim'){const field=append(row,'label',game.i18n.localize("SWFFG.UI.Talent.RollText033"));const value=document.createElement('input');value.type='number';value.name='targetDefence';value.min='0';value.step='1';value.value=String(selected.find(s=>s.id===option.id)?.targetDefence??0);value.style.width='56px';field.append(value);}
  if(option.condition){const conditionLabel=append(row,'label',({livingUnarmed:game.i18n.localize("SWFFG.UI.Talent.RollExtra017"),socialBribe:game.i18n.localize("SWFFG.UI.Talent.RollExtra018"),improvised:game.i18n.localize("SWFFG.UI.Talent.RollExtra019"),longRange:game.i18n.localize("SWFFG.UI.Talent.RollExtra020"),engagedRange:game.i18n.localize("SWFFG.UI.Talent.RollExtra021"),encounterRecovery:game.i18n.localize("SWFFG.UI.Talent.RollExtra022"),tracking:game.i18n.localize("SWFFG.UI.Talent.RollExtra023"),salvaging:game.i18n.localize("SWFFG.UI.Talent.RollExtra024"),animal:game.i18n.localize("SWFFG.UI.Talent.RollExtra025"),chase:game.i18n.localize("SWFFG.UI.Talent.RollExtra026"),forceSusceptible:game.i18n.localize("SWFFG.UI.Talent.RollExtra027")})[option.condition]);const check=document.createElement('input');check.type='checkbox';check.name='conditionConfirmed';check.checked=selected.find(s=>s.id===option.id)?.conditionConfirmed===true;conditionLabel.prepend(check);}
  section.append(row);
 }
 section.addEventListener('change',read);section.addEventListener('input',read);
 updateSummary();return section;
}

export async function openAssociatedTalents(builder,html){
 if(builder._talentWindow?.rendered){builder._talentWindow.bringToFront();return;}
 const section=await talentChoices(builder,html);if(!section)return;
 const content=document.createElement('div');
 const style=document.createElement('style');style.textContent='.ffg-associated-talents{max-height:calc(100dvh - 24px)}.ffg-associated-talents .window-content,.ffg-associated-talents .dialog-form{display:flex;flex-direction:column;min-height:0;overflow:hidden}.ffg-associated-talents .dialog-content{flex:1;min-height:0;overflow-y:auto}.ffg-associated-talents .form-footer{flex-shrink:0}';
 content.append(style);
 const bounds=builder.element.getBoundingClientRect(),width=Math.min(440,window.innerWidth-24);
 const left=bounds.right+width+12<=window.innerWidth?bounds.right+8:Math.max(12,bounds.left-width-8);
 const app=new foundry.applications.api.DialogV2({classes:['starwarsffg','themed','ffg-associated-talents'],window:{title:game.i18n.localize("SWFFG.UI.Talent.RollText034"),resizable:true},position:{left,top:Math.max(12,bounds.top),width},content,buttons:[{action:'close',label:game.i18n.localize("SWFFG.UI.Talent.RollText035")}]});
 builder._talentWindow=app;await app.render({force:true});
 app.element.querySelector('.dialog-content').append(section);
 const height=Math.min(app.element.getBoundingClientRect().height,window.innerHeight-24);
 app.setPosition({height,top:Math.max(12,Math.min(bounds.top,window.innerHeight-height-12))});
}

export async function renderRollTalents(builder,html){
 const root=html[0];root.querySelector('.ffg-roll-talents')?.remove();root.querySelector('.ffg-associated-talents-button')?.remove();
 const wasOpen=builder._talentWindow?.rendered;
 if(wasOpen)await builder._talentWindow.close();
 const actor=builder.weaponContext?.actor??builder.roll.data?.document??game.actors.get(builder.roll.data?.actor?._id),skill=builder.weaponContext?.skillKey??builder.roll.skillName;
 if(!actor?.isOwner||!rollTalentOptions(actor,skill,{item:builder.roll.item,precisePaid:builder._preciseAimPaid,frenziedPaid:builder._frenziedPaid?.selection}).length)return;
 const button=document.createElement('button');button.type='button';button.className='ffg-associated-talents-button';button.textContent=game.i18n.localize("SWFFG.UI.Talent.RollText036");button.style.cssText='width:100%;margin:6px 0';
 button.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();button.disabled=true;try{await openAssociatedTalents(builder,html);}catch(error){ui.notifications.error(error.message);}finally{button.disabled=false;}});
 root.querySelector('.roll-button')?.before(button);
 renderPreciseAimButton(builder,html,actor,skill);
 if(wasOpen)await openAssociatedTalents(builder,html);
}

export function renderPreciseAimButton(builder,html,actor,skill){
 renderActiveRollTalents(builder,html,actor,skill);
 renderFrenziedAttackButton(builder,html,actor,skill);
 const root=html[0];root.querySelector('.ffg-precise-aim')?.remove();
 const paid=builder._preciseAimPaid;
 const option=rollTalentOptions(actor,skill,{item:builder.roll.item,precisePaid:paid}).find(o=>o.id==='precise-aim');
 const setback=Number(builder._previewPool().setback)||0;
 if(!option||(!paid&&(option.blocked||setback<1)))return;
 const button=document.createElement('button');button.type='button';button.className='ffg-precise-aim';button.disabled=Boolean(paid);
 button.textContent=paid?game.i18n.format("SWFFG.UI.Talent.RollText037", {value0: paid.amount}):game.i18n.localize("SWFFG.UI.Talent.RollText038");
 button.addEventListener('click',async()=>{if(builder._postingRoll||builder._preciseAimBusy)return;builder._preciseAimBusy=true;button.disabled=true;
 try{const max=Math.min(option.rank,strainRemaining(actor),setback);if(max<1)return;
 const selection=await foundry.applications.api.DialogV2.prompt({classes:['starwarsffg','themed'],window:{title:game.i18n.localize("SWFFG.UI.Talent.RollText039")},rejectClose:false,
 content:`<p>${game.i18n.localize("SWFFG.UI.Talent.RollText040")}</p><label>${game.i18n.localize("SWFFG.UI.Talent.RollText041")}<input name="defence" type="number" min="1" max="${setback}" value="1" step="1"></label><label>${game.i18n.localize("SWFFG.UI.Talent.RollText042")} (1-${max})<input name="amount" type="number" min="1" max="${max}" value="1" step="1"></label>`,
 ok:{label:game.i18n.localize("SWFFG.UI.Talent.RollText043"),callback:(_e,_b,app)=>({id:'precise-aim',amount:Number(app.element.querySelector('[name=amount]').value),targetDefence:Number(app.element.querySelector('[name=defence]').value)})}});
 if(!selection)return;
 if(!Number.isInteger(selection.targetDefence)||selection.targetDefence<1||selection.targetDefence>setback||selection.amount>selection.targetDefence||selection.amount>max)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollText044"));
 if(game.combat?.started&&game.combat.combatant?.actor?.uuid!==actor.uuid)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollText045"));
 await commitRollTalents(actor,skill,[selection],{item:builder.roll.item});
 builder._preciseAimPaid=selection;builder._talentSelections=[...(builder._talentSelections??[]).filter(s=>s.id!=='precise-aim'),selection];
 builder._initializeInputs(html);await renderRollTalents(builder,html);
 }catch(error){ui.notifications.error(error.message);}finally{builder._preciseAimBusy=false;if(!builder._preciseAimPaid)button.disabled=false;}});
 root.querySelector('.roll-button')?.after(button);
}

// Applied once after the GM/Pilotage pool is assembled. Existing talent-owned
// removal attributes are replaced, other sources retain their normal behavior.
export function automaticSetbackRemovals(actor,skill,pool={}){
 if(!actor||!skill)return {requested:0,configured:0,entries:[]};
 const options=rollTalentOptions(actor,skill).filter(o=>o.automatic),entries=[];let configured=0;
 for(const option of options){
  let value=0;
  for(const item of Array.from(actor.items?.contents??actor.items??[])){
   const nodes=item.type==='talent'?[{...item.system,name:item.name}]:item.type==='specialization'?Object.values(item.system?.talents??{}).filter(n=>n.islearned===true):[];
   for(const node of nodes)if(option.names.includes(normalize(node.name)))value+=Object.values(node.attributes??{}).filter(a=>normalize(a.modtype)==='skillremovesetback'&&canonicalSkill(a.mod)===canonicalSkill(skill)).reduce((n,a)=>n+(Number(a.value)||0)*(node.isRanked?Math.max(1,Number(node.rank??1)):1),0);
  }
  configured+=value;entries.push({name:option.name,requested:option.rank});
 }
 configured=Math.min(Number(pool.remsetback)||0,configured);
 const requested=entries.reduce((n,e)=>n+e.requested,0);
 return {requested,configured,entries};
}
const frenziedLocks=new Set();
export async function activateFrenziedAttack(builder,actor,skill,amount){
 if(builder._reviewedClosed||builder._postingRoll)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollExtra028"));
 if(builder._frenziedPaid||frenziedLocks.has(actor.uuid))throw Error(game.i18n.localize("SWFFG.UI.Talent.RollExtra029"));
 frenziedLocks.add(actor.uuid);
 try{const selection={id:'frenzied-attack',amount};const transaction=await commitRollTalents(actor,skill,[selection],{item:builder.roll.item});builder._frenziedPaid={selection,transaction,actor};builder._talentSelections=[...(builder._talentSelections??[]).filter(s=>s.id!==selection.id),selection];}
 finally{frenziedLocks.delete(actor.uuid);}
}
export async function cancelFrenziedAttack(builder){
 const paid=builder._frenziedPaid;if(!paid)return;
 if(frenziedLocks.has(paid.actor.uuid))throw Error(game.i18n.localize("SWFFG.UI.Talent.RollExtra030"));
 frenziedLocks.add(paid.actor.uuid);
 try{await serializeTalentCost(paid.actor,async()=>{
  if(!paid.actor.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollExtra031"));
  const charge=paid.transaction.changes.find(c=>c.path.startsWith('system.stats.'));
  const value=Number(foundry.utils.getProperty(paid.actor,charge?.path??''));
  if(!charge||!Number.isFinite(value))throw Error(game.i18n.localize("SWFFG.UI.Talent.RollExtra032"));
  await paid.actor.update({[charge.path]:Math.max(0,value-paid.selection.amount)});
  builder._frenziedPaid=null;builder._talentSelections=(builder._talentSelections??[]).filter(s=>s.id!=='frenzied-attack');
 });}finally{frenziedLocks.delete(paid.actor.uuid);}
}
function renderFrenziedAttackButton(builder,html,actor,skill){
 const root=html[0];root.querySelector('.ffg-frenzied-attack')?.remove();
 if(!actor?.isOwner)return;
 const paid=builder._frenziedPaid,option=rollTalentOptions(actor,skill,{frenziedPaid:paid?.selection}).find(o=>o.id==='frenzied-attack');if(!option&&!paid)return;
 const button=document.createElement('button');button.type='button';button.className='ffg-frenzied-attack';button.textContent=paid?game.i18n.localize("SWFFG.UI.Talent.RollExtra033"):game.i18n.localize("SWFFG.UI.Talent.RollExtra034");button.disabled=!paid&&option.blocked;
 button.addEventListener('click',async()=>{if(builder._postingRoll||builder._frenziedBusy)return;builder._frenziedBusy=true;button.disabled=true;
 try{if(paid)await cancelFrenziedAttack(builder);else{const amount=await foundry.applications.api.DialogV2.prompt({window:{title:game.i18n.localize("SWFFG.UI.Talent.RollExtra035")},classes:['starwarsffg','themed'],rejectClose:false,content:`<p style="text-align:justify">${game.i18n.format("SWFFG.UI.Talent.RollExtra044", {account:talentCostAccountLabel(actor)})}</p><p style="text-align:justify">${game.i18n.localize("SWFFG.UI.Talent.RollExtra045")}</p><label>${game.i18n.localize("SWFFG.UI.Talent.RollExtra046")}<input name="amount" type="number" min="1" max="${option.maxAmount}" step="1" value="1"></label>`,ok:{label:game.i18n.localize("SWFFG.UI.Talent.RollExtra036"),callback:(_e,_b,app)=>Number(app.element.querySelector('[name=amount]').value)}});if(amount!=null&&amount!==false)await activateFrenziedAttack(builder,actor,skill,amount);}
 builder._initializeInputs(html);await renderRollTalents(builder,html);
 }catch(error){ui.notifications.error(error.message);}finally{builder._frenziedBusy=false;button.disabled=false;}});
 root.querySelector('.roll-button')?.after(button);
}

/** Keep the main roll window synchronized with explicit talent selections. */
export function renderActiveRollTalents(builder,html,actor,skill){
 const root=html?.[0];if(!root)return;
 const options=actor?rollTalentOptions(actor,skill,{item:builder.roll.item,precisePaid:builder._preciseAimPaid,frenziedPaid:builder._frenziedPaid?.selection}):[];
 let section=root.querySelector('.ffg-active-roll-talents');
 const binary=pendingBinaryOrders(actor,skill);const triggeredName=builder.roll.data?.triggeredTalentName;
 if(!options.length&&!binary.length&&!triggeredName){section?.remove();return;}
 const anchor=root.querySelector('.ffg-associated-talents-button')??root.querySelector('.roll-button');if(!anchor)return;
 if(!section){section=document.createElement('div');section.className='ffg-active-roll-talents';section.setAttribute('role','status');section.setAttribute('aria-live','polite');}
 anchor.before(section);section.replaceChildren();
 const heading=document.createElement('strong');heading.textContent=game.i18n.localize("SWFFG.UI.Talent.RollText046");section.append(heading);
 const selected=[...new Map((builder._talentSelections??[]).map(s=>[s.id,s])).values()].map(s=>({selection:s,option:options.find(o=>o.id===s.id)})).filter(s=>s.option&&(!s.option.blocked||s.selection.id==='precise-aim'&&builder._preciseAimPaid||s.selection.id==='frenzied-attack'&&builder._frenziedPaid));
 if(!selected.length&&!binary.length&&!triggeredName){section.append(document.createTextNode(' '+game.i18n.localize("SWFFG.UI.Talent.RollText047")));return;}
 const list=document.createElement('ul');
 for(const {option}of selected){const item=document.createElement('li');const owned=(actor.talentList??[]).find(t=>option.names.includes(normalize(t.name)));item.textContent=(owned?.name??option.name)+(option.isRanked!==false?' ('+game.i18n.localize("SWFFG.UI.Talent.RollText026")+' '+option.rank+')':'');list.append(item);}
 if(triggeredName){const item=document.createElement('li');item.textContent=triggeredName;list.append(item);}
 if(binary.length){const item=document.createElement('li');item.textContent=game.i18n.localize("SWFFG.UI.Talent.RollExtra037")+Math.max(...binary.map(o=>o.rank))+game.i18n.localize("SWFFG.UI.Talent.RollExtra038");list.append(item);}
 section.append(list);
}

export function guardProtection(effects,targetUuid,skill,combat){
 if(!combat?.started||!targetUuid)return {amount:0,sources:[]};
 const tick=Number(combat.round)*(combat.turns?.length??0)+Number(combat.turn);
 const norm=normalize(skill).replace(/^swffgskillsname/,'');
 const melee=['melee','brawl','corpsacorps','pugilat','lightsaber','sabrelaser'].includes(norm),ranged=['rangedlight','rangedheavy','gunnery','armeslegeres','armeslourdes','artillerie'].includes(norm);
 if(!melee&&!ranged)return {amount:0,sources:[]};
 const active=effects.filter(e=>e&&e.targetUuid===targetUuid&&e.combatId===combat.id&&tick<e.expiresTick&&(e.kind==='all'||e.kind==='melee'&&melee||e.kind==='ranged'&&ranged));
 const guards=active.filter(e=>e.id==='body-guard'),self=active.filter(e=>e.id!=='body-guard');
 const amount=self.reduce((n,e)=>n+e.amount,0)+Math.max(0,...guards.map(e=>e.amount));
 return {amount,sources:active.map(e=>({id:e.id,source:e.source,amount:e.amount}))};
}
export function targetedTalentProtection(skill){
 const targets=Array.from(game.user?.targets??[]);if(targets.length!==1)return {amount:0,sources:[]};
 const effects=Array.from(game.actors?.contents??[]).flatMap(a=>Object.values(a.getFlag?.(scope,'reviewedGuards')??{}));
 const protection=guardProtection(effects,targets[0]?.actor?.uuid,skill,game.combat),target=targets[0]?.actor;
 if(['charm','coercion','deception'].includes(canonicalSkill(skill))){const rank=defenderTalentRank(target,['nobodysfool','perspicace']);if(rank){protection.amount+=rank;protection.sources.push({id:'nobodys-fool',source:target.uuid,amount:rank});}}
 return protection;
}

export function pendingBinaryOrders(actor,skill){
 if(!['minion','rival','nemesis'].includes(actor?.type))return [];
 return (actor.getFlag?.(scope,'binaryOrders')??[]).filter(o=>canonicalSkill(o.skill)===canonicalSkill(skill)&&Number.isInteger(o.rank)&&o.rank>0);
}

/** Rebuild only an untouched native aptitude pool; never erase user-edited dice. */
export function replacementCharacteristicPool(actor,skill,pool,characteristic){
 const entry=actor?.system?.skills?.[skill];const old=Number(actor?.system?.characteristics?.[entry?.characteristic]?.value),value=Number(actor?.system?.characteristics?.[characteristic]?.value),rank=Number(entry?.rank);
 if(!Number.isInteger(old)||!Number.isInteger(value)||!Number.isInteger(rank)||old<0||value<0||rank<0)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollExtra039"));
 const previous={proficiency:Math.min(old,rank),ability:Math.abs(old-rank)};
 if(Number(pool.proficiency??0)!==previous.proficiency||Number(pool.ability??0)!==previous.ability)throw Error(game.i18n.localize("SWFFG.UI.Talent.RollExtra040"));
 return {proficiency:Math.min(value,rank),ability:Math.abs(value-rank)};
}
export function defenderTalentRank(actor,names){
 const prepared=talentRank(actor,names);if(prepared)return prepared;
 return Array.from(actor?.items?.contents??actor?.items??[]).filter(i=>i.type==='talent'&&i.system?.active!==false&&names.includes(normalize(i.name))).reduce((n,i)=>n+(i.system.ranks?.ranked?Math.max(0,Number(i.system.ranks.current)||0):1),0);
}

export function deadlyAccuracyBonus(actor,skill,item){
 if(item?.type!=='weapon'||!skill)return 0;let matched=false;
 for(const it of Array.from(actor?.items?.contents??actor?.items??[])){if(it.system?.active===false)continue;const nodes=it.type==='talent'?[['_self',{...it.system,name:it.name,islearned:true}]]:it.type==='specialization'?Object.entries(it.system?.talents??{}):[];for(const[slot,node]of nodes)if(node.islearned&&['deadlyaccuracy','precisionmortelle'].includes(normalize(node.name))&&(it.flags?.starwarsffg?.reviewedTalentChoices?.[slot]?.skills??[]).some(k=>canonicalSkill(k)===canonicalSkill(skill)))matched=true;}
 if(!matched)return 0;const key=Object.keys(actor.system.skills??{}).find(k=>canonicalSkill(k)===canonicalSkill(skill));return Math.max(0,Number(actor._source?.system?.skills?.[key]?.rank??actor.system.skills[key]?.rank)||0);
}

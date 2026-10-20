const scope = 'starwarsffg';
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const t = (fr,en) => game.i18n.lang === 'fr' ? fr : en;
const bands=['Short','Medium','Long','Extreme'];
const rules=[
 {id:'precise-aim',names:['preciseaim','coupprecis'],combat:true,maneuver:true,perRound:true,variable:true,upgrades:0,note:'Coût : 1 manœuvre et le stress choisi, une fois par round. Renseignez uniquement la défense de la cible déjà incluse dans les Infortunes de ce jet. Les autres Infortunes ne sont pas réduites.'},
 {id:'intense-focus',names:['intensefocus','concentrationintense'],maneuver:true,cost:1,upgrades:1},
 {id:'frenzied-attack',names:['frenziedattack','attaquefrenetique','attaquefurieuse'],variable:true,melee:true},
 {id:'true-aim',names:['trueaim','viseejuste','viseeprecise'],maneuver:true,perRound:true,ranged:true,boost:1},
 {id:'sniper-shot',names:['snipershot','tireurdelite'],maneuver:true,perRound:true,ranged:true,requiresWeapon:true,variable:true,upgrades:0},
 {id:'point-blank',names:['pointblank','boutportant'],rangedPersonal:true,requiresWeapon:true,upgrades:0},
];
// These rules are source-checked summaries, not an approval for production delivery.
export const sourceCheckedTalentRules=[
 {id:'physical-training',names:['physicaltraining','entrainementphysique'],skills:['athletics','resilience','athletisme','resistance'],boostPerRank:1,upgrades:0,note:'Passif : +1 Fortune par rang en Athlétisme et Résistance.',source:'AoR p.154 / PDF155'},
 {id:'kill-with-kindness',names:['killwithkindness','irresistible'],skills:['charm','leadership','charme','commandement'],removePerRank:1,upgrades:0,note:'Passif : retirez 1 Infortune par rang en Charme et Commandement.',source:'AoR p.150 / PDF151 ; SWR02 p.139 / PDF150'},
 {id:'plausible-deniability',names:['plausibledeniability','beneficedudoute'],skills:['coercion','deception','tromperie'],removePerRank:1,upgrades:0,note:'Passif : retirez 1 Infortune par rang en Coercition et Tromperie.',source:'AoR p.154 / PDF155 ; SWR02 p.133 / PDF144'},
 {id:'convincing-demeanor',names:['convincingdemeanor','persuasion'],skills:['deception','skulduggery','tromperie','magouilles'],removePerRank:1,upgrades:0,note:'Passif : retirez 1 Infortune par rang en Tromperie et Magouilles.',source:'AoR p.145 / PDF146 ; SWR02 p.141 / PDF152'},
 {id:'skilled-jockey',names:['skilledjockey','pilotechevronne'],skills:['pilotingplanetary','pilotingspace','pilotageplanetaire','pilotagespatial','pilotageespace'],removePerRank:1,upgrades:0,note:'Passif : retirez 1 Infortune par rang aux tests de Pilotage planétaire et spatial.',source:'AoR p.156 / PDF157 ; SWR02 p.141 / PDF152'},
 {id:'stalker',names:['stalker','filature'],skills:['coordination','stealth','discretion'],boostPerRank:1,upgrades:0,note:'Passif : +1 Fortune par rang en Coordination et Discrétion.',source:'AoR p.157 / PDF158 ; SWR02 p.138 / PDF149'},
 {id:'galaxy-mapper',names:['galaxymapper','cartographiedelagalaxie'],skills:['astrogation'],removePerRank:1,upgrades:0,note:'Retirez 1 Infortune par rang en Astrogation ; durée divisée par deux, sans réduction supplémentaire par rang (à gérer manuellement).',source:'AoR p.148 / PDF149 ; SWR02 p.133 / PDF144'},
 {id:'bypass-security',names:['bypasssecurity','systemesdesecurite'],skills:['computers','skulduggery','informatique','magouilles'],removePerRank:1,upgrades:0,note:'À cocher seulement pour désactiver une sécurité ou ouvrir une porte verrouillée : retirez 1 Infortune par rang.',source:'AoR p.144 / PDF145 ; SWR02 p.144 / PDF155'},
 {id:'researcher',names:['researcher','chercheur'],knowledge:true,removePerRank:1,upgrades:0,note:'Retirez 1 Infortune par rang aux tests de Connaissance ; recherches deux fois plus rapides (durée manuelle).',source:'AoR p.154 / PDF155 ; SWR02 p.134 / PDF145'},
 {id:'forager',names:['forager','subsistance'],skills:['survival','survie'],removeSetback:2,upgrades:0,note:'À cocher seulement pour chercher nourriture, eau ou abri : retirez jusqu’à 2 Infortunes. Test de Survie deux fois plus rapide, durée manuelle.',source:'AoR p.147 / PDF148 ; SWR02 p.144 / PDF155'},
 {id:'brace',names:['brace','stabilite'],maneuver:true,variable:true,removalAmount:true,removePerRank:1,upgrades:0,note:'Coût : 1 manœuvre. Retirez 1 Infortune par rang, uniquement celles dues aux conditions physiques ou environnementales ; vérifiez leur nombre avant de cocher.',source:'AoR p.143 / PDF144 ; SWR02 p.144 / PDF155'},
 {id:'quick-strike',names:['quickstrike','coupeclair'],combat:true,boostPerRank:1,upgrades:0,note:'À cocher seulement si la cible n’a pas encore agi dans cette rencontre : +1 Fortune par rang.',source:'AoR p.154 / PDF155 ; SWR02 p.135 / PDF146'},
];
rules.push(...sourceCheckedTalentRules);
const canonicalSkill=value=>{const key=normalize(value).replace(/^swffgskillsname/,'');return ({charme:'charm',commandement:'leadership',tromperie:'deception',magouilles:'skulduggery',athletisme:'athletics',resistance:'resilience',discretion:'stealth',informatique:'computers',survie:'survival',pilotageplanetaire:'pilotingplanetary',pilotagespatial:'pilotingspace',pilotageespace:'pilotingspace'})[key]??key;};
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
export function talentRank(actor,names){const keys=names.map(normalize);return (actor?.talentList??[]).filter(talent=>keys.includes(normalize(talent.name))).reduce((sum,talent)=>sum+(talent.isRanked?Math.max(0,Number(talent.rank)||0):1),0);}
export function strainRemaining(actor){const strain=actor?.system?.stats?.strain;return Math.max(0,(Number(strain?.max)||0)-(Number(strain?.value)||0));}
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
  if(rule.knowledge&&!/^(knowledge|connaissance)/.test(key)&&!['coreworlds','education','lore','outerrim','underworld','warfare','xenology','mondesdunoyau','culture','bordureexterieure','pegre','strategie','xenologie'].includes(key))return [];
  if(rule.combat&&!melee&&!ranged&&!['lightsaber','sabrelaser'].includes(key))return [];
  const round=combatRoundKey(),item=context.item;
  let blockedReason='';
  if((rule.removePerRank||rule.boostPerRank||rule.removeSetback)&&configuredTalentImpact(actor,rule,skill))blockedReason=t('Effet déjà paramétré sur le talent acquis : ne pas le compter deux fois. Vérifiez son application dans la fiche.','Effect already configured on this acquired talent: do not count it twice. Check its application on the sheet.');
  if(rule.perRound&&round&&actor.getFlag?.(scope,'rollTalentUsage')?.[rule.id]===round)blockedReason=t('Déjà utilisé ce round.','Already used this round.');
  if(rule.requiresWeapon&&item?.type!=='weapon')blockedReason=t('Choisissez une arme personnelle pour ce jet.','Choose a personal weapon for this roll.');
  let maxAmount=rule.variable?rank:1;
  if(rule.id==='precise-aim'){maxAmount=Math.min(rank,strainRemaining(actor));if(!maxAmount)blockedReason=t('Stress disponible insuffisant.','Insufficient remaining strain.');}
  if(rule.id==='sniper-shot'){
   const index=bands.indexOf(weaponRange(item));maxAmount=index<0?0:Math.min(rank,bands.length-1-index);
   if(item?.type==='weapon'&&!maxAmount)blockedReason=t('Portée personnelle inconnue ou déjà extrême.','Unknown personal range or already Extreme.');
   if(item?.system?.isThrown===true||item?.flags?.starwarsffg?.isThrown===true)blockedReason=t('Tireur d’Élite exclut les armes de jet.','Sniper Shot excludes thrown weapons.');
  }
  return [{...rule,name:owned.name,rank,description:owned.description,isRanked:owned.isRanked,maxAmount,blocked:Boolean(blockedReason),blockedReason}];
 });
}
export function selectedRollTalents(actor,skill,selections,context={}){
 const options=rollTalentOptions(actor,skill,context),seen=new Set();
 const chosen=selections.map(selection=>{
  const option=options.find(option=>option.id===selection.id),amount=Number(selection.amount??1);
  if(!option||option.blocked||seen.has(option.id)||!Number.isInteger(amount)||amount<1||amount>(option.variable?option.maxAmount:1))throw Error(t('Ce talent est indisponible ou sa quantité est invalide.','This talent is unavailable or its quantity is invalid.'));
  seen.add(option.id);
  const frenzied=option.id==='frenzied-attack',precise=option.id==='precise-aim';
  const targetDefence=Number(selection.targetDefence??0);
  if(precise&&(!Number.isInteger(targetDefence)||targetDefence<0))throw Error(t('Défense de la cible invalide.','Invalid target defence.'));
  return {...selection,name:option.name,rank:option.rank,amount,cost:(frenzied||precise)?amount:option.cost??0,
   upgrades:frenzied?amount:option.upgrades??option.rank,boost:option.boost??(option.boostPerRank??0)*option.rank,removeSetback:precise?Math.min(amount,targetDefence):option.removalAmount?amount:option.removeSetback??(option.removePerRank??0)*option.rank,perRound:option.perRound,
   maneuvers:option.maneuver?1:0,difficultyUpgrades:option.id==='sniper-shot'?amount:0,
   damageBonus:option.id==='point-blank'?option.rank:0,
   condition:option.id==='point-blank'?'short-or-engaged':null};
 });
 if(chosen.reduce((sum,option)=>sum+option.maneuvers,0)>2)throw Error(t('Ces talents nécessitent plus de deux manœuvres pour ce jet.','These talents require more than two maneuvers for this roll.'));
 return chosen;
}
export function rollTalentPool(pool,selections){
 const next=Object.assign(Object.create(Object.getPrototypeOf(pool)),pool);
 for(const selection of selections){
  next.boost=(Number(next.boost)||0)+selection.boost;
  next.setback=Math.max(0,(Number(next.setback)||0)-(selection.removeSetback??0));
  for(let i=0;i<selection.upgrades;i++)if(Number(next.ability)>0){next.ability--;next.proficiency=(Number(next.proficiency)||0)+1;}else next.ability=(Number(next.ability)||0)+1;
  for(let i=0;i<(selection.difficultyUpgrades??0);i++)if(Number(next.difficulty)>0){next.difficulty--;next.challenge=(Number(next.challenge)||0)+1;}else next.difficulty=(Number(next.difficulty)||0)+1;
 }
 return next;
}
export function talentWeaponPreview(item,selections){
 const baseRange=weaponRange(item),sniper=selections.find(s=>s.id==='sniper-shot'),bonus=selections.reduce((sum,s)=>sum+(s.damageBonus??0),0);
 const range=sniper?bands[Math.min(bands.length-1,bands.indexOf(baseRange)+sniper.amount)]:baseRange;
 return {baseRange,range,baseDamage:baseDamage(item),damage:baseDamage(item)+bonus,damageBonus:bonus,maneuvers:selections.reduce((sum,s)=>sum+(s.maneuvers??0),0)};
}
export function talentWeaponSnapshot(item,selections){
 if(item?.type!=='weapon'||!selections.some(s=>s.id==='point-blank'||s.id==='sniper-shot'))return item;
 const snapshot=JSON.parse(JSON.stringify(item.toObject?item.toObject():item));
 snapshot.system=JSON.parse(JSON.stringify(item.system));
 const info=talentWeaponPreview(item,selections);
 snapshot.system.damage={...snapshot.system.damage,adjusted:info.damage};
 snapshot.system.range={...snapshot.system.range,value:info.range,adjusted:info.range,label:`SWFFG.WeaponRange${info.range}`};
 snapshot.flags??={};snapshot.flags[scope]??={};snapshot.flags[scope].rollWeaponSnapshot=true;snapshot.flags[scope].rollTalentWeapon=info;
 return snapshot;
}
// Activating a checkbox is the choice to spend its maneuver; there is no second confirmation checkbox.
// Maneuver budgets are still counted by the player/MJ; strain is charged only when the roll is posted.
export async function commitRollTalents(actor,skill,selections,context={}){
 if(!selections.length)return {selections:[],changes:[]};
 if(!actor?.isOwner)throw Error(t('Le propriétaire du personnage doit activer ses talents.','The actor owner must activate their talents.'));
 const chosen=selectedRollTalents(actor,skill,selections,context),cost=chosen.reduce((sum,s)=>sum+s.cost,0),changes=[],update={};
 if(cost){if(!actor.system?.stats?.strain)throw Error(t('Ce personnage ne possède pas de compteur de stress.','This actor has no strain counter.'));const before=Number(actor.system.stats.strain.value)||0;if(chosen.some(s=>s.id==='precise-aim')&&cost>strainRemaining(actor))throw Error(t('Stress disponible insuffisant pour les talents sélectionnés.','Insufficient remaining strain for selected talents.'));update['system.stats.strain.value']=before+cost;changes.push({path:'system.stats.strain.value',before,after:before+cost});}
 const round=combatRoundKey();if(round)for(const option of chosen.filter(s=>s.perRound)){const path=`flags.${scope}.rollTalentUsage.${option.id}`,before=actor.getFlag?.(scope,'rollTalentUsage')?.[option.id]??null;update[path]=round;changes.push({path,before,after:round});}
 if(Object.keys(update).length)await actor.update(update);
 return {selections:chosen,changes};
}
export async function rollbackRollTalents(actor,transaction){if(!transaction?.changes?.length)return;const update={};for(const change of transaction.changes){const current=foundry.utils.getProperty(actor,change.path)??null;if(current!==change.after)throw Error(t('Le personnage a changé depuis : vérifie le coût des talents sur sa fiche.','The actor changed since: check the talent costs on its sheet.'));update[change.path]=change.before;}await actor.update(update);}

function talentChoices(builder,html){
 const actor=builder.weaponContext?.actor??builder.roll.data?.document??game.actors.get(builder.roll.data?.actor?._id),skill=builder.weaponContext?.skillKey??builder.roll.skillName;
 const options=rollTalentOptions(actor,skill,{item:builder.roll.item});if(!actor?.isOwner||!options.length)return;
 const section=document.createElement('fieldset');section.className='ffg-roll-talents';section.style.cssText='margin:0;padding:8px;font-size:12px;line-height:1.4;display:block';
 const append=(parent,tag,text)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
 append(section,'legend',t('Talents pour ce jet','Talents for this roll'));
 const summary=append(section,'p','');summary.className='ffg-talent-weapon-preview';summary.style.cssText='margin:0 0 8px;padding:6px;background:#ffffff30;border-radius:3px;white-space:pre-line';
 const selected=builder._talentSelections??[];
 const updateSummary=()=>{
  let selections=[];try{selections=selectedRollTalents(actor,skill,builder._talentSelections??[],{item:builder.roll.item});}catch(error){summary.textContent=error.message;return;}
  const info=talentWeaponPreview(builder.roll.item,selections),lines=[];
  if(info.maneuvers)lines.push(`${info.maneuvers} ${t('manœuvre(s) à décompter','maneuver(s) to spend')}`);
  summary.textContent=lines.join('\n');summary.hidden=!lines.length;
 };
 const read=()=>{
  if(builder._postingRoll||builder._selectingWeapon)return;
  builder._talentSelections=[...section.querySelectorAll('[data-talent]')].filter(row=>row.querySelector('[name=use]')?.checked).map(row=>({id:row.dataset.talent,amount:Number(row.querySelector('[name=amount]')?.value??1),targetDefence:Number(row.querySelector('[name=targetDefence]')?.value??0)}));
  updateSummary();builder._initializeInputs(html);
 };
 for(const option of options){
  const row=document.createElement('div');row.dataset.talent=option.id;row.style.cssText='margin:10px 0;padding-top:10px;border-top:1px solid #748a9144;display:block;flex:0 0 auto';
  const label=document.createElement('label'),input=document.createElement('input');label.style.cssText='display:flex;align-items:center;gap:7px;font-weight:600;color:#496573;line-height:1.3';input.style.cssText='margin:0;flex:0 0 auto';input.type='checkbox';input.name='use';input.disabled=option.blocked;input.checked=selected.some(s=>s.id===option.id)&&!option.blocked;
  const labels={'true-aim':'Visée Juste','sniper-shot':'Tireur d’Élite','point-blank':'Bout Portant'};
  label.append(input,document.createTextNode(`${game.i18n.lang==='fr'?(labels[option.id]??option.name):option.name}${option.isRanked===false?'':` (${t('rang','rank')} ${option.rank})`}`));row.append(label);
  const notes={
   'true-aim':t(`Coût : 1 manœuvre · une fois par round. +1 Fortune et ${option.rank} amélioration(s) du jet.`,`Cost: 1 maneuver · once per round. +1 Boost and ${option.rank} ability upgrade(s).`),
   'sniper-shot':t('Coût : 1 manœuvre · une fois par round. Arme à distance, hors armes de jet. Améliore la difficulté par bande gagnée ; cela s’ajoute à la difficulté de la distance de la cible.','Cost: 1 maneuver · once per round. Non-thrown ranged weapon. Upgrade difficulty per extra range band, in addition to the target range difficulty.'),
   'point-blank':t(`Cible à courte portée ou au contact : +${option.rank} dégât(s) sur une seule touche réussie. Aucun coût de manœuvre.`,`Target at short range or engaged: +${option.rank} damage to one successful hit. No maneuver cost.`),
   'intense-focus':t('Coût : 1 manœuvre et 1 stress · une amélioration du jet.','Cost: 1 maneuver and 1 strain · one ability upgrade.'),
   'frenzied-attack':t('Broutille : 1 stress par amélioration, au maximum le rang.','Incidental: 1 strain per upgrade, up to the rank.'),
  };
  append(row,'small',option.blockedReason||option.note||notes[option.id]).style.cssText='display:block;margin-top:5px';
  if(option.variable&&option.maxAmount>1){const amount=document.createElement('input');amount.type='number';amount.name='amount';amount.min='1';amount.max=String(option.maxAmount||1);amount.value=String(selected.find(s=>s.id===option.id)?.amount??1);amount.disabled=option.blocked;amount.style.width='56px';amount.setAttribute('aria-label',option.removalAmount?t('Infortunes environnementales à retirer','Environmental Setback dice to remove'):option.id==='sniper-shot'?t('Bandes de portée supplémentaires','Additional range bands'):t('Nombre d’améliorations','Upgrade count'));row.append(amount);}
  if(option.id==='precise-aim'){const field=append(row,'label',t('Défense déjà incluse dans les Infortunes : ','Defence already included in Setback dice: '));const value=document.createElement('input');value.type='number';value.name='targetDefence';value.min='0';value.step='1';value.value=String(selected.find(s=>s.id===option.id)?.targetDefence??0);value.style.width='56px';field.append(value);}
  section.append(row);
 }
 section.addEventListener('change',read);section.addEventListener('input',read);
 append(section,'small',t('Choix valables pour ce jet uniquement. Les manœuvres et le coût éventuel d’une seconde manœuvre restent à décompter.','Choices apply to this roll only. Count maneuvers and any second-maneuver cost separately.'));
 updateSummary();return section;
}

export async function openAssociatedTalents(builder,html){
 if(builder._talentWindow?.rendered){builder._talentWindow.bringToFront();return;}
 const section=talentChoices(builder,html);if(!section)return;
 const content=document.createElement('div');
 const style=document.createElement('style');style.textContent='.ffg-associated-talents{max-height:calc(100dvh - 24px)}.ffg-associated-talents .window-content,.ffg-associated-talents .dialog-form{display:flex;flex-direction:column;min-height:0;overflow:hidden}.ffg-associated-talents .dialog-content{flex:1;min-height:0;overflow-y:auto}.ffg-associated-talents .form-footer{flex-shrink:0}';
 content.append(style);
 const bounds=builder.element.getBoundingClientRect(),width=Math.min(440,window.innerWidth-24);
 const left=bounds.right+width+12<=window.innerWidth?bounds.right+8:Math.max(12,bounds.left-width-8);
 const app=new foundry.applications.api.DialogV2({classes:['starwarsffg','themed','ffg-associated-talents'],window:{title:t('Talents associés','Associated talents'),resizable:true},position:{left,top:Math.max(12,bounds.top),width},content,buttons:[{action:'close',label:t('Fermer','Close')}]});
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
 if(!actor?.isOwner||!rollTalentOptions(actor,skill,{item:builder.roll.item}).length)return;
 const button=document.createElement('button');button.type='button';button.className='ffg-associated-talents-button';button.textContent=t('Talents associés','Associated talents');button.style.cssText='width:100%;margin-top:6px';
 button.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();button.disabled=true;try{await openAssociatedTalents(builder,html);}catch(error){ui.notifications.error(error.message);}finally{button.disabled=false;}});
 root.querySelector('.roll-button')?.after(button);
 if(wasOpen)await openAssociatedTalents(builder,html);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
async function load(){
 const context=vm.createContext({structuredClone,game:{i18n:{lang:'fr',localize:k=>k},combat:null,user:{isGM:true},settings:{get:()=>true}},foundry:{utils:{getProperty:(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o),deepClone:structuredClone}}});
 const cache=new Map();
 async function module(name){if(cache.has(name))return cache.get(name);const m=new vm.SourceTextModule(await fs.readFile(new URL('../../modules/helpers/'+name,import.meta.url),'utf8'),{context});cache.set(name,m);await m.link(s=>module(s.split('/').at(-1)));await m.evaluate();return m;}
 return {state:(await module('reviewed-talent-state.js')).namespace,roll:(await module('roll-talents.js')).namespace,combat:(await module('combat-actions.js')).namespace,ui:(await module('reviewed-talent-ui.js')).namespace,context};
}
function actor(talents=[]){
 const a={uuid:'Actor.a',type:'character',isOwner:true,system:{skills:{Charm:{careerskill:false},Coercion:{careerskill:false},Negotiation:{careerskill:false},Deception:{careerskill:false},Athletics:{careerskill:true},Mechanics:{careerskill:false},Education:{type:'Knowledge',careerskill:false}},stats:{strain:{max:15,value:4},wounds:{max:12,value:2},defence:{melee:0,ranged:1}}},flags:{},items:talents};
 a.items.get=id=>a.items.find(i=>i.id===id);for(const i of a.items)i.parent=a;
 a.talentList=talents.filter(i=>i.type==='talent').map(i=>({itemId:i.id,name:i.name,isRanked:i.system.ranks?.ranked,rank:i.system.ranks?.current??1}));
 a.update=async data=>{for(const [path,value]of Object.entries(data)){const keys=path.split('.');let o=a;for(const k of keys.slice(0,-1))o=o[k]??={};o[keys.at(-1)]=value;}};return a;
}
const talent=(name,rank=1,id=name)=>({id,type:'talent',name,system:{ranks:{ranked:true,current:rank},attributes:{}},flags:{}});
const equipment=(id,type='weapon')=>({id,name:id,type,system:{damage:{value:5,adjusted:5},crit:{value:2,adjusted:2},encumbrance:{value:3,adjusted:3},equippable:{equipped:true},itemmodifier:[{name:'Burn'}]},flags:{starwarsffg:{}}});
test('only acquired active choices affect career skills and existing career sources survive removal',async()=>{
 const {state:s}=await load(),spec={id:'tree',type:'specialization',system:{talents:{a:{name:'Accompli',islearned:true},b:{name:'Accompli',islearned:false}}},flags:{starwarsffg:{reviewedTalentChoices:{a:{skills:['Charm','Mechanics']},b:{skills:['Coercion']}}}}};
 const a=actor([spec]);s.applyReviewedActorData(a);assert.equal(a.system.skills.Charm.careerskill,true);assert.equal(a.system.skills.Mechanics.careerskill,true);assert.equal(a.system.skills.Coercion.careerskill,false);assert(a._reviewedTalentPaths.includes('system.skills.Charm.careerskill'));
 a.system.skills.Charm.careerskill=false;spec.system.talents.a.islearned=false;s.applyReviewedActorData(a);assert.equal(a.system.skills.Charm.careerskill,false);assert.equal(a.system.skills.Athletics.careerskill,true);
});
test('career and Smooth Talker choices reject duplicates, invalid skills and existing careers',async()=>{
 const {state:s}=await load(),a=actor();assert.throws(()=>s.validateTalentChoice(a,'wellRounded',['Charm','Charm']));assert.throws(()=>s.validateTalentChoice(a,'wellRounded',['Athletics','Mechanics']));assert.throws(()=>s.validateTalentChoice(a,'smoothTalker',['Mechanics']));assert.equal(s.validateTalentChoice(a,'wellRounded',['Charm','Mechanics']).skills.length,2);
});
test('jury rigging consumes one owned personal equipment slot per rank and rejects unsupported qualities',async()=>{
 const {state:s}=await load(),gun=equipment('gun'),other=equipment('other'),a=actor([talent('Bidouillage'),gun,other]);gun.flags.starwarsffg.juryRigged=s.validateJuryAssignment(a,gun,'damage');assert.throws(()=>s.validateJuryAssignment(a,other,'critical'));assert.throws(()=>s.validateJuryAssignment(a,gun,'quality','Pierce'));assert.throws(()=>s.validateJuryAssignment(a,{...gun,parent:{uuid:'other'}},'damage'));
 gun.flags.starwarsffg.juryRigged=s.validateJuryAssignment(a,gun,'quality','Burn');assert.equal(gun.flags.starwarsffg.juryRigged.quality,'burn');
});
test('jury bonuses are derived, reversible and do not modify base statistics or invent a critical',async()=>{
 const {state:s}=await load(),gun=equipment('gun'),a=actor([talent('Jury Rigged'),gun]);gun.flags.starwarsffg.juryRigged={effect:'damage'};s.applyJuryItemData(gun);assert.equal(gun.system.damage.adjusted,6);assert.equal(gun.system.damage.value,5);
 gun.system.damage.adjusted=5;delete gun.flags.starwarsffg.juryRigged;s.applyJuryItemData(gun);assert.equal(gun.system.damage.adjusted,5);
 gun.system.crit={value:0,adjusted:0};assert.throws(()=>s.validateJuryAssignment(a,gun,'critical'));
 gun.flags.starwarsffg.juryRigged={effect:'encumbrance'};gun.system.encumbrance.adjusted=0;s.applyJuryItemData(gun);assert.equal(gun.system.encumbrance.adjusted,0);
});
test('armour defence applies to the chosen direction only while worn and carried; losing talent disables rigging',async()=>{
 const {state:s}=await load(),armour=equipment('armour','armour'),t=talent('Bidouillage'),a=actor([t,armour]);armour.flags.starwarsffg.juryRigged={effect:'defence-ranged'};s.applyReviewedActorData(a);assert.equal(a.system.stats.defence.ranged,2);assert.equal(a.system.stats.defence.melee,0);
 for(const state of ['stored','not-worn','no-talent']){a.system.stats.defence.ranged=1;armour.flags.starwarsffg.inventoryLocation=state==='stored'?'possession':'carried';armour.system.equippable.equipped=state!=='not-worn';t.system.active=state!=='no-talent';s.applyReviewedActorData(a);assert.equal(a.system.stats.defence.ranged,1);}
});
test('Confidence reverses exact requested red-to-purple-to-zero steps without changing the base pool',async()=>{
 const {roll:r}=await load(),a=actor([talent('Aplomb',3)]),base={challenge:2,difficulty:1,setback:0},selected=r.selectedRollTalents(a,'Discipline',[{id:'confidence'}]);const result=r.rollTalentPool(base,selected,a,'Discipline');assert.equal(result.challenge,0);assert.equal(result.difficulty,2);assert.equal(base.challenge,2);assert.equal(r.rollTalentPool(base,[],a,'Discipline').difficulty,1);assert.equal(r.rollTalentOptions(a,'Cool').length,0);
 const one=actor([talent('Aplomb',2)]);assert.equal(r.rollTalentPool({challenge:1,difficulty:0},r.selectedRollTalents(one,'Discipline',[{id:'confidence'}])).difficulty,0);
});
test('automatic removals use talent rank, are bounded, coexist with other sources and cannot be selected twice',async()=>{
 const {roll:r}=await load();for(const [name,skill]of [['As de la mécanique','Mechanics'],['Cartographie de la Galaxie','Astrogation'],['Chercheur','Education']]){const a=actor([talent(name,2)]),base={setback:5,remsetback:1,boost:0};const p=r.rollTalentPool(base,[],a,skill);assert.equal(p.setback,3);assert.equal(p.remsetback,1);assert.equal(base.setback,5);assert.throws(()=>r.selectedRollTalents(a,skill,[{id:r.rollTalentOptions(a,skill)[0].id}]));assert.equal(r.rollTalentPool({setback:1},[],a,skill).setback,0);assert.equal(r.rollTalentPool(base,[],a,'Charm').setback,5);}
 const item=talent('As de la mécanique',2);item.system.attributes.a={modtype:'Skill Remove Setback',mod:'Mechanics',value:2};const a=actor([item]),p=r.rollTalentPool({setback:4,remsetback:3},[],a,'Mechanics');assert.equal(p.setback,2);assert.equal(p.remsetback,1);
});
test('Command and Outdoorsman selections apply exact rank and deselect without accumulating',async()=>{
 const {roll:r}=await load(),a=actor([talent('Autorité Naturelle',2),talent('Baroudeur',3)]),base={boost:1,setback:2};const command=r.selectedRollTalents(a,'Leadership',[{id:'command'}]);assert.equal(r.rollTalentPool(base,command).boost,3);const outdoor=r.selectedRollTalents(a,'Coordination',[{id:'outdoorsman'}]);assert.equal(r.rollTalentPool(base,outdoor).setback,0);assert.equal(r.rollTalentPool(base,[]).boost,1);assert.equal(r.rollTalentOptions(a,'Computers').length,0);
});
test('Frenzied Attack pays immediately, never pays twice, refunds exactly on cancel and rejects invalid or late activation',async()=>{
 const {roll:r}=await load(),a=actor([talent('Attaque furieuse',3)]),b={roll:{},_talentSelections:[]};await r.activateFrenziedAttack(b,a,'Melee',2);assert.equal(a.system.stats.strain.value,6);const chosen=r.selectedRollTalents(a,'Melee',b._talentSelections,{frenziedPaid:b._frenziedPaid.selection});assert.equal(chosen[0].cost,0);assert.equal(r.rollTalentPool({ability:1,proficiency:0},chosen).proficiency,1);await r.commitRollTalents(a,'Melee',b._talentSelections,{frenziedPaid:b._frenziedPaid.selection});assert.equal(a.system.stats.strain.value,6);
 await r.cancelFrenziedAttack(b);assert.equal(a.system.stats.strain.value,4);assert.equal(b._talentSelections.length,0);await r.activateFrenziedAttack(b,a,'Melee',2);a.system.stats.strain.value=1;await r.cancelFrenziedAttack(b);assert.equal(a.system.stats.strain.value,0);a.system.stats.strain.value=4;for(const amount of [0,4,1.5])await assert.rejects(()=>r.activateFrenziedAttack(b,a,'Melee',amount));assert.equal(a.system.stats.strain.value,4);b._reviewedClosed=true;await assert.rejects(()=>r.activateFrenziedAttack(b,a,'Melee',1));
});
test('Rivals pay strain costs as wounds, minions cannot voluntarily pay, failed writes do not select talent',async()=>{
 const {roll:r}=await load(),a=actor([talent('Frenzied Attack',2)]);a.type='rival';delete a.system.stats.strain;const b={roll:{}};await r.activateFrenziedAttack(b,a,'Brawl',2);assert.equal(a.system.stats.wounds.value,4);await r.cancelFrenziedAttack(b);assert.equal(a.system.stats.wounds.value,2);a.type='minion';await assert.rejects(()=>r.activateFrenziedAttack(b,a,'Brawl',1));a.type='rival';a.update=async()=>{throw Error('offline');};await assert.rejects(()=>r.activateFrenziedAttack(b,a,'Brawl',1));assert.equal(b._frenziedPaid,null);
});
test('Smooth Talker is limited to the linked skill, first in spending and supports multiple Triumphs and undo',async()=>{
 const {combat:c}=await load(),t=talent('Beau Parleur',2);t.flags={starwarsffg:{reviewedTalentChoices:{_self:{kind:'smoothTalker',skills:['Charm']}}}};const a=actor([t]);const message=skill=>({getFlag:(_s,k)=>k==='combatSkill'?skill:undefined});assert.equal(c.smoothTalkerForMessage(a,message('Charm')).rank,2);assert.equal(c.smoothTalkerForMessage(a,message('Deception')),null);
 const opts=c.spendingOptions(null,{triumph:2},{smoothTalker:{rank:2}});assert.equal(opts[0].id,'smooth-talker');const selected=c.validateSpending({triumph:2},[],opts,[{effect:'smooth-talker',currency:'triumph',quantity:2}]);assert.equal(selected[0].cost,2);assert.throws(()=>c.validateSpending({triumph:1},[],opts,[{effect:'smooth-talker',currency:'triumph',quantity:2}]));
 const entry={effect:'smooth-talker',successGain:4,currency:'triumph',cost:2};assert.equal(c.adjustedResult({success:0,failure:3},[entry]).success,1);entry.undone=true;assert.equal(c.adjustedResult({success:0,failure:3},[entry]).failure,3);
});
test('jury rigging changes only the chosen active quality advantage cost, including misses, never below one',async()=>{
 const {combat:c}=await load(),gun=equipment('gun');gun.system.itemmodifier=[{name:'Burn',system:{rank:2}},{name:'Blast',system:{rank:3}},{name:'Sunder',system:{rank:1}}];gun.flags.starwarsffg.juryRiggedApplied={effect:'quality',quality:'burn'};const p=c.weaponEffects(gun,true);assert.equal(p.find(q=>q.name==='Burn').cost,1);assert.equal(p.find(q=>q.name==='Blast').cost,2);gun.flags.starwarsffg.juryRiggedApplied.quality='blast';assert.equal(c.weaponEffects(gun,false).find(q=>q.name==='Blast').cost,2);gun.flags.starwarsffg.juryRiggedApplied.quality='sunder';assert.equal(c.weaponEffects(gun,true).find(q=>q.name==='Sunder').cost,1);
});


test('concurrent talent spending cannot lose a cost or exceed remaining strain',async()=>{
 const {roll:r}=await load(),a=actor([talent('Attaque furieuse',2)]);a.system.stats.strain.max=7;const update=a.update;a.update=async data=>{await Promise.resolve();await update(data);};
 const results=await Promise.allSettled([r.commitRollTalents(a,'Melee',[{id:'frenzied-attack',amount:2}]),r.commitRollTalents(a,'Melee',[{id:'frenzied-attack',amount:2}])]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(a.system.stats.strain.value,6);
});

test('direct Accompli action configures only this talent, preserves other choices, and cancellation never writes',async()=>{
 const {ui:u,context}=await load(),well=talent('Accompli'),smooth=talent('Beau Parleur'),a=actor([well,smooth]);let writes=0,prompts=0;
 well.update=async d=>{writes++;well.flags.starwarsffg={reviewedTalentChoices:{_self:d['flags.starwarsffg.reviewedTalentChoices._self']}};};
 context.ui={notifications:{info(){}}};context.foundry.applications={api:{DialogV2:{prompt:async opts=>{prompts++;assert.match(opts.window.title,/Accompli/);return ['Charm','Mechanics'];}}}};
 await u.configureSpecificTalent(a,well.id,'_self');assert.equal(writes,1);assert.equal(prompts,1);assert.equal(smooth.flags.starwarsffg,undefined);assert.equal(well.flags.starwarsffg.reviewedTalentChoices._self.skills.length,2);
 well.flags={};context.foundry.applications.api.DialogV2.prompt=async()=>null;await u.configureSpecificTalent(a,well.id,'_self');assert.equal(writes,1);
 context.foundry.applications.api.DialogV2.prompt=async()=>{a.items.splice(a.items.indexOf(well),1);return ['Charm','Mechanics'];};await assert.rejects(()=>u.configureSpecificTalent(a,well.id,'_self'));assert.equal(writes,1);
});

test('Accompli confirms real dialog values, refreshes the actor and reopens saved choices',async()=>{
 const {ui:u,state:s,context}=await load(),well=talent('Accompli'),a=actor([well]);
 const calls=[];let values=['Charm','Mechanics'];
 well.update=async data=>{calls.push('save');well.flags.starwarsffg={reviewedTalentChoices:{_self:data['flags.starwarsffg.reviewedTalentChoices._self']}};};
 a.reset=()=>{calls.push('reset');for(const key of ['Charm','Mechanics','Coercion'])a.system.skills[key].careerskill=false;};
 a.prepareData=()=>{calls.push('prepare');s.applyReviewedActorData(a);};
 a.sheet={render:async()=>{calls.push('render');assert(a.system.skills[values[0]].careerskill);assert(a.system.skills[values[1]].careerskill);}};
 context.ui={notifications:{info(){calls.push('notice');}}};
 context.foundry.applications={api:{DialogV2:{prompt:async opts=>{
  if(well.flags.starwarsffg){assert.match(opts.content,/value="Charm" selected/);assert.match(opts.content,/value="Mechanics" selected/);}
  return opts.ok.callback(null,null,{element:{querySelector:selector=>({value:values[Number(selector.match(/skill(\d)/)[1])]})}});
 }}}};
 await u.configureSpecificTalent(a,well.id,'_self');
 assert.deepEqual(calls,['save','reset','prepare','render','notice']);
 calls.length=0;values=['Charm','Coercion'];await u.configureSpecificTalent(a,well.id,'_self');
 assert.equal(a.system.skills.Mechanics.careerskill,false);assert.equal(a.system.skills.Coercion.careerskill,true);
 assert.deepEqual(calls,['save','reset','prepare','render','notice']);
});
test('Accompli can retain its own career choices without accepting another career skill',async()=>{
 const {state:s}=await load(),a=actor();a.system.skills.Charm.careerskill=true;
 assert.equal(s.validateTalentChoice(a,'wellRounded',['Charm','Mechanics'],['Charm']).skills.length,2);
 assert.throws(()=>s.validateTalentChoice(a,'wellRounded',['Charm','Athletics'],['Charm']));
});

test('Accompli description reports missing, partial and complete choices without changing the source text',async()=>{
 const {state:s}=await load(),t=talent('Accompli'),a=actor([t]);
 assert.match(s.talentChoiceDescription(a,t.id),/Compétence choisie : <strong class="ffg-talent-choice-empty">aucune<\/strong>\./);assert(!s.talentChoiceDescription(a,t.id).includes('Choix incomplet'));
 t.flags.starwarsffg={reviewedTalentChoices:{_self:{skills:['Charm','unknown']}}};
 assert.match(s.talentChoiceDescription(a,t.id),/1 compétence à choisir/);
 t.flags.starwarsffg.reviewedTalentChoices._self.skills=['Charm','Mechanics'];
 assert.equal(s.talentChoiceStatus(a,t.id)[0].missing,0);assert.doesNotMatch(s.talentChoiceDescription(a,t.id),/incomplet/);
 assert.equal(t.system.description,undefined);
});
test('Accompli groups actual skill options and persists through the actor before the dialog closes',async()=>{
 const {ui:u,context}=await load(),t=talent('Accompli'),a=actor([t]);
 a.system.skills.Charm.type='Social';a.system.skills.Mechanics.type='General';
 a.system.skills.Gunnery={type:'Combat',careerskill:false};
 let saved=false;
 a.updateEmbeddedDocuments=async(type,updates)=>{assert.equal(type,'Item');assert.equal(updates[0]._id,t.id);t.flags.starwarsffg={reviewedTalentChoices:{_self:updates[0]['flags.starwarsffg.reviewedTalentChoices._self']}};saved=true;};
 context.ui={notifications:{info(){}}};
 context.foundry.applications={api:{DialogV2:{prompt:async opts=>{
  assert.match(opts.content,/<optgroup label="General">/);assert.match(opts.content,/<optgroup label="Combat">/);assert.match(opts.content,/<optgroup label="Social">/);
  const result=await opts.ok.callback(null,{form:{querySelector:selector=>({value:selector.includes('skill0')?'Charm':'Mechanics'})}},null);
  assert(saved);return result;
 }}}};
 await u.configureSpecificTalent(a,t.id,'_self');assert(saved);
});
test('Accompli rejects a server update that did not persist its choice',async()=>{
 const {ui:u,context}=await load(),t=talent('Accompli'),a=actor([t]);
 a.updateEmbeddedDocuments=async()=>[];
 context.foundry.applications={api:{DialogV2:{prompt:async()=>['Charm','Mechanics']}}};
 await assert.rejects(()=>u.configureSpecificTalent(a,t.id,'_self'),/pas été enregistrées/);
});
test('career checkboxes granted by Accompli are checked and disabled, with no global configure button',async()=>{
 const {ui:u,context}=await load(),a=actor(),input={checked:false,disabled:false};
 a._reviewedTalentPaths=['system.skills.Charm.careerskill'];
 context.document={createElement(){throw Error('Unexpected global control');}};
 const root={querySelectorAll:selector=>selector.includes('[name=')?[input]:[],querySelector:()=>null};
 u.renderReviewedTalentControls({actor:a,element:root});
 assert.equal(input.checked,true);assert.equal(input.disabled,true);assert.match(input.title,/talent acquis/);
});

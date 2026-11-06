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

test('Street Smarts removes actual ranks only on its two skills and never below zero',async()=>{
 const {roll:r}=await load(),a=actor([talent('Dégourdi',2)]);
 for(const skill of ['Streetwise','Underworld'])for(const count of [0,1,4])assert.equal(r.rollTalentPool({setback:count},[],a,skill).setback,Math.max(0,count-2));
 assert.equal(r.rollTalentPool({setback:4},[],a,'Mechanics').setback,4);
 a.items[0].system.active=false;assert.equal(r.rollTalentPool({setback:4},[],a,'Streetwise').setback,4);
});
test('Codebreaker exposes independent selections and allows their combination',async()=>{
 const {roll:r}=await load(),a=actor([talent('Craqueur de Codes',2)]);
 const selected=r.selectedRollTalents(a,'Computers',[{id:'codebreaker-removal'},{id:'codebreaker-difficulty'}]);
 const p=r.rollTalentPool({setback:3,difficulty:2,challenge:1},selected);assert.equal(p.setback,1);assert.equal(p.difficulty,1);assert.equal(p.challenge,1);
 const q=r.rollTalentPool({setback:0,difficulty:0,challenge:1},selected);assert.equal(q.challenge,0);assert.equal(q.difficulty,1);
 assert.throws(()=>r.selectedRollTalents(a,'Mechanics',[{id:'codebreaker-removal'}]));
});
test('Master Doctor costs two only at commit, minimum Easy and one use per combat round',async()=>{
 const {roll:r,context}=await load(),a=actor([talent('Expert en Médecine')]);
 context.game.combat={started:true,id:'battle',round:1};a.getFlag=(_s,k)=>a.flags.starwarsffg?.[k];
 const chosen=r.selectedRollTalents(a,'Medicine',[{id:'master-doctor'}]);assert.equal(a.system.stats.strain.value,4);
 assert.equal(r.rollTalentPool({difficulty:1},chosen).difficulty,1);assert.equal(r.rollTalentPool({difficulty:3},chosen).difficulty,2);
 const tx=await r.commitRollTalents(a,'Medicine',[{id:'master-doctor'}]);assert.equal(a.system.stats.strain.value,6);
 assert.throws(()=>r.selectedRollTalents(a,'Medicine',[{id:'master-doctor'}]));await r.rollbackRollTalents(a,tx);assert.equal(a.system.stats.strain.value,4);
});
test('Crippling Blow increases difficulty once and does not upgrade dice',async()=>{
 const {roll:r}=await load(),a=actor([talent('Coup Handicapant',2)]),s=r.selectedRollTalents(a,'Melee',[{id:'crippling-blow'}]);
 const p=r.rollTalentPool({difficulty:2,challenge:1,ability:2},s);assert.equal(p.difficulty,3);assert.equal(p.challenge,1);assert.equal(p.ability,2);
 assert.throws(()=>r.selectedRollTalents(a,'Medicine',[{id:'crippling-blow'}]));
});
test('Knowledge Specialization only accepts a Knowledge choice and converts triumphs on that skill',async()=>{
 const {state:s,combat:c}=await load(),i=talent('Connaissances Spécialisées',2),a=actor([i]);
 assert.throws(()=>s.validateTalentChoice(a,'knowledgeSpecialization',['Charm']));
 i.flags.starwarsffg={reviewedTalentChoices:{_self:s.validateTalentChoice(a,'knowledgeSpecialization',['Education'])}};
 const m={getFlag:(_s,k)=>k==='combatSkill'?'Education':null,rolls:[]};assert.equal(c.smoothTalkerForMessage(a,m,'knowledgeSpecialization').rank,2);
 const opts=c.spendingOptions(null,{success:1},{knowledgeSpecialization:{rank:2}});const o=opts.find(o=>o.id==='knowledge-specialization');assert.equal(o.payments.triumph,1);
 assert.equal(c.adjustedResult({success:1,failure:0},[{effect:o.id,successGain:4}]).success,5);
 assert.equal(c.adjustedResult({success:1,failure:0},[{effect:o.id,successGain:4,undone:true}]).success,1);
});
test('Defensive Driving only uses actual Pilot roles, one pilot bonus, all four zones',async()=>{
 const {state:s,context}=await load(),pilot=actor([talent('Conduite stratégique',2)]);context.game.actors={get:id=>id==='pilot'?pilot:null};
 const v={type:'vehicle',items:[],flags:{starwarsffg:{crew:[{actor_id:'pilot',role:'Co-Pilot'}]}},system:{stats:{shields:{fore:1,aft:0,port:0,starboard:1}}}};
 s.applyReviewedActorData(v);assert.equal(v.system.stats.shields.fore,1);
 v.flags.starwarsffg.crew.push({actor_id:'pilot',role:'Pilot'});s.applyReviewedActorData(v);assert.equal(v.system.stats.shields.fore,3);assert.equal(v.system.stats.shields.aft,2);assert.equal(v._reviewedTalentPaths.length,4);
});
test('Disorient and improved Stunning Blow only appear after an eligible successful attack',async()=>{
 const {combat:c}=await load(),a=actor([talent('Désorientation',2),talent('Coup Assommant (Amélioré)')]);
 const m={getFlag:(_s,k)=>k==='combatSkill'?'Melee':k==='rollTalents'?[{id:'stunning-blow'}]:null,rolls:[{hasFFG:true,ffg:{success:1,failure:0}}]};
 const context=c.reviewedCombatForMessage(a,m);assert.equal(context.disorient,2);assert.equal(context.stunningImproved,true);
 const opts=c.spendingOptions(null,{success:1},{reviewedCombat:context});assert.equal(opts.find(o=>o.id==='talent-disorient').payments.advantage,2);assert.equal(opts.find(o=>o.id==='talent-stagger').payments.triumph,1);
 m.rolls[0].ffg.success=0;assert(!c.spendingOptions(null,{success:0},{reviewedCombat:c.reviewedCombatForMessage(a,m)}).some(o=>o.id==='talent-stagger'));
});
test('Intense Focus already costs one strain and upgrades exactly once',async()=>{
 const {roll:r}=await load(),a=actor([talent('Concentration Intense')]);const chosen=r.selectedRollTalents(a,'Medicine',[{id:'intense-focus'}]);
 const p=r.rollTalentPool({ability:2,proficiency:0},chosen);assert.equal(p.ability,1);assert.equal(p.proficiency,1);
 await r.commitRollTalents(a,'Medicine',[{id:'intense-focus'}]);assert.equal(a.system.stats.strain.value,5);
});

test('Dedication derives one point per chosen rank, max six and no original source mutation',async()=>{
 const {state:s}=await load(),i=talent('Entraînement',2),a=actor([i]);
 a.system.characteristics={Brawn:{value:3},Agility:{value:5}};a.system.stats.soak={value:3};a.system.stats.encumbrance={max:8};
 i.flags.starwarsffg={reviewedTalentChoices:{_self:{kind:'dedication',skills:['Brawn','Agility']}}};
 s.applyReviewedActorData(a);assert.equal(a.system.characteristics.Brawn.value,4);assert.equal(a.system.characteristics.Agility.value,6);assert.equal(a.system.stats.soak.value,4);assert.equal(a.system.stats.encumbrance.max,9);
 assert.equal(s.talentChoiceStatus(a,i.id)[0].missing,0);
 i.flags.starwarsffg.reviewedTalentChoices._self.skills=[];assert.equal(s.talentChoiceStatus(a,i.id)[0].missing,2);
});

test('post-roll talent choices recognize skill keys, translation keys and French labels from normal rolls',async()=>{
 const {combat:c,context}=await load();
 const translations={'SWFFG.SkillsNameKnowledgeOuterRim':'Bordure Extérieure','SWFFG.SkillsNameCharm':'Charme'};
 context.game.i18n.localize=k=>translations[k]??k;
 for(const [kind,name,key,label] of [
  ['knowledgeSpecialization','Connaissances Spécialisées','OuterRim','SWFFG.SkillsNameKnowledgeOuterRim'],
  ['smoothTalker','Beau Parleur','Charm','SWFFG.SkillsNameCharm']
 ]){
  const item=talent(name,2),a=actor([item]);a.system.skills[key]={label};
  item.flags={starwarsffg:{reviewedTalentChoices:{_self:{kind,skills:[key]}}}};
  for(const skill of [key,label,translations[label]]){
   const m={getFlag:(_s,k)=>k==='combatSkill'?skill:undefined};
   assert.equal(c.smoothTalkerForMessage(a,m,kind)?.rank,2,skill);
   const fallback={getFlag:()=>undefined,rolls:[{hasFFG:true,skillName:skill}]};
   assert.equal(c.smoothTalkerForMessage(a,fallback,kind)?.rank,2);
  }
  assert.equal(c.smoothTalkerForMessage(a,{getFlag:()=> 'Mechanics'},kind),null);
  const optionId=kind==='knowledgeSpecialization'?'knowledge-specialization':'smooth-talker';
  const options=c.spendingOptions(null,{triumph:3,success:1},{[kind]:{rank:2}});
  const option=options.find(o=>o.id===optionId);assert(option);assert.equal(option.payments.triumph,1);
  const entries=[{effect:optionId,successGain:6,currency:'triumph',cost:3}];
  assert.equal(c.remainingSymbols({triumph:3},entries).triumph,0);
  assert.equal(c.adjustedResult({success:1,failure:0},entries).success,7);
  entries[0].undone=true;
  assert.equal(c.remainingSymbols({triumph:3},entries).triumph,3);
  assert.equal(c.adjustedResult({success:1,failure:0},entries).success,1);
  item.system.active=false;
  assert.equal(c.smoothTalkerForMessage(a,{getFlag:()=>translations[label]},kind),null);
 }
});

test('success conversion reports cumulative talent gains and new net success total, respecting undo',async()=>{
 const {combat:c}=await load(),raw={success:1,failure:0};
 const entries=[{effect:'knowledge-specialization',successGain:6}];
 assert.equal(c.successConversionSummary(raw,entries),'Connaissances Spécialisées : +6 réussite(s). Total des réussites ajoutées : +6. Nouveau total : 7 réussite(s).');
 entries.push({effect:'knowledge-specialization',successGain:2});
 assert.match(c.successConversionSummary(raw,entries),/ajoutées : \+8. Nouveau total : 9/);
 entries[0].undone=true;
 assert.match(c.successConversionSummary(raw,entries),/ajoutées : \+2. Nouveau total : 3/);
 assert.match(c.successConversionSummary({success:0,failure:3},entries),/Nouveau total : 0 réussite\(s\), 1 échec/);
 entries[1].undone=true;assert.equal(c.successConversionSummary(raw,entries),'');
 assert.match(c.successConversionSummary(raw,[{effect:'smooth-talker',successGain:2}]),/^Beau Parleur : \+2/);
});

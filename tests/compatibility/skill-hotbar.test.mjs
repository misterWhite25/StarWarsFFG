import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {loadSystemModule} from '../load-system-module.mjs';
import {SKILL_ICONS,FALLBACK_SKILL_ICON,skillIcon,shortcutSkills,shortcutPreset,pageSlots,hotbarPatch} from '../../modules/helpers/skill-hotbar-model.mjs';

test('shortcut translations do not collide with nested namespace keys in either language',async()=>{
 for(const language of ['fr','en']){
  const data=JSON.parse(await fs.readFile(new URL('../../lang/'+language+'.json',import.meta.url),'utf8')),keys=Object.keys(data).filter(key=>key.startsWith('SWFFG.UI.SkillHotbar.'));
  assert.ok(keys.length>20);for(const key of keys)assert.equal(keys.some(other=>other.startsWith(key+'.')),false,key);
 }
});

test('native skill icons cover aliases and profiles use current ranks without inventing skills',()=>{
 assert.equal(skillIcon('Connaissance : Ingénierie'),SKILL_ICONS.knowledgeengineering);
 assert.equal(skillIcon('custom',{label:'Chasseurs de Primes'}),SKILL_ICONS.knowledgebountyhunters);
 assert.equal(skillIcon('Knowledge: Bounty Hunting'),SKILL_ICONS.knowledgebountyhunters);
 assert.equal(skillIcon('Astrophysique',{type:'Knowledge'}),SKILL_ICONS.knowledgeeducation);
 assert.equal(skillIcon('custom'),FALLBACK_SKILL_ICON);assert.equal(skillIcon('Ranged-Heavy'),skillIcon('Ranged: Heavy'));assert.equal(skillIcon('custom',{label:'SWFFG.SkillsNameComputers'}),SKILL_ICONS.computers);
 const actor={system:{characteristics:{Agility:{value:4},Intellect:{value:3}},skills:{'Ranged: Heavy':{label:'Heavy',characteristic:'Agility',rank:2},Computers:{label:'Computers',characteristic:'Intellect',rank:3},Lightsaber:{characteristic:'Agility',rank:0}}},items:[]};
 const skills=shortcutSkills(actor),main=shortcutPreset(skills,'main',actor);assert.equal(main[0],'Computers');assert.equal(main.length,10);assert.equal(main.includes('Lightsaber'),false);assert.ok(shortcutPreset(skills,'technical',actor).includes('Computers'));
 actor.items.push({type:'weapon',system:{skill:{value:'Lightsaber'}}});assert.ok(shortcutPreset(skills,'combat',actor).includes('Lightsaber'));
 assert.throws(()=>pageSlots({},6));assert.deepEqual(Object.keys(hotbarPatch(5,Array(10).fill(null))),Array.from({length:10},(_,i)=>'hotbar.-='+(41+i)));
});

async function fixture({onCreate,onUpdate}={}){
 let sequence=0;const macros=[],updates=[],removed=[],calls=[],notices=[];
 const actor={id:'pc',uuid:'Actor.pc',name:'Character',type:'character',system:{characteristics:{Intellect:{value:3}},skills:{Computers:{label:'Computers',rank:2,characteristic:'Intellect'},Perception:{label:'Perception',rank:1,characteristic:'Intellect'}}},testUserPermission:()=>true};
 const user={id:'user',hotbar:{1:'other',21:'old',22:'old2',30:'old10',41:'last'},can:()=>true,async update(patch){if(onUpdate)await onUpdate(this,patch);updates.push(patch);for(const [path,value]of Object.entries(patch)){const key=path.slice(7);if(key.startsWith('-='))delete this.hotbar[key.slice(2)];else this.hotbar[key]=value;}}};
 const MacroClass={canUserCreate:()=>true,async createDocuments(rows){await onCreate?.(user,rows);const result=rows.map(row=>({...row,id:'macro'+(++sequence),isOwner:true,getFlag(scope,key){return this.flags?.[scope]?.[key];}}));macros.push(...result);return result;},async deleteDocuments(ids){removed.push(...ids);for(const id of ids){const index=macros.findIndex(macro=>macro.id===id);if(index>=0)macros.splice(index,1);}}};
 const context=vm.createContext({console,Hooks:{once(){}},CONFIG:{Macro:{documentClass:MacroClass}},fromUuid:async uuid=>uuid===actor.uuid?actor:null,ui:{notifications:{warn:text=>notices.push(text)},hotbar:{changePage:async page=>calls.push({page})}},game:{user,macros,i18n:{localize:key=>key,format:key=>key},ffg:{DiceHelpers:{rollSkillByKey:async(...args)=>calls.push(args)}}}});
 const api=(await loadSystemModule('helpers/skill-hotbar.mjs',context)).namespace;
 const keys=['Computers','Perception',...Array(8).fill('')];
 return {api,context,actor,user,macros,updates,removed,calls,notices,keys};
}

test('install replaces all ten slots only on the selected page and reuses private macros',async()=>{
 const f=await fixture(),expected=pageSlots(f.user.hotbar,3),result=await f.api.installSkillHotbar(f.actor,{page:3,keys:f.keys,expected});
 assert.equal(result.assigned,2);assert.equal(result.created,2);assert.equal(f.updates.length,1);assert.equal(f.user.hotbar[1],'other');assert.equal(f.user.hotbar[41],'last');assert.equal(f.user.hotbar[30],undefined);assert.equal(f.user.hotbar[21],f.macros[0].id);
 assert.equal(f.macros[0].img,SKILL_ICONS.computers);assert.equal(f.macros[0].ownership.default,0);
 f.macros[0].img='custom.webp';await f.api.installSkillHotbar(f.actor,{page:2,keys:f.keys,expected:pageSlots(f.user.hotbar,2)});assert.equal(f.macros.length,2);assert.equal(f.macros[0].img,'custom.webp');
});

test('a concurrent change on another page survives while a target-page change aborts safely',async()=>{
 const other=await fixture({onCreate:user=>{user.hotbar[1]='concurrent';}});await other.api.installSkillHotbar(other.actor,{page:3,keys:other.keys,expected:pageSlots(other.user.hotbar,3)});assert.equal(other.user.hotbar[1],'concurrent');
 const target=await fixture({onCreate:user=>{user.hotbar[21]='concurrent';}}),expected=pageSlots(target.user.hotbar,3);
 await assert.rejects(()=>target.api.installSkillHotbar(target.actor,{page:3,keys:target.keys,expected}));assert.equal(target.user.hotbar[21],'concurrent');assert.equal(target.updates.length,0);assert.equal(target.macros.length,0);assert.equal(target.removed.length,2);
});

test('failed assignment, invalid skills and missing permissions preserve the hotbar',async()=>{
 const f=await fixture({onUpdate:()=>{throw Error('write failed');}});const before={...f.user.hotbar};await assert.rejects(()=>f.api.installSkillHotbar(f.actor,{page:3,keys:f.keys,expected:pageSlots(before,3)}));assert.deepEqual(f.user.hotbar,before);assert.equal(f.macros.length,0);
 const safe=await fixture();for(const spec of [{page:6,keys:safe.keys},{page:3,keys:['Computers','Computers',...Array(8).fill('')]},{page:3,keys:['unknown',...Array(9).fill('')]}])await assert.rejects(()=>safe.api.installSkillHotbar(safe.actor,spec));
 safe.user.can=()=>false;await assert.rejects(()=>safe.api.installSkillHotbar(safe.actor,{page:3,keys:safe.keys}));assert.equal(safe.macros.length,0);assert.equal(safe.updates.length,0);
});

test('execution resolves the live actor, supports synthetic tokens and checks ownership again',async()=>{
 const f=await fixture();f.actor.system.skills.Computers.rank=4;await f.api.rollSkillShortcut(f.actor.uuid,'Computers');assert.deepEqual([...f.calls[0]],['pc','Computers',2]);
 f.actor.isToken=true;f.actor.token={uuid:'Scene.scene.Token.token'};await f.api.rollSkillShortcut(f.actor.uuid,'Computers');assert.equal(f.calls[1][0].tokenUuid,'Scene.scene.Token.token');
 f.actor.testUserPermission=()=>false;await f.api.rollSkillShortcut(f.actor.uuid,'Computers');assert.equal(f.calls.length,2);assert.equal(f.notices.length,1);
});

test('quoted custom skill identifiers are inert strings in generated macro commands',async()=>{
 const f=await fixture(),key='Custom "skill"\n`code`';f.actor.system.skills[key]={label:'Custom',rank:1,characteristic:'Intellect'};
 await f.api.installSkillHotbar(f.actor,{page:1,keys:[key,...Array(9).fill('')]});f.context.game.ffg.SkillHotbar={roll:async(uuid,skill)=>f.calls.push([uuid,skill])};
 await vm.runInContext('(async()=>{'+f.macros[0].command+'})()',f.context);assert.deepEqual(f.calls.at(-1),['Actor.pc',key]);
});

test('chat macro creation hooks preserve skill icons instead of copying the actor portrait',async()=>{
 const context=vm.createContext({foundry:{utils:{fromUuid:()=>{throw Error('Skill shortcuts must not resolve their actor image');}}}});
 const api=(await loadSystemModule('helpers/macros.js',context)).namespace,macro={getFlag:()=>({skillKey:'Computers'}),img:SKILL_ICONS.computers,command:'await game.ffg.SkillHotbar.roll("Actor.pc", "Computers");'};
 assert.equal(await api.updateMacro(macro),macro);assert.equal(macro.img,SKILL_ICONS.computers);
});

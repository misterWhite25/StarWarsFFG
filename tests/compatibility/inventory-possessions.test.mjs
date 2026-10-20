import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
import {isPossession,possessionData,possessionUpdate} from '../../modules/helpers/inventory-location.js';
import {matchingWeapons} from '../../modules/helpers/weapon-selection.js';
import {equippedItems} from '../../modules/helpers/equipment-summary.js';
import {calculateStats} from '../../modules/helpers/automatic-stats.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const stored=(type)=>({type,flags:{starwarsffg:{inventoryLocation:'possession'}},system:{encumbrance:{value:5},quantity:{value:2},equippable:{equipped:true},skill:{value:'Ranged: Light'},soak:{value:9},defence:{value:4}}});
const cloneSource={_id:'id',name:'Arme',type:'weapon',img:'art.webp',effects:[{disabled:false}],system:{equippable:{equipped:true},quantity:{value:3}},flags:{other:{keep:true}}};
const before=JSON.stringify(cloneSource),copied=possessionData(cloneSource);assert(isPossession(copied));assert.equal(copied._id,undefined);assert.equal(copied.img,'art.webp');assert.equal(copied.system.quantity.value,3);assert.equal(JSON.stringify(cloneSource),before);assert.equal(copied.system.equippable.equipped,false);
assert.deepEqual(possessionUpdate(false),{'flags.starwarsffg.inventoryLocation':'carried'});
const held={...stored('weapon'),flags:{}};const items=[stored('weapon'),stored('armour'),stored('gear'),held];
assert.deepEqual(matchingWeapons({items:{contents:items}},'Ranged: Light'),[held]);assert.deepEqual(equippedItems({items}),[held]);
const context=vm.createContext({Actor:class {*allApplicableEffects(){yield* this.effects;}},CONFIG:{FFG:{theme:'starwars'},logger:{error:e=>{throw e;}}}});
const mod=new vm.SourceTextModule(fs.readFileSync(root+'/modules/actors/actor-ffg.js','utf8'),{context});await mod.link(()=>new vm.SyntheticModule(['default','getPreparedActiveEffectChanges'],function(){this.setExport('default',class{});this.setExport('getPreparedActiveEffectChanges',()=>[]);},{context}));await mod.evaluate();
const actor=new mod.namespace.ActorFFG();actor.system={stats:{encumbrance:{}}};actor.items=items;actor._calculateDerivedValues(actor);assert.equal(actor.system.stats.encumbrance.value,10);
held.flags={starwarsffg:{inventoryLocation:'possession'}};actor._calculateDerivedValues(actor);assert.equal(actor.system.stats.encumbrance.value,0);
held.flags={};actor._calculateDerivedValues(actor);assert.equal(actor.system.stats.encumbrance.value,10);
const storedEffect={parent:items[1]},carriedEffect={parent:held},actorEffect={parent:{documentName:'Actor'}};actor.effects=[storedEffect,carriedEffect,actorEffect];assert.deepEqual([...actor.allApplicableEffects()],[carriedEffect,actorEffect]);
const a={type:'character',flags:{starwarsffg:{automaticStats:{creationBrawn:3,creationWillpower:2}}},system:{characteristics:{Brawn:{value:3}},stats:{}},items:[{type:'species',name:'Humain',system:{attributes:{Wounds:{value:10},Strain:{value:10}}}},items[1]],allApplicableEffects:()=>[]};
let stats=calculateStats(a);assert.equal(stats.rows.find(r=>r.id==='soak').total,3);a.items[1].flags={};stats=calculateStats(a);assert.equal(stats.rows.find(r=>r.id==='soak').total,12);
console.log('OK : copie sans mutation, trois types, quantités, mise en possession et reprise, exclusion des armes sélectionnables, équipement équipé, encombrement, effets transférés et armures dans les statistiques automatiques.');

// Exercise the add command without writing to a Foundry world.
let addHandler,choice,createdCalls=[],renders=0;
const addControl={addEventListener:(_name,fn)=>addHandler=fn};
const uiContext=vm.createContext({structuredClone,document:{createElement:()=>({})},foundry:{applications:{api:{DialogV2:{wait:async()=>choice}}}},ui:{notifications:{error:error=>{throw Error(error);}}}});
const locationModule=new vm.SourceTextModule(fs.readFileSync(root+'/modules/helpers/inventory-location.js','utf8'),{context:uiContext});await locationModule.link(()=>{});await locationModule.evaluate();
const uiModule=new vm.SourceTextModule(fs.readFileSync(root+'/modules/helpers/inventory-possessions.js','utf8'),{context:uiContext});await uiModule.link(()=>locationModule);await uiModule.evaluate();
const testSheet={isEditable:true,actor:{type:'character',isOwner:true,verifyEditModeIsNotEnabled:()=>true,createEmbeddedDocuments:async(type,data)=>{createdCalls.push({type,data});return [{sheet:{render:()=>renders++}}];}},element:{querySelectorAll:()=>[],querySelector:()=>addControl}};
uiModule.namespace.activateInventoryPossessions(testSheet);
for(const type of ['weapon','armour','gear']){choice={type,name:'Essai '+type};await addHandler({preventDefault(){},stopPropagation(){}});}
assert.equal(createdCalls.length,3);assert.equal(renders,3);assert(createdCalls.every(c=>c.type==='Item'&&c.data[0].flags.starwarsffg.inventoryLocation==='possession'&&c.data[0].system.quantity.value===1&&!c.data[0].system.equippable.equipped));
choice='cancel';await addHandler({preventDefault(){},stopPropagation(){}});assert.equal(createdCalls.length,3);
testSheet.isEditable=false;choice={type:'weapon',name:'Interdit'};await addHandler({preventDefault(){},stopPropagation(){}});assert.equal(createdCalls.length,3);
console.log('OK : bouton +, trois types, ouvertures de fiches, annulation et protection lecture seule.');

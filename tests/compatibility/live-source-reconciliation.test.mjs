import {systemI18n} from '../system-i18n.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {loadSystemModule} from '../load-system-module.mjs';

const CORE='swffg-compendium-bilingual-steelers-core_rule';

async function wizardFixture(api) {
  const events=[],errors=[],modules=new Map(),actors=new Map();
  if(api)modules.set(CORE,{api:{species:api}});
  const game={i18n:await systemI18n('fr'),modules,actors,packs:new Map(),items:[],user:{isGM:true,name:'GM'},users:[{isGM:true,active:true}],settings:{get:()=>0},socket:{on(){},emit(){events.push('socket');}}};
  const context=vm.createContext({game,Number,CONFIG:{logger:{error:(...args)=>errors.push(args)}},Actor:{create:async()=>{events.push('create');return {id:'new'};}},
    fromUuid:async uuid=>({uuid,type:'species',system:{startingXP:100}}),$:value=>({data:()=>value}),
    ui:{notifications:{warn(){},error(){}}},foundry:{applications:{api:{ApplicationV2:class{},HandlebarsApplicationMixin:C=>C},ux:{TextEditor:{enrichHTML:async value=>value}}}}});
  const {CharacterCreator}= (await loadSystemModule('helpers/character-creator.js',context,{
    'applications/legacy-dialog-v2.js':{LegacyDialogV2:class{}},
    'helpers/effects.js':{default:{}},
    'helpers/actor-helpers.js':{xpLogEarn:async()=>events.push('earn'),xpLogSpend:async()=>events.push('spend')},
    'helpers/dice-helpers.js':{default:{}},
    'actors/actor-sheet-ffg.js':{sortDataBy(){}},
  })).namespace;
  const wizard=new CharacterCreator();
  wizard.render=()=>events.push('wizard-render');
  wizard.calcCredits=async()=>({available:0});
  wizard.calcObligation=async()=>({key:'morality',available:50});
  const actor={id:'new',items:[],system:{},flags:{},
    async setFlag(scope,key,value){events.push('managed');this.flags[key]=value;},
    async unsetFlag(scope,key){events.push('unmanaged');delete this.flags[key];},
    async update(){events.push('update');},async createEmbeddedDocuments(){events.push('items');},
    sheet:{render(){events.push('sheet-render');}}};
  actors.set(actor.id,actor);
  return {wizard,game,actor,events,errors,context};
}

test('species discovery adds the installed core pack once and deduplicates document UUIDs',async()=>{
  const {wizard,game}=await wizardFixture();
  const calls=[],species={uuid:'Compendium.core.species.human',type:'species',link:'human'},world={uuid:'Item.world',type:'species',link:'world'};
  const pack=(name,items)=>({async getDocuments(){calls.push(name);return items;}});
  game.packs.set('custom',pack('custom',[species,{type:'gear',uuid:'Item.gear'}]));
  game.packs.set(CORE+'.en-species',pack('core',[species,{uuid:'Compendium.core.species.twilek',type:'species',link:'twilek'}]));
  game.items=[species,world];
  wizard.getSources=()=>[' custom ','custom',CORE+'.en-species','missing',''];
  const available=await wizard.getAvailableSpecies();
  assert.deepEqual(calls,['custom','core']);
  assert.deepEqual(Array.from(available,item=>item.uuid),[species.uuid,'Compendium.core.species.twilek','Item.world']);
});

test('species choices remain for the same UUID and reset when changing species',async()=>{
  const {wizard}=await wizardFixture();let previews=0;
  wizard.showCharacterStatusShim=async()=>{previews++;};
  wizard.data.selected.species={uuid:'Item.human'};
  wizard.data.selected.speciesStartingChoices={skill:'Charm'};
  wizard._steelersSpeciesStatus={status:'ready'};
  await wizard.handleSpeciesSelect({currentTarget:'Item.human'});
  assert.equal(wizard.data.selected.speciesStartingChoices.skill,'Charm');
  assert.equal(wizard._steelersSpeciesStatus.status,'ready');
  await wizard.handleSpeciesSelect({currentTarget:'Item.droid'});
  assert.deepEqual(Object.keys(wizard.data.selected.speciesStartingChoices),[]);
  assert.equal(wizard._steelersSpeciesStatus,undefined);assert.equal(previews,2);
});

test('species XP bonus is optional, added once, and must be a safe integer',async()=>{
  const {wizard,game}=await wizardFixture();
  wizard.data.selected.species={system:{startingXP:100}};
  wizard.data.grants.bonus.xp=10;wizard.data.purchases.xp.skills.push({cost:5});
  assert.deepEqual({...wizard.calcXp()},{total:110,available:105});
  game.modules.set(CORE,{api:{species:{wizardXPBonus:()=>15}}});
  assert.deepEqual({...wizard.calcXp()},{total:125,available:120});
  assert.deepEqual({...wizard.calcXp()},{total:125,available:120});
  for(const bonus of [NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){
    game.modules.get(CORE).api.species.wizardXPBonus=()=>bonus;
    assert.throws(()=>wizard.calcXp(),/Invalid species wizard XP bonus/);
  }
});

test('species preflight can stop final creation before an actor or socket request is created',async()=>{
  const {wizard,game,events}=await wizardFixture({validateWizard:async()=>false});
  assert.equal(await wizard.createActorShim(),false);
  game.user.isGM=false;
  assert.equal(await wizard.createActorShim(),false);
  assert.deepEqual(events,[]);
});

test('a failed species synchronization leaves the wizard editable and records a blocked status',async()=>{
  const error=Error('choices unavailable');
  const {wizard,actor,errors}=await wizardFixture({syncWizardSpecies:async()=>{throw error;}});
  const result=await wizard._syncWizardSpecies(actor);
  assert.equal(result.status,'blocked');assert.equal(result.error,error);
  assert.equal(wizard._steelersSpeciesStatus,result);assert.equal(errors.length,1);
});

test('species preview and final actor stay managed until synchronization has completed',async()=>{
  for(const status of ['ready','choices-required','blocked']){
    const f=await wizardFixture({syncWizardSpecies:async(wizard,actor)=>{assert.equal(actor.flags.speciesWizardManaged,true);f.events.push('sync');return {status};}});
    await f.wizard.showCharacterStatus(f.actor.id);
    assert.equal(f.wizard.tempActor,f.actor);assert.ok(f.events.indexOf('managed')<f.events.indexOf('sync'));
    f.events.length=0;
    const result=await f.wizard.createActor(f.actor.id);
    assert.ok(f.events.indexOf('managed')<f.events.indexOf('sync'));
    if(status==='ready'){
      assert.equal(f.actor.flags.speciesWizardManaged,undefined);
      assert.ok(f.events.indexOf('sync')<f.events.indexOf('earn'));
      assert.ok(f.events.indexOf('spend')<f.events.indexOf('unmanaged'));
      assert.equal(f.events.at(-1),'sheet-render');
    }else{
      assert.equal(result,false);assert.equal(f.actor.flags.speciesWizardManaged,true);
      assert.equal(f.events.includes('sheet-render'),false);assert.equal(f.events.includes('earn'),false);
      assert.equal(f.events.at(-1),'wizard-render');
    }
  }
});

test('creation preview and final sheet both receive paid trees and motivation documents',async()=>{
  const {wizard,actor}=await wizardFixture();
  const item=name=>({name,uuid:`Item.${name}`});
  wizard.data.selected.specialization=item('Primary');
  wizard.data.selected.motivations.push({item:item('Cause')});
  wizard.data.purchases.xp.specializations.push({item:item('Secondary'),cost:20});
  wizard.data.purchases.xp.forcePowers.push({item:item('Influence'),cost:10});
  const batches=[];
  actor.createEmbeddedDocuments=async(type,documents)=>{
    assert.equal(type,'Item');
    batches.push(Array.from(documents,document=>document.name));
  };
  await wizard.showCharacterStatus(actor.id);
  await wizard.createActor(actor.id);
  const expected=['Primary','Secondary','Influence','Cause'];
  assert.deepEqual(batches.filter(batch=>batch.length),[expected,expected]);
});

test('refunding a Force upgrade keeps other purchases and their XP costs',async()=>{
  const {wizard,context}=await wizardFixture();
  const power={name:'Influence',system:{upgrades:{upgrade0:{islearned:true}}},
    updateSource(changes){this.system.upgrades.upgrade0.islearned=changes['system.upgrades.upgrade0.islearned'];}};
  wizard.data.selected.species={system:{startingXP:100}};
  wizard.data.purchases.xp.forcePowers=[{item:power,cost:10}];
  wizard.data.purchases.xp.talents=[{specName:'Influence',key:'upgrade0',cost:5},{specName:'Healer',key:'talent1',cost:15}];
  wizard.showCharacterStatusShim=async()=>{};
  context.$=dataset=>({data:key=>dataset[key]});
  await wizard.handleForcePowerTalentPurchase({currentTarget:{target:'upgrade0',forcepower:'Influence',cost:5}});
  assert.equal(power.system.upgrades.upgrade0.islearned,false);
  assert.deepEqual(Array.from(wizard.data.purchases.xp.talents,purchase=>purchase.specName),['Healer']);
  assert.equal(wizard.calcXp().available,75);
});

test('only the initiating wizard processes an active GM reply once',async()=>{
  const {wizard,game}=await wizardFixture();
  game.user.id='player';
  game.users.activeGM={id:'gm'};
  const created=[];
  wizard.createActor=async id=>created.push(id);
  wizard._finalRequest='pending';
  wizard._wizardSession='session';
  const reply={eventType:'pcWizard',event:'createFinalActorResponse',recipient:'player',
    wizardId:'session',requestId:'pending',actorId:'final'};
  for(const [changes,author] of [[{recipient:'another'},'gm'],[{wizardId:'another'},'gm'],
    [{requestId:'stale'},'gm'],[{},'another'],[{},'gm'],[{},'gm']]){
    await wizard._wizardSocketHandler({...reply,...changes},author);
  }
  assert.deepEqual(created,['final']);
});

test('actor sheet supports absent NPC credits and still formats an existing large balance',async()=>{
  const source=await readFile(new URL('../../modules/actors/actor-sheet-ffg.js',import.meta.url),'utf8');
  const start=source.indexOf('        if (data.data.stats.credits');
  const end=source.indexOf('        data.data.enrichedBio',start);
  const format=vm.runInNewContext(`data=>{${source.slice(start,end)}return data;}`);
  assert.doesNotThrow(()=>format({data:{stats:{}}}));
  assert.equal(format({data:{stats:{credits:{value:1250}}}}).data.stats.credits.value,'1,250');
});

test('item creation guard registers once alongside module hooks and allows one minion species',async()=>{
  const source=await readFile(new URL('../../modules/actors/actor-sheet-ffg.js',import.meta.url),'utf8');
  const start=source.search(/    if \((?:Hooks\.events\.preCreateItem === undefined|!ActorSheetFFG.itemCreationGuardRegistered)\) \{/);
  const end=source.indexOf('    if (Hooks.events.preDeleteItem',start);
  const callbacks=[],warnings=[],Hooks={events:{preCreateItem:[()=>{}]},on:(event,fn)=>callbacks.push([event,fn])};
  const register=vm.runInNewContext(`(function(){${source.slice(start,end)}})`,{game:{i18n:await systemI18n('fr')},Hooks,ActorSheetFFG:class{},ui:{notifications:{warn:text=>warnings.push(text)}}});
  const sheet={position:{width:700,height:650}};register.call(sheet);register.call(sheet);
  assert.equal(callbacks.length,1);assert.equal(callbacks[0][0],'preCreateItem');
  const deleted=[],old={id:'old',type:'species',delete:()=>deleted.push('old')};
  const items=[old];items.get=id=>items.find(item=>item.id===id);
  const actor={type:'minion',items},item={id:'new',type:'species',isEmbedded:true,parent:{documentName:'Actor'},actor};
  assert.notEqual(callbacks[0][1](item),false);assert.deepEqual(deleted,['old']);
  item.type='career';assert.equal(callbacks[0][1](item),false);assert.equal(warnings.length,1);
});

test('combat modifier editor enables assignment for the selected scene token only',async()=>{
  const fields=new Map();
  const node=()=>({classList:{remove(){},add(){}},addEventListener(){},replaceChildren(){},
    querySelector(selector){if(!fields.has(selector))fields.set(selector,node());return fields.get(selector);}});
  const root=node();
  const token={uuid:'Scene.scene.Token.chosen',name:'Dodge',actor:{getFlag:()=>[]}};
  const context=vm.createContext({
    structuredClone,document:{createElement:()=>({firstElementChild:root})},
    canvas:{scene:{tokens:[token]}},
    Hooks:{on(){},callAll(){}},
    game:{i18n:await systemI18n('fr'),user:{isGM:true}}
  });
  const api=(await loadSystemModule('helpers/pilotage-mj.js',context)).namespace;
  const editor=api.createPilotageModifierEditor();
  editor.onSelect({token});
  assert.equal(editor.modifierEditor,root);
  assert.equal(fields.get('.pilotage-target-title').textContent,'Dodge');
  assert.equal(fields.get('[data-pilotage-assign]').disabled,false);
  editor.onSelect(null);
  assert.equal(fields.get('[data-pilotage-assign]').disabled,true);
});

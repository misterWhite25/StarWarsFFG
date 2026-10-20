import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function fixture({failure='posting',rollbackFailure=false,forward=false,externalAmmoChange=false}={}) {
 let forwarded;
 const notices=[],calls=[],effects=new Map(),once={_id:'once',system:{duration:'once'},toObject(){return {_id:this._id,system:structuredClone(this.system)};}};
 effects.set('once',once);
 const actor={uuid:'Actor.a',getEmbeddedCollection(){return {contents:[...effects.values()],get:id=>effects.get(id)};},
 async deleteEmbeddedDocuments(_type,ids){calls.push('effects-spent');for(const id of ids)effects.delete(id);},
 async createEmbeddedDocuments(_type,documents){calls.push('effects-restored');for(const data of documents)effects.set(data._id,{...data,toObject(){return structuredClone(data);}});}};
 const item={uuid:'Actor.a.Item.w',id:'w',type:'weapon',flags:{starwarsffg:{uuid:'Actor.a.Item.w'}},system:{ammo:{value:3}},
 getFlag(_scope,key){return key==='config.enableAmmo';},async update(data){this.system.ammo.value=data['system.ammo.value'];calls.push(`ammo-${this.system.ammo.value}`);}};
 const noop=()=>{};
 const exports={
 'dodge-reaction':{registerIncomingRoll:noop,unregisterIncomingRoll:noop,dodgePool:(_b,p)=>p,commitDodge:async()=>({}),rollbackDodge:async()=>calls.push('dodge-restored')},
 'pilotage-mj':{preparePilotage:noop,renderPilotageNotice:noop,pilotageTotals:()=>({boost:0,setback:0}),poolModifiers:()=>[],reservePilotage:async()=>{if(failure==='reserve')throw Error('reserve failed');return {entries:[]};},restorePilotage:async()=>{calls.push('pilotage-restored');if(rollbackFailure)throw Error('pilotage refund failed');}},
 'gm-difficulty':{effectivePool:p=>p,gmDifficulty:()=>({enabled:false}),NEGATIVE_DICE:[]},
 'skill-information-ui':{renderSkillInformation:noop},
 'weapon-selection':{matchingWeapons:()=>[item],replaceWeaponPool:noop,describeWeaponQuality:noop,hasAutoFire:()=>false,setAutoFirePool:noop,combatSkillKind:()=>null,combatModeForRoll:()=>null,rememberWeapon:noop},
 'combat-actions':{pendingAid:()=>[],consumeAid:async()=>calls.push('aid-spent'),restoreAid:async()=>calls.push('aid-restored')},
 'roll-talents':{selectedRollTalents:()=>[],rollTalentPool:p=>p,commitRollTalents:async()=>({selections:[],changes:[]}),rollbackRollTalents:async()=>calls.push('talents-restored'),renderRollTalents:async()=>{},talentWeaponSnapshot:i=>i,talentWeaponPreview:noop},
 'form-application':{FormApplicationV2:class {activateListeners(){}}},
 'monte-carlo':{MonteCarlo:class {}}
 };
 const context=vm.createContext({Hooks:{on:()=>1,off:noop},document:{createElement:()=>({})},CONFIG:{logger:{debug:noop,warn:noop}},
 foundry:{utils:{deepClone:structuredClone,fromUuid:async()=>item},applications:{ux:{TextEditor:{enrichHTML:async x=>x}}}},fromUuid:async uuid=>uuid===item.uuid?item:actor,
 ChatMessage:{getSpeaker:()=>({actor:'a'}),create:async data=>{forwarded=JSON.parse(JSON.stringify(data));calls.push('forwarded');}},ui:{notifications:{error:error=>notices.push(error)}},
 game:{user:{id:'gm',isGM:true},playlists:{contents:[]},users:{contents:[]},actors:{get:()=>actor},settings:{get:()=>false},i18n:{lang:'fr',localize:x=>x},ffg:{RollFFG:class {async toMessage(){calls.push('post');if(failure==='posting'){if(externalAmmoChange)item.system.ammo.value=1;throw Error('posting failed');}}}}}});
 const module=new vm.SourceTextModule(await readFile(new URL('../../modules/dice/roll-builder.js',import.meta.url),'utf8'),{context});
 await module.link(spec=>{const names=Object.keys(exports).find(key=>spec.includes(key)),values=exports[names];assert.ok(values,spec);return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});});await module.evaluate();
 context.$=value=>typeof value==='string'?[{}]:{html:()=>''};
 const app=new module.namespace.default({document:actor},{boost:0,renderDiceExpression:()=> '1dp',renderAdvancedPreview:noop},'Test','RangedLight',item);
 app._initializeInputs=noop;app._activateInputs=noop;app._activateFixedWeapon=noop;app._activateAutoFire=noop;app._activateCombatContext=noop;
 let click;
 const html={0:{prepend:noop,querySelector:()=>null},find:selector=>Object.assign({click:cb=>{if(selector==='.btn')click=cb;},on:noop},selector==='.user-selection'&&forward?{0:{value:'player'}}:{})};
 app.activateListeners(html);
 return {app,item,effects,calls,notices,click:()=>click({}),context,forwarded:()=>forwarded};
}

test('a failed publication restores ammunition and one-shot effects',async()=>{
 const f=await fixture();await f.click();
 assert.equal(f.item.system.ammo.value,3);assert.equal(f.effects.has('once'),true);
 assert.deepEqual(f.notices,['posting failed']);
});
test('a rejected Pilotage reservation does not consume ammunition or one-shot effects',async()=>{
 const f=await fixture({failure:'reserve'});await f.click();
 assert.equal(f.item.system.ammo.value,3);assert.equal(f.effects.has('once'),true);
 assert.deepEqual(f.notices,['reserve failed']);
});
test('one failing refund does not skip the other resources, talents or Dodge refunds',async()=>{
 const f=await fixture({rollbackFailure:true});await f.click();
 assert.equal(f.item.system.ammo.value,3);assert.equal(f.effects.has('once'),true);
 for(const step of ['aid-restored','talents-restored','dodge-restored'])assert.ok(f.calls.includes(step),step);
 assert.ok(f.notices.includes('pilotage refund failed'));assert.ok(f.notices.includes('posting failed'));
});
test('a successful publication spends one round and removes one-shot effects once',async()=>{
 const f=await fixture({failure:null});await f.click();
 assert.equal(f.item.system.ammo.value,2);assert.equal(f.effects.has('once'),false);
 assert.equal(f.calls.filter(step=>step==='post').length,1);assert.deepEqual(f.notices,[]);
});

test('forwarding a pool does not spend resources before the recipient rolls',async()=>{
 const f=await fixture({failure:null,forward:true});await f.click();
 assert.equal(f.item.system.ammo.value,3);assert.equal(f.effects.has('once'),true);
 assert.ok(f.calls.includes('forwarded'));assert.equal(f.calls.includes('post'),false);
 assert.deepEqual(f.notices,[]);
});
test('a later ammunition change is preserved while independent one-shot effects are restored',async()=>{
 const f=await fixture({externalAmmoChange:true});await f.click();
 assert.equal(f.item.system.ammo.value,1);assert.equal(f.effects.has('once'),true);
 assert.ok(f.notices.some(notice=>notice.includes('Les munitions ont changé')));
 assert.ok(f.calls.includes('talents-restored'));assert.ok(f.calls.includes('dodge-restored'));
});

test('a forwarded serialized roll resolves the exact actor and weapon when the recipient posts it',async()=>{
 const source=await fixture({failure:null,forward:true});await source.click();
 const forwarded=source.forwarded().flags.starwarsffg.roll;
 assert.equal(forwarded.data.documentUuid,'Actor.a');
 const recipient=await fixture({failure:null});recipient.app.roll=forwarded;
 delete recipient.app.roll.item.uuid;
 assert.equal(typeof recipient.app.roll.data.document.getEmbeddedCollection,'undefined');
 await recipient.app.getData();
 assert.equal(typeof recipient.app.roll.data.document.getEmbeddedCollection,'function');
 await recipient.click();assert.deepEqual(recipient.notices,[]);
 assert.equal(recipient.item.system.ammo.value,2);assert.equal(recipient.effects.has('once'),false);
});

test('a forwarded weapon moved into Possession is rejected without spending ammo or one-shot effects',async()=>{
 const f=await fixture({failure:null});f.item.flags.starwarsffg.inventoryLocation='possession';
 await f.click();assert.equal(f.item.system.ammo.value,3);assert.equal(f.effects.has('once'),true);
 assert.equal(f.calls.includes('post'),false);assert.ok(f.notices.some(notice=>notice.includes('Possession')));
});
test('empty ammunition is rejected before removing one-shot effects',async()=>{
 const f=await fixture({failure:null});f.item.system.ammo.value=0;
 await f.click();assert.equal(f.item.system.ammo.value,0);assert.equal(f.effects.has('once'),true);
 assert.equal(f.calls.includes('post'),false);assert.ok(f.notices.some(notice=>notice.includes('munitions')));
});

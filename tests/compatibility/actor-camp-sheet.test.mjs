import test from 'node:test';
import assert from 'node:assert/strict';
import {setActorCamp,campSourceActor,actorCampValue,renderActorCampField} from '../../modules/helpers/actor-camp-sheet.mjs';
import {usesAlliedDirectoryDefault} from '../../modules/helpers/directory-camps.mjs';
const set=(object,path,value)=>{const parts=path.split('.');let target=object;for(const part of parts.slice(0,-1))target=target[part]??={};target[parts.at(-1)]=value;};
function fixture({gm=true,pack=null}={}){
  const updates=[],actor={id:'a',uuid:'Actor.a',name:'Patch',type:'rival',pack,flags:{starwarsffg:{npcDirectory:false}},prototypeToken:{disposition:1},system:{stats:{wounds:{value:3,max:15}}},getFlag(scope,key){return this.flags[scope]?.[key];},async update(data){updates.push(data);for(const [path,value] of Object.entries(data))set(this,path,value);return this;}};
  const token=(id,actorId,disposition,override)=>({id,actorId,disposition,flags:{starwarsffg:{...(override===undefined?{}:{campOverride:override})}},getFlag(scope,key){return this.flags[scope]?.[key];}});
  const first=[token('one','a',1),token('two','a',-1,-1),token('other','b',-1)],second=[token('three','a',0)];
  const scene=tokens=>({tokens,async updateEmbeddedDocuments(type,changes){assert.equal(type,'Token');for(const change of changes){const doc=tokens.find(t=>t.id===change._id);for(const [path,value] of Object.entries(change))if(path!=='_id')set(doc,path,value);}return changes;}});
  globalThis.game={user:{isGM:gm},actors:new Map([['a',actor]]),scenes:[scene(first),scene(second)],combats:[]};
  globalThis.foundry={applications:{instances:new Map()}};globalThis.Hooks={callAll(){}};
  return {actor,updates,tokens:[...first,...second]};
}
test('the sheet saves a permanent choice and updates every current copy across scenes',async()=>{
  const f=fixture(),result=await setActorCamp(f.actor,0);
  assert.equal(actorCampValue(f.actor),0);assert.equal(f.actor.prototypeToken.disposition,0);assert.equal(f.actor.getFlag('starwarsffg','campOverride'),0);
  assert.equal(usesAlliedDirectoryDefault(f.actor),false);assert.equal(result.tokens,3);
  assert.ok(f.tokens.filter(t=>t.actorId==='a').every(t=>t.disposition===0&&t.getFlag('starwarsffg','campOverride')===0));
  assert.equal(f.tokens.find(t=>t.actorId==='b').disposition,-1);assert.deepEqual(f.actor.system.stats.wounds,{value:3,max:15});
});
test('opening a token sheet resolves the permanent setting to its source actor',async()=>{
  const f=fixture(),copy={id:'a',isToken:true,parent:{actorId:'a'}};assert.equal(campSourceActor(copy),f.actor);
  await setActorCamp(copy,-1);assert.equal(f.actor.prototypeToken.disposition,-1);assert.equal(f.actor.getFlag('starwarsffg','campOverride'),-1);
  assert.equal(campSourceActor({id:'gone',isToken:true,parent:{actorId:'gone'}}),null);
});
test('players and invalid choices cannot write a permanent camp',async()=>{
  let f=fixture({gm:false});await assert.rejects(setActorCamp(f.actor,-1),/Seul le MJ/);assert.equal(f.updates.length,0);
  f=fixture();for(const invalid of [-2,2,'1',NaN])await assert.rejects(setActorCamp(f.actor,invalid),/Allié, Neutre ou Ennemi/);assert.equal(f.updates.length,0);
});
test('editing a compendium actor never touches unrelated world copies sharing its id',async()=>{
  const f=fixture({pack:'source.npcs'});await setActorCamp(f.actor,-1);assert.equal(f.actor.prototypeToken.disposition,-1);assert.equal(f.tokens.find(t=>t.id==='one').disposition,1);
});
test('clicking an already selected default still pins that choice permanently',async()=>{
  const f=fixture();assert.equal(f.actor.getFlag('starwarsffg','campOverride'),undefined);await setActorCamp(f.actor,1);assert.equal(f.actor.getFlag('starwarsffg','campOverride'),1);
  assert.ok(f.tokens.filter(t=>t.actorId==='a').every(t=>t.disposition===1));
});
test('owned item sheets do not receive actor camp controls',()=>{
  renderActorCampField({document:{documentName:'Item'},actor:{type:'character'},element:{querySelector(){throw Error('Item sheet should not be queried');}}});
});

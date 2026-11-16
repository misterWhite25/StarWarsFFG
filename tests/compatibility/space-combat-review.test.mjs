import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';

async function boardFixture({integrated=false}={}) {
  const hooks=new Map(),user={id:'gm',isGM:true};
  const vehicle={id:'vehicle',type:'vehicle',flags:{starwarsffg:{crew:[{actor_id:'crew',role:'Pilot',integrated}]}}};
  const crew={id:'crew'},actors=new Map([['vehicle',vehicle],['crew',crew]]);
  const users=new Map([['gm',user],['other',{id:'other',isGM:false}]]);users.activeGM=user;
  let state={round:1,ships:[{id:'ship',actorId:'vehicle',version:0,combat:{reservations:{reserved:{rollId:'roll',userId:'gm',actorId:'crew'}}}}]};
  const context=vm.createContext({structuredClone,console,game:{actors,users,user,settings:{get:()=>state,set:async(_scope,_key,next)=>{state=next;}}},
    Hooks:{once(){},on:(name,callback)=>hooks.set(name,callback)}});
  const board=(await loadSystemModule('space-combat/board.mjs',context,{
    'space-combat/encounter.mjs':{prepareSpaceEncounter:async()=>null},
    'helpers/integrated-crew.mjs':{resolveCrewActor:member=>actors.get(member?.actor_id)},
    'helpers/vehicle-token-artwork.mjs':{vehicleTokenArtwork:value=>value},
    'space-combat/scene-document.mjs':{ensureCombatScene:async()=>null,registerCombatScene(){}},
    'space-combat/combat-engine.mjs':{executeCombat(){},commitCombatUpdates(){},rollbackCombatUpdates(){}},
    'space-combat/initiative.mjs':{initiativeStamp:()=>null,initiativeContext:()=>({}),synchronizeInitiative:value=>value}
  })).namespace;
  board.registerBoard(()=>{},error=>{throw error;});
  async function publish({speaker=integrated?'vehicle':'crew',author='gm',rollId='roll'}={}) {
    hooks.get('createChatMessage')({author:{id:author},speaker:{actor:speaker},rolls:[{data:{name:'Pilotage',flags:{starwarsffg:{spaceCombatRoll:{shipId:'ship',crewId:'crew',rollId}}}},ffg:{success:2,advantage:1,threat:0}}]},null,author);
    // Wait for the same serialized queue used by the chat hook.
    await board.command('scene');
    return state.ships[0];
  }
  return {publish};
}

test('spatial roll receipts finalize ordinary characters and integrated NPC vehicle speakers',async()=>{
  for(const integrated of [false,true]) {
    const ship=await (await boardFixture({integrated})).publish();
    assert.equal(ship.combat.reservations.reserved,undefined);
    assert.equal(ship.combat.lastRoll.actorId,'crew');
    assert.equal(ship.combat.lastRoll.success,2);
    assert.equal(ship.version,1);
  }
});

test('spatial roll receipts reject another speaker, author or roll identifier',async()=>{
  for(const integrated of [false,true])for(const message of [{speaker:'unrelated'},{author:'other'},{rollId:'another'}]) {
    const ship=await (await boardFixture({integrated})).publish(message);
    assert.ok(ship.combat.reservations.reserved);
    assert.equal(ship.combat.lastRoll,undefined);
    assert.equal(ship.version,0);
  }
});

test('maneuver cost reads match the mutable turn model without cloning ship history',async()=>{
  let clones=0;
  const context=vm.createContext({structuredClone:value=>{clones++;return structuredClone(value);}});
  const rules=(await loadSystemModule('space-combat/combat-rules.mjs',context)).namespace;
  const cases=[];
  for(const silhouette of [3,5])for(const maneuvers of [0,1,2])for(const ended of [false,true])for(const pilotManeuvers of [0,1,2])for(const currentRound of [1,2]) {
    cases.push({silhouette,combat:{turns:{crew:{round:currentRound,maneuvers,action:true,ended}},pilotManeuvers}});
  }
  cases.push({silhouette:3});
  for(const ship of cases) {
    const original=JSON.stringify(ship);
    const expectedTurn=rules.turnState(structuredClone(ship),'crew',1);
    for(const pilot of [false,true]) {
      const limit=rules.pilotManeuverLimit(ship),cost=rules.maneuverCost(ship,'crew',1,pilot);
      assert.equal(cost.personal,expectedTurn.maneuvers===1?2:0);
      assert.equal(cost.system,pilot&&limit>1&&(ship.combat?.pilotManeuvers??0)===1?2:0);
      assert.equal(cost.available,!expectedTurn.ended&&expectedTurn.maneuvers<2&&(!pilot||(ship.combat?.pilotManeuvers??0)<limit));
    }
    assert.equal(JSON.stringify(ship),original);
  }
  assert.equal(clones,0);
});

class PlotNode {
  constructor(tag='node'){this.tag=tag;this.localName=tag;this.children=[];this.attributes={};this.listeners=new Map();this.dataset={};this.style={};this.isConnected=true;this.renders=0;this.captured=new Set();this.classList={toggle(){}};}
  append(...children){for(const node of children){if(node.parent)node.remove();node.parent=this;this.children.push(node);}}
  setAttribute(key,value){this.attributes[key]=String(value);if(key==='viewBox')this.renders++;}
  getAttribute(key){return this.attributes[key]??null;}
  getAttributeNames(){return Object.keys(this.attributes);}
  removeAttribute(key){delete this.attributes[key];}
  set textContent(value){this._text=value;this.children=[];}
  get textContent(){return this._text??'';}
  insertBefore(node,before){const index=before?this.children.indexOf(before):-1;if(node.parent)node.remove();node.parent=this;if(index<0)this.children.push(node);else this.children.splice(index,0,node);}
  replaceChild(node,previous){const index=this.children.indexOf(previous);node.parent=this;this.children[index]=node;previous.parent=null;}
  remove(){if(this.parent){const index=this.parent.children.indexOf(this);if(index>=0)this.parent.children.splice(index,1);this.parent=null;}}
  replaceChildren(...children){this.children=[];this.append(...children);}
  getBoundingClientRect(){return {left:0,top:0,width:800,height:500};}
  addEventListener(type,callback,{signal}={}){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push({callback,signal});}
  dispatch(type,values={}){const event={target:this,button:0,pointerId:1,clientX:400,clientY:250,preventDefault(){},stopPropagation(){},...values};for(const listener of this.listeners.get(type)??[])if(!listener.signal?.aborted)listener.callback(event);}
  contains(){return false;}
  closest(){return null;}
  querySelector(selector){for(const child of this.children){if(child.localName===selector)return child;const found=child.querySelector(selector);if(found)return found;}return null;}
  querySelectorAll(){return [];}
  setPointerCapture(id){this.captured.add(id);}
  hasPointerCapture(id){return this.captured.has(id);}
  releasePointerCapture(id){this.captured.delete(id);}
}

async function plotFixture(options={}) {
  const frames=new Map(),cameras=[],moves=[];let nextFrame=0;
  const svg=new PlotNode('svg'),doc=new PlotNode('document');
  doc.createElementNS=(_namespace,tag)=>new PlotNode(tag);doc.createDocumentFragment=()=>new PlotNode('fragment');
  const context=vm.createContext({document:doc,AbortController,game:{actors:new Map()},
    requestAnimationFrame:callback=>{frames.set(++nextFrame,callback);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id)});
  const {drawPlot}=(await loadSystemModule('space-combat/plot.mjs',context)).namespace;
  const dispose=drawPlot(svg,{ships:[],camera:{x:0,y:0,width:24},onCamera:value=>cameras.push(value),onMove:(...value)=>moves.push(value),...options});
  return {svg,dispose,cameras,moves,frames,flush(){const pending=[...frames.values()];frames.clear();for(const callback of pending)callback();}};
}

test('space plot batches wheel events per animation frame while preserving the latest local camera',async()=>{
  const f=await plotFixture();
  assert.equal(f.svg.renders,1);
  for(let i=0;i<40;i++)f.svg.dispatch('wheel',{deltaY:-5,deltaMode:0});
  assert.equal(f.frames.size,1);
  assert.equal(f.svg.renders,1);
  assert.equal(f.cameras.length,40);
  assert.ok(Math.abs(f.cameras.at(-1).width-24*Math.exp(-.0075*40))<1e-10);
  f.flush();
  assert.equal(f.svg.renders,2);
  assert.equal(f.frames.size,0);
  f.dispose();
});

test('space plot batches pan moves and records the final local camera on release',async()=>{
  const f=await plotFixture();
  f.svg.dispatch('pointerdown');
  for(let x=410;x<=500;x+=10)f.svg.dispatch('pointermove',{clientX:x});
  assert.equal(f.svg.renders,1);
  assert.equal(f.frames.size,1);
  f.svg.dispatch('pointerup',{clientX:500});
  assert.equal(f.cameras.length,1);
  assert.equal(f.cameras[0].x,-3);
  assert.equal(f.cameras[0].width,24);
  assert.equal(f.moves.length,0);
  f.flush();assert.equal(f.svg.renders,2);
  f.dispose();
});

test('space plot commits the snapped ship drag once and renders the committed input immediately',async()=>{
  const ship={id:'ship',x:0,y:0,z:0,heading:90,speed:2,silhouette:3,destination:{x:0,y:0}};
  const f=await plotFixture({ships:[ship],canReposition:true});
  const target={closest:selector=>selector==='[data-ship]'?{dataset:{ship:'ship'}}:null};
  f.svg.dispatch('pointerdown',{target});
  for(let x=410;x<=500;x+=10)f.svg.dispatch('pointermove',{clientX:x});
  assert.equal(f.svg.renders,1);
  assert.equal(f.frames.size,1);
  f.svg.dispatch('pointerup',{clientX:500});
  assert.equal(f.frames.size,0);
  assert.equal(f.svg.renders,2);
  assert.equal(f.moves.length,1);
  assert.equal(f.moves[0][0],'ship');
  assert.equal(f.moves[0][1].x,3);
  assert.equal(f.cameras.length,0);
  f.dispose();
});

test('cancelling or disposing a space plot cancels pending frames and pointer capture',async()=>{
  const f=await plotFixture();
  f.svg.dispatch('pointerdown');f.svg.dispatch('pointermove',{clientX:500});
  f.svg.dispatch('pointercancel');
  assert.equal(f.frames.size,0);
  assert.equal(f.svg.captured.size,0);
  assert.equal(f.cameras.length,0);
  const renders=f.svg.renders;
  f.svg.dispatch('wheel',{deltaY:5,deltaMode:0});
  assert.equal(f.frames.size,1);
  f.dispose();
  assert.equal(f.frames.size,0);
  f.flush();assert.equal(f.svg.renders,renders);
  f.svg.dispatch('wheel',{deltaY:5,deltaMode:0});
  assert.equal(f.frames.size,0);
});

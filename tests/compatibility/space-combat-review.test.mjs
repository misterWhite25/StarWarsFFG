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
  let clones = 0;
  const context=vm.createContext({structuredClone:value=>{clones++;return structuredClone(value);},console,game:{actors,users,user,settings:{get:()=>state,set:async(_scope,_key,next)=>{state=next;}}},
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
  return {publish, hooks, get clones() { return clones; }};
}

test('ground initiative updates do not copy the idle spatial board', async () => {
  const fixture = await boardFixture();
  await fixture.hooks.get('updateCombat')();
  assert.equal(fixture.clones, 0);
});

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

test('GM and map barrages use the selected battery and send targeted fire to the roll builder', async () => {
  const member = {actor_id: 'gunner'}, weapon = {id: 'battery'};
  const ship = {id: 'ship', actorId: 'vehicle', version: 4};
  const vehicle = {items: new Map([[weapon.id, weapon]])};
  const choice = {crewId: member.actor_id, weaponId: weapon.id, barrageArc: 'fore', barrageCount: 2};
  let selection, calls = [];
  const context = vm.createContext({
    Hooks: {on() {}}, game: {actors: new Map([[ship.actorId, vehicle]])},
    document: {createElement: () => ({style: {}, append() {}})},
    foundry: {applications: {api: {DialogV2: {wait: async () => selection}}}}
  });
  const {performBarrage} = (await loadSystemModule('space-combat/barrage-dialog.mjs', context, {
    'space-combat/board.mjs': {board: () => ({ships: [ship]}), command: (...args) => calls.push(args)},
    'space-combat/combat-rolls.mjs': {openCombatRoll: (...args) => calls.push(args)},
    'helpers/crew.js': {crewStationWeapons() {}},
    'space-combat/crew-access.mjs': {crewActor: () => ({name: 'Gunner'})}
  })).namespace;
  for (const id of ['blanketBarrage', 'concentratedBarrage', 'overwhelmingBarrage']) {
    const target = id !== 'blanketBarrage';
    selection = target ? {...choice, targetId: 'target', sector: 'aft'} : choice;
    calls = [];
    assert.equal(await performBarrage(ship, {id, target}, [member], 2), selection.targetId);
    assert.equal(calls.length, 1);
    if (target) {
      const [current, crew, options] = calls[0];
      assert.equal(current, ship);
      assert.equal(crew, member);
      assert.equal(options.weapon, weapon);
      assert.deepEqual({...options.barrage}, {id, ...selection});
      assert.equal(options.terrain, 2);
    } else {
      assert.deepEqual({...calls[0][1]}, {shipId: ship.id, version: ship.version, combatAction: id, terrain: 2, ...choice});
    }
  }
  selection = null;
  calls = [];
  await performBarrage(ship, {id: 'blanketBarrage'}, [member]);
  assert.equal(calls.length, 0);
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

async function plotFixture(options={}, globals={}) {
  const frames=new Map(),cameras=[],moves=[];let nextFrame=0;
  const svg=new PlotNode('svg'),doc=new PlotNode('document');
  doc.createElementNS=(_namespace,tag)=>new PlotNode(tag);doc.createDocumentFragment=()=>new PlotNode('fragment');
  const context=vm.createContext({document:doc,AbortController,game:{actors:new Map()},
    requestAnimationFrame:callback=>{frames.set(++nextFrame,callback);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id), ...globals});
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

test('space range overlays read each weapon range once and preserve the inventory order for every target', async () => {
  const {shipRanges} = (await loadSystemModule('space-combat/ranges.mjs', vm.createContext({}))).namespace;
  const origin = {id:'source', x:0, y:0};
  const fleet = [origin, ...Array.from({length:30}, (_, i) => ({id:String(i), x:i, y:0}))];
  let reads = 0;
  const weapon = (name, range) => ({
    name, type:'shipweapon', system:{range:{get value() { reads++; return range; }}}
  });
  const vehicle = {items:[
    weapon('Turret', 'Short'), weapon('Laser', 'EXTREME'), weapon('Turret', 'long'),
    weapon('Unspecified', ''), {name:'Cargo', type:'shipattachment'}
  ]};
  const result = shipRanges(origin, fleet, vehicle);
  assert.equal(reads, 4);
  assert.equal(result.maximum, 4);
  assert.equal(result.targets.length, 30);
  for (const target of result.targets) {
    const expected = target.distance < 5 ? ['Turret','Laser','Turret'] : target.distance < 20 ? ['Laser','Turret'] : ['Laser'];
    assert.deepEqual([...target.weapons], expected);
    assert.equal(target.inRange, true);
  }
  const unarmed = shipRanges(origin, fleet, {items:[weapon('Missing', null)]});
  assert.equal(unarmed.maximum, -1);
  assert.equal(unarmed.weaponRange, null);
  assert.ok(unarmed.targets.every(target => !target.inRange && target.weapons.length === 0));
});

test('space map shares number formatters across a fleet and refreshes both precisions on a language change', async () => {
  const formats = [];
  class CountedNumberFormat extends Intl.NumberFormat {
    constructor(language, options) {
      super(language, options);
      formats.push([language, options.maximumFractionDigits]);
    }
  }
  const ships = Array.from({length:12}, (_, i) => ({
    id:String(i), name:'Ship ' + i, x:i, y:i, heading:45, speed:1.5, silhouette:3
  }));
  const game = {i18n:{lang:'en'}, actors:new Map()};
  const f = await plotFixture({ships, rangeShipId:'0'}, {Intl:{NumberFormat:CountedNumberFormat}, game});
  const titles = node => [node.localName === 'title' ? node.textContent : '', ...node.children.flatMap(titles)];
  assert.deepEqual(formats, [['en',1],['en',3]]);
  assert.ok(titles(f.svg).some(text => text.includes('1.414 u.')));
  for (const width of [20, 30]) {
    f.dispose.view({width});
    f.flush();
  }
  assert.equal(formats.length, 2);
  game.i18n.lang = 'fr';
  f.dispose.view({width:24});
  f.flush();
  assert.deepEqual(formats, [['en',1],['en',3],['fr',1],['fr',3]]);
  assert.ok(titles(f.svg).some(text => text.includes('1,414 u.')));
  f.dispose();
});

test('world document changes only inspect the fleet while the space map is visible or rendering', async () => {
  const hooks = new Map(), frames = new Set();
  const board = {round:0, encounterId:'encounter', ships:[{actorId:'vehicle'}]};
  const vehicle = {id:'vehicle', flags:{starwarsffg:{crew:[{actor_id:'pilot'}]}}};
  let boardReads = 0, window, session;
  class ApplicationV2 {
    static RENDER_STATES = {RENDERING:1};
    constructor() { window = this; }
    render() { this.rendered = true; }
    close() { this.rendered = false; }
  }
  const context = vm.createContext({
    foundry:{applications:{api:{ApplicationV2}}}, document:{querySelector:() => null},
    game:{user:{isGM:false}, actors:new Map([[vehicle.id,vehicle]])},
    Hooks:{once() {}, on:(name, callback) => hooks.set(name, callback)},
    requestAnimationFrame:callback => { frames.add(callback); return callback; },
    cancelAnimationFrame:callback => frames.delete(callback)
  });
  await loadSystemModule('space-combat/application.mjs', context, {
    'space-combat/board.mjs':{board:() => { boardReads++; return board; }, command() {}, registerBoard() {}, shipAppearance() {}},
    'space-combat/combat-card.mjs':{combatCard() {}},
    'helpers/integrated-crew.mjs':{resolveCrewActor() {}},
    'space-combat/sharing.mjs':{registerSharing:function(callbacks) { session = callbacks; return {}; }},
    'space-combat/scene-view.mjs':{enterCombatScene() {}, leaveCombatScene() {}, hasCombatSceneReturn() {}}
  });
  const notify = () => {
    hooks.get('updateActor')({id:'pilot'});
    hooks.get('updateItem')({parent:{id:'pilot'}});
    hooks.get('updateCombat')({id:'encounter'});
  };
  notify();
  assert.equal(boardReads, 0);
  await session.show();
  boardReads = 0;
  hooks.get('updateActor')({id:'unrelated'});
  assert.equal(frames.size, 0);
  window.rendered = false;
  window.state = ApplicationV2.RENDER_STATES.RENDERING;
  notify();
  assert.equal(boardReads, 4);
  assert.equal(frames.size, 1);
  window.rendered = true;
  window.state = 2;
  await session.hide();
  boardReads = 0;
  notify();
  assert.equal(boardReads, 0);
  assert.equal(frames.size, 0);
});

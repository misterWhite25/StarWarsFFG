import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tokenArtworkEntries,legacyTokenArtworkEntries} from '../../modules/helpers/token-artwork-catalogue.mjs';
import {vehicleTokenArtwork,resolveLegacyTokenArtwork,registerVehicleTokenArtwork} from '../../modules/helpers/vehicle-token-artwork.mjs';

test('all 450 historical system token URLs resolve to stable compendium destinations',()=>{
  assert.equal(legacyTokenArtworkEntries.length,450);
  assert.equal(new Set(legacyTokenArtworkEntries.map(([source])=>source)).size,450);
  for(const [source,destination] of legacyTokenArtworkEntries){
    assert.match(source,/^systems\/starwarsffg\/images\/(actor-tokens|refreshed-tokens|ship-tokens)\//);
    assert.match(destination,/^modules\/swffg-compendium-bilingual-steelers-(adversaries|starships_and_speeders)\/assets\//);
    assert.equal(vehicleTokenArtwork(source),destination);
    assert.equal(resolveLegacyTokenArtwork(source),destination);
    assert.equal(vehicleTokenArtwork(encodeURIComponent(source)),destination);
    assert.equal(resolveLegacyTokenArtwork(encodeURIComponent(source)),destination);
    assert.equal(vehicleTokenArtwork(destination),destination);
    assert.equal(resolveLegacyTokenArtwork(destination),destination);
  }
  assert.equal(legacyTokenArtworkEntries.filter(([,target])=>target.includes('-adversaries/')).length,80);
  assert.equal(legacyTokenArtworkEntries.filter(([,target])=>target.includes('-starships_and_speeders/')).length,370);
});

test('portrait aliases, French URI encoding and the TieAce alias chain resolve transitively',()=>{
  const ace='assets/Star Wars/Compendium/NPCs/Humanoïdes/TieAce.png';
  const pilot='assets/Star Wars/Compendium/NPCs/Humanoïdes/imperial_pilot.png';
  const expected=vehicleTokenArtwork(pilot);
  assert.match(expected,/^modules\/swffg-compendium-bilingual-steelers-adversaries\/assets\/tokens\/legacy\//);
  assert.equal(vehicleTokenArtwork(ace),expected);
  assert.equal(vehicleTokenArtwork(encodeURI(ace)),expected);
  assert.equal(vehicleTokenArtwork(encodeURI(pilot)),expected);
  for(const [source] of tokenArtworkEntries){
    const target=vehicleTokenArtwork(source);
    assert.match(target,/^modules\/swffg-compendium-bilingual-steelers-/);
    assert.equal(vehicleTokenArtwork(target),target);
    assert.equal(vehicleTokenArtwork(decodeURIComponent(source)),target);
  }
});

test('portrait-only legacy resolution preserves normal portraits and unrelated custom images',()=>{
  for(const [portrait] of tokenArtworkEntries)assert.equal(resolveLegacyTokenArtwork(portrait),portrait);
  for(const custom of ['custom/portrait.webp','modules/custom/token.webp','malformed/%E0%A4%A.png','icons/svg/mystery-man.svg']){
    assert.equal(vehicleTokenArtwork(custom),custom);
    assert.equal(resolveLegacyTokenArtwork(custom),custom);
  }
  for(const custom of [null,undefined,{},42]){
    assert.equal(vehicleTokenArtwork(custom),custom);
    assert.equal(resolveLegacyTokenArtwork(custom),custom);
  }
});

test('derived Actor, Token and chat images redirect without source updates or normal portrait conversion',()=>{
  const previous={CONFIG:globalThis.CONFIG,game:globalThis.game,Hooks:globalThis.Hooks};
  const hooks=new Map(),[legacy,destination]=legacyTokenArtworkEntries[0],portrait=tokenArtworkEntries[0][0];
  class ActorBase{
    constructor(image){this.img=image;this._source=Object.freeze({img:image});this.type='vehicle';this.documentName='Actor';this.prepared=0;}
    prepareDerivedData(){this.prepared++;}
    update(){assert.fail('Actor source must not be written');}
    updateSource(){assert.fail('Actor source must not be written');}
  }
  class TokenBase{
    constructor(image,parent){this.texture={src:image};this._source=Object.freeze({texture:Object.freeze({src:image})});this.parent=parent;this.prepared=0;}
    prepareDerivedData(){this.prepared++;}
    update(){assert.fail('Token source must not be written');}
    updateSource(){assert.fail('Token source must not be written');}
  }
  try{
    globalThis.CONFIG={Actor:{documentClass:ActorBase},Token:{documentClass:TokenBase}};
    globalThis.game={settings:{get:()=>false},actors:new Map()};
    globalThis.Hooks={on:(name,callback)=>{assert.ok(!hooks.has(name));hooks.set(name,callback);}};
    registerVehicleTokenArtwork();
    const ActorClass=CONFIG.Actor.documentClass,TokenClass=CONFIG.Token.documentClass;
    registerVehicleTokenArtwork();
    assert.equal(CONFIG.Actor.documentClass,ActorClass);assert.equal(CONFIG.Token.documentClass,TokenClass);
    const actor=new ActorClass(legacy);actor.prepareDerivedData();
    assert.equal(actor.img,destination);assert.equal(actor._source.img,legacy);assert.equal(actor.prepared,1);
    const normal=new ActorClass(portrait);normal.prepareDerivedData();
    assert.equal(normal.img,portrait);assert.equal(normal._source.img,portrait);
    const token=new TokenClass(legacy,actor);token.prepareDerivedData();
    assert.equal(token.texture.src,destination);assert.equal(token._source.texture.src,legacy);assert.equal(token.prepared,1);
    const portraitToken=new TokenClass(portrait,normal);portraitToken.prepareDerivedData();
    assert.equal(portraitToken.texture.src,vehicleTokenArtwork(portrait));
    for(const type of ['vehicle','character','homestead']){
      const sceneActor={id:'world-'+type,type};game.actors.set(sceneActor.id,sceneActor);
      const sceneToken=new TokenClass(portrait,{documentName:'Scene'});sceneToken.actorId=sceneActor.id;sceneToken.prepareDerivedData();
      assert.equal(sceneToken.texture.src,type==='homestead'?portrait:vehicleTokenArtwork(portrait));
      assert.equal(sceneToken._source.texture.src,portrait);
      const legacySceneToken=new TokenClass(legacy,{documentName:'Scene'});legacySceneToken.actorId=sceneActor.id;legacySceneToken.prepareDerivedData();
      assert.equal(legacySceneToken.texture.src,destination);assert.equal(legacySceneToken._source.texture.src,legacy);
    }
    const saved={content:'<img src="'+legacy+'">'};
    const images=[legacy,portrait,'custom/chat.webp'].map(source=>({source,getAttribute(){return this.source;},setAttribute(_name,value){this.source=value;}}));
    hooks.get('renderChatMessageHTML')(saved,{querySelectorAll:selector=>{assert.equal(selector,'img[src]');return images;}});
    assert.equal(images[0].source,destination);assert.equal(images[1].source,portrait);assert.equal(images[2].source,'custom/chat.webp');
    assert.equal(saved.content,'<img src="'+legacy+'">');
  }finally{for(const [key,value] of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});

test('artwork compatibility is registered before the generic-initiative conditional',()=>{
  const main=readFileSync(new URL('../../modules/swffg-main.js',import.meta.url),'utf8');
  const registration=main.indexOf('\n  registerVehicleTokenArtwork();');
  assert.ok(registration>main.indexOf('CONFIG.Actor.documentClass = ActorFFG;'));
  assert.ok(registration<main.indexOf('if (game.settings.get("starwarsffg", "useGenericSlots"))',registration));
  assert.equal(main.match(/registerVehicleTokenArtwork\(\);/g)?.length,1);
});

test('renamed starships URLs remain usable with both module generations',()=>{
  const old='swffg-compendium-bilingual-steelers-starship_and_speeders',current='swffg-compendium-bilingual-steelers-starships_and_speeders';
  const portrait='modules/'+current+'/starfighters-shuttles/183109796751056f.webp';
  const previous=globalThis.game;
  try{
    globalThis.game={modules:new Map([[current,{}]])};
    assert.equal(resolveLegacyTokenArtwork(portrait.replace(current,old)),portrait);
    assert.equal(vehicleTokenArtwork(portrait.replace(current,old)),vehicleTokenArtwork(portrait));
    const expected=vehicleTokenArtwork(portrait);
    globalThis.game={modules:new Map([[old,{}]])};
    assert.equal(vehicleTokenArtwork(portrait),expected.replace(current,old));
    assert.equal(resolveLegacyTokenArtwork(portrait),portrait.replace(current,old));
  }finally{if(previous===undefined)delete globalThis.game;else globalThis.game=previous;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../../modules/combat-ffg.js',import.meta.url),'utf8');
// Execute the real DOM method without Foundry's unrelated initiative classes.
const method=source.split('  _renderTalentMarkers() {')[1].split('\n  /**')[0];
const code='(function(){'+method.slice(0,method.lastIndexOf('  }'))+'})';
function fixture(){
 let markers=[];
 const npc={talentList:[{name:'Adversaire <test>',isRanked:true,rank:2}],items:new Map(),testUserPermission:()=>false};
 const player={...npc,testUserPermission:()=>true};
 const empty={...npc,talentList:[]};
 const tool={...npc,talentList:[{name:'Outil',itemId:'tool'},{name:'Increase a characteristic'}],items:new Map([['tool',{flags:{starwarsffg:{characteristicIncrease:{creationTool:true}}}}]])};
 const rows=['npc','player','empty','tool','missing'].map(id=>({dataset:{combatantId:id,altId:'player'},querySelector:()=>({append(marker){markers.push(marker);}})}));
 const game={user:{isGM:true},users:{contents:[{isGM:false}]}};
 const document={createElement:()=>({setAttribute(key,value){this[key]=value;},remove(){markers=markers.filter(marker=>marker!==this);}})};
 const context=vm.createContext({game,document});
 const render=vm.runInContext(code,context);
 const tracker={element:{querySelectorAll:selector=>{if(selector==='.ffg-combat-talent-marker')return [...markers];assert.equal(selector,'li.combatant.claimed[data-combatant-id]');return rows;}},viewed:{combatants:new Map([['npc',{actor:npc}],['player',{actor:player}],['empty',{actor:empty}],['tool',{actor:tool}]])}};
 return {game,npc,rows,tracker,markers:()=>markers,render:()=>render.call(tracker)};
}
test('GM sees acquired NPC talents and ranks, excluding PJ, empty actors and creation tools',()=>{
 const f=fixture();f.render();assert.equal(f.markers().length,1);
 assert.equal(f.markers()[0].title,'Talents : Adversaire <test> (rang 2)');
 assert.equal(f.markers()[0]['aria-label'],f.markers()[0].title);
 f.render();assert.equal(f.markers().length,1);
 f.npc.talentList=[];f.render();assert.equal(f.markers().length,0);
});
test('initiative marker follows the actual claimant, with original roller fallback before combat only',()=>{
 const f=fixture();f.rows[0].dataset.combatantId='';f.rows[0].dataset.altId='npc';
 f.tracker.viewed.started=false;f.render();assert.equal(f.markers().length,1);
 f.tracker.viewed.started=true;f.render();assert.equal(f.markers().length,0);
 f.rows[0].dataset.combatantId='player';f.render();assert.equal(f.markers().length,0);
 f.rows[0].dataset.combatantId='npc';f.rows[0].dataset.altId='player';f.render();assert.equal(f.markers().length,1);
});
test('talent markers are removed for a non-GM',()=>{
 const f=fixture();f.render();f.game.user.isGM=false;f.render();assert.equal(f.markers().length,0);
});

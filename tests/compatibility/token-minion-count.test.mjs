import {linkWithSystemLocalization} from '../load-system-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const root=new URL('../../modules/helpers/',import.meta.url);
class Container{
 constructor(){this.children=[];this.position={set(){}};}
 addChild(child){this.children.push(child);return child;}
 removeChild(child){this.children=this.children.filter(c=>c!==child);}
 removeChildren(){return this.children.splice(0);}
 destroy(){this.destroyed=true;}
}
class Graphics extends Container{lineStyle(){}beginFill(color){this.color=color;}drawRoundedRect(){}endFill(){}}
class Text extends Container{constructor(text){super();this.text=text;this.anchor={set(){}};}}
async function load(){
 const state={enabled:true},context=vm.createContext({PIXI:{Container,Graphics,Text},game:{settings:{get:()=>state.enabled}}});
 const code=await fs.readFile(new URL('token.js',root),'utf8');
 const mod=new vm.SourceTextModule(code,{context});
 await linkWithSystemLocalization(mod, context, async spec=>{
  const file=new URL(spec,root);
  const dep=new vm.SourceTextModule(await fs.readFile(file,'utf8'),{context});await linkWithSystemLocalization(dep, context, ()=>{});return dep;
 });await mod.evaluate();return {draw:mod.namespace.drawMinionCount,state};
}
const vehicle=(count=3,damage=0)=>({type:'vehicle',flags:{starwarsffg:{vehicleMinionGroup:{enabled:true,count}}},system:{stats:{hullTrauma:{max:6,value:damage}}}});
const token=actor=>Object.assign(new Container(),{actor,w:100,h:100});
test('vehicles use hull survivors and share the terrestrial minion markers',async()=>{
 const {draw}=await load(),t=token(vehicle());draw(t);assert.equal(t.minionCount.children.length,3);
 assert(t.minionCount.children.every(c=>c.color==='0x00A2E84D'));
 t.actor.system.stats.hullTrauma.value=7;draw(t);assert.deepEqual(t.minionCount.children.map(c=>c.color),['0x00A2E84D','0x00A2E84D','0x8800154D']);
 t.actor.system.stats.hullTrauma.value=19;draw(t);assert(t.minionCount.children.every(c=>c.color==='0x8800154D'));
 const terrestrial=token({type:'minion',system:{quantity:{max:3,value:2}}});draw(terrestrial);
 assert.deepEqual(terrestrial.minionCount.children.map(c=>c.color),['0x00A2E84D','0x00A2E84D','0x8800154D']);
});
test('effectives belong to each token actor and ordinary vehicles have no count',async()=>{
 const {draw,state}=await load(),a=token(vehicle(2)),b=token(vehicle(4));draw(a);draw(b);
 assert.equal(a.minionCount.children.length,2);assert.equal(b.minionCount.children.length,4);
 a.actor.flags.starwarsffg.vehicleMinionGroup.enabled=false;const old=a.minionCount;draw(a);assert(old.destroyed);assert.equal(a.minionCount,null);assert.equal(a.children.length,0);
 assert.equal(b.minionCount.children.length,4);state.enabled=false;draw(b);assert.equal(b.minionCount,null);assert.equal(b.children.length,0);
});

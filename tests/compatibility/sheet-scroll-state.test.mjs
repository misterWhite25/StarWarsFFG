import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../modules/actors/actor-sheet-ffg-v2.js',import.meta.url),'utf8');
const methods=source.slice(source.indexOf('  _preSyncPartState('),source.indexOf('  async _renderFrame('));
class NativeSync {
 async _renderHTML(){return this.result;}
 _preSyncPartState(_id,_next,_prior,state){state.scrollPositions=[];}
 _syncPartState(_id,next,_prior,state){for(const [selector,top,left] of state.scrollPositions){const el=selector?next.querySelector(selector):next;if(el){el.scrollTop=top;el.scrollLeft=left;}}}
}
const Sheet=vm.runInNewContext(`(class extends NativeSync {${methods}})`,{NativeSync,CSS:{escape:s=>s},hasSummaryTalents:()=>false,showTalentSummary(){},showEquipmentSummary(){},document:{createElement:tag=>({tag,dataset:{},setAttribute(){},append(){},addEventListener(){}})}});
function view(){
 const tabs=['characteristics','items','talents'].map(tab=>({dataset:{tab},active:tab==='items',scrollTop:tab==='items'?446:0,scrollLeft:0}));
 for(const node of tabs){let top=node.scrollTop;Object.defineProperty(node,'scrollTop',{get:()=>top,set:value=>{top=node.active?value:0;}});node.classList={toggle(_name,on){node.active=on;}};}
 const body={scrollTop:0,scrollLeft:0},header={scrollTop:19,scrollLeft:0};
 return {tabs,scrollTop:138,scrollLeft:0,querySelectorAll:s=>s.includes('.tab')?tabs:[],querySelector:s=>s==='.sheet-body'?body:s==='.header-description-block'?header:tabs.find(n=>s===`.tab[data-tab="${n.dataset.tab}"]`)};
}
test('equipment tab is visible before scroll restoration, including root window scroll',()=>{
 const sheet=new Sheet();sheet._sheetTab='items';const prior=view(),next=view(),state={};
 sheet._preSyncPartState('sheet',next,prior,state);
 for(const tab of next.tabs){tab.active=false;tab.scrollTop=0;}
 next.scrollTop=0;
 sheet._syncPartState('sheet',next,prior,state);
 assert.equal(next.scrollTop,138);assert.equal(next.tabs[1].scrollTop,446);assert(next.tabs[1].active);assert(!next.tabs[0].active);
 assert.equal(next.querySelector('.header-description-block').scrollTop,19);
});
test('root template replacement preserves state even when prior and next root are the same element',()=>{
 const sheet=new Sheet();sheet._sheetTab='items';const root=view(),state={};sheet._preSyncPartState('sheet',root,root,state);
 root.scrollTop=0;root.tabs[1].active=false;root.tabs[1].scrollTop=0;
 sheet._syncPartState('sheet',root,root,state);
 assert.equal(root.scrollTop,138);assert.equal(root.tabs[1].scrollTop,446);
});

test('all three shortcuts and the selected tab are ready before rendered HTML is inserted',async()=>{
 const sheet=new Sheet();sheet.actor={type:'character'};sheet._sheetTab='items';
 const tabs=['characteristics','items'].map(name=>({dataset:{tab:name},classList:{toggle(_class,value){this.active=value;}}}));
 const buttons=[];
 const sidebar={querySelectorAll:()=>[],append:button=>buttons.push(button)};
 const element={querySelector:selector=>selector==='.sheet-tabs'?sidebar:tabs[0],querySelectorAll:()=>tabs};
 sheet.result={sheet:element};
 assert.equal(await sheet._renderHTML({},{}),sheet.result);
 assert.equal(buttons.length,3);
 assert(!tabs[0].classList.active);assert(tabs[1].classList.active);
});

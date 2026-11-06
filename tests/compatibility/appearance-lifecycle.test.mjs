import {loadSystemModule} from '../load-system-module.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
function classes(){const values=new Set();return {add(...v){v.forEach(x=>values.add(x));},remove(...v){v.forEach(x=>values.delete(x));},contains:v=>values.has(v),toggle(v,on){on?values.add(v):values.delete(v);}};}
async function load(kind){const frame={classList:classes(),querySelector:()=>({classList:classes()})};class Base{constructor(options){this.document=options.document;this.actor=options.document;this.item=options.document;this.position=new Proxy({width:550,height:650,top:undefined,left:undefined},{set(t,k,v){if((k==='top'||k==='left')&&v===undefined)return false;t[k]=v;return true;}});this.options={};}async _renderFrame(){return frame;}async _postRender(){}setPosition(p){this.position={...this.position,...p};this.positionedWhilePending=this.element.classList.contains('ffg-sheet-pending');}}
 class Legacy{async getData(){this.position.width=850;this.position.height=1005;return {type:kind};}}
 const name=kind==='actor'?'Actor':'Item',context=vm.createContext({window:{innerWidth:1600,innerHeight:1000},foundry:{applications:{sheets:{[name+'SheetV2']:Base},api:{HandlebarsApplicationMixin:x=>x}}}});
 const directory = kind === 'actor' ? 'actors' : 'items';
 const entry = directory + '/' + kind + '-sheet-ffg';
 const m = await loadSystemModule(entry + '-v2.js', context, {
   [entry + '.js']: {[name + 'SheetFFG']: Legacy}
 });
 return {Class:m.namespace[name+'SheetFFGV2'],frame};}
for(const kind of ['actor','item']){
 test(`${kind}: prepare context does not mutate live dimensions, initial size and explicit width are retained`,async()=>{const {Class}=await load(kind),app=new Class({document:{type:kind==='actor'?'character':'specialization',flags:{}}}),before={...app.position},options={position:{width:1120}};await app._prepareContext(options);assert.deepEqual(app.position,before);assert.equal(options.position.width,1120);assert.equal(options.position.height,1005);app.position={width:1210,height:910};const rerender={};await app._prepareContext(rerender);assert.deepEqual(app.position,{width:1210,height:910});assert.equal(rerender.position,undefined);const first=new Class({document:{type:kind==='actor'?'character':'specialization',flags:{}}});const defaults={position:{...Class.DEFAULT_OPTIONS.position}};await first._prepareContext(defaults);assert.equal(defaults.position.width,850);assert.equal(defaults.position.height,1005);});
 test(`${kind}: frame is staged before insertion and revealed after position is set`,async()=>{const {Class,frame}=await load(kind),app=new Class({document:{type:kind==='actor'?'vehicle':'specialization',flags:{}}});app.element=await app._renderFrame({isFirstRender:true});assert.equal(frame.classList.contains('ffg-sheet-pending'),true);await app._postRender({}, {isFirstRender:true,position:{width:900,height:800}});assert.equal(app.positionedWhilePending,true);assert.equal(frame.classList.contains('ffg-sheet-pending'),false);assert.equal(app.position.width,900);});
}
test('System windows inherit the native theme; adapters strip old forced classes',()=>{for(const path of ['modules/applications/form-application-v2.js','modules/applications/legacy-dialog-v2.js']){const s=fs.readFileSync(root+path,'utf8');assert.match(s,/filter\(c => !\["theme-dark", "theme-light"\]\.includes\(c\)\)/);assert.doesNotMatch(s,/, "themed", "theme-light"/);}const main=fs.readFileSync(root+'modules/swffg-main.js','utf8');assert.ok(main.indexOf('styles/v14-sheets.css')>main.indexOf('styles/mandar.css'));});
test('Palette follows application theme, stages only first sheet frames and never inverts images',()=>{const css=fs.readFileSync(root+'styles/v14-sheets.css','utf8');assert.match(css,/body\.theme-dark \.application\.starwarsffg/);assert.match(css,/ffg-sheet-pending \{visibility:hidden;pointer-events:none/);assert.doesNotMatch(css,/filter:\s*invert/);assert.match(css,/--ffg-ink:#e5eaf0/);});

test('a failed legacy render restores the sheet dimensions and lets the next render choose its size', async () => {
  const {prepareLegacySheetContext} = (await loadSystemModule('applications/legacy-sheet-layout.js',vm.createContext({}))).namespace;
  const sheet = {position:{width:710,height:650},constructor:{DEFAULT_OPTIONS:{position:{width:710,height:650}}}};
  const options = {};
  await assert.rejects(() => prepareLegacySheetContext(sheet,options,async function () {
    this.position.width = 980;
    throw Error('template unavailable');
  }), /template unavailable/);
  assert.deepEqual(sheet.position,{width:710,height:650});
  assert.equal(sheet._ffgInitialSizeApplied, undefined);
  assert.equal(options.position, undefined);
});

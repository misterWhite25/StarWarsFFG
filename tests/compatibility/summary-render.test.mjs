import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSummary,summaryDialog,cancelSummaryRenders} from '../../modules/helpers/summary-render.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
test('concurrent openings share one operation',async()=>{
  const owner={actor:{}},gate=deferred();let calls=0,commits=0;
  const render=async current=>{calls++;await gate.promise;if(current())commits++;};
  const first=renderSummary(owner,'popup',false,render),second=renderSummary(owner,'popup',false,render);
  assert.equal(first,second);gate.resolve();await Promise.all([first,second]);assert.equal(calls,1);assert.equal(commits,1);
});
test('closing or replacing a popup during enrichment prevents a late reopening',async()=>{
  for(const replace of [false,true]){
    const original={rendered:true},owner={actor:{},popup:original},gate=deferred();let commits=0;
    const pending=renderSummary(owner,'popup',true,async current=>{await gate.promise;if(current())commits++;});
    if(replace)owner.popup={rendered:true};else original.rendered=false;
    gate.resolve();await pending;assert.equal(commits,0);
  }
});
test('late results never overwrite a more recent refresh',async()=>{
  const owner={actor:{},popup:{rendered:true}},old=deferred(),recent=deferred(),committed=[];
  const first=renderSummary(owner,'popup',true,async current=>{await old.promise;if(current())committed.push('old');});
  const second=renderSummary(owner,'popup',true,async current=>{await recent.promise;if(current())committed.push('new');});
  recent.resolve();await second;old.resolve();await first;assert.deepEqual(committed,['new']);
});
test('an old completion cannot erase a newer pending request after the previous generation finishes',async()=>{
  const owner={actor:{},popup:{rendered:true}},old=deferred(),recent=deferred(),opening=deferred();
  const first=renderSummary(owner,'popup',true,async()=>old.promise);
  const second=renderSummary(owner,'popup',true,async()=>recent.promise);recent.resolve();await second;
  const third=renderSummary(owner,'popup',false,async()=>opening.promise);old.resolve();await first;
  const fourth=renderSummary(owner,'popup',false,()=>assert.fail('Duplicate opening'));
  assert.equal(third,fourth);opening.resolve();await third;
});
test('failed enrichment allows retry, and changed actors discard old data',async()=>{
  const owner={actor:{}};await assert.rejects(renderSummary(owner,'popup',false,async()=>{throw Error('Enrichment failed');}),/Enrichment failed/);
  let applied=false;await renderSummary(owner,'popup',false,async current=>{owner.actor={};applied=current();});assert.equal(applied,false);
  await renderSummary(owner,'popup',false,async current=>{applied=current();});assert.equal(applied,true);
});
test('dialog updates preserve the live content node without writing immutable native options',async()=>{
  const previous=globalThis.foundry;let inserted;
  class NativeDialog{
    constructor(config){this.options=Object.freeze(config);}
    _replaceHTML(result,content){content.nativeResult=result;}
    async render(){this.rendered=true;}
    async close(){this.rendered=false;}
  }
  globalThis.foundry={applications:{api:{DialogV2:NativeDialog}}};
  try{
    const scroller={scrollTop:0,scrollLeft:0},detail={dataset:{summaryKey:'quality'},open:false};
    const first={listener:()=>true,querySelector:()=>({scrollTop:75,scrollLeft:4}),querySelectorAll:()=>[{dataset:{summaryKey:'quality'}}]};
    const second={listener:()=>false,querySelector:()=>scroller,querySelectorAll:()=>[detail]},dialog=summaryDialog({content:first});
    assert.equal(dialog.summaryContent,first);await dialog.setContent(second);assert.equal(dialog.summaryContent,second);assert.equal(dialog.options.content,'<span></span>');
    const host={querySelector:()=>({replaceChildren:node=>inserted=node})};dialog._replaceHTML('form',host,{});
    assert.equal(host.nativeResult,'form');assert.equal(inserted,second);assert.equal(inserted.listener(),false);
    assert.equal(scroller.scrollTop,75);assert.equal(scroller.scrollLeft,4);assert.equal(detail.open,true);
  }finally{globalThis.foundry=previous;}
});

test('cancelling an unfinished opening prevents a stale popup without cancelling a newer opening',async()=>{
  const owner={actor:{}},old=deferred(),fresh=deferred(),commits=[];
  const first=renderSummary(owner,'popup',false,async current=>{await old.promise;if(current())commits.push('old');});
  cancelSummaryRenders(owner);
  const second=renderSummary(owner,'popup',false,async current=>{await fresh.promise;if(current())commits.push('new');});
  old.resolve();await first;
  assert.equal(renderSummary(owner,'popup',false,()=>assert.fail('Duplicate operation')),second);
  fresh.resolve();await second;assert.deepEqual(commits,['new']);
});
test('refreshing an open summary replaces only its body and keeps the window and handlers',async()=>{
  const scroller={scrollTop:0,scrollLeft:0},previous={querySelector:()=>({scrollTop:42,scrollLeft:3}),querySelectorAll:()=>[]},next={querySelector:()=>scroller,querySelectorAll:()=>[]};
  const dialog=summaryDialog({content:previous});let inserted;
  dialog.rendered=true;dialog.element={querySelector:()=>({replaceChildren:content=>inserted=content})};
  dialog.render=()=>assert.fail('Full dialog render');
  await dialog.setContent(next);assert.equal(inserted,next);assert.equal(dialog.summaryContent,next);assert.equal(scroller.scrollTop,42);assert.equal(scroller.scrollLeft,3);
  await dialog.close();assert.equal(dialog.summaryContent,null);
});

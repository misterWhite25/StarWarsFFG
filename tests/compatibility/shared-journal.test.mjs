import {systemI18n} from '../system-i18n.mjs';
const frI18n=await systemI18n('fr');
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';

async function fixture(){
  const hooks=new Map(),buttons=[
    {dataset:{action:'nextPage'},disabled:false},
    {dataset:{action:'previousPage'},disabled:true},
    {dataset:{action:'toggleMode'},disabled:false}
  ];
  const input={},caption={},label={nextElementSibling:null,querySelector:selector=>selector==='input'?input:caption};
  const footer={before(){}},root={addEventListener(){},querySelector:selector=>selector==='.ffg-journal-sharing'?label:footer,querySelectorAll:()=>buttons};
  label.nextElementSibling=footer;
  const entry={uuid:'JournalEntry.entry',_source:{ownership:{default:2}},pages:new Map()};
  const page={id:'1234567890abcdef',parent:entry,_source:{ownership:{default:2}}};entry.pages.set(page.id,page);
  const app={element:root,document:entry,pageId:page.id};
  let navigating=false;
  const state={open:true,view:{uuid:entry.uuid,pageId:page.id},navigatorId:'responsible'};
  const session={state,canNavigate:()=>navigating,start:async()=>{}};
  const context=vm.createContext({Hooks:{on:(name,callback)=>hooks.set(name,callback),once:(name,callback)=>hooks.set(name,callback)},
    game:{i18n:frI18n,user:{id:'reader',isGM:false},users:{get:()=>({name:'Responsable'})}},
    CONST:{DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,INHERIT:-1,OBSERVER:2}},console,
    ui:{notifications:{warn(){}}}});
  await loadSystemModule('helpers/shared-journal.mjs',context,{
    'helpers/shared-window-session.mjs':{createSharedWindowSession:()=>session},
    'helpers/shared-window-controls.mjs':{renderSharedWindowControls(){}}
  });
  await hooks.get('ready')();
  return {buttons,session,state,render:()=>hooks.get('renderJournalEntrySheet')(app),setNavigator:value=>{navigating=value;}};
}

test('journal handoff restores native navigation states for the new responsible participant',async()=>{
  const f=await fixture();f.render();
  assert.deepEqual(f.buttons.map(button=>button.disabled),[true,true,true]);
  f.setNavigator(true);f.render();
  assert.deepEqual(f.buttons.map(button=>button.disabled),[false,true,true]);
  f.state.open=false;f.render();
  assert.deepEqual(f.buttons.map(button=>button.disabled),[false,true,false]);
});

test('repeated follower renders retain the original disabled state',async()=>{
  const f=await fixture();f.render();f.render();f.render();
  f.setNavigator(true);f.render();f.render();
  assert.deepEqual(f.buttons.map(button=>button.disabled),[false,true,true]);
  f.setNavigator(false);f.render();f.state.open=false;f.render();
  assert.deepEqual(f.buttons.map(button=>button.disabled),[false,true,false]);
});

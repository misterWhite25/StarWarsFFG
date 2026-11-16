import {systemI18n} from '../system-i18n.mjs';
const frI18n=await systemI18n('fr');
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {loadSystemModule} from '../load-system-module.mjs';

async function fixture(t, options={}) {
  const callbacks=new Map(),writes=[],states=[],errors=[];
  let hookId=0,requestId=0;
  const Hooks={
    on(name,callback){const id=++hookId;callbacks.set(id,{name,callback});return id;},
    off(_name,id){callbacks.delete(id);},
    call(name,...args){for(const hook of [...callbacks.values()])if(hook.name===name)hook.callback(...args);}
  };
  const users=['gm','player'].map((id,index)=>({id,name:id,active:true,isGM:index===0,flags:{},
    getFlag(scope,key){return this.flags[scope]?.[key];},
    async setFlag(scope,key,value){
      writes.push({userId:this.id,key,value:structuredClone(value)});
      this.flags[scope]??={};this.flags[scope][key]=structuredClone(value);
      Hooks.call('updateUser',this,{flags:{[scope]:{[key]:value}}},{},game.user.id);
    }
  }));
  users.get=id=>users.find(user=>user.id===id);
  Object.defineProperty(users,'activeGM',{get:()=>users.find(user=>user.active&&user.isGM)});
  const game={users,user:users[0],i18n:frI18n};
  const context=vm.createContext({game,Hooks,structuredClone,setTimeout,clearTimeout,foundry:{utils:{randomID:()=>`request${++requestId}`}}});
  const api=(await loadSystemModule('helpers/shared-window-session.mjs',context)).namespace;
  const session=api.createSharedWindowSession({scope:'test',stateKey:'state',requestKey:'request',
    onState:state=>states.push(structuredClone(state)),onError:error=>errors.push(error),...options});
  t.after(()=>session.destroy());
  return {session,game,Hooks,callbacks,writes,states,errors,users};
}

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

test('destroy rejects queued and future requests without writing new commands',async t=>{
  const f=await fixture(t);
  const first=f.session.request('open'),second=f.session.request('open');
  const firstRejected=assert.rejects(first,/Session fermée/),secondRejected=assert.rejects(second,/Session fermée/);
  f.session.destroy();
  await Promise.all([firstRejected,secondRejected]);
  await assert.rejects(f.session.request('open'),/Session fermée/);
  await f.session.start();await f.session.modeChanged();
  assert.equal(f.writes.length,0);assert.equal(f.states.length,0);assert.equal(f.callbacks.size,0);
});

test('destroy cancels a pending command and prevents a late validation from committing',async t=>{
  const validation=deferred();
  const f=await fixture(t,{validateRequest:()=>validation.promise});
  await f.session.start();
  const command=f.session.request('open'),rejected=assert.rejects(command,/Session fermée/);
  await nextTurn();
  assert.equal(f.writes.filter(write=>write.key==='request').length,1);
  const states=f.states.length;
  f.session.destroy();await rejected;
  validation.resolve();await nextTurn();
  assert.equal(f.writes.filter(write=>write.key==='state').length,0);
  assert.equal(f.states.length,states);assert.equal(f.session.canNavigate(),false);
});

test('destroy clears a scheduled navigation and blocks late document notifications',async t=>{
  const f=await fixture(t);await f.session.start();await f.session.request('open');
  assert.equal(f.session.canNavigate(),true);
  f.session.publishView({from:'Coruscant'});
  const writes=f.writes.length,states=f.states.length;
  f.session.destroy();f.session.publishView({from:'Tatooine'});
  f.Hooks.call('updateUser',f.game.user,{flags:{test:{state:{revision:99}}}},{},f.game.user.id);
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.equal(f.writes.length,writes);assert.equal(f.states.length,states);assert.equal(f.session.canNavigate(),false);
});

test('synchronous state callback errors use onError without rejecting session startup',async t=>{
  const error=Error('render failed');
  const f=await fixture(t,{onState(){throw error;}});
  await f.session.start();
  assert.deepEqual(f.errors,[error]);
});

test('authenticated requests support navigation, GM handoff and closing',async t=>{
  const f=await fixture(t);await f.session.start();
  const opened=await f.session.request('open');
  assert.equal(opened.open,true);assert.equal(opened.navigatorId,'gm');
  await f.session.request('navigate',{view:{from:'Coruscant',camera:{zoom:99,cx:-1,cy:99999},discarded:true}});
  assert.equal(f.session.state.view.from,'Coruscant');assert.equal(f.session.state.view.camera.zoom,12);
  assert.equal(f.session.state.view.camera.cx,0);assert.equal(f.session.state.view.camera.cy,3260);
  assert.equal(f.session.state.view.discarded,undefined);
  await f.session.request('handoff',{target:'player'});
  assert.equal(f.session.state.navigatorId,'player');assert.equal(f.session.canNavigate(),false);
  await f.session.request('close');assert.equal(f.session.state.open,false);assert.equal(f.errors.length,0);
});

test('a forged command author cannot open a session',async t=>{
  const f=await fixture(t);await f.session.start();
  const player=f.users[1];
  player.flags.test={request:{id:'forged',authorityId:'gm',action:'open',modeId:'initial'}};
  f.Hooks.call('updateUser',player,{flags:{test:{request:player.flags.test.request}}},{},'another-user');
  await nextTurn();
  assert.equal(f.session.state.open,false);assert.equal(f.writes.length,0);
});

test('a replacement authority retains a legitimate player-written no-GM session',async t=>{
  const f=await fixture(t);
  f.users[0].isGM=false;
  f.users[1].flags.test={state:{revision:7,open:true,sessionId:'existing',navigatorId:'player',writerId:'player',view:{from:'Coruscant'}}};
  await f.session.start();
  assert.equal(f.session.state.open,true);assert.equal(f.session.state.sessionId,'existing');
  assert.equal(f.session.state.navigatorId,'player');assert.equal(f.session.state.writerId,'gm');
  assert.equal(f.session.state.revision,8);
  f.users[1].active=false;f.Hooks.call('userConnected');await nextTurn();
  assert.equal(f.session.state.navigatorId,'gm');assert.equal(f.session.state.open,true);
});

test('a GM can preassign the map navigator without opening the map',async t=>{
  const f=await fixture(t,{allowClosedHandoff:true});await f.session.start();
  await f.session.request('handoff',{target:'player'});
  assert.equal(f.session.state.open,false);assert.equal(f.session.state.navigatorId,'player');assert.equal(f.session.canNavigate(),false);
  await f.session.request('open');assert.equal(f.session.state.navigatorId,'player');assert.equal(f.session.state.open,true);
  await f.session.request('close');await f.session.request('handoff',{target:'gm'});assert.equal(f.session.state.open,false);
  await f.session.request('open');assert.equal(f.session.state.navigatorId,'gm');assert.equal(f.session.canNavigate(),true);
});
test('other shared tools still reject handoff before the session is open',async t=>{
  const f=await fixture(t);await f.session.start();await assert.rejects(f.session.request('handoff',{target:'player'}),/terminée/);assert.equal(f.session.state.navigatorId,null);
});
test('an inactive target and a player cannot preassign the map owner',async t=>{
  const f=await fixture(t,{allowClosedHandoff:true});await f.session.start();
  const player=f.users[1],command={id:'player-handoff',action:'handoff',target:'player',authorityId:'gm',sessionId:null,modeId:'initial'};
  player.flags.test={request:command};f.Hooks.call('updateUser',player,{flags:{test:{request:command}}},{},player.id);await nextTurn();
  assert.equal(f.session.state.navigatorId,null);assert.equal(f.session.state.open,false);
  player.active=false;await assert.rejects(f.session.request('handoff',{target:'player'}),/terminée/);assert.equal(f.session.state.navigatorId,null);
});
test('a stale session cannot change the navigator after the map closes',async t=>{
  const f=await fixture(t,{allowClosedHandoff:true});await f.session.start();await f.session.request('open');await f.session.request('close');
  const before=f.session.state.navigatorId,command={id:'stale-handoff',action:'handoff',target:'player',authorityId:'gm',sessionId:'obsolete',modeId:'initial'};
  f.users[0].flags.test.request=command;f.Hooks.call('updateUser',f.users[0],{flags:{test:{request:command}}},{},'gm');await nextTurn();
  assert.equal(f.session.state.navigatorId,before);assert.equal(f.session.state.open,false);
});

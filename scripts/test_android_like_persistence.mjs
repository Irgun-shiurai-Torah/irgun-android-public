import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync('src/main.js','utf8');
const start=source.indexOf('function bindLikeButtons(');
const toggle=source.indexOf('async function toggleLike(',start);
const end=source.indexOf('async function toggleWatchLater(',toggle);
assert.ok(start>0&&toggle>start&&end>toggle,'Exercise real Like code, not a mock replacement');
const code=source.slice(start,toggle)+'\n'+source.slice(toggle,end)+
  '\nthis.bindLikeButtons=bindLikeButtons;this.toggleLike=toggleLike;this.pendingLikeMutations=pendingLikeMutations;';

function fixture({initial=false,request}={}) {
  const events={requests:[],ui:0,alert:null,history:0};
  const state={user:{id:'qa'},myLikes:new Set(initial?['lecture']:[]),likeCounts:{lecture:initial?1:0},watchVideo:{id:'lecture'},screen:'shiurim',librarySection:'all'};
  const context={state,Set,console,
    preserveWatchTime:async()=>{events.history++;},
    requireLogin:()=>{throw Error('Should remain authenticated');},
    refreshInteractiveUi:()=>{events.ui++;},
    refreshLikeCounts:async()=>({}),
    render:()=>{},
    alert:error=>{events.alert=error;},
    apiJson:async(path,opts)=>{
      assert.equal(path,'/like');
      assert.equal(JSON.parse(opts.body).videoId,'lecture');
      events.requests.push(path);
      return request?request():{liked:!initial};
    }
  };
  runInNewContext(code,context);
  return {state,events,...context};
}
function button() {
  const handlers=[];
  const el={dataset:{like:'lecture'},addEventListener:(type,handler)=>{
    assert.equal(type,'click');handlers.push(handler);
  },fire:()=>Promise.all(handlers.map(fn=>fn({stopPropagation(){}})))};
  return {el,handlers};
}
test('persistent watch Like binds once even when the page and result list bind repeatedly',async()=>{
  const f=fixture();const {el,handlers}=button();
  const root={querySelectorAll:()=>[el]};
  f.bindLikeButtons(root);
  f.bindLikeButtons(root);
  f.bindLikeButtons(root);
  assert.equal(handlers.length,1,'One physical tap must have exactly one click handler');
  await el.fire();
  assert.equal(f.events.requests.length,1,'A single Like tap must issue exactly one server toggle');
  assert.equal(f.state.myLikes.has('lecture'),true);
  assert.notEqual(el.dataset.likeBusy,'1','The UI must become usable after the server response');
});
test('two buttons for the same lecture cannot race toggle the server twice',async()=>{
  let finish;
  const request=()=>new Promise(resolve=>{finish=resolve;});
  const f=fixture({request}),first=button(),second=button();
  f.bindLikeButtons({querySelectorAll:()=>[first.el,second.el]});
  const a=first.el.fire(),b=second.el.fire();
  // The two asynchronous preserve-time reads must settle before either POST.
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(f.events.requests.length,1,'Two rapid buttons must share one logical mutation');
  assert.equal(f.state.myLikes.has('lecture'),true,'Optimistic UI should show one pending Like');
  finish({liked:true});await Promise.all([a,b]);
  assert.equal(f.state.myLikes.has('lecture'),true,'Server-confirmed state must remain liked');
  assert.equal(f.pendingLikeMutations.size,0,'No stuck Like busy state');
});
test('server response is authoritative even if it differs from optimistic state',async()=>{
  const f=fixture({request:async()=>({liked:false})});
  await f.toggleLike('lecture');
  assert.equal(f.state.myLikes.has('lecture'),false);
  assert.equal(f.events.requests.length,1);
  assert.equal(f.pendingLikeMutations.size,0);
});
test('failed Like request restores previous state, then permits a real retry',async()=>{
  let fail=true;
  const f=fixture({initial:true,request:async()=>{
    if(fail)throw Error('Network unavailable');
    return {liked:false};
  }});
  await f.toggleLike('lecture');
  assert.equal(f.state.myLikes.has('lecture'),true,'Failed unlike must roll back');
  assert.equal(f.pendingLikeMutations.size,0);
  fail=false;await f.toggleLike('lecture');
  assert.equal(f.state.myLikes.has('lecture'),false);
  assert.equal(f.events.requests.length,2);
});

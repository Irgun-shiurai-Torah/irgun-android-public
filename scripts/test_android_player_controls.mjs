import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {bindAndroidPlayerSheetInteractions,preserveAndroidPlayerSheetScroll} from '../src/android-player-controls.js';

const app=readFileSync('src/main.js','utf8');
const start=app.indexOf('function refreshAndroidPlayerSpeedChoices()');
const end=app.indexOf('\nfunction bind()',start);
assert.ok(start>0&&end>start);
assert.match(app.slice(end),/bindPlayerSpeedChoices\(\);/);
assert.match(app,/androidPlayerSheetRenderGate\.shouldDefer\(\)/);
assert.match(app,/restorePlayerSheetScroll\(\);/);
function speedFixture(platform='android',reject=false){
 const state={playbackSpeed:1},sheet={scrollTop:300},calls=[];
 const buttons=[1.25,1.5,2].map(rate=>({dataset:{speedChoice:String(rate)},active:false,
  classList:{toggle(_,active){this.owner.active=active;}},addEventListener(_,fn){this.click=fn;}}));
 for(const b of buttons)b.classList.owner=b;
 const context={state,Capacitor:{getPlatform:()=>platform},document:{querySelectorAll:()=>buttons},
  PlaybackController:{setSpeed:async rate=>{calls.push(rate);if(reject)throw new Error('Native command failed');state.playbackSpeed=rate;}},
  render:()=>{sheet.scrollTop=0;calls.push('render');}};
 runInNewContext(app.slice(start,end)+'\nbindPlayerSpeedChoices();',context);
 return {state,sheet,calls,buttons};
}
test('actual Android speed handlers retain the scrolled buttons across 2x to 1.5x',async()=>{
 const f=speedFixture();
 await f.buttons[2].click();await f.buttons[1].click();
 assert.deepEqual(f.calls,[2,1.5]);assert.equal(f.state.playbackSpeed,1.5);
 assert.equal(f.sheet.scrollTop,300);assert.equal(f.buttons[1].active,true);assert.equal(f.buttons[2].active,false);
});
test('an Android speed command failure preserves its settings and actual selected rate',async()=>{
 const f=speedFixture('android',true);await f.buttons[1].click();
 assert.deepEqual(f.calls,[1.5]);assert.equal(f.state.playbackSpeed,1);assert.equal(f.sheet.scrollTop,300);
});
test('the existing iOS speed handler behavior remains unchanged',async()=>{
 const f=speedFixture('ios');await f.buttons[1].click();
 assert.deepEqual(f.calls,[1.5,'render']);assert.equal(f.sheet.scrollTop,0);
});
function gateFixture(android=true){
 const handlers={},viewHandlers={},timers=new Map();let seq=0,renders=0,gate;
 const document={addEventListener:(name,fn)=>{handlers[name]=fn;}};
 const view={addEventListener:(name,fn)=>{viewHandlers[name]=fn;}};
 const render=()=>{if(!gate.shouldDefer())renders++;};
 gate=bindAndroidPlayerSheetInteractions({document,view,isAndroid:()=>android,render,
  schedule:(fn,ms)=>{assert.equal(ms,100);timers.set(++seq,fn);return seq;},cancel:id=>timers.delete(id)});
 const down=id=>handlers.pointerdown({pointerId:id,target:{closest:()=>({})}});
 const flush=async()=>{for(const fn of [...timers.values()])fn();timers.clear();await Promise.resolve();};
 return {gate,handlers,viewHandlers,timers,render,down,flush,get renders(){return renders;}};
}
test('background renders coalesce and keep a real sheet touch alive through pointerup and click',async()=>{
 const f=gateFixture();f.down(1);f.render();f.render();
 f.handlers.pointerup({pointerId:1});f.render();assert.equal(f.renders,0);
 await f.flush();assert.equal(f.renders,1);
});
test('closing Audio renders Video immediately before its persistent host consumes the overlay',()=>{
 const renderStart=app.indexOf('function render() {');
 const renderEnd=app.indexOf('\n\nfunction syncOpenFilterChecks',renderStart);
 const state={playerOpen:true,screen:'shiurim',current:{kind:'video-audio',id:'one'},watchVideo:{id:'one'},watchMode:'audio'};
 const target={innerHTML:'audio sheet'};let binds=0,deferrals=0;
 const context={state,app:target,syncAndroidVideoDisplay(){},tabSwipeRenderGate:{shouldDefer:()=>false},
  androidPlayerSheetRenderGate:{shouldDefer:()=>{deferrals++;return true;}},
  document:{activeElement:null},usageAnalytics:{setScreen:()=>{}},analyticsScreenLabel:()=>'',
  shiurimHtml:()=>'',preserveAuthFormDraft:()=>()=>{},preserveHomeSearchDraft:()=>()=>{},
  preserveAndroidPlayerSheetScroll:()=>()=>{},Capacitor:{getPlatform:()=> 'android'},
  shell:()=>state.watchMode==='video'?'video overlay with native anchor':'audio sheet',
  playlistPickerHtml:()=>'',bind:()=>{binds++;},syncLivePlaybackAnalytics:()=>{},
  updatePlayerUi:()=>{},refreshOfflineButtonsForKey:()=>{},initWatchVimeo:()=>{},setTimeout:()=>{}};
 runInNewContext(app.slice(renderStart,renderEnd)+'\nrender();',context);
 assert.equal(binds,0);assert.equal(deferrals,1);assert.equal(target.innerHTML,'audio sheet');
 state.playerOpen=false;state.watchMode='video';
 runInNewContext('render();',context);
 assert.equal(binds,1);assert.equal(deferrals,1);
 assert.equal(target.innerHTML,'video overlay with native anchor','Video host must receive Video markup synchronously');
});
test('an unrelated pointer cannot release a sheet touch and a new touch cancels pending release',async()=>{
 const f=gateFixture();f.down(1);f.render();f.handlers.pointerup({pointerId:2});
 assert.equal(f.timers.size,0);
 f.handlers.pointerup({pointerId:1});f.down(3);assert.equal(f.timers.size,0);
 f.handlers.pointercancel({pointerId:3});await f.flush();assert.equal(f.renders,1);
});
test('leaving the app releases a pending Android sheet render without a playback command',async()=>{
 const f=gateFixture();f.down(1);f.render();f.viewHandlers.blur();await f.flush();assert.equal(f.renders,1);
});
test('the sheet interaction gate installs no iOS listeners',()=>{
 const f=gateFixture(false);assert.deepEqual(Object.keys(f.handlers),[]);assert.deepEqual(Object.keys(f.viewHandlers),[]);
 f.render();assert.equal(f.renders,1);
});
test('Android rerenders restore scroll only for the same lecture sheet',()=>{
 let sheet={dataset:{irgunPlayerKey:'video:one'},scrollTop:280,scrollLeft:4};
 const document={querySelector:()=>sheet};
 const restore=preserveAndroidPlayerSheetScroll({document,isAndroid:()=>true,playerKey:'video:one'});
 sheet={dataset:{irgunPlayerKey:'video:one'},scrollTop:0,scrollLeft:0};restore();
 assert.equal(sheet.scrollTop,280);assert.equal(sheet.scrollLeft,4);
 sheet={dataset:{irgunPlayerKey:'video:two'},scrollTop:0,scrollLeft:0};restore();assert.equal(sheet.scrollTop,0);
 const ignore=preserveAndroidPlayerSheetScroll({document:{querySelector:()=>{throw Error('iOS DOM must not be read');}},isAndroid:()=>false,playerKey:'video:one'});
 ignore();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {bindAndroidPlayerSheetInteractions,preserveAndroidPlayerSheetScroll,preserveAndroidSpeedTapScroll} from '../src/android-player-controls.js';

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
  preserveAndroidSpeedTapScroll:()=>()=>{},
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
 const context={state,app:target,syncAndroidBottomNavigation(){},syncAndroidVideoDisplay(){},tabSwipeRenderGate:{shouldDefer:()=>false},
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

test('Android speed tap restores the same Audio sheet after delayed DOM rerenders',()=>{
  let sheet={dataset:{irgunPlayerKey:'video-audio:one'},scrollTop:310,scrollLeft:0};
  const timers=new Map(),listeners=new Map();
  const doc={querySelector:selector=>selector==='[data-player-sheet]'?sheet:null,
    addEventListener:(name,fn)=>listeners.set(name,fn),
    removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
  const restore=preserveAndroidSpeedTapScroll({document:doc,isAndroid:()=>true,
    schedule:(fn,ms)=>{timers.set(ms,fn);return ms;},cancel:id=>timers.delete(id)});
  sheet={dataset:{irgunPlayerKey:'video-audio:one'},scrollTop:0,scrollLeft:0};
  timers.get(120)();assert.equal(sheet.scrollTop,310,'late render of the same Audio sheet must not reset speed scroll');
  sheet.scrollTop=0;restore();assert.equal(sheet.scrollTop,310);
  timers.get(600)();assert.equal(listeners.size,0,'speed scroll watch must not accumulate listeners');
});

test('Android speed tap never scrolls a different lecture or overrides a new touch',()=>{
  let sheet={dataset:{irgunPlayerKey:'video-audio:one'},scrollTop:320,scrollLeft:0};
  const timers=new Map(),listeners=new Map();
  const doc={querySelector:()=>sheet,
    addEventListener:(name,fn)=>listeners.set(name,fn),
    removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
  preserveAndroidSpeedTapScroll({document:doc,isAndroid:()=>true,
    schedule:(fn,ms)=>{timers.set(ms,fn);return ms;},cancel:id=>timers.delete(id)});
  sheet={dataset:{irgunPlayerKey:'video-audio:two'},scrollTop:0,scrollLeft:0};
  timers.get(120)();assert.equal(sheet.scrollTop,0,'must not scroll another lecture');
  sheet={dataset:{irgunPlayerKey:'video-audio:one'},scrollTop:180,scrollLeft:0};
  listeners.get('pointerdown')();timers.get(300)();assert.equal(sheet.scrollTop,180,'new physical gesture owns the sheet');
  const ignored=preserveAndroidSpeedTapScroll({document:{querySelector:()=>{throw Error('no iOS sheet access');}},
    isAndroid:()=>false,schedule:()=>{throw Error('must not schedule iOS');}});
  ignored();
});

test('Android 15 rotated native Media3 controller restores action row on physical reveal',()=>{
  const native=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunNativeVideoPlugin.java','utf8');
  assert.match(native,/!isControllerFullyVisible\(\) \|\| videoActions == null \|\| !videoActions\.isShown\(\)/,
    'Physical tap must also recover a hidden native toolbar after rotation');
  const full=native.slice(native.indexOf('public void fullscreen(PluginCall call)'),
    native.indexOf('// Capacitor Filesystem returns a file:',native.indexOf('public void fullscreen(PluginCall call)'))>0?
      native.indexOf('// Capacitor Filesystem returns a file:',native.indexOf('public void fullscreen(PluginCall call)')):undefined);
  assert.match(full,/surface\.showController\(\);\s*controllerVisible = true;\s*updateVideoActions\(\);/,
    'Sensor fullscreen must restore both native Media3 controls and custom action row');
});

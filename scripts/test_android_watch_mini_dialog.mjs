import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync('src/main.js','utf8');
const adapter=readFileSync('src/android-native-media3-video.js','utf8');
const css=readFileSync('src/style.css','utf8');
const between=(s,first,last)=>{
  const a=s.indexOf(first),b=s.indexOf(last,a+first.length);
  assert.ok(a>=0&&b>a, `Missing expected code markers: ${first}`);
  return s.slice(a,b);
};
const gestureSource=between(main,'function bindAndroidWatchDetailsSwipeToMini(overlay) {','function bindPersistentVideoChrome() {');

function gestureRig(){
  const listeners=new Map(), bodyClasses=new Set();
  const overlay={dataset:{},querySelector:selector=>selector==='.watch-scroll'?scroller:null};
  const scroller={scrollTop:0,addEventListener:(event,fn)=>{
    if(!listeners.has(event))listeners.set(event,[]);
    listeners.get(event).push(fn);
  }};
  const modal={open:false};
  let minimized=0,clock=1000;
  const state={watchVideo:{id:'qa'},watchMode:'video',watchMinimized:false,systemPipActive:false};
  const document={
    querySelector:selector=>modal.open && selector.includes('.admin-editor-backdrop')?{}:null,
    body:{classList:{toggle:(name,on)=>{if(on)bodyClasses.add(name);else bodyClasses.delete(name);}}}
  };
  const f=new Function('Capacitor','state','document','nativeVideoFullscreen','performance','minimizeWatchToPersistent',
    gestureSource+'return {bindAndroidWatchDetailsSwipeToMini,syncAndroidMiniDialogVisibility};')(
      {getPlatform:()=> 'android'},state,document,false,{now:()=>clock},
      ()=>{minimized++;state.watchMinimized=true;return Promise.resolve();});
  const fire=(type,x,y,target=null)=>{
    const event={touches:[{clientX:x,clientY:y}],
      target:{closest:()=>target},preventDefault(){this.prevented=true;}};
    for(const fn of listeners.get(type)||[])fn(event);
    return event;
  };
  return {f,overlay,scroller,state,modal,bodyClasses,fire,clock:value=>{clock=value;},
    get minimized(){return minimized;},count:type=>listeners.get(type)?.length||0};
}

test('pull down from lecture DETAILS minimizes once and preserves regular touch targets',()=>{
  const r=gestureRig();
  r.f.bindAndroidWatchDetailsSwipeToMini(r.overlay);
  r.f.bindAndroidWatchDetailsSwipeToMini(r.overlay);
  assert.equal(r.count('touchstart'),1,'Repeated render must not stack handlers');
  r.fire('touchstart',25,100);
  r.clock(1150);
  assert.equal(r.fire('touchmove',25,228).prevented,true);
  r.fire('touchend',25,228);
  assert.equal(r.minimized,1,'A vertical downward pull below the video should minimize');
  assert.equal(r.state.watchMinimized,true);
});

test('normal scroll and sideways drags do not minimize the video',()=>{
  const r=gestureRig();r.f.bindAndroidWatchDetailsSwipeToMini(r.overlay);
  r.scroller.scrollTop=70;
  r.fire('touchstart',15,110);r.fire('touchmove',15,285);r.fire('touchend',15,285);
  assert.equal(r.minimized,0,'Scrolling back up through comments should remain ordinary scrolling');
  r.scroller.scrollTop=0;
  r.fire('touchstart',20,100);r.fire('touchmove',240,130);r.fire('touchend',240,130);
  assert.equal(r.minimized,0,'Horizontal gestures remain usable');
  r.fire('touchstart',15,110,{});r.fire('touchmove',15,320);r.fire('touchend',15,320);
  assert.equal(r.minimized,0,'Touches beginning on buttons/inputs must be ignored');
});

test('modal presence blocks swipe and toggles mini visual suppression',()=>{
  const r=gestureRig();r.f.bindAndroidWatchDetailsSwipeToMini(r.overlay);
  r.modal.open=true;r.f.syncAndroidMiniDialogVisibility();
  assert.equal(r.bodyClasses.has('irgun-mini-modal-open'),true);
  r.fire('touchstart',15,110);r.fire('touchmove',15,320);r.fire('touchend',15,320);
  assert.equal(r.minimized,0);
  r.modal.open=false;r.f.syncAndroidMiniDialogVisibility();
  assert.equal(r.bodyClasses.has('irgun-mini-modal-open'),false);
});

test('native Media3 surface hides behind Edit Shiur without pausing and returns on close',async()=>{
  const code=between(adapter,'  const positionFrame=async()=>{','  const scheduleFrame=()=>{');
  const frames=[];let modal=true;
  const stage={
    getBoundingClientRect:()=>({x:5,y:540,left:5,top:540,right:117,bottom:603,width:112,height:63}),
    closest:()=>({getBoundingClientRect:()=>({left:0,top:0,right:320,bottom:640})})
  };
  const document={
    querySelector:query=>query.includes('.admin-editor-backdrop')&&modal ? {}:null,
    getElementById:()=>null,body:{classList:{contains:()=>true}}
  };
  const native={frame:async rect=>frames.push(rect)};
  const pos=new Function('document','native','viewportFrame','innerWidth','innerHeight',
    'let destroyed=false,mode="video",framePlacedOnScreen=true;'+code+'return positionFrame;'
  )(document,native,()=>stage,320,640);
  await pos();
  assert.equal(frames.length,1);
  assert.equal(frames[0].width,0,'Physical Android PlayerView must hide under admin editor');
  assert.equal(frames[0].height,0);
  modal=false;await pos();
  assert.equal(frames.length,2);
  assert.equal(frames[1].width,112,'Native PlayerView returns when editor closes');
  assert.equal(frames[1].height,63);
  assert.match(css,/irgun-mini-modal-open #persistentVideoMount\.watch-mini-host[\s\S]*?visibility:\s*hidden/i,
    'The underlying WebView chrome must also hide');
});

test('Android render and persistent host both bind the gesture and modal without rebuilding player',()=>{
  assert.match(main,/app\.innerHTML = shell\(content \+ playlistPickerHtml\(\)\);[\s\S]*?if \(typeof syncAndroidMiniDialogVisibility === 'function'\) syncAndroidMiniDialogVisibility\(\)/);
  assert.match(main,/function bindPersistentVideoChrome\(\) \{[\s\S]*?bindAndroidWatchDetailsSwipeToMini\(persistentVideoMount\.querySelector/);
  assert.match(main,/document\.querySelectorAll\('\.watch-overlay'\)\.forEach\(bindAndroidWatchDetailsSwipeToMini\)/);
  assert.match(adapter,/\.admin-editor-backdrop/);
  assert.doesNotMatch(gestureSource,/\.pause\(|\.destroy\(|\.setMode\(|\.seekTo\(/);
});

test('Audio -> Video removes stale in-app Watch but keeps original external native host',()=>{
  const latest=readFileSync('src/main.js','utf8');
  const restore=between(latest,'function restoreParkedHostedVideo() {','async function switchVideoToAudioSeamlessly(');
  assert.match(restore,/document\.querySelector\('#app \.watch-overlay'\)\?\.remove\(\)/);
  assert.doesNotMatch(restore,/\.destroy\(|\.pause\(|\.setMode\(/);
  const host=between(latest,'function hostCurrentWatchOverlay(mode = \'full\') {','async function resetWatchVimeoPlayer() {');
  assert.match(host,/document\.querySelector\('#app \.watch-overlay'\)\?\.remove\(\)/);
  const stale={removed:false,remove(){this.removed=true;}};
  const mount={className:'watch-audio-parked',querySelector:selector=>selector==='#watchVimeoFrame'?{}:null};
  const state={watchVimeo:{},watchMode:'video',watchMinimized:false,watchHostedExternally:false};
  const bodyClasses={removed:[],remove(name){this.removed.push(name);}};
  const document={body:{classList:bodyClasses},querySelector:selector=>selector==='#app .watch-overlay'?stale:null};
  const restoreFn=new Function('persistentVideoMount','state','document','Capacitor',
    restore+'return restoreParkedHostedVideo;')(mount,state,document,{getPlatform:()=> 'android'});
  assert.equal(restoreFn(),true);
  assert.equal(stale.removed,true,'stale overlay is removed before the next physical native tap');
  assert.equal(state.watchHostedExternally,true);
  assert.equal(state.watchMinimized,false);
  assert.ok(state.watchVimeo,'same native player remains alive');
});

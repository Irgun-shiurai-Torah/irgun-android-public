import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import {nativeHierarchy} from './android-native-hierarchy.mjs';
import {settledNativeTapPoint,waitForNativeWindowFocus} from './android-native-tap-point.mjs';
import {safeNativeBackgroundHandoff} from './android-background-handoff-check.mjs';
import {startMediaRequest,completeMediaRequest,failedDuringOffline} from './android-network-evidence.mjs';
import {fullscreenEducationTapPoint,mediaNotificationClock,settledMediaNotificationControlPoint} from './android-system-ui-observation.mjs';

// Run after android-emulator-mp4.mjs: the actual reported shiur is already
// playing in native AUDIO mode. All UI actions below are physical ADB events.
// CDP is used only to observe test-build state and app/media outcomes.
const pkg = 'org.irgunshiuraitorah.app';
const delay = ms => new Promise(r => setTimeout(r, ms));
const adb = (...args) => execFileSync('adb', args, { encoding:'utf8', timeout:30000 }).trim();
const report = {startedAt:new Date().toISOString(),checks:[],failures:[], device:'Android emulator'};
const ensureReport = () => mkdirSync('emulator-report',{recursive:true});
let ws,seq=0,pending=new Map(),bounds;
let networkPhase='normal';const networkRequests=new Map();report.networkEvidence=[];
const screenshot = name => {try {writeFileSync('emulator-report/'+name+'.png', execFileSync('adb',['exec-out','screencap','-p'],{timeout:15000}));} catch {}};
const save = () => writeFileSync('emulator-report/release-regressions.json',JSON.stringify(report,null,2));

async function connect() {
  ws?.close();
  const pid=adb('shell','pidof',pkg).split(/\s+/)[0];
  assert.ok(pid,'Irgun app must be running');
  adb('forward','tcp:9224','localabstract:webview_devtools_remote_'+pid);
  let page;
  for(let i=0;i<16;i++) {
    try {
      const entries=await (await fetch('http://127.0.0.1:9224/json/list',{signal:AbortSignal.timeout(4000)})).json();
      page=entries.find(p=>p.type==='page'&&/localhost/.test(p.url)&&p.webSocketDebuggerUrl);
      if(page)break;
    }catch{}
    await delay(600);
  }
  assert.ok(page,'Android application WebView is unavailable');
  const socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('WebView connection timeout')),10000);
    socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('WebView connection error'));},{once:true});
  });
  ws=socket;seq=0;pending=new Map();
  socket.addEventListener('message',ev=>{
    const message=JSON.parse(ev.data);
    if(message.method==='Network.requestWillBeSent') {
      const data=message.params,request=startMediaRequest(data,networkPhase);
      if(request)networkRequests.set(data.requestId,request);
      return;
    }
    if(message.method==='Network.loadingFinished'||message.method==='Network.loadingFailed') {
      const data=message.params,request=networkRequests.get(data.requestId);
      if(request&&(request.phase!=='normal'||networkPhase!=='normal'))report.networkEvidence.push(completeMediaRequest(request,data,networkPhase));
      networkRequests.delete(data.requestId);return;
    }
    const p=pending.get(message.id);
    if(!p)return;
    pending.delete(message.id);clearTimeout(p.timer);
    if(message.error||message.result?.exceptionDetails)p.reject(new Error('WebView read failed: '+JSON.stringify(message.error||message.result.exceptionDetails)));
    else p.resolve(message.result);
  });
  socket.addEventListener('close',()=>{
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('WebView inspector disconnected'));}
    pending.clear();
  });
}
async function command(method,params={}) {
  assert.ok(ws?.readyState===WebSocket.OPEN,'WebView observation channel unavailable');
  return await new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('WebView observation timeout'));},12000);
    pending.set(id,{resolve,reject,timer});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {return command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}).then(result=>result.result.value);}
async function read() {
  const snap=await evaluate('JSON.stringify(window.ISTReleaseQA?.snapshot?.() || {observerMissing:true})');
  const s=JSON.parse(snap);
  assert.equal(s.observerMissing,undefined,'QA observer must be appended to this disposable build');
  s.native=await evaluate("window.Capacitor.nativePromise('IrgunPlayback','qaPlaybackSnapshot',{})");
  // The Android Media3 engine renders into native PlayerView rather than HTML.
  // Normalize ONLY actual ExoPlayer read-only observations (never fake frames,
  // playing states, seeks, or times) so every existing assertion sees reality.
  if(s.native.videoSource==='native-media3'){
    s.videoEngine='native-media3';s.webViewVideo=s.video;
    s.media3=await evaluate("window.Capacitor.nativePromise('IrgunNativeVideo','snapshot',{})");
    assert.equal(s.webViewVideo,null,'Media3 cannot create a second WebView decoder');
    s.iframeSources=JSON.parse(await evaluate('JSON.stringify([...document.querySelectorAll("#watchVimeoFrame")].map(e=>e.getAttribute("src")||""))'));
    const n=s.media3;
    s.video=n.active&&n.videoSelected?{
      time:Number(n.positionMs)/1000,frames:Number(n.frames),paused:!n.playing,
      ready:n.firstFrame&&n.width>0&&n.height>0?4:0,
      width:Number(n.width),height:Number(n.height),
      muted:Number(s.native.audioOutputVolume||0)<=0,
      volume:Number(s.native.audioOutputVolume||0),
      rate:Number(s.native.playbackSpeed),error:n.error||null,
      buffered:Number(n.bufferedPositionMs)/1000
    }:null;
  }else{s.videoEngine='webview';}
  return s;
}
async function wait(test,message,timeout=45000) {
  const deadline=Date.now()+timeout;
  let last, lastError;
  while(Date.now()<deadline) {
    try {last=await read();if(await test(last))return last;}catch(e){lastError=String(e.message);}
    await delay(600);
  }
  throw new Error(message+'; last='+JSON.stringify(last||{})+'; error='+String(lastError||'none'));
}
async function nativeBounds(waitForFocus=false) {
  const observe=()=>evaluate("window.Capacitor.nativePromise('IrgunPlayback','qaWindowBounds',{})");
  const geometry=waitForFocus?await waitForNativeWindowFocus({readBounds:observe,delay}):await observe();
  assert.equal(geometry.focused,true,'Irgun must own the native foreground window before an app tap');
  const arr=[geometry.left,geometry.top,geometry.right,geometry.bottom];
  assert.ok(arr.every(Number.isFinite)&&arr[2]>arr[0]&&arr[3]>arr[1],
    'Fresh actual Android WebView bounds required');
  report.boundsSource='fresh native WebView location and size';
  return arr;
}
const nativeXY=(point)=>{
  assert.ok(bounds,'Observed native window bounds required');
  return [Math.round(bounds[0]+point.x*(bounds[2]-bounds[0])/point.width),
          Math.round(bounds[1]+point.y*(bounds[3]-bounds[1])/point.height)];
};
async function hit(selector){
  const expr='JSON.stringify((()=>{for(const e of document.querySelectorAll('+JSON.stringify(selector)+'))'+
    '{const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);'+
    'if(r.width>8&&r.height>8&&x>0&&x<innerWidth&&y>0&&y<innerHeight&&h&&(h===e||e.contains(h)))'+
    'return {x,y,width:innerWidth,height:innerHeight,label:(e.textContent||e.getAttribute("aria-label")||"").slice(0,40)};'+
    '}return null;})())';
  return JSON.parse(await evaluate(expr));
}
async function tap(selector){
  const measured=await settledNativeTapPoint({readBounds:()=>evaluate("window.Capacitor.nativePromise('IrgunPlayback','qaWindowBounds',{})"),readPoint:()=>hit(selector),delay});
  bounds=measured.bounds;const xy=measured.point;
  const speedScroll=selector.startsWith('[data-speed-choice=')?
    Number(await evaluate('document.querySelector("[data-player-sheet]")?.scrollTop')):null;
  adb('shell','input','tap',String(xy[0]),String(xy[1]));
  await delay(500);
  if(speedScroll>0){
    const after=Number(await evaluate('document.querySelector("[data-player-sheet]")?.scrollTop'));
    assert.ok(after>=speedScroll-2,'Actual Android speed selection must preserve the settings sheet scroll');
    report.speedSettingScrolls??=[];report.speedSettingScrolls.push({selector,before:speedScroll,after});
  }
  return xy;
}
async function tapWithScroll(selector) {
  for(let attempt=0;attempt<8;attempt++) {
    const point=await hit(selector);
    if(point) {
      try { return await tap(selector); }
      catch(error) {
        if(!String(error.message).includes('no tap was performed')) throw error;
        // An asynchronous render can reset the sheet's scroll between the
        // first hit test and the two stable geometry samples. Re-measure and
        // physically scroll again, without replacing the failed tap with JS.
        await delay(300); continue;
      }
    }
    // Physical swipes in the current Android WebView, not synthetic DOM scrolling.
    assert.ok(bounds,'Actual measured native WebView bounds required to scroll');
    const x=Math.round((bounds[0]+bounds[2])/2);
    const top=Math.round(bounds[1]+(bounds[3]-bounds[1])*0.30);
    const bottom=Math.round(bounds[1]+(bounds[3]-bounds[1])*0.82);
    adb('shell','input','swipe',String(x),String(bottom),String(x),String(top),'380');
    await delay(450);
  }
  throw new Error('Required control was not visible after native scrolling: '+selector);
}
async function tapOfflineDeleteConfirmation(){
  // The app's asynchronous confirmation keeps playback/bridge JS running.
  // The same real removal assertion follows a physical, hit-tested button tap.
  assert.ok(await hit('[data-offline-delete-confirm]'),'Actual offline confirmation must be visible');
  const point=await tap('[data-offline-delete-confirm]');
  report.offlineConfirmation={physicalTap:point,dialogClosed:false};save();
  await wait(async()=>!await hit('[data-offline-delete-confirm]'),
    'Actual positive confirmation tap did not close the offline deletion dialog',20000);
  report.offlineConfirmation.dialogClosed=true;save();
}
function checks(label,details={}) {report.checks.push({label,...details});save();}
async function section(name,fn){
  report.activeSection=name;report.scenarios||=[];const scenario={name,status:'running',startedAt:new Date().toISOString(),expected:name};report.scenarios.push(scenario);save();
  report.device = String(adb('shell','getprop','ro.build.version.release')).trim();
  report.androidApi = Number(adb('shell','getprop','ro.build.version.sdk'));
  try {await fn();scenario.status='passed';checks(name);console.log('PASS: '+name);}
  catch(e){scenario.status='failed';const error=String(e.stack||e);try{scenario.actual=await read();}catch(observation){scenario.observationError=String(observation.message);}report.failures.push({name,expected:name,error,screenshot:'failed-'+(report.failures.length+1)+'.png'});screenshot('failed-'+report.failures.length);console.error('FAIL: '+name+': '+error.slice(0,1400));}
  finally{
    // A failed notification observation must not leave SystemUI covering every
    // later physical tap. Its original failure remains in the report.
    if(name.startsWith('Home during video')){
      adb('shell','cmd','statusbar','collapse');
      adb('shell','am','start','-W','-n',pkg+'/.MainActivity');
      await delay(500);
    }
    scenario.finishedAt=new Date().toISOString();save();
  }
}
function noDuplicatePlayback(s){
  if(s.videoEngine==='native-media3'){
    if(s.watchMode==='video'){
      assert.equal(s.overlays,1,'Native Video must have exactly one Watch overlay; a duplicate blocks physical mini-player buttons');
      assert.equal(s.iframes,1,'Native Video must keep exactly one about:blank anchor for its physical PlayerView');
    }
    assert.equal(s.videos,0,'Native Media3 must not use an HTML video decoder');
    assert.ok(s.media3?.active,'Exactly one active native Media3 playback session required');
    assert.ok(s.iframeSources?.every(src=>!src||src==='about:blank'),
      'No network Vimeo iframe may play behind the native PlayerView');
  }else{
    assert.ok(s.overlays===1,'Exactly one WebView video overlay expected');
    assert.ok(s.videos<=1&&s.iframes<=1,'No duplicate WebView video/iframe');
  }
}
function audibleVideo(s){
  assert.ok(s.video&&!s.video.paused&&s.video.ready>=2&&s.video.width>0,'Video must actually decode and play');
  assert.equal(s.video.error,null,'Video decoder must not fail');
  assert.ok(!s.video.muted&&s.video.volume>0,'Video must have audible output');
  assert.equal(s.native.mode,'VIDEO','Native VIDEO must be authoritative');
  if(s.videoEngine==='native-media3'){
    assert.ok(s.media3.active&&s.media3.videoSelected&&s.media3.playing&&
      s.media3.firstFrame&&s.media3.frames>=2,'ExoPlayer must render real video frames');
    assert.ok(s.media3.surfaceVisibleOnScreen&&s.media3.surfaceVisibleWidth>120&&
      s.media3.surfaceVisibleHeight>65&&s.media3.surfaceX>=0,
      'Native PlayerView must be PHYSICALLY VISIBLE; decoded frames at x=-12000 are black video');
    assert.ok(s.native.audioOutputVolume>0,'Same native Media3 video/audio player must be audible');
  }else if(typeof s.native.audioOutputVolume==='number'){
    assert.equal(s.native.audioOutputVolume,0,'WebView Video requires a silent native Audio shadow');
  }
  noDuplicatePlayback(s);
}
function audibleAudio(s){
  assert.equal(s.native.mode,'AUDIO','Media3 must authorize native Audio');
  assert.ok(s.native.audioIsPlaying,'Actual native Audio must play');
  if(typeof s.native.audioOutputVolume==='number')assert.ok(s.native.audioOutputVolume>0,'Native Audio must be audible');
  if(s.videoEngine==='native-media3'){
    assert.ok(!s.media3?.videoSelected,'Native video track must be deselected in Audio mode');
    assert.equal(s.webViewVideo,null,'No second WebView audio output');
  }else if(s.video)assert.ok(s.video.paused||s.video.muted||s.video.volume===0,'HTML video must not overlap native Audio');
}
async function videoReady(){
  let current=await read();
  if(!current.watchId&&current.currentId){
    if(!current.playerOpen)await tapWithScroll('.mini-player .mini-copy');
    await tapWithScroll('[data-player-watch="'+current.currentId+'"]');
    await wait(s=>!!s.watchId,'Actual lecture did not reopen from the native player');
    await closePlayer();current=await read();
  }
  if(current.watchMode!=='video'||
    (current.videoEngine==='native-media3'&&current.native.mode==='AUDIO'&&!current.media3?.videoSelected)||
    (current.videoEngine!=='native-media3'&&current.native.mode==='AUDIO'&&!current.video&&!String(current.hostClass||'').includes('watch-video-host')))
    await tap('[data-watch-mode="video"]');
  const playing=await wait(s=>s.watchMode==='video'&&s.video&&!s.video.paused&&
    s.video.ready>=2&&s.video.width>0&&!s.video.muted&&s.video.volume>0&&
    s.native.mode==='VIDEO'&&(s.videoEngine==='native-media3'?
      s.media3.active&&s.media3.videoSelected&&s.media3.playing&&s.media3.firstFrame&&
      s.media3.frames>=2&&s.media3.bufferedPositionMs>s.media3.positionMs&&
      s.media3.surfaceVisibleOnScreen&&s.media3.surfaceVisibleWidth>120:
      typeof s.native.audioOutputVolume!=='number'||s.native.audioOutputVolume===0),
    'Actual Video failed to regain audible moving VIDEO authority',65000);
  audibleVideo(playing);return playing;
}
async function audioReady(){
  const current=await read();
  if(current.watchMode!=='audio')await tap('[data-watch-mode="audio"]');
  return await wait(s=>s.watchMode==='audio'&&s.native.mode==='AUDIO'&&s.native.audioIsPlaying,'Native audio did not return',65000);
}
async function closePlayer(){
  if((await read()).playerOpen) {
    await tapWithScroll('[data-close-player]');
    await wait(s=>!s.playerOpen,'Closing the full native player did not restore its compact view',14000);
  }
}
async function seekAudio(seconds) {
  let offset=0;
  for(let i=0;i<8;i++) {
    const measured=await settledNativeTapPoint({
      readBounds:()=>evaluate("window.Capacitor.nativePromise('IrgunPlayback','qaWindowBounds',{})"),delay,
      readPoint:async()=>JSON.parse(await evaluate('JSON.stringify((()=>{const e=document.querySelector("#watchAudioSeek"),r=e?.getBoundingClientRect();if(!r)return null;const max=Number(e.max),usable=r.width-16;if(!Number.isFinite(max)||max<=0||usable<=0||max<'+seconds+')return null;const rtl=getComputedStyle(e).direction==="rtl",x=r.left+8+usable*(rtl?1-'+seconds+'/max:'+seconds+'/max)+'+offset+',y=r.top+r.height/2;return document.elementFromPoint(x,y)===e?{x,y,width:innerWidth,height:innerHeight,max,usable,rtl}:null;})())'))
    });
    bounds=measured.bounds;adb('shell','input','tap',...measured.point.map(String));await delay(450);
    const state=await read(),position=Number(state.native.audioPositionMs)/1000;
    if(Math.abs(position-seconds)<8)return state;
    const range=Number(await evaluate('document.querySelector("#watchAudioSeek")?.value'));
    assert.ok(Number.isFinite(range),'Actual audio seek input must be observable');
    offset+=(seconds-range)*measured.domPoint.usable/measured.domPoint.max*(measured.domPoint.rtl?-1:1);
  }
  return wait(s=>Math.abs(Number(s.native.audioPositionMs)/1000-seconds)<8,'Native seek did not reach '+seconds+' seconds');
}
async function nativeNotificationTap(pattern,name) {
  // SystemUI can briefly show Connecting while the same player buffers.
  // Observe the requested real action twice before issuing exactly one tap.
  const point=await settledMediaNotificationControlPoint({
    readHierarchy:()=>nativeHierarchy('emulator-report/notification-'+name+'.xml'),
    action:name,pattern,delay
  });
  adb('shell','input','tap',...point.map(String));
  await delay(800);
}
async function verifyOfflineServerHistory(id) {
  const expected=(await read()).native.audioPositionMs/1000;
  const headers={Origin:'https://localhost','X-Irgun-App':'1','Content-Type':'application/json'};
  const response=await fetch('https://api.irgunshiuraitorah.com/login',{method:'POST',headers,body:JSON.stringify({email:process.env.IRGUN_TEST_EMAIL,password:process.env.IRGUN_TEST_PASSWORD}),signal:AbortSignal.timeout(30000)})
    .catch(error=>{throw new Error('Independent offline-history login transport failed: '+error.message,{cause:error});});
  assert.equal(response.status,200,'Independent QA session required to verify offline history reached server');
  const session=await response.json();assert.ok(session.sessionToken&&!session.user?.isAdmin,'Dedicated non-admin session required');
  const authenticated={...headers,Authorization:'Bearer '+session.sessionToken};
  try {
    let match;const deadline=Date.now()+45000;
    while(Date.now()<deadline) {
      let response;
      try { response=await fetch('https://api.irgunshiuraitorah.com/history',{headers:authenticated,
        signal:AbortSignal.timeout(Math.max(1,Math.min(12000,deadline-Date.now())))}); }
      catch(error) {
        if(error.name!=='TimeoutError'&&!(error instanceof TypeError&&error.message==='fetch failed')) throw error;
        // Retry only this read within the original overall history-sync deadline.
        // Login/mutations and every real server position assertion remain strict.
        (report.historyReadTransportFailures||=[]).push({error:error.name,at:new Date().toISOString()});
        await delay(1000);continue;
      }
      assert.equal(response.status,200,'Real server history must be readable after reconnect');
      const data=await response.json(),actualPosition=(await read()).native.audioPositionMs/1000;
      match=(data.items||[]).find(x=>String(x.videoId||x.rawAudioId||x.id||'').replace(/^audio:/,'')===String(id)&&String(x.mediaType||'').toLowerCase()==='audio'&&Number(x.progressSeconds||x.positionSeconds||0)>=Math.floor(expected)&&Number(x.progressSeconds||x.positionSeconds||0)<=actualPosition+3);
      if(match)break;await delay(1000);
    }
    assert.ok(match,'Offline playback progress must synchronise to the real server after reconnect');
    checks('Signed-in offline playback synchronised real server history after reconnection',{id,expectedSeconds:Math.floor(expected),actualSeconds:Number(match.progressSeconds||match.positionSeconds||0)});
  }finally {await fetch('https://api.irgunshiuraitorah.com/logout',{method:'POST',headers:authenticated,signal:AbortSignal.timeout(10000)}).catch(()=>{});}
}
async function notificationClock() {
  const xml=nativeHierarchy('emulator-report/notification-clock.xml');
  return mediaNotificationClock(xml);
}
async function dismissFullscreenEducation() {
  const geometry=await evaluate("window.Capacitor.nativePromise('IrgunPlayback','qaWindowBounds',{})");
  if(geometry.focused)return;
  const xml=nativeHierarchy('emulator-report/fullscreen-education.xml');
  const point=fullscreenEducationTapPoint(xml);
  assert.ok(point,'Fullscreen window is covered by an unidentified dialog; Back behaviour is unverified');
  screenshot('fullscreen-education');
  adb('shell','input','tap',String(point[0]),String(point[1]));
  await wait(async()=>Boolean((await evaluate("window.Capacitor.nativePromise('IrgunPlayback','qaWindowBounds',{})")).focused),
    'Actual Got it tap must return foreground focus to the fullscreen app');
  checks('First-use Android fullscreen education dismissed with physical Got it tap');
}
async function setOnline(online){
  adb('shell','svc','wifi',online?'enable':'disable');
  adb('shell','svc','data',online?'enable':'disable');
  await delay(1200);
}
async function sampleMovingVideo(){
  const a=await videoReady();
  await delay(2300);
  let b=await read();
  // Real HLS briefly buffers after a native fullscreen -> Android Back
  // transition. A stopped decoder remains a failure, but avoid reporting a
  // transient 2-second rebuffer as an app crash while it is recovering.
  if(a.videoEngine==='native-media3' && (!b.media3?.playing ||
      b.media3.frames < a.media3.frames+2 || b.media3.positionMs < a.media3.positionMs+1000)) {
    b=await wait(s=>s.media3?.playing && s.media3.videoSelected &&
      s.media3.frames>=a.media3.frames+3 &&
      s.media3.positionMs>a.media3.positionMs+1000,
      'Native Media3 must resume real decoded frames after transient HLS rebuffer',18000);
  }
  audibleVideo(b);
  assert.ok(b.video.time>a.video.time+1.0,'Video timeline must advance without a restart');
  assert.ok(b.video.frames>=a.video.frames+2,'Decoded frames must advance');
  return {before:a,after:b};
}

ensureReport();
try{
  await connect();bounds=await nativeBounds();
  const initial=await wait(s=>s.ready&&s.watchId&&s.watchMode==='audio'&&s.native.audioIsPlaying,'Existing real-MP4 audio/video handoff test must leave audio playing');
  assert.equal(initial.isLoggedIn,process.env.IRGUN_EXPECT_SIGNED_IN==='1','Media suite must execute in its declared logged-in or logged-out state');
  report.accountMode=initial.isLoggedIn?'logged-in':'logged-out';
  audibleAudio(initial);report.initial={watchId:initial.watchId,positionMs:initial.native.audioPositionMs};
  checks('Started from successful real-media 10-minute audio/video handoff');

  await section('Repeated audio/video handoffs preserve playing position and single audio source',async()=>{
    for(let i=0;i<2;i++){
      const a=await audioReady(),before=Number(a.native.audioPositionMs)/1000;
      const v=await videoReady();audibleVideo(v);
      assert.ok(v.video.time>=before-4,'Switch to Video rewound the shiur');
      await delay(2500);
      const vv=await read();audibleVideo(vv);
      assert.ok(vv.video.time>v.video.time+1,'Video froze after handoff');
      const resumed=await audioReady();audibleAudio(resumed);
      assert.ok(Number(resumed.native.audioPositionMs)/1000>=vv.video.time-5,'Return to Audio lost playback progress');
    }
  });

  await section('Near-end native seek, pause/resume and return preserve actual decoded audio position',async()=>{
    const original=await audioReady(),duration=Number(original.native.audioDurationMs)/1000;
    assert.ok(duration>600,'Actual native duration must load before seeking near the end');
    const position=Number(original.native.audioPositionMs)/1000;
    await tap('.watch-audio-controls [data-play-toggle]');
    await wait(s=>!s.native.audioIsPlaying&&!s.native.audioPlayWhenReady,'Pause must stop native audio before near-end seeking');
    await seekAudio(duration-90);
    await tap('.watch-audio-controls [data-play-toggle]');
    // API 34 can briefly enter BUFFERING again after its first READY frame
    // at a distant HLS keyframe. Requiring isPlaying exactly 2.4s later
    // falsely failed although it resumed seconds afterward. Require a REAL
    // advancing clock and audible Media3 output within a bounded 25s.
    const started=await wait(s=>s.native.audioIsPlaying&&
      s.native.audioPositionMs>=(duration-94)*1000,
      'Playback must actually resume near the end',25000);
    const advanced=await wait(s=>s.native.audioIsPlaying&&
      s.native.audioOutputVolume>0&&
      s.native.audioPositionMs>started.native.audioPositionMs+1300,
      'Near-end Audio did not resume advancing after Media3 buffering',25000);
    audibleAudio(advanced);
    assert.ok(advanced.native.audioPositionMs>started.native.audioPositionMs+1300,
      'Actual near-end clock must advance, not merely report Play intent');
    await tap('.watch-audio-controls [data-play-toggle]');
    await wait(s=>!s.native.audioPlayWhenReady,'Pause after near-end playback failed');
    await seekAudio(position);
    await tap('.watch-audio-controls [data-play-toggle]');
    const restored=await wait(s=>s.native.audioIsPlaying&&
      s.native.audioPositionMs>=(position+1.1)*1000&&
      s.native.audioPositionMs<=(position+18)*1000,
      'Returning from near-end seek must regain genuinely advancing native Audio',30000);
    audibleAudio(restored);
    checks('Near-end seek recovered actual audible clocks at both positions',
      {durationSeconds:duration,nearEndSeconds:started.native.audioPositionMs/1000,
       nearEndAdvancedSeconds:advanced.native.audioPositionMs/1000,
       restoredSeconds:restored.native.audioPositionMs/1000});
  });

  await section('Native Media3 playback speed selector persists through Audio and Video',async()=>{
    const initial=await videoReady();
    if(initial.videoEngine!=='native-media3'){
      // Older WebView builds have a genuine HTML speed picker.
      for(const rate of [1.25,1.5,2,1]){
        await tap('[data-hls-speed]');await delay(600);
        const xml=nativeHierarchy('emulator-report/video-speed-'+rate+'.xml');
        const wanted='text="'+rate+'×"';
        const node=(xml.match(/<node\b[^>]*>/g)||[]).find(n=>n.includes(wanted)&&/visible="true"/.test(n));
        const rect=node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)?.slice(1).map(Number);
        assert.ok(rect&&rect[2]>rect[0]&&rect[3]>rect[1],'Actual WebView speed picker option required: '+rate);
        adb('shell','input','tap',String(Math.round((rect[0]+rect[2])/2)),String(Math.round((rect[1]+rect[3])/2)));
        const adjusted=await wait(s=>s.video&&Math.abs(s.video.rate-rate)<.05&&Math.abs(s.speed-rate)<.05,'WebView speed option did not apply');
        const audio=await audioReady();assert.ok(Math.abs(audio.native.playbackSpeed-rate)<.05,'Audio must inherit selected rate');
        const video=await videoReady();assert.ok(Math.abs(video.video.rate-rate)<.05,'WebView Video must preserve rate');
        checks('WebView Video speed '+rate+'x via physical picker',{rate:adjusted.video.rate});
      }
      return;
    }
    for(const rate of [1.25,1.5,2,1]){
      // PlayerView uses native OS controls; the app also exposes an accessible
      // physical speed selector in the full Audio player. Apply it via actual
      // Android taps, then verify the SAME ExoPlayer speed in native Video.
      await audioReady();
      await tap('[data-close-watch]');
      await wait(s=>!s.watchId&&!!s.currentId,'Audio must continue after closing Watch');
      await tapWithScroll('.mini-player .mini-copy');
      await wait(s=>s.playerOpen,'Full native Audio controls must open for speed');
      await tapWithScroll('[data-speed-choice="'+rate+'"]');
      const selected=await wait(s=>Math.abs(s.speed-rate)<.05&&
        Math.abs(s.native.playbackSpeed-rate)<.05&&s.native.audioIsPlaying,
        'Physical speed button did not set native Media3 to '+rate,20000);
      await closePlayer();
      const video=await videoReady();audibleVideo(video);
      assert.ok(Math.abs(video.video.rate-rate)<.05,
        'Native decoded Video did not inherit the selected '+rate+'x rate');
      const before=video.video.time;await delay(2100);
      const after=await read();audibleVideo(after);
      assert.ok(after.video.time>before+rate*1.0,
        'Real native decoded Video clock failed to advance at selected speed '+rate);
      const audio=await audioReady();
      assert.ok(Math.abs(audio.native.playbackSpeed-rate)<.05,
        'Returning to Audio lost '+rate+'x setting');
      checks('Physical '+rate+'x speed selection persists in same Media3 Audio and Video',
        {selectedSpeed:selected.native.playbackSpeed,videoSpeed:video.video.rate,
          videoTimeBefore:before,videoTimeAfter:after.video.time,audioSpeed:audio.native.playbackSpeed});
    }
  });

  await section('True video fullscreen and Android Back exit retain moving picture',async()=>{
    const selected=await videoReady();
    if(selected.videoEngine==='native-media3'){
      for(let i=0;i<2;i++){
        const before=await videoReady();
        const sourceId=before.native.lectureId;
        await tap('[data-native-video-fullscreen]');
        const full=await wait(s=>s.media3?.fullscreen&&s.media3.surfaceVisible&&
          s.media3.active&&s.media3.videoSelected&&s.media3.playing&&
          s.media3.surfaceWidth>=s.media3.rootWidth-8&&
          s.media3.surfaceHeight>=s.media3.rootHeight-8&&
          s.media3.rootWidth>100&&s.media3.rootHeight>100,
          'Native PlayerView must really fill its Android root in immersive fullscreen',22000);
        // Android 15/16 display the system-owned "Viewing full screen / Got it"
        // tutorial on first use. The OS consumes Back while that dialog owns
        // focus; pretending Back reached the app caused every later test to fail.
        // Dismiss it with a real physical tap, verify app focus, THEN send Back.
        // SystemUI can show its first-use education just after PlayerView
        // reports fullscreen; let that real OS window appear before inspecting.
        await delay(700);
        await dismissFullscreenEducation();
        await delay(2300);const moved=await read();
        audibleVideo(moved);
        assert.ok(moved.media3.positionMs>full.media3.positionMs+1100&&
          moved.media3.frames>=full.media3.frames+5,
          'Fullscreen must retain moving decoded native frames and clock');
        assert.equal(moved.native.lectureId,sourceId,'Fullscreen changed lecture');
        screenshot('media3-native-fullscreen-'+i);
        adb('shell','input','keyevent','KEYCODE_BACK');
        const exit=await wait(s=>!s.media3?.fullscreen&&!!s.watchId&&s.media3.active&&
          s.native.mode==='VIDEO'&&s.media3.videoSelected,
          'Physical Android Back must exit native fullscreen without closing lecture',22000);
        assert.ok(exit.media3.positionMs>=moved.media3.positionMs-1250,
          'Back from native fullscreen rewound the lecture');
        const continued=await sampleMovingVideo();
        assert.ok(continued.after.media3.frames>continued.before.media3.frames,
          'Media3 frames must keep moving after exiting real fullscreen');
        checks('Native fullscreen '+(i+1)+' enters actual Android root and Back preserves one moving ExoPlayer',
          {fullscreenWidth:full.media3.surfaceWidth,fullscreenHeight:full.media3.surfaceHeight,
            exitedPositionMs:exit.media3.positionMs});
      }
      return;
    }
    for(let i=0;i<2;i++) {
      const before=await read();await tap('[data-hls-fullscreen]');
      const full=await wait(s=>s.fullscreen,'Fullscreen button must enter actual Android WebView fullscreen');
      await delay(700);await dismissFullscreenEducation();
      await delay(2200);const moving=await read();audibleVideo(moving);
      assert.ok(moving.video.frames>full.video.frames+2,'Actual fullscreen picture must continue moving');
      screenshot('video-fullscreen-'+i);
      adb('shell','input','keyevent','KEYCODE_BACK');
      const exit=await wait(s=>!s.fullscreen&&!!s.watchId,'Android Back must exit fullscreen before leaving the lecture');
      assert.ok(exit.video.time>=before.video.time-2,'Fullscreen/Back must not restart video');
      await sampleMovingVideo();
    }
  });

  await section('Android portrait/landscape rotation retains moving video and unclipped controls',async()=>{
    const auto=adb('shell','settings','get','system','accelerometer_rotation');
    const rotation=adb('shell','settings','get','system','user_rotation');
    const acceleration=adb('emu','sensor','get','acceleration').match(/acceleration\s*=\s*([-\d.]+:[-\d.]+:[-\d.]+)/)?.[1];
    assert.ok(acceleration,'Observe the actual device sensor before the rotation test');
    try {
      adb('shell','settings','put','system','accelerometer_rotation','0');
      const before=await videoReady();
      for(const value of [1,0,1,0]) {
        // Physical tilt, rather than changing a display preference, exercises
        // the app's sensor policy while the user's auto-rotate remains OFF.
        adb('emu','sensor','set','acceleration',value===1?'9.81:0:0':'0:9.81:0');await delay(1800);
        const shapeSelector=before.videoEngine==='native-media3'?'#watchVimeoFrame':'#watchDirectHlsVideo';
        const shape=JSON.parse(await evaluate('JSON.stringify({w:innerWidth,h:innerHeight,rect:(()=>{const r=document.querySelector('+JSON.stringify(shapeSelector)+')?.getBoundingClientRect();return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom}:null})()})'));
        assert.equal(shape.w>shape.h,value===1,'Actual WebView must rotate with Android, not merely accept a setting');
        assert.ok(shape.rect&&shape.rect.left>=-2&&shape.rect.right<=shape.w+2,'Rotated video must fit actual viewport width');
        const movement=await sampleMovingVideo();assert.ok(movement.after.video.time>=before.video.time-2,'Rotation lost the lecture position');
        screenshot('video-rotation-'+value);
      }
    }finally {
      adb('emu','sensor','set','acceleration',acceleration);
      for(const [key,value] of [['accelerometer_rotation',auto],['user_rotation',rotation]])
        if(/^\d+$/.test(value))adb('shell','settings','put','system',key,value);else adb('shell','settings','delete','system',key);
      await delay(900);bounds=await nativeBounds();
    }
  });

  await section('Mini player and Picture-in-Picture preserve player, progress and controls',async()=>{
    await closePlayer();const before=await videoReady();audibleVideo(before);
    for(let attempt=0;attempt<3;attempt++) {
      await tap('[data-minimize-watch]');
      const mini=await wait(s=>s.minimized&&s.hostClass.includes('watch-mini-host'),'Video mini player did not open');
      noDuplicatePlayback(mini);await delay(2100);
      const miniNext=await read();
      assert.ok(miniNext.minimized&&miniNext.hostClass.includes('watch-mini-host'),
        'Mini player unexpectedly expanded or moved before the physical Expand tap');
      assert.ok(miniNext.video.time>mini.video.time+0.7,'Mini player video stopped on cycle '+attempt);
      noDuplicatePlayback(miniNext);
      assert.ok(await hit('[data-expand-watch]'),
        'Mini Expand is not physically hit-testable; inspect overlapping Watch overlays and native PlayerView');
      await tap('[data-expand-watch]');
      const expanded=await wait(s=>!s.minimized&&s.hostClass.includes('watch-full-host'),'Fullscreen view did not restore');
      noDuplicatePlayback(expanded);
      assert.ok(expanded.video.time>=miniNext.video.time-2,'Mini->full transition restarted video');
    }
    if(before.videoEngine==='native-media3'){
      const actual=await sampleMovingVideo();
      assert.ok(actual.after.video.frames>actual.before.video.frames,
        'Real native mini/full transitions must retain decoded moving frames');
      checks('Three native mini/full transitions retain Media3; native PiP, quality and swipe controls are physically covered in the dedicated HLS matrix');
      return;
    }
    await tap('[data-video-pip]');
    const pip=await wait(s=>s.pipActive,'Android system PiP was not entered',20000);
    assert.equal(pip.watchMode,'video');
    noDuplicatePlayback(pip);
    await delay(2200);
    const pipAfter=await read();
    assert.ok(pipAfter.video.time>pip.video.time+0.7,'PiP video playback stopped');
    adb('shell','am','start','-W','-n',pkg+'/.MainActivity');
    const full=await wait(s=>!s.pipActive&&s.watchMode==='video'&&!!s.video,'PiP did not restore regular app player',25000);
    assert.ok(full.video.time>=pipAfter.video.time-2,'Returning from PiP rewound the player');
    noDuplicatePlayback(full);
  });

  await section('Actual Hebrew/English player labels, RTL and moving picture survive language changes',async()=>{
    await videoReady();
    const media3Labels=(await read()).videoEngine==='native-media3';
    const readLabels=async()=>JSON.parse(await evaluate(media3Labels?
      'JSON.stringify({lang:document.documentElement.lang,dir:document.documentElement.dir,labels:[...document.querySelectorAll("[data-watch-mode], [data-close-watch]")].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0).map(e=>({key:e.dataset.watchMode||"back",label:e.textContent.trim()})),title:document.querySelector(".watch-title")?.textContent||""})':
      'JSON.stringify({lang:document.documentElement.lang,dir:document.documentElement.dir,labels:[...document.querySelectorAll(".watch-hls-controls [aria-label]")].filter(e=>!e.hidden).map(e=>({key:Object.keys(e.dataset).find(k=>k.startsWith("hls")),label:e.getAttribute("aria-label")})),title:document.querySelector(".watch-title")?.textContent||""})'));
    await audioReady();await tap('[data-close-watch]');await wait(s=>!s.watchId,'Close Watch must reveal the real language control');
    await tap('[data-language-toggle]');await wait(s=>/^he/.test(s.lang),'Hebrew button must change actual player language');
    await videoReady();
    await delay(1500);const hebrew=await readLabels();
    assert.equal(hebrew.dir,'rtl','Hebrew player document must be RTL');
    assert.ok(hebrew.labels.length>=(media3Labels?3:5),'Actual Watch must expose translated Video, Audio and Back controls');
    assert.ok(hebrew.labels.every(x=>/[\u0590-\u05ff]/.test(x.label)),'Visible player controls must have Hebrew labels, including changing Play/Pause and Mute controls');
    await sampleMovingVideo();screenshot('hebrew-moving-player');
    await audioReady();await tap('[data-close-watch]');await wait(s=>!s.watchId,'Close Hebrew Watch must reveal language control');
    await tap('[data-language-toggle]');await wait(s=>s.lang==='en','Language button must restore English');
    await videoReady();
    await delay(900);const english=await readLabels();
    assert.equal(english.dir,'ltr');assert.ok(english.labels.every(x=>/[A-Za-z]/.test(x.label)),'Actual player labels must return to English');
    checks('Native Hebrew/English video control labels verified',{hebrew,english});
  });

  await section('Home during video continues native audio; media notification and controls reopen',async()=>{
    await closePlayer();const v=await videoReady();audibleVideo(v);
    const beforePosition=v.video.time;
    const homeAt=Date.now();
    adb('shell','input','keyevent','KEYCODE_HOME');
    // Native Media3 must actually become audible after the asynchronous Home
    // transfer; an arbitrary fixed sleep can sample VIDEO just before READY.
    const background=await wait(s=>safeNativeBackgroundHandoff(s),
      'Home did not establish audible native Audio with a simultaneously silent Video source',6500);
    const handoffMs=Date.now()-homeAt;
    assert.ok(handoffMs<=6500,'Home handoff exceeded the bounded background playback deadline');
    report.backgroundHandoffMs=handoffMs;
    const notification=adb('shell','dumpsys','notification','--noredact');
    assert.ok(notification.includes(pkg),'The app did not post a media notification while backgrounded');
    const sessions=adb('shell','dumpsys','media_session');
    assert.ok(sessions.includes(pkg),'The Android Media3 session is absent while backgrounded');
    audibleAudio(background);
    // A seamless handoff preserves the same clock; it need not gain a full
    // additional second while switching audio focus in ~1.6s. Require
    // continuity against the pre-Home video position with both a rewind guard
    // and a bounded forward-drift guard, then independently prove advancement.
    const backgroundSeconds=background.native.audioPositionMs/1000;
    const elapsedSeconds=(Date.now()-homeAt)/1000;
    assert.ok(backgroundSeconds>=beforePosition-1.0 &&
      backgroundSeconds<=beforePosition+elapsedSeconds+1.2,
      'Home must preserve real position (before='+beforePosition+
      ', native='+backgroundSeconds+', elapsed='+elapsedSeconds+')');
    report.backgroundPosition={videoBeforeSeconds:beforePosition,nativeAfterSeconds:backgroundSeconds,
      elapsedSeconds,deltaSeconds:backgroundSeconds-beforePosition};
    await delay(1400);
    const continuing=await read();audibleAudio(continuing);
    assert.ok(continuing.native.audioPositionMs>background.native.audioPositionMs+700,
      'Actual audible native Audio must advance in the background before reopening');
    report.background={notificationPosted:true,sessionRegistered:true, androidApi:report.androidApi,
      beforeMs:background.native.audioPositionMs,afterMs:continuing.native.audioPositionMs,
      audibleVolume:continuing.native.audioOutputVolume};
    adb('shell','cmd','statusbar','expand-notifications');
    await delay(1400);
    // Read the actual SystemUI tree without waiting for the continuously
    // updating media progress view to become idle. Taps still use ADB input.
    const xml=nativeHierarchy('emulator-report/irgun-notification.xml');
    screenshot('actual-android-notification-shade');
    await nativeNotificationTap(/(?:content-desc="Pause"|resource-id="[^"]*actionPlayPause")/,'pause');
    await wait(s=>!s.native.audioIsPlaying,'Physical notification Pause must stop actual Media3 audio');
    await nativeNotificationTap(/(?:content-desc="Play"|resource-id="[^"]*actionPlayPause")/,'play');
    const playing=await wait(s=>s.native.audioIsPlaying,'Physical notification Play must resume actual Media3 audio');
    if(report.androidApi===30) {
      // Android 11's notification shade shows a collapsed media card. Expand
      // real Quick Settings before requiring its visible seek-bar timer.
      adb('shell','cmd','statusbar','expand-settings');await delay(1000);
      screenshot('expanded-android11-media-timer');
    }
    const clockBefore=await notificationClock();await delay(3500);const clockAfter=await notificationClock();
    assert.ok(clockAfter>=clockBefore+2,'The visible Android notification timer must advance, not remain at 0:00');
    await nativeNotificationTap(/(?:content-desc="Forward 15 seconds"|resource-id="[^"]*actionNext")/,'forward');
    const physicalForward=await wait(s=>s.native.audioPositionMs>=playing.native.audioPositionMs+12000,'Physical notification Forward did not seek');
    await nativeNotificationTap(/(?:content-desc="Back 15 seconds"|resource-id="[^"]*actionPrev")/,'back');
    await wait(s=>s.native.audioPositionMs<=physicalForward.native.audioPositionMs-11000,'Physical notification Back did not seek');
    checks('Physical notification Play/Pause/Forward/Back and visible timer',{clockBefore,clockAfter});
    const updatedXml=nativeHierarchy('emulator-report/irgun-notification-after-controls.xml');
    const nodes=updatedXml.match(/<node\b[^>]*>/g)||[];
    const title=String(v.native.title||'');
    assert.ok(title,'The playing Irgun session must identify its notification title');
    const escapedTitle=title.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    const selected=nodes.find(n=>/visible="true"/.test(n)&&
      (n.includes('text="'+escapedTitle+'"')||n.includes('content-desc="'+escapedTitle+'"')));
    assert.ok(selected,'Media notification must have a tappable, visible title in Android shade');
    const rect=selected.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)?.slice(1).map(Number);
    assert.ok(rect&&rect[2]>rect[0]&&rect[3]>rect[1],'Visible notification title must have native screen bounds');
    adb('shell','input','tap',String(Math.round((rect[0]+rect[2])/2)),String(Math.round((rect[1]+rect[3])/2)));
    bounds=await nativeBounds(true);
    const back=await wait(s=>s.videoEngine==='native-media3' ? s.native.mode==='VIDEO'&&s.watchMode==='video'&&s.video&&!s.video.paused : s.native.mode==='AUDIO'&&s.native.audioIsPlaying,'Notification must reopen the previously selected Video with moving playback',50000);
    assert.ok(back.native.audioPositionMs/1000>=beforePosition+1,'Background handoff lost saved Video progress');
    assert.ok(back.native.audioPositionMs>=continuing.native.audioPositionMs-750,
      'Notification reopening must not rewind native Audio to the parked Video clock');
    if(back.videoEngine==='native-media3') audibleVideo(back); else audibleAudio(back);
    adb('shell','input','keyevent','KEYCODE_MEDIA_PAUSE');
    await wait(s=>!s.native.audioIsPlaying,'Media notification/session Pause action not respected',17000);
    adb('shell','input','keyevent','KEYCODE_MEDIA_PLAY');
    const resumed=await wait(s=>s.native.audioIsPlaying,'Media notification/session Play action not respected',17000);
    assert.ok(resumed.native.audioPositionMs/1000>=beforePosition,'Reopening must not reset the timer');
    // Exercise Android's real media key dispatch to the registered MediaSession.
    // These are OS media commands, not JavaScript setters or fake snapshots.
    const originalMs=Number(resumed.native.audioPositionMs);
    adb('shell','input','keyevent','KEYCODE_MEDIA_FAST_FORWARD');
    const forward=await wait(s=>s.native.audioIsPlaying&&
      Number(s.native.audioPositionMs)>=originalMs+12000,
      'MediaSession forward command did not seek by 15 seconds',19000);
    adb('shell','input','keyevent','KEYCODE_MEDIA_REWIND');
    const rewind=await wait(s=>s.native.audioIsPlaying&&
      Number(s.native.audioPositionMs)<=Number(forward.native.audioPositionMs)-11000,
      'MediaSession rewind command did not seek back by 15 seconds',19000);
    assert.ok(Number(rewind.native.audioPositionMs)>0,'Media notification timer returned to 0:00');
    checks('Android MediaSession Play, Pause, +15s, -15s and timer after reopening');
  });

  await section('Another real Android audio app interrupts Media3 and playback resumes after focus returns',async()=>{
    await closePlayer();const before=await audioReady();
    adb('shell','am','start','-W','-n','org.irgunshiuraitorah.qa/.AudioFocusActivity');
    const interrupted=await wait(s=>!s.native.audioIsPlaying,'Irgun must pause actual audio when another foreground audio app takes transient focus',6500);
    const focus=adb('logcat','-d','-s','IrgunQAAudioFocus:I','*:S');
    assert.match(focus,/requestResult=1/,'Other audio app must obtain real Android audio focus');
    assert.match(focus,/toneStarted=true/,'Other audio app must really start its audio output');
    await delay(1600);const held=await read();
    assert.ok(Math.abs(held.native.audioPositionMs-interrupted.native.audioPositionMs)<500,'Irgun audio must remain stopped while another app holds focus');
    const resumed=await wait(s=>s.native.audioIsPlaying,'Irgun native audio must resume after the other app abandons transient focus',20000);
    assert.ok(resumed.native.audioPositionMs>=before.native.audioPositionMs-750,'Audio interruption must preserve playback position');
    adb('shell','am','start','-W','-n',pkg+'/.MainActivity');await delay(700);bounds=await nativeBounds();
    audibleAudio(await read());
  });

  if(report.androidApi>=33)await section('Denied and granted Android notification permission retain media playback and notification',async()=>{
    await audioReady();
    try {
      adb('shell','pm','revoke',pkg,'android.permission.POST_NOTIFICATIONS');
      assert.match(adb('shell','dumpsys','package',pkg),/android.permission.POST_NOTIFICATIONS: granted=false/,'Actual notification permission must be denied');
      adb('shell','input','keyevent','KEYCODE_HOME');await delay(2000);
      const start=await read();await delay(2300);const after=await read();audibleAudio(after);
      assert.ok(after.native.audioPositionMs>start.native.audioPositionMs+1000,'Permission denial must not stop media');
      adb('shell','cmd','statusbar','expand-notifications');await delay(1200);
      const xml=nativeHierarchy('emulator-report/notification-permission-denied.xml');
      assert.ok(xml.includes('media_progress_bar')||xml.includes('media_elapsed_time')||xml.includes('qs_media_controls'),'Actual exempt media notification must remain visible with notifications denied');
    }finally {
      adb('shell','cmd','statusbar','collapse');adb('shell','pm','grant',pkg,'android.permission.POST_NOTIFICATIONS');
      adb('shell','am','start','-W','-n',pkg+'/.MainActivity');await delay(700);bounds=await nativeBounds();
    }
    assert.match(adb('shell','dumpsys','package',pkg),/android.permission.POST_NOTIFICATIONS: granted=true/,'Actual notification permission must be granted again');
    audibleAudio(await read());
  });

  await section('Android forced Doze preserves foreground media audio and position',async()=>{
    await audioReady();
    try {
      adb('shell','input','keyevent','KEYCODE_HOME');adb('shell','dumpsys','battery','unplug');
      adb('shell','input','keyevent','KEYCODE_SLEEP');
      adb('shell','cmd','deviceidle','force-idle');
      assert.match(adb('shell','dumpsys','deviceidle'),/mState=IDLE/,'Android must really enter deep Doze');
      const start=await read();await delay(4500);const after=await read();audibleAudio(after);
      assert.ok(after.native.audioPositionMs>start.native.audioPositionMs+2000,'Media clock must advance during actual Android Doze');
    }finally {
      adb('shell','cmd','deviceidle','unforce');adb('shell','dumpsys','battery','reset');
      adb('shell','input','keyevent','KEYCODE_WAKEUP');adb('shell','input','keyevent','KEYCODE_MENU');
      adb('shell','am','start','-W','-n',pkg+'/.MainActivity');await delay(900);bounds=await nativeBounds();
    }
    audibleAudio(await read());
  });

  await section('Actual offline download plays native audio without Wi-Fi or mobile data',async()=>{
    await closePlayer();await videoReady();
    const before=await read();
    if(!before.offline.some(x=>x.id===before.watchId&&x.bytes>0))
      await tap('[data-save-offline-kind="video"][data-save-offline-id="'+before.watchId+'"]');
    const saved=await wait(s=>s.offline.some(x=>x.id===before.watchId&&x.bytes>0),'Audio file was not downloaded to Android local storage',180000);
    const record=saved.offline.find(x=>x.id===before.watchId);
    assert.ok(record?.uri&&record.bytes>0,'Offline download requires a verified local URI and file size');
    const savedPath=record.uri.replace(/^file:\/\//,'');
    assert.ok(savedPath.startsWith('/data/user/0/'+pkg+'/files/irgun-offline/')&&!savedPath.includes('..'),
      'Downloaded file must be within this app\'s private offline directory');
    adb('shell','run-as',pkg,'ls',savedPath);
    const beforeAudio=await read();
    assert.ok(beforeAudio.video&&!beforeAudio.video.paused&&beforeAudio.native.mode==='VIDEO',
      'Downloading an offline file interrupted an actively playing video before switching to Audio');
    const audio=await audioReady();
    assert.equal(audio.currentOffline,true,'Audio playback must select the offline file, not the network URL');
    try{
      await setOnline(false);
      const start=await read();audibleAudio(start);await delay(3500);
      const end=await read();audibleAudio(end);
      assert.ok(end.native.audioPositionMs>start.native.audioPositionMs+1400,'Downloaded audio must continue playing without internet');
      checks('Actual downloaded audio played while offline',{bytes:record.bytes,downloadAttempts:record.downloadAttempts});
      ws.close();adb('shell','am','force-stop',pkg);adb('shell','am','start','-W','-n',pkg+'/.SplashActivity');
      await delay(2500);await connect();bounds=await nativeBounds();
      const restarted=await wait(s=>s.ready&&s.offline.some(x=>x.key===record.key),'Actual offline app restart must load the cached library and saved download');
      assert.equal(restarted.isLoggedIn,process.env.IRGUN_EXPECT_SIGNED_IN==='1','Offline restart must retain the declared account session');
      await tap('.bottom-nav [data-nav="library"]');
      for(let i=0;i<7&&!await hit('[data-library-section="downloads"]');i++) {
        const strip=JSON.parse(await evaluate('JSON.stringify((()=>{const r=document.querySelector(".library-tabs-scroll")?.getBoundingClientRect();return r?{x:r.x,y:r.y,w:r.width,h:r.height,width:innerWidth,height:innerHeight,rtl:getComputedStyle(document.querySelector(".library-tabs-scroll")).direction==="rtl"}:null;})())'));
        assert.ok(strip,'Actual Library tab strip must render offline');
        const from=nativeXY({x:strip.x+strip.w*(strip.rtl?.18:.82),y:strip.y+strip.h*.5,width:strip.width,height:strip.height}),to=nativeXY({x:strip.x+strip.w*(strip.rtl?.82:.18),y:strip.y+strip.h*.5,width:strip.width,height:strip.height});
        adb('shell','input','swipe',...from.map(String),...to.map(String),'420');await delay(500);
      }
      await tap('[data-library-section="downloads"]');await tapWithScroll('[data-offline-play="'+record.key+'"]');
      const startAfterRestart=await wait(s=>s.currentOffline&&s.native.audioIsPlaying,'Persisted local audio must start without internet after process restart');
      await delay(4500);const endAfterRestart=await read();audibleAudio(endAfterRestart);
      assert.ok(endAfterRestart.native.audioPositionMs>startAfterRestart.native.audioPositionMs+1800,'Restarted offline audio clock must advance');
      report.offlineRestart={bytes:record.bytes,positionBeforeMs:startAfterRestart.native.audioPositionMs,positionAfterMs:endAfterRestart.native.audioPositionMs};
      checks('Process restart while offline reopens and plays the real downloaded file');
    }finally{await setOnline(true);}
    if(process.env.IRGUN_EXPECT_SIGNED_IN==='1')await verifyOfflineServerHistory(record.id);
    const audioBeforeVideo=await read();
    assert.equal(audioBeforeVideo.native.mode,'AUDIO','Native MP3 must own playback until actual Video frames arrive');
    const recoveredVideo=await sampleMovingVideo();
    assert.ok(recoveredVideo.before.video.time>=audioBeforeVideo.native.audioPositionMs/1000-8,
      'Video after offline MP3 rewinded the live audio position');
    checks('Reconnected offline MP3 returns to advancing Video frames',{
      videoSeconds:recoveredVideo.after.video.time,
      audioBeforeSeconds:audioBeforeVideo.native.audioPositionMs/1000,
      framesDecoded:recoveredVideo.after.video.frames-recoveredVideo.before.video.frames
    });
    const present=await read();
    assert.ok(present.offline.some(x=>x.key===record.key&&x.bytes>0),'Downloaded file disappeared before deletion');
    await tap('[data-save-offline-kind="video"][data-save-offline-id="'+before.watchId+'"]');
    const modalBefore=await read();await delay(1300);const modalAfter=await read();
    if(modalBefore.videoEngine==='native-media3'){
      // Native PlayerView deliberately hides only the picture surface while
      // the save/remove dialog is above it. Requiring rendered frames behind
      // the dialog is wrong; the SAME Media3 audio clock must continue.
      assert.ok(modalAfter.media3?.active&&modalAfter.media3.playing,
        'Actual native Media3 session must continue behind offline dialog');
      assert.ok(modalAfter.media3.positionMs>modalBefore.media3.positionMs+500,
        'Offline confirmation must not pause or rewind the shared Media3 clock');
      assert.equal(modalAfter.webViewVideo,null,'Modal must not start WebView fallback');
    }else{
      audibleVideo(modalAfter);
      assert.ok(modalAfter.video.time>modalBefore.video.time+.5&&
        modalAfter.video.frames>modalBefore.video.frames,
        'Actual WebView Video must keep moving while offline confirmation is visible');
    }
    await tap('[data-offline-delete-cancel]');
    if(modalBefore.videoEngine==='native-media3')await sampleMovingVideo();
    assert.equal(await hit('[data-offline-delete-confirm]'),null,'Physical Cancel must close the actual offline confirmation');
    assert.ok((await read()).offline.some(x=>x.key===record.key),'Cancel must retain the downloaded record');
    adb('shell','run-as',pkg,'ls',savedPath);
    checks('Physical offline Cancel preserves the actual file while the modal keeps Video moving');
    await tap('[data-save-offline-kind="video"][data-save-offline-id="'+before.watchId+'"]');
    await tapOfflineDeleteConfirmation();
    await wait(s=>!s.offline.some(x=>x.key===record.key),'Offline file was not deleted after user confirmation',25000);
    let deletionError;
    try{adb('shell','run-as',pkg,'ls',savedPath);}catch(error){deletionError=error;}
    assert.ok(deletionError,'The actual MP3 file must be absent from Android storage, not only removed from the UI');
    assert.match([deletionError.stderr,deletionError.stdout,deletionError.message].map(value=>String(value||'')).join('\n'),/No such file or directory/,
      'File absence must be confirmed by Android, not a permission or observer failure');
    checks('Offline download was deleted by physical Android UI with server playback unaffected');
  });

  await section('Wi-Fi and mobile-data interruptions recover video at saved position',async()=>{
    await closePlayer();const a=await videoReady();const prior=a.video.time;
    try{
      await setOnline(false);
      assert.equal(adb('shell','settings','get','global','wifi_on'),'0','Wi-Fi was not disabled');
      await delay(4300);
    }finally{await setOnline(true);}
    const recovered=await wait(s=>s.watchMode==='video'&&s.video&&
      !s.video.paused&&s.video.ready>=2&&
      (s.videoEngine!=='native-media3'||s.media3.surfaceVisibleOnScreen),
      'Video did not recover from network interruption',65000);
    // READY after network restoration can precede the first new HLS keyframe.
    // Require genuinely moving decoded frames and clock, not an arbitrary
    // 2.3-second snapshot taken during a new buffering interval.
    const after=await wait(s=>s.watchMode==='video'&&s.video&&
      !s.video.paused&&s.video.ready>=2&&
      s.video.time>recovered.video.time+1.3&&
      s.video.frames>recovered.video.frames+3&&
      (s.videoEngine!=='native-media3'||s.media3.surfaceVisibleOnScreen),
      'Native video frames and clock never recovered after physical network restoration',35000);
    audibleVideo(after);
    assert.ok(after.video.time>=prior-2,'Video resumed from the beginning after Wi-Fi loss');
    checks('Video playback recovery after Wi-Fi/mobile-data interruption',{startSeconds:prior,endSeconds:after.video.time});
  });

  await section('Native Media3 slow transport and real unbuffered HLS/MP4 failure recover without rewind',async()=>{
    await closePlayer();const start=await videoReady();
    if(start.videoEngine==='native-media3'){
      const initialTransport=start.media3.sourceType;
      assert.ok(['hls','mp4'].includes(initialTransport),
        'Native transport regression must observe its REAL HLS/MP4 source; actual='+initialTransport);
      // Previous physical network loss can produce a documented native
      // HLS->MP4 fallback. Do not incorrectly label a real MP4 run as HLS.
      // Separate native-HLS jobs still insist on genuine HLS across APIs.
      report.nativeNetworkSource=initialTransport;save();
      const originalPid=adb('shell','pidof',pkg);
      const originalSource=start.native.lectureId;
      const originalPlayer=start.media3.playerIdentity;
      const originalMediaItem=start.media3.mediaItemIdentity;
      let throttled=false;
      const genuineSeek=async(bufferEnd)=>{
        let before=await read(),last=before;
        const target=Math.min(start.media3.durationMs-60000,
          Math.max(before.media3.positionMs+45000,bufferEnd+40000));
        assert.ok(target>before.media3.positionMs+30000,'Need a genuinely unbuffered distant seek target');
        // Real Android MediaSession remote/physical media-key actions; never
        // call IrgunNativeVideo.playback or set any test clock directly.
        for(let n=0;n<28&&last.media3.positionMs<target-6000;n++){
          adb('shell','input','keyevent','KEYCODE_MEDIA_FAST_FORWARD');
          await delay(200);
          last=await read();
        }
        if(last.media3.positionMs<target-6000){
          // Android 11 MediaSession sometimes stops accepting repeated FF
          // keyevents after a real unbuffered network stall. The user can
          // still seek using Watch's actual physical Audio slider. Exercise
          // that supported UI rather than injecting any synthetic clock or
          // accepting a seek that never occurred.
          await tap('[data-watch-mode="audio"]');
          await wait(s=>s.watchMode==='audio'&&s.native.mode==='AUDIO'&&
            s.media3?.active&&!s.media3.videoSelected,
            'Physical Audio button must present the same native Media3 engine while offline',25000);
          const soughtAudio=await seekAudio(target/1000);
          assert.ok(Math.abs(soughtAudio.native.audioPositionMs-target)<8000,
            'Actual Android slider did not seek offline native audio to requested clock');
          await tap('[data-watch-mode="video"]');
          last=await wait(s=>s.watchMode==='video'&&s.native.mode==='VIDEO'&&
            s.media3?.active&&s.media3.videoSelected&&
            Math.abs(s.media3.positionMs-target)<8000,
            'Returning to native Video must retain the physical offline Audio seek',25000);
          report.gestures.push({label:'Physical Android 11 stalled-key fallback: Watch Audio slider and Video',
            expectedMs:target,observedMs:last.media3.positionMs});
        }
        assert.ok(last.media3.positionMs>=target-8000,
          'Neither physical media keys nor actual Watch slider could reach unbuffered source: '+JSON.stringify({
            target,actual:last.media3.positionMs,buffered:before.media3.bufferedPositionMs}));
        report.nativeTransportSeeks||=[];
        report.nativeTransportSeeks.push({target,actual:last.media3.positionMs,
          previouslyBuffered:before.media3.bufferedPositionMs,networkCondition:throttled?'throttled':'offline'});
        save();
        return last;
      };
      try{
        // adb emu network commands shape the entire emulator network, including
        // native ExoPlayer HTTP. CDP Network.emulateNetworkConditions would
        // affect only WebView and was a false positive for this native engine.
        // 384 kb/s UMTS (<50 KB/s) cannot sustain the source's HD HLS
        // rendition; requiring uninterrupted decoded Video at that speed
        // confuses simple bandwidth starvation with a player bug. HSDPA with
        // EDGE latency still deliberately impairs the *whole emulator* while
        // leaving enough throughput for adaptive playback. The separate
        // all-networks-disabled test below remains a hard outage.
        adb('emu','network','speed','hsdpa');
        adb('emu','network','delay','edge');
        throttled=true;
        const networkStatus=adb('emu','network','status');
        assert.ok(networkStatus.length>10,'Actual emulator shaping must be observable');
        report.nativeNetworkThrottle=networkStatus.slice(0,1500);save();
        const sought=await genuineSeek(start.media3.bufferedPositionMs);
        const slow=await wait(s=>s.media3?.active&&s.media3.videoSelected&&
          (s.media3.sourceType===initialTransport||
            (initialTransport==='hls'&&s.media3.sourceType==='mp4'))&&
          s.media3.firstFrame&&s.media3.playing&&
          s.media3.bufferedPositionMs>s.media3.positionMs+1000&&
          s.media3.positionMs>=sought.media3.positionMs-2000,
          'Native HLS did not decode newly fetched frames under actual emulator network throttling',95000);
        await delay(2500);const slowMoved=await read();
        audibleVideo(slowMoved);
        assert.ok(slowMoved.media3.positionMs>slow.media3.positionMs+900&&
          slowMoved.media3.frames>slow.media3.frames+3,
          'Under real emulator throttle, native HLS clock and decoded frames must advance');
        checks('Native '+initialTransport.toUpperCase()+' continued after a physical seek under actual emulator-wide HSDPA speed/EDGE latency',
          {networkStatus,startedMs:start.media3.positionMs,throttledPositionMs:slowMoved.media3.positionMs});
        await setOnline(false);
        const lost=await genuineSeek(slowMoved.media3.bufferedPositionMs);
        let stalled=false,last;
        const deadline=Date.now()+18000;
        while(Date.now()<deadline){
          last=await read();
          if(last.native.networkRecoveryPending||!last.media3?.playing){stalled=true;break;}
          await delay(600);
        }
        assert.ok(stalled,
          'Unbuffered native HLS must encounter actual transport loss when Android Wi-Fi/data are both disabled; last='+JSON.stringify({
            native:last?.native,media3:last?.media3}));
        checks('Native ExoPlayer observed actual stalled/unavailable unbuffered data while all Android networks were disabled',
          {positionMs:lost.media3.positionMs,bufferedBeforeMs:slowMoved.media3.bufferedPositionMs,
            recoveryPending:Boolean(last.native.networkRecoveryPending)});
        await setOnline(true);
        adb('emu','network','speed','full');
        adb('emu','network','delay','none');
        throttled=false;
        const recovered=await wait(s=>s.media3?.active&&s.media3.videoSelected&&
          (s.media3.sourceType===initialTransport||
            (initialTransport==='hls'&&s.media3.sourceType==='mp4'))&&
          s.media3.firstFrame&&s.media3.playing&&
          s.media3.bufferedPositionMs>s.media3.positionMs&&
          s.media3.positionMs>=lost.media3.positionMs-2000,
          'Native HLS did not resume from the unbuffered failed seek after real network restoration',95000);
        const again=await wait(s=>s.media3?.playing&&s.media3.videoSelected&&
          s.media3.positionMs>recovered.media3.positionMs+900&&
          s.media3.frames>recovered.media3.frames+3,
          'Recovered native transport must resume its clock and decoded frames',25000);
        audibleVideo(again);
        assert.ok(again.media3.positionMs>recovered.media3.positionMs+900&&
          again.media3.frames>recovered.media3.frames+3,
          'Native HLS failed to render new frames after transport recovery');
        assert.equal(adb('shell','pidof',pkg),originalPid,'Actual app process changed during network recovery');
        assert.equal(again.native.lectureId,originalSource,'Network recovery changed to a different shiur');
        assert.equal(again.media3.playerIdentity,originalPlayer,'Network recovery must retain the same ExoPlayer');
        if(again.media3.sourceType===initialTransport)assert.equal(again.media3.mediaItemIdentity,
          originalMediaItem,'Transport retry must retain the same MediaItem');
        checks('Native ExoPlayer resumed moving '+initialTransport.toUpperCase()+' at original lecture and position after genuine unbuffered network loss',
          {fromMs:lost.media3.positionMs,toMs:again.media3.positionMs});
      }finally{
        try{await setOnline(true);}catch{}
        try{adb('emu','network','speed','full');adb('emu','network','delay','none');}catch{}
      }
      return;
    }

    assert.equal(start.sourceType,'hls','Slow/interrupted transport test must run on real HLS video');
    const seekVideo=async seconds=>{
      const point=JSON.parse(await evaluate('JSON.stringify((()=>{const e=document.querySelector("[data-hls-seek]"),r=e?.getBoundingClientRect(),v=document.querySelector("#watchDirectHlsVideo");if(!r||!v?.duration)return null;const fraction='+seconds+'/v.duration,rtl=getComputedStyle(e).direction==="rtl",x=r.left+8+(r.width-16)*(rtl?1-fraction:fraction),y=r.top+r.height/2;return document.elementFromPoint(x,y)===e?{x,y,width:innerWidth,height:innerHeight}:null;})())'));
      assert.ok(point,'Visible HLS seek bar required to fetch real unbuffered video');
      bounds=await nativeBounds();adb('shell','input','tap',...nativeXY(point).map(String));await delay(500);
      const observed=Number(await evaluate('document.querySelector("#watchDirectHlsVideo")?.dataset.hlsSeekRequestedSeconds || NaN'));
      assert.ok(Number.isFinite(observed)&&Math.abs(observed-seconds)<15,
        'Physical HLS range tap did not dispatch a seek to its requested position: expected='+seconds+' observed='+observed);
      report.physicalHlsSeeks||=[];
      report.physicalHlsSeeks.push({expectedSeconds:seconds,requestedSeconds:observed});save();
    };
    await command('Network.enable');await command('Network.setCacheDisabled',{cacheDisabled:true});
    try {
      networkPhase='slow';
      await command('Network.emulateNetworkConditions',{offline:false,latency:800,downloadThroughput:160000,uploadThroughput:40000});
      await seekVideo(start.video.time+180);
      await wait(s=>s.video&&!s.video.paused&&s.video.time>start.video.time+140,'Slow real HLS transport did not recover at requested position',65000);
      await sampleMovingVideo();
      assert.ok(report.networkEvidence.some(x=>x.phase==='slow'&&!x.error&&x.bytes>0&&x.elapsedMs>=650),'A real HLS request must transfer bytes under measured latency; accepting a throttle command alone is not a pass');
      const beforeLoss=await read(),target=beforeLoss.video.time+180;
      networkPhase='offline';
      await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});
      await seekVideo(target);
      const failureDeadline=Date.now()+10000;
      while(Date.now()<failureDeadline&&!report.networkEvidence.some(failedDuringOffline)) await delay(300);
      assert.ok(report.networkEvidence.some(failedDuringOffline),'Unbuffered HLS must really encounter a failed network request');
      networkPhase='reconnected';
      await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
      await wait(s=>s.video&&!s.video.paused&&s.video.time>target-20,'Playback must recover close to the interrupted seek position',65000);
      await sampleMovingVideo();
      assert.ok(adb('shell','pidof',pkg),'App must remain alive during real network transport failures');
    }finally {
      networkPhase='normal';await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
      await command('Network.setCacheDisabled',{cacheDisabled:false});
    }
  });

  await section('Long-session lock/unlock and resumed media controls do not crash',async()=>{
    await closePlayer();
    // Resume an existing lecture when the cold relaunch closed the watch page.
    // Keep the assertion explicit: no fake media state is inserted into JS.
    const current=await read();
    assert.ok(current.watchId,'A real shiur must remain available for reliability test');
    let a=await audioReady();audibleAudio(a);
    for(let i=0;i<3;i++) {
      adb('shell','input','keyevent','KEYCODE_POWER');await delay(1300);
      adb('shell','input','keyevent','KEYCODE_POWER');
      adb('shell','input','keyevent','KEYCODE_MENU');await delay(1000);
      const b=await wait(s=>s.watchId&&s.native.audioIsPlaying,'Lock/unlock lost audio playback');
      assert.ok(b.native.audioPositionMs>=a.native.audioPositionMs,'Audio time reset on lock/unlock');
      a=b;
    }
    assert.ok(adb('shell','pidof',pkg),'Android process crashed during lock/unlock');
  });  await section('Playback starts at 1x; native 1.25x, 1.5x, 2x work; 1.5x survives restart',async()=>{
    await closePlayer();
    const playing=await audioReady();
    audibleAudio(playing);
    assert.ok(Math.abs(playing.speed-1)<0.01,'Fresh-session default speed must be 1x, never 0.75x');
    // The speed settings are on the full player opened from the mini player.
    // The Watch page itself has no [data-open-player] control.
    await tap('[data-close-watch]');
    await wait(s=>!s.watchId&&s.currentId==='1233236785:585d5d53db','Closing Watch must retain live native audio');
    await tapWithScroll('.mini-player .mini-copy');
    await wait(s=>s.playerOpen,'Audio full-player settings did not open from real mini player');
    for(const rate of [1.25,1.5,2,1.5]) {
      await tapWithScroll('[data-speed-choice="'+rate+'"]');
      const adjusted=await wait(s=>Math.abs(s.speed-rate)<0.01&&Math.abs(s.native.playbackSpeed-rate)<0.05,
        'Native Media3 playback speed did not become '+rate+'x',20000);
      audibleAudio(adjusted);
      const old=adjusted.native.audioPositionMs;
      await delay(2100);
      const newer=await read();
      assert.ok(newer.native.audioPositionMs>old+rate*1100,'Audio clock did not advance at '+rate+'x');
      checks('Native playback speed '+rate+'x',{timeBeforeMs:old,timeAfterMs:newer.native.audioPositionMs});
    }
    await closePlayer();
    const atSpeed=await read(),lecture=atSpeed.currentId;
    await videoReady();const videoAtSpeed=await wait(s=>s.video&&Math.abs(s.video.rate-1.5)<.05,'Video handoff must preserve the chosen 1.5x speed');
    await audioReady();const audioAtSpeed=await wait(s=>Math.abs(s.native.playbackSpeed-1.5)<.05,'Audio handoff must preserve the chosen 1.5x speed');
    assert.equal(audioAtSpeed.watchId,lecture,'Speed handoffs must keep the same shiur');
    checks('Audio to Video to Audio retains 1.5x',{videoRate:videoAtSpeed.video.rate,audioRate:audioAtSpeed.native.playbackSpeed});
    await closePlayer();
    ws.close();
    adb('shell','am','force-stop',pkg);
    adb('shell','am','start','-W','-n',pkg+'/.SplashActivity');
    await delay(3000);
    await connect();bounds=await nativeBounds();
    const restored=await wait(s=>s.ready,'App did not reload after force-stop',45000);
    assert.ok(Math.abs(restored.speed-1.5)<0.01,'1.5x playback speed preference was lost after relaunch');
  });
  await section('Small-screen English/Hebrew layouts retain usable navigation',async()=>{
    const originalSize=adb('shell','wm','size');
    await closePlayer();
    try{
      if((await read()).watchId){
        await tap('[data-close-watch]');
        await wait(s=>!s.watchId,'Watch overlay must close before checking main navigation');
      }
      if (/^he/.test((await read()).lang)) await tap('[data-language-toggle]');
      const english=await wait(s=>s.ready&&s.lang==='en','English app must render before narrow layout');
      assert.ok(english.ready);
      adb('shell','wm','size','240x320');
      await delay(1400);
      const readLayout=async()=>JSON.parse(await evaluate('JSON.stringify({w:innerWidth,h:innerHeight,lang:document.documentElement.lang,dir:document.documentElement.dir,nav:[...document.querySelectorAll(".bottom-nav [data-nav]")].map(x=>{let r=x.getBoundingClientRect();return {key:x.dataset.nav,width:r.width,left:r.left,right:r.right,bottom:r.bottom}})})'));
      const englishScreen=await readLayout();
      assert.match(adb('shell','wm','size'),/Override size:\s*240x320/,
        'Android must actually use a 240x320 screen');
      assert.ok(englishScreen.w>0&&englishScreen.w<500,'Narrow Android WebView width must be bounded');
      assert.equal(englishScreen.lang,'en','English interface changed unexpectedly');
      assert.ok(englishScreen.nav.length>=3,'English narrow layout needs main navigation');
      assert.ok(englishScreen.nav.every(n=>n.width>=25&&n.left>=-4&&n.right<=englishScreen.w+4),
        'English navigation is clipped on small screens');
      screenshot('small-screen-english');

      // Restore actual Android resolution before another physical tap, because
      // the UI hierarchy cannot expose accurate WebView hit-boxes after wm resize.
      // Both reduced-width layouts below are still rendered by the real emulator.
      adb('shell','wm','size','reset');
      await delay(1100);
      bounds=await nativeBounds();
      await tap('[data-language-toggle]');
      await wait(s=>s.lang==='he'||s.lang==='he-IL','Real language button did not activate Hebrew');
      adb('shell','wm','size','240x320');
      await delay(1100);
      const hebrewScreen=await readLayout();
      assert.ok(/^he/.test(hebrewScreen.lang),'Hebrew interface did not survive narrow-screen resize');
      assert.ok(hebrewScreen.dir==='rtl',
        'Hebrew document must be explicitly right-to-left');
      assert.ok(hebrewScreen.nav.length>=3,'Hebrew narrow layout needs main navigation');
      assert.ok(hebrewScreen.nav.every(n=>n.width>=25&&n.left>=-4&&n.right<=hebrewScreen.w+4),
        'Hebrew navigation is clipped on small screens');
      screenshot('small-screen-hebrew');
      report.smallScreen={english:englishScreen,hebrew:hebrewScreen,actualSize:adb('shell','wm','size')};
    }finally{
      adb('shell','wm','size','reset');await delay(900);
    }
  });


} catch(e){
  report.failures.push({name:'setup',error:String(e.stack||e)});
  screenshot('release-setup-failure');
} finally{
  try{await setOnline(true);}catch{}
  try{adb('shell','wm','size','reset');}catch{}
  try{ws?.close();}catch{}
  report.finishedAt=new Date().toISOString();
  report.status=report.failures.length||!report.scenarios?.length?'failed':'passed';
  save();
  console.log(JSON.stringify({status:report.status,checks:report.checks.map(x=>x.label),failures:report.failures},null,2));
  if(report.failures.length)process.exitCode=1;
}

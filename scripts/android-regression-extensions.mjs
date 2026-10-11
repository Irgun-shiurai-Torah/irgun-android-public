import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Run after android-emulator-mp4.mjs: the actual reported shiur is already
// playing in native AUDIO mode. All UI actions below are physical ADB events.
// CDP is used only to observe test-build state and app/media outcomes.
const pkg = 'org.irgunshiuraitorah.app';
const delay = ms => new Promise(r => setTimeout(r, ms));
const adb = (...args) => execFileSync('adb', args, { encoding:'utf8', timeout:30000 }).trim();
const report = {startedAt:new Date().toISOString(),checks:[],failures:[], device:'Android emulator'};
const ensureReport = () => mkdirSync('emulator-report',{recursive:true});
let ws,seq=0,pending=new Map(),bounds;
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
    const message=JSON.parse(ev.data),p=pending.get(message.id);
    if(!p)return;
    pending.delete(message.id);clearTimeout(p.timer);
    if(message.error||message.result?.exceptionDetails)p.reject(new Error('WebView read failed: '+JSON.stringify(message.error||message.result.exceptionDetails)));
    else p.resolve(message.result?.result?.value);
  });
  socket.addEventListener('close',()=>{
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('WebView inspector disconnected'));}
    pending.clear();
  });
}
async function evaluate(expression) {
  assert.ok(ws?.readyState===WebSocket.OPEN,'WebView observation channel unavailable');
  return await new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('WebView observation timeout'));},12000);
    pending.set(id,{resolve,reject,timer});
    ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));
  });
}
async function read() {
  const snap=await evaluate('JSON.stringify(window.ISTReleaseQA?.snapshot?.() || {observerMissing:true})');
  const s=JSON.parse(snap);
  assert.equal(s.observerMissing,undefined,'QA observer must be appended to this disposable build');
  s.native=await evaluate("window.Capacitor.nativePromise('IrgunPlayback','getState',{})");
  return s;
}
async function wait(test,message,timeout=45000) {
  const deadline=Date.now()+timeout;
  let last, lastError;
  while(Date.now()<deadline) {
    try {last=await read();if(test(last))return last;}catch(e){lastError=String(e.message);}
    await delay(600);
  }
  throw new Error(message+'; last='+JSON.stringify(last||{})+'; error='+String(lastError||'none'));
}
async function nativeBounds() {
  for(let i=0;i<5;i++){
    try{
      adb('shell','rm','-f','/sdcard/irgun-regression-bounds.xml');
      adb('shell','uiautomator','dump','/sdcard/irgun-regression-bounds.xml');
      const xml=adb('shell','cat','/sdcard/irgun-regression-bounds.xml');
      const node=xml.match(/<node\b[^>]*class="android\.webkit\.WebView"[^>]*>/)?.[0];
      const arr=node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)?.slice(1).map(Number);
      if(arr&&arr[2]>arr[0]&&arr[3]>arr[1])return arr;
    }catch{}
    await delay(700);
  }
  // The real media handoff test already obtained uncompressed native WebView
  // bounds on this exact emulator and screenshot geometry. Reuse that measured
  // result only when the UI hierarchy temporarily returns a null root.
  try {
    const prior=JSON.parse(readFileSync('emulator-report/reported-shiur.json','utf8'));
    const measured=prior.nativeBounds;
    const current=adb('shell','wm','size').match(/(\d+)x(\d+)/g)?.at(-1)?.split('x').map(Number);
    assert.ok(prior.result==='passed'&&Array.isArray(measured)&&measured.length===4,
      'Only passed baseline observations may provide fallback native bounds');
    assert.ok(current&&measured[0]>=0&&measured[1]>=0&&measured[2]<=current[0]&&measured[3]<=current[1],
      'Baseline bounds must fit actual current Android screen');
    report.boundsSource='measured by preceding real-media baseline';
    return measured;
  } catch (error) {
    throw new Error('Actual Android WebView bounds are unavailable: '+String(error.message||error));
  }
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
  const point=await hit(selector);
  assert.ok(point,'A visible, hit-tested native control is required: '+selector);
  const xy=nativeXY(point);
  adb('shell','input','tap',String(xy[0]),String(xy[1]));
  await delay(500);
  return xy;
}
async function tapWithScroll(selector) {
  for(let attempt=0;attempt<8;attempt++) {
    const point=await hit(selector);
    if(point) return tap(selector);
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
async function tapPositiveAndroidDialog(){
  let failures=[];
  for(let attempt=1;attempt<=6;attempt++){
    const xmlPath='/sdcard/irgun-offline-delete-dialog.xml';
    adb('shell','rm','-f',xmlPath);
    try{
      const args=['shell','uiautomator','dump'];
      if(attempt%2===0)args.push('--compressed');
      args.push(xmlPath);
      adb(...args);
      const xml=adb('shell','cat',xmlPath);
      const nodes=xml.match(/<node\b[^>]*>/g)||[];
      const positive=nodes.find(n=>/text="(OK|Yes|Delete|Remove)"/i.test(n)&&/clickable="true"/.test(n));
      const rect=positive?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)?.slice(1).map(Number);
      if(rect&&rect[2]>rect[0]&&rect[3]>rect[1]){
        adb('shell','input','tap',String(Math.round((rect[0]+rect[2])/2)),String(Math.round((rect[1]+rect[3])/2)));
        return;
      }
      failures.push('No native positive confirmation in attempt '+attempt);
    }catch(e){failures.push(String(e.message||e).slice(0,160));}
    await delay(650);
  }
  throw new Error('Could not confirm actual Android offline-file deletion: '+failures.join(' | '));
}
function checks(label,details={}) {report.checks.push({label,...details});save();}
async function section(name,fn){
  report.activeSection=name;save();
  report.device = String(adb('shell','getprop','ro.build.version.release')).trim();
  report.androidApi = Number(adb('shell','getprop','ro.build.version.sdk'));
  try {await fn();checks(name);console.log('PASS: '+name);}
  catch(e){const error=String(e.stack||e);report.failures.push({name,error});screenshot('failed-'+report.failures.length);console.error('FAIL: '+name+': '+error.slice(0,1400));}
  finally{save();}
}
function noDuplicatePlayback(s){
  assert.ok(s.overlays===1,'Exactly one video overlay is expected');
  assert.ok(s.videos<=1&&s.iframes<=1,'There must be no duplicated video/iframe');
}
function audibleVideo(s){
  assert.ok(s.video&&!s.video.paused&&s.video.ready>=2&&s.video.width>0,'Video must be decoding and playing');
  assert.equal(s.video.error,null,'Video decoder must not fail');
  assert.ok(!s.video.muted&&s.video.volume>0,'Video must be audible');
  assert.equal(s.native.mode,'VIDEO','Media3 must authorize the video, not a second audio stream');
  if(typeof s.native.audioOutputVolume==='number')assert.equal(s.native.audioOutputVolume,0,'Native shadow audio must be silent in video mode');
  noDuplicatePlayback(s);
}
function audibleAudio(s){
  assert.equal(s.native.mode,'AUDIO','Media3 must authorize native audio');
  assert.ok(s.native.audioIsPlaying,'Native audio must be playing');
  if(typeof s.native.audioOutputVolume==='number')assert.ok(s.native.audioOutputVolume>0,'Native audio volume must be audible');
  if(s.video)assert.ok(s.video.paused||s.video.muted||s.video.volume===0,'Video must not audibly duplicate native audio');
}
async function videoReady(){
  const current=await read();
  if(current.watchMode!=='video')await tap('[data-watch-mode="video"]');
  return await wait(
    s=>s.watchMode==='video'&&s.video&&!s.video.paused&&s.video.ready>=2&&s.video.width>0&&
      !s.video.muted&&s.video.volume>0&&s.native.mode==='VIDEO'&&
      (typeof s.native.audioOutputVolume!=='number'||s.native.audioOutputVolume===0),
    'Video did not regain moving, audible VIDEO authority without overlapping native audio',
    65000
  );
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
async function setOnline(online){
  adb('shell','svc','wifi',online?'enable':'disable');
  adb('shell','svc','data',online?'enable':'disable');
  await delay(1200);
}
async function sampleMovingVideo(){
  const a=await videoReady();
  await delay(2300);
  const b=await read();
  audibleVideo(b);
  assert.ok(b.video.time>a.video.time+1.0,'Video timeline must advance without a restart');
  assert.ok(b.video.frames>=a.video.frames+2,'Decoded frames must advance');
  return {before:a,after:b};
}

ensureReport();
try{
  await connect();bounds=await nativeBounds();
  const initial=await wait(s=>s.ready&&s.watchId&&s.watchMode==='audio'&&s.native.audioIsPlaying,'Existing real-MP4 audio/video handoff test must leave audio playing');
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

  await section('Mini player and Picture-in-Picture preserve player, progress and controls',async()=>{
    await closePlayer();const before=await videoReady();audibleVideo(before);
    await tap('[data-minimize-watch]');
    const mini=await wait(s=>s.minimized&&s.hostClass.includes('watch-mini-host'),'Video mini player did not open');
    noDuplicatePlayback(mini);await delay(2100);
    const miniNext=await read();assert.ok(miniNext.video.time>mini.video.time+0.7,'Mini player video stopped');
    await tap('[data-expand-watch]');
    const expanded=await wait(s=>!s.minimized&&s.hostClass.includes('watch-full-host'),'Fullscreen view did not restore');
    noDuplicatePlayback(expanded);
    assert.ok(expanded.video.time>=miniNext.video.time-2,'Mini->full transition restarted video');
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

  await section('Home during video continues native audio; media notification and controls reopen',async()=>{
    await closePlayer();const v=await videoReady();audibleVideo(v);
    const beforePosition=v.video.time;
    adb('shell','input','keyevent','KEYCODE_HOME');
    await delay(3600);
    const notification=adb('shell','dumpsys','notification','--noredact');
    assert.ok(notification.includes(pkg),'The app did not post a media notification while backgrounded');
    const sessions=adb('shell','dumpsys','media_session');
    assert.ok(sessions.includes(pkg),'The Android Media3 session is absent while backgrounded');
    report.background={notificationPosted:true,sessionRegistered:true, androidApi:report.androidApi};
    adb('shell','cmd','statusbar','expand-notifications');
    await delay(1400);
    // Android notification shade is sometimes non-idle on API 34+.
    // Only tap a fresh, actual accessibility node; never infer its location.
    let xml='',shadeErrors=[];
    for(let attempt=1;attempt<=7;attempt++) {
      adb('shell','rm','-f','/sdcard/irgun-notification.xml');
      try {
        const args=['shell','uiautomator','dump'];
        if(attempt%2===0)args.push('--compressed');
        args.push('/sdcard/irgun-notification.xml');
        adb(...args);
        xml=adb('shell','cat','/sdcard/irgun-notification.xml');
        if(xml.includes('<node'))break;
        shadeErrors.push('Empty native notification hierarchy: attempt '+attempt);
      }catch(error){
        shadeErrors.push('Attempt '+attempt+': '+String(error.message||error).slice(0,160));
      }
      await delay(700);
    }
    assert.ok(xml.includes('<node'),'Could not inspect real notification controls: '+shadeErrors.join(' | '));
    screenshot('actual-android-notification-shade');
    const nodes=xml.match(/<node\b[^>]*>/g)||[];
    const selected=nodes.find(n=>/text="[^"]*(?:Irgun|Shiur|Prizant)/i.test(n)||/content-desc="[^"]*(?:Irgun|Shiur|Prizant)/i.test(n));
    assert.ok(selected,'Media notification must have a tappable, visible title in Android shade');
    const rect=selected.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)?.slice(1).map(Number);
    assert.ok(rect&&rect[2]>rect[0]&&rect[3]>rect[1],'Visible notification title must have native screen bounds');
    adb('shell','input','tap',String(Math.round((rect[0]+rect[2])/2)),String(Math.round((rect[1]+rect[3])/2)));
    await delay(1600);
    bounds=await nativeBounds();
    const back=await wait(s=>s.native.mode==='AUDIO'&&s.native.audioIsPlaying,'Notification did not reopen playing native Audio',50000);
    assert.ok(back.native.audioPositionMs/1000>=beforePosition+1,'Background handoff lost saved Video progress');
    audibleAudio(back);
    adb('shell','input','keyevent','KEYCODE_MEDIA_PAUSE');
    await wait(s=>s.native.mode==='AUDIO'&&!s.native.audioIsPlaying,'Media notification/session Pause action not respected',17000);
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

  await section('Actual offline download plays native audio without Wi-Fi or mobile data',async()=>{
    await closePlayer();await videoReady();
    const before=await read();
    if(!before.offline.some(x=>x.id===before.watchId&&x.bytes>0))
      await tap('[data-save-offline-kind="video"][data-save-offline-id="'+before.watchId+'"]');
    const saved=await wait(s=>s.offline.some(x=>x.id===before.watchId&&x.bytes>0),'Audio file was not downloaded to Android local storage',180000);
    const record=saved.offline.find(x=>x.id===before.watchId);
    assert.ok(record?.uri&&record.bytes>0,'Offline download requires a verified local URI and file size');
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
      checks('Actual downloaded audio played while offline',{bytes:record.bytes});
    }finally{await setOnline(true);}
    const present=await read();
    assert.ok(present.offline.some(x=>x.key===record.key&&x.bytes>0),'Downloaded file disappeared before deletion');
    await tap('[data-save-offline-kind="video"][data-save-offline-id="'+before.watchId+'"]');
    await tapPositiveAndroidDialog();
    await wait(s=>!s.offline.some(x=>x.key===record.key),'Offline file was not deleted after user confirmation',25000);
    checks('Offline download was deleted by physical Android UI with server playback unaffected');
  });

  await section('Wi-Fi and mobile-data interruptions recover video at saved position',async()=>{
    await closePlayer();const a=await videoReady();const prior=a.video.time;
    try{
      await setOnline(false);
      assert.equal(adb('shell','settings','get','global','wifi_on'),'0','Wi-Fi was not disabled');
      await delay(4300);
    }finally{await setOnline(true);}
    const recovered=await wait(s=>s.watchMode==='video'&&s.video&&!s.video.paused&&s.video.ready>=2,'Video did not recover from network interruption',65000);
    await delay(2300);
    const after=await read();
    audibleVideo(after);
    assert.ok(after.video.time>recovered.video.time+0.8,'Video clock did not recover');
    assert.ok(after.video.time>=prior-2,'Video resumed from the beginning after Wi-Fi loss');
    checks('Video playback recovery after Wi-Fi/mobile-data interruption',{startSeconds:prior,endSeconds:after.video.time});
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
    try{
      if((await read()).watchId){
        await tap('[data-close-watch]');
        await wait(s=>!s.watchId,'Watch overlay must close before checking main navigation');
      }
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
  report.status=report.failures.length?'failed':'passed';
  save();
  console.log(JSON.stringify({status:report.status,checks:report.checks.map(x=>x.label),failures:report.failures},null,2));
  if(report.failures.length)process.exitCode=1;
}
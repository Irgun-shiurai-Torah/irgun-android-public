import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Read the real WebView through CDP, but perform every navigation gesture with
// Android input events. No DOM clicks or synthetic touch events stand in for UI.
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' }).trim();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { gestures: [], checks: [] };
let ws;
try {
  const pid = adb('shell', 'pidof', 'org.irgunshiuraitorah.app').split(/\s+/)[0];
  adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);
  const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = pages.find(p => p.type === 'page' && /localhost/.test(p.url));
  assert.ok(page?.webSocketDebuggerUrl, 'App WebView must be inspectable');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP connection timeout')), 10000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data), request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error || message.result?.exceptionDetails) request.reject(new Error(JSON.stringify(message)));
    else request.resolve(message.result.result.value);
  });
  const evaluate = expression => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP read timeout')); }, 10000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  });
  const catalog = await (await fetch('https://api.irgunshiuraitorah.com/video-map?driveLibrary=1', {
    headers:{Origin:'https://localhost','X-Irgun-App':'1'}, signal:AbortSignal.timeout(30000)
  })).json();
  const candidates = catalog.filter(v => /פריזנט/.test(v.title||'') && /עצות להצלחה/.test(v.title||''));
  const target = candidates.find(v => Number(v.duration) === 3663 &&
    [v.lectureDate,v.created].some(d=>String(d||'').startsWith('2026-10-06')));
  report.candidates = candidates.map(v=>({id:v.id,title:v.title,duration:v.duration,created:v.created,lectureDate:v.lectureDate}));
  assert.ok(target,'Must identify the exact Oct 6 Prizant shiur, duration 1:01:03');
  report.shiur = {id:target.id,title:target.title,duration:target.duration};
  const response = await fetch(`https://api.irgunshiuraitorah.com/media/${encodeURIComponent(target.id)}/source.json`, {
    headers:{Origin:'https://localhost'},signal:AbortSignal.timeout(30000)
  });
  assert.equal(response.status,200,'Source descriptor must be available');
  const source = await response.json();
  report.sources = source.video;
  assert.ok(source.video?.mp4,'Reported shiur must have its direct MP4');

  const readDOM = async () => JSON.parse(await evaluate(`JSON.stringify((()=>{
    const v=document.querySelector('#watchDirectHlsVideo');
    const r=v?.getBoundingClientRect(),stage=v?.closest('.watch-hls-stage')?.getBoundingClientRect();
    return {title:document.querySelector('.watch-overlay')?.innerText?.slice(0,900),
      iframeSrc:document.querySelector('#watchVimeoFrame')?.getAttribute('src'),
      video:v?{src:v.currentSrc||v.src,time:v.currentTime,paused:v.paused,ready:v.readyState,width:v.videoWidth,muted:v.muted,volume:v.volume,
        frames:v.getVideoPlaybackQuality?.().totalVideoFrames??v.webkitDecodedFrameCount,error:v.error?.code,
        seeking:v.seeking,rate:v.playbackRate,buffered:Array.from({length:v.buffered.length},(_,i)=>[v.buffered.start(i),v.buffered.end(i)]),
        rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,
        stage:stage?{x:stage.x,y:stage.y,width:stage.width,height:stage.height}:null}:null,
      runtime:{userAgent:navigator.userAgent,aspectRatio:CSS.supports('aspect-ratio','16/9')},
      activeMode:document.querySelector('.media-switch .active')?.getAttribute('data-watch-mode'),
      seek:document.querySelector('#watchAudioSeek')?{value:Number(document.querySelector('#watchAudioSeek').value),max:Number(document.querySelector('#watchAudioSeek').max)}:null,
      webAudio:Array.from(document.querySelectorAll('audio')).map(a=>({paused:a.paused,muted:a.muted,volume:a.volume,time:a.currentTime})),
      diagnostic:!!document.querySelector('.watch-hls-fallback-note'),
      text:document.querySelector('#app')?.innerText?.slice(0,300)};
  })())`));
  const read = async () => {
    const dom = await readDOM();
    dom.native = await evaluate("window.Capacitor.nativePromise('IrgunPlayback','getState',{})");
    return dom;
  };
  const wait = async predicate => {
    let state;
    for(let i=0;i<120;i++) {state=await read();if(predicate(state))return state;await delay(500);}
    throw new Error(`Video did not settle: ${JSON.stringify(state)}`);
  };
  adb('shell','uiautomator','dump','/sdcard/irgun-mp4.xml');
  const xml=adb('shell','cat','/sdcard/irgun-mp4.xml');
  const bounds=xml.match(/<node\b[^>]*class="android\.webkit\.WebView"[^>]*>/)?.[0]
    .match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  assert.ok(bounds,'Native WebView bounds required');
  const [left,top,right,bottom]=bounds.slice(1).map(Number);
  const nativePoint=p=>[Math.round(left+p.x*(right-left)/p.width),Math.round(top+p.y*(bottom-top)/p.height)];
  const visiblePoint=async selector=>JSON.parse(await evaluate(`JSON.stringify((()=>{
    // A card has several Watch targets. Its cover center can be obscured by
    // sibling Watch/Listen buttons; choose a genuinely visible target instead.
    for(const b of document.querySelectorAll(${JSON.stringify(selector)})) {
      const r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
      const hit=document.elementFromPoint(x,y);
      if(y>70 && y<innerHeight-75 && (hit===b || b.contains(hit)))
        return {x,y,width:innerWidth,height:innerHeight};
    }
    return null;
  })())`));
  const tapVisible=async selector=>{
    const p=await visiblePoint(selector);assert.ok(p,`Visible native tap target required: ${selector}`);
    const xy=nativePoint(p);adb('shell','input','tap',...xy.map(String));report.gestures.push({selector,point:xy});
  };
  // Navigate through the real Home search with native taps, typing and scrolling.
  // CDP only reads hit-tested coordinates and media state.
  let search;
  for(let i=0;i<8;i++) {
    search=await visiblePoint('#homeLibrarySearch');if(search)break;
    adb('shell','input','swipe',String(right-40),String(bottom-130),String(right-40),String(top+190),'450');
    await delay(400);
  }
  assert.ok(search,'Home search must be visible');
  await tapVisible('#homeLibrarySearch');
  const code=String(target.shiurCode||target.title.match(/IST-[A-Z]+\d+/)?.[0]||'');
  assert.ok(/^IST-[A-Z]+\d+$/.test(code),'Reported shiur search code required');
  adb('shell','input','text',code);adb('shell','input','keyevent','KEYCODE_ENTER');await delay(800);
  // Dismiss the keyboard only if still present, without navigating back.
  if(/mInputShown=true/.test(adb('shell','dumpsys','input_method')))adb('shell','input','keyevent','KEYCODE_BACK');
  const selector=`[data-watch="${target.id}"]`;
  for(let i=0;i<12 && !(await visiblePoint(selector));i++) {
    adb('shell','input','swipe',String(right-40),String(bottom-130),String(right-40),String(top+190),'450');
    await delay(400);
  }
  await tapVisible(selector);
  await wait(s=>s.video?.ready>=2 && s.video.width>0);
  const loaded=await read();report.loaded=loaded;
  assert.ok(loaded.video.rect.width>100 && loaded.video.rect.height>50,'Direct video must occupy a visible surface');
  assert.ok(loaded.video.rect.y>=0 && loaded.video.rect.y+loaded.video.rect.height<=bottom-top,'Direct video must fit the native viewport');
  const embed=new URL((await read()).iframeSrc);
  const [vimeoNumber,privacyHash]=String(target.vimeoId||target.id).split(':');
  assert.equal(embed.pathname,`/video/${vimeoNumber}`,'App must keep the numeric Vimeo ID separate');
  if(privacyHash)assert.equal(embed.searchParams.get('h'),privacyHash,'App must preserve the unlisted embed code');
  report.checks.push({label:'Actual app Vimeo embed preserves video number and unlisted code',url:embed.href});
  const tapPlayPause=async()=>{
    const p=JSON.parse(await evaluate(`JSON.stringify((()=>{
      const b=document.querySelector('[data-hls-play]'),r=b?.getBoundingClientRect();
      if(!r)return null;const x=r.left+r.width/2,y=r.top+r.height/2;
      return document.elementFromPoint(x,y)?.closest('[data-hls-play]')?{x,y,width:innerWidth,height:innerHeight}:null;
    })())`));
    assert.ok(p,'Visible, hit-tested play control required');
    adb('shell','input','tap',String(Math.round(left+p.x*(right-left)/p.width)),String(Math.round(top+p.y*(bottom-top)/p.height)));
  };
  if((await read()).video.paused)await tapPlayPause();
  await wait(s=>s.video&&!s.video.paused&&s.video.time>0);
  const moving=async label=>{
    const before=await read();await delay(3500);const after=await read();
    report.checks.push({label,before,after});
    assert.ok(after.video.time>before.video.time+1,`${label}: media clock must advance`);
    assert.ok(after.video.width>0 && after.video.frames>=before.video.frames+2,`${label}: decoded video frames must advance`);
    assert.equal(after.video.error,undefined);assert.equal(after.diagnostic,false,'Internal fallback banner must be absent');
  };
  await moving('Reported shiur starts with moving direct video');
  const actual=(await read()).video.src;
  assert.equal(actual,source.video.hls||source.video.mp4,'Must use its direct source instead of Vimeo');
  if(!source.video.hls)assert.equal(actual,source.video.mp4,'MP4-only shiur must play MP4');
  await tapPlayPause();await wait(s=>s.video?.paused);
  const paused=await read();await delay(1500);const still=await read();
  assert.equal(still.video.paused,true);assert.ok(Math.abs(still.video.time-paused.video.time)<0.3,'Pause clock must stay stationary');
  report.checks.push({label:'Native Pause preserves position',before:paused.video,after:still.video});
  await tapPlayPause();await wait(s=>s.video&&!s.video.paused);await moving('Native Play resumes moving frames');
  // Reproduce the user's sequence with physical Android input, not media setters.
  const screenshot = name => writeFileSync(`emulator-report/${name}.png`,execFileSync('adb',['exec-out','screencap','-p']));
  const audioPlaying = s => s.activeMode==='audio' && s.native?.mode==='AUDIO' && s.native.audioIsPlaying;
  const videoPlaying = s => s.activeMode==='video' && s.native?.mode==='VIDEO' && s.video && !s.video.paused && s.video.ready>=2;
  const oneAudible = (s,mode) => {
    assert.equal(s.diagnostic,false,'Internal fallback banner must stay absent');
    assert.ok(s.webAudio.every(a=>a.paused||a.muted||a.volume===0),'Browser audio must not overlap native playback');
    assert.equal(typeof s.native.audioOutputVolume,'number','CI must expose actual native output volume');
    if(mode==='audio') {
      assert.ok(s.native.audioIsPlaying && s.native.audioOutputVolume>0,'Native audio must be audible');
      assert.ok(!s.video || s.video.paused || s.video.muted || s.video.volume===0,'Parked video must not overlap audio');
    } else {
      assert.ok(s.video && !s.video.paused && !s.video.muted && s.video.volume>0,'Video must be audible');
      assert.equal(s.native.audioOutputVolume,0,'Native shadow must be silent in Video mode');
    }
  };
  await tapVisible('[data-watch-mode="audio"]');
  await wait(audioPlaying);
  let a=await read();oneAudible(a,'audio');
  await delay(2000);let b=await read();oneAudible(b,'audio');
  assert.ok(b.native.audioPositionMs>a.native.audioPositionMs+1000,'Audio must advance before skipping');
  report.checks.push({label:'Switch to Audio keeps playing with one audible source',before:a,after:b});
  await tapVisible('.watch-audio-controls [data-skip="15"]');
  await wait(s=>audioPlaying(s)&&s.native.audioPositionMs>b.native.audioPositionMs+13000);
  a=await read();oneAudible(a,'audio');
  assert.ok(a.native.audioPositionMs-b.native.audioPositionMs<20000,'Forward audio skip must be 15 seconds');
  report.checks.push({label:'Forward 15 seconds while Audio is playing',before:b,after:a});
  await tapVisible('.watch-audio-controls [data-skip="-15"]');
  await wait(s=>audioPlaying(s)&&s.native.audioPositionMs<a.native.audioPositionMs-10000);
  b=await read();oneAudible(b,'audio');
  assert.ok(Math.abs(b.native.audioPositionMs-(a.native.audioPositionMs-15000))<4000,'Backward audio skip must be 15 seconds');
  report.checks.push({label:'Backward 15 seconds while Audio is playing',before:a,after:b});

  // Seek with genuine range-bar touches. Android 11 does not focus the range
  // after a tap: DPAD keys navigate nearby controls instead of changing time.
  // Use the observed range value to refine fresh physical touch coordinates.
  let seekOffset=0;
  for(let i=0;i<8;i++) {
    const seek=JSON.parse(await evaluate(`JSON.stringify((()=>{
      const e=document.querySelector('#watchAudioSeek'),r=e?.getBoundingClientRect();if(!r)return null;
      const max=Number(e.max),usable=r.width-16,rtl=getComputedStyle(e).direction==='rtl';
      const x=r.left+8+usable*(rtl?1-600/max:600/max)+${seekOffset},y=r.top+r.height/2;
      return document.elementFromPoint(x,y)===e?{x,y,width:innerWidth,height:innerHeight,rtl,usable,max}:null;
    })())`));
    assert.ok(seek,'Visible hit-tested audio seek bar required');
    const xy=nativePoint(seek);adb('shell','input','tap',...xy.map(String));await delay(350);
    const observed=await read();
    report.gestures.push({label:i?'Refine native seek-bar touch':'Seek Audio to 10 minutes',point:xy,
      rtl:seek.rtl,rangeValue:observed.seek?.value,audioPositionMs:observed.native.audioPositionMs});
    if(audioPlaying(observed)&&Math.abs(observed.native.audioPositionMs/1000-600)<6)break;
    const value=Number(observed.seek?.value);
    assert.ok(Number.isFinite(value),'Audio range value must be observable');
    seekOffset+=(600-value)*seek.usable/seek.max*(seek.rtl?-1:1);
  }
  await wait(s=>audioPlaying(s)&&Math.abs(s.native.audioPositionMs/1000-600)<8);
  a=await read();oneAudible(a,'audio');screenshot('audio-at-ten-minutes');
  await delay(2000);b=await read();oneAudible(b,'audio');
  assert.ok(b.native.audioPositionMs>a.native.audioPositionMs+1000,'Audio must keep playing after the 10-minute seek');
  report.checks.push({label:'Native range seek to 10 minutes preserves playing Audio',before:a,after:b});

  const audioBeforeVideo=await read(),switchStarted=Date.now();
  await tapVisible('[data-watch-mode="video"]');
  await wait(videoPlaying);
  const videoAtSwitch=await read();oneAudible(videoAtSwitch,'video');
  report.videoHandoff={before:audioBeforeVideo,start:videoAtSwitch,samples:[]};
  const elapsed=(Date.now()-switchStarted)/1000;
  assert.ok(videoAtSwitch.video.time>=audioBeforeVideo.native.audioPositionMs/1000-2,'Video must not jump back after the audio seek');
  assert.ok(videoAtSwitch.video.time<=audioBeforeVideo.native.audioPositionMs/1000+elapsed+4,'Video must preserve the live audio position');
  screenshot('video-after-ten-minute-audio-seek');
  // Exactly the requested 10-second observation before pressing Audio again.
  const observationStarted=Date.now();
  for(let i=1;i<=10;i++) {
    await delay(Math.max(0,observationStarted+i*1000-Date.now()));
    report.videoHandoff.samples.push({elapsedMs:Date.now()-observationStarted,state:await read()});
  }
  const videoAfterTenSeconds=await read();report.videoHandoff.after=videoAfterTenSeconds;oneAudible(videoAfterTenSeconds,'video');
  assert.ok(videoAfterTenSeconds.video.time>videoAtSwitch.video.time+7,'Video clock must advance for 10 seconds');
  assert.ok(videoAfterTenSeconds.video.frames>videoAtSwitch.video.frames+10,'Video must show moving decoded frames after the seek');
  report.checks.push({label:'Audio at 10 minutes to Video, then 10 seconds of moving audible video',before:audioBeforeVideo,start:videoAtSwitch,after:videoAfterTenSeconds});
  const backStarted=Date.now();await tapVisible('[data-watch-mode="audio"]');
  await wait(audioPlaying);const returnedAudio=await read();oneAudible(returnedAudio,'audio');
  assert.ok(returnedAudio.native.audioPositionMs/1000>=videoAfterTenSeconds.video.time-2,'Audio must resume at the latest Video position');
  assert.ok(returnedAudio.native.audioPositionMs/1000<=videoAfterTenSeconds.video.time+(Date.now()-backStarted)/1000+4,'Return to Audio must preserve position');
  await delay(3000);const returnedAudioMoving=await read();oneAudible(returnedAudioMoving,'audio');
  assert.ok(returnedAudioMoving.native.audioPositionMs>returnedAudio.native.audioPositionMs+1500,'Audio must advance after switching back');
  screenshot('audio-after-ten-seconds-of-video');
  report.checks.push({label:'Switch back to Audio after 10 seconds keeps position, playing, and a single audible source',before:videoAfterTenSeconds,start:returnedAudio,after:returnedAudioMoving});
  writeFileSync('emulator-report/reported-shiur.png',execFileSync('adb',['exec-out','screencap','-p']));
  report.result='passed';
} catch (error) {
  report.result = 'failed'; report.error = String(error.stack || error);
  try { writeFileSync('emulator-report/audio-switch-failure.png',execFileSync('adb',['exec-out','screencap','-p'])); } catch {}
  process.exitCode = 1;
} finally {
  ws?.close();
  writeFileSync('emulator-report/reported-shiur.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

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
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.consoleAPICalled') {
      const msg=(message.params?.args||[]).map(x=>String(x.value??x.description??'')).join(' ').slice(0,350);
      if(/HLS|MP4|Playback|Vimeo|CORS|fetch|video/i.test(msg)) {
        (report.webConsole||=[]).push({type:message.params.type,message:msg});
        if(report.webConsole.length>70)report.webConsole.shift();
      }
      return;
    }
    const request=pending.get(message.id);
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
  // Read-only CDP console inspection; Android taps still use real adb input.
  ws.send(JSON.stringify({id:++sequence,method:'Runtime.enable'}));
  const catalog = await (await fetch('https://api.irgunshiuraitorah.com/video-map?driveLibrary=1', {
    headers:{Origin:'https://localhost','X-Irgun-App':'1'}, signal:AbortSignal.timeout(30000)
  })).json();
  const hlsId=String(process.env.IRGUN_HLS_TEST_ID||'1232214252');
  const candidates=catalog.filter(v=>String(v.id||'')===hlsId||String(v.vimeoId||'')===hlsId);
  const target=candidates[0];
  report.candidates=candidates.map(v=>({id:v.id,title:v.title,duration:v.duration,shiurCode:v.shiurCode,vimeoId:v.vimeoId}));
  assert.ok(target,'The actual HLS test shiur must exist in the app catalog: '+hlsId);
  report.shiur = {id:target.id,title:target.title,duration:target.duration};
  const response = await fetch(`https://api.irgunshiuraitorah.com/media/${encodeURIComponent(target.id)}/source.json`, {
    headers:{Origin:'https://localhost'},signal:AbortSignal.timeout(30000)
  });
  assert.equal(response.status,200,'Source descriptor must be available');
  const source = await response.json();
  report.sources = source.video;
  assert.ok(source.video?.hls,'Selected shiur must expose a real HLS source');

  const readDOM = async () => JSON.parse(await evaluate(`JSON.stringify((()=>{
    const v=document.querySelector('#watchDirectHlsVideo');
    const r=v?.getBoundingClientRect(),stage=v?.closest('.watch-hls-stage')?.getBoundingClientRect();
    return {title:document.querySelector('.watch-overlay')?.innerText?.slice(0,900),
      iframeSrc:document.querySelector('#watchVimeoFrame')?.getAttribute('src'),
      iframeHidden:document.querySelector('#watchVimeoFrame') ? getComputedStyle(document.querySelector('#watchVimeoFrame')).visibility==='hidden' : false,
      sourceType:window.ISTReleaseQA?.snapshot?.()?.sourceType||null,
      quality:(()=>{const e=document.querySelector('[data-hls-quality]');return e?{value:e.value,hidden:e.hidden,options:Array.from(e.options).map(o=>({value:o.value,label:o.textContent}))}:null})(),
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
  // Android 14+ may report a null UIAutomator root during WebView startup.
  // Use fresh native accessibility bounds, never guessed tap coordinates.
  let measuredBounds=null;
  const hierarchyErrors=[];
  for(let attempt=1;attempt<=7 && !measuredBounds;attempt++) {
    for(const compressed of [false,true]) {
      adb('shell','rm','-f','/sdcard/irgun-hls-bounds.xml');
      try {
        const args=['shell','uiautomator','dump'];
        if(compressed)args.push('--compressed');
        args.push('/sdcard/irgun-hls-bounds.xml');
        adb(...args);
        const xml=adb('shell','cat','/sdcard/irgun-hls-bounds.xml');
        const node=xml.match(/<node\b[^>]*class="android\.webkit\.WebView"[^>]*>/)?.[0];
        const match=node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
        const rect=match?.slice(1).map(Number);
        if(rect && rect[2]>rect[0] && rect[3]>rect[1]) {
          measuredBounds=rect;
          report.nativeBoundsAttempt=attempt;
          report.nativeBoundsCompressed=compressed;
          break;
        }
        hierarchyErrors.push('Attempt '+attempt+': no real WebView node');
      } catch(error) {
        hierarchyErrors.push('Attempt '+attempt+': '+String(error.message||error).slice(0,160));
      }
    }
    if(!measuredBounds) {
      adb('shell','input','keyevent','KEYCODE_WAKEUP');
      await delay(850);
    }
  }
  assert.ok(measuredBounds,'Native Android WebView bounds unavailable: '+hierarchyErrors.join(' | '));
  const [left,top,right,bottom]=measuredBounds;
  report.nativeBounds=measuredBounds;
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
  for(let i=0;i<90;i++) {
    search=await visiblePoint('#homeLibrarySearch');if(search)break;
    // Real Android 14–16 emulators can initialize the WebView before the
    // asynchronous lecture catalog finishes loading. Wait for the actual UI
    // instead of treating a loading screen as a missing search control.
    if(i%5===0)adb('shell','input','swipe',String(right-40),String(bottom-130),String(right-40),String(top+190),'450');
    await delay(650);
  }
  assert.ok(search,'Home search must be visible');
  await tapVisible('#homeLibrarySearch');
  const code=String(target.shiurCode||target.title.match(/\bCH\s*\d+\b/i)?.[0]?.replace(/\s+/g,'')||'');
  assert.ok(/^[A-Z]+\d+$/.test(code),'HLS fixture must have a searchable lecture code from its actual title');
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

  const initial=await read();
  assert.equal(initial.sourceType,'hls','Actual app playback must use HLS, NOT direct MP4 or Vimeo fallback');
  assert.equal(initial.iframeHidden,true,'Vimeo iframe must stay hidden while HLS video is active');
  assert.ok(initial.video.src.startsWith('blob:')||initial.video.src===source.video.hls,
    'The HLS media element must use a genuine HLS/MSE source');
  report.checks.push({label:'Live Android video renders moving HLS picture with Vimeo visually disabled',sourceType:initial.sourceType,src:initial.video.src});
  assert.ok(initial.quality&&!initial.quality.hidden,'Multi-variant HLS must show its quality selector');
  const playable=initial.quality.options.filter(o=>o.value!=='-1');
  assert.ok(playable.length>=2,'At least two video qualities must be selectable');
  const targetChoice=playable.find(x=>/360p/.test(x.label))||playable[0];
  // This is a native Android tap, followed by a native Android popup item tap.
  // Runtime.evaluate is ONLY read-only inspection.
  const dropdown=await visiblePoint('[data-hls-quality]');
  assert.ok(dropdown,'HLS quality dropdown must be visible and hit-testable');
  adb('shell','input','tap',...nativePoint(dropdown).map(String));
  await delay(700);
  adb('shell','uiautomator','dump','--compressed','/sdcard/irgun-hls-options.xml');
  const xmlOptions=adb('shell','cat','/sdcard/irgun-hls-options.xml');
  const lines=xmlOptions.match(/<node\b[^>]*>/g)||[];
  const matching=lines.find(x=>x.includes('text="'+targetChoice.label+'"'));
  assert.ok(matching,'Real Android quality options popup must include '+targetChoice.label);
  const b=matching.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)?.slice(1).map(Number);
  assert.ok(b&&b[2]>b[0]&&b[3]>b[1],'Quality popup option must have visible screen coordinates');
  adb('shell','input','tap',String(Math.floor((b[0]+b[2])/2)),String(Math.floor((b[1]+b[3])/2)));
  const selected=await wait(s=>s.quality?.value===targetChoice.value,'Quality selection did not stick');
  assert.equal(selected.sourceType,'hls','Quality selection must not switch to MP4');
  assert.equal(selected.video.error,undefined,'Video decoder reported error');
  const timeAtQuality=selected.video.time,framesAtQuality=selected.video.frames;
  await delay(4500);
  const after=await read();
  assert.equal(after.sourceType,'hls','Quality switching may not switch to MP4 fallback');
  assert.ok(after.video.time>timeAtQuality+2,'Quality change stopped the video');
  assert.ok(after.video.frames>framesAtQuality+4,'Video picture froze when quality changed');
  assert.ok(after.video.time>=timeAtQuality,'Quality change restarted the shiur');
  report.checks.push({label:'Native quality selection preserves moving HLS picture and position',
    choice:targetChoice,oldSeconds:timeAtQuality,newSeconds:after.video.time});
  const screenshot=name=>writeFileSync('emulator-report/'+name+'.png',execFileSync('adb',['exec-out','screencap','-p']));
  screenshot('hls-picture-after-quality-change');
  if(process.env.IRGUN_SOAK_TO_AUDIO==='1') {
    // Start the 15-minute reliability run from a proven, frame-decoding HLS
    // lecture, using an actual Android tap (no JS setters or forced timers).
    await tapVisible('[data-watch-mode="audio"]');
    const audio=await wait(s=>s.activeMode==='audio' &&
      s.native?.mode==='AUDIO' && s.native.audioIsPlaying &&
      Number(s.native.audioDurationMs)>1000000);
    assert.ok(audio.webAudio.every(a=>a.paused||a.muted||a.volume===0),
      'HLS->Audio must not leave separate browser audio playing');
    assert.ok(!audio.video || audio.video.paused||audio.video.muted||audio.video.volume===0,
      'Parked HLS picture must not remain audibly active over native Audio');
    const start=Number(audio.native.audioPositionMs);
    await delay(2300);
    const progressed=await read();
    assert.ok(progressed.native.audioIsPlaying &&
      Number(progressed.native.audioPositionMs)>start+1200,
      'Real native Audio must advance before the 15-minute soak starts');
    report.checks.push({label:'HLS lecture handed off to real audible Media3 Audio for 15-minute soak',
      beforeMs:start,afterMs:Number(progressed.native.audioPositionMs)});
    screenshot('soak-audio-source-started');
  }
  report.result='passed';
} catch (error) {
  report.result='failed';report.error=String(error.stack||error);
  try {writeFileSync('emulator-report/hls-playback-failure.png',execFileSync('adb',['exec-out','screencap','-p']));}catch{}
  process.exitCode=1;
} finally {
  ws?.close();
  writeFileSync('emulator-report/hls-app-playback.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
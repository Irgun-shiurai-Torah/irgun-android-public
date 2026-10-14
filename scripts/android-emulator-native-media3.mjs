import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {observedAdb} from './android-adb-observer.mjs';
import {nativeHierarchy} from './android-native-hierarchy.mjs';
import {fullscreenEducationTapPoint} from './android-system-ui-observation.mjs';
import {settledNativeTapPoint} from './android-native-tap-point.mjs';
import {typeObservedNativeText} from './android-native-text-entry.mjs';

// Read the real WebView through CDP, but perform every navigation gesture with
// Android input events. No DOM clicks or synthetic touch events stand in for UI.
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { gestures: [], checks: [], engine:'native-media3-single-exoplayer' };
const adb = observedAdb(report);
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
  const pending = new Map(), networkRequests = new Map();
  report.blockedVimeoRequests=[];
  ws.addEventListener('message', event => {
    const message=JSON.parse(event.data);
    if(message.method==='Network.requestWillBeSent') {
      networkRequests.set(message.params.requestId,message.params.request.url);return;
    }
    if(message.method==='Network.loadingFailed') {
      const url=networkRequests.get(message.params.requestId)||'';
      if(/^https:\/\/(?:[^/]+\.)?(?:vimeo\.com|vimeocdn\.com)\//.test(url)&&message.params.blockedReason)
        report.blockedVimeoRequests.push({url,reason:message.params.blockedReason});
      return;
    }
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
    else request.resolve(message.result);
  });
  const command = (method,params={}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP read timeout')); }, 10000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate=expression=>command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}).then(r=>r.result.value);
  // Block genuine third-party transport, without substituting any HTTP response.
  await command('Network.enable');
  await command('Network.setBlockedURLs',{urls:['*://*.vimeo.com/*','*://vimeo.com/*','*://*.vimeocdn.com/*']});
  report.vimeoTransportDisabled=true;
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
        hlsLastError:v.dataset.hlsLastError||null,hlsFallbackReason:v.dataset.hlsFallbackReason||null,
        hlsRecoveryAttempts:v.dataset.hlsRecoveryAttempts||null,
        hlsQualityRecovery:v.dataset.hlsQualityRecovery||null,
        hlsCurrentLevel:v.dataset.hlsCurrentLevel??null,hlsBufferedLevel:v.dataset.hlsBufferedLevel??null,
        startup:{phase:v.dataset.startupBufferPhase||'',required:Number(v.dataset.startupBufferRequired||0),bufferAtStart:Number(v.dataset.startupBufferAtStart||0),waitMs:Number(v.dataset.startupBufferWaitMs||0),waitingCount:Number(v.dataset.startupWaitingCount||0),visibleRebufferCount:Number(v.dataset.startupVisibleRebufferCount||0)},
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
    dom.native = await evaluate("window.Capacitor.nativePromise('IrgunPlayback','qaPlaybackSnapshot',{})");
    return dom;
  };
  const wait = async predicate => {
    let state;
    for(let i=0;i<120;i++) {state=await read();if(predicate(state))return state;await delay(500);}
    throw new Error(`Video did not settle: ${JSON.stringify(state)}`);
  };
  // Read the actual native WebView directly. UIAutomator's wait-for-idle dump
  // blocks on a moving page and cannot prove foreground ownership.
  const windowBounds = await evaluate("window.Capacitor.nativePromise('IrgunPlayback','qaWindowBounds',{})");
  assert.equal(windowBounds.focused,true,'Irgun must own the foreground window; an ANR dialog is a failure');
  const measuredBounds=[windowBounds.left,windowBounds.top,windowBounds.right,windowBounds.bottom];
  assert.ok(measuredBounds.every(Number.isFinite)&&measuredBounds[2]>measuredBounds[0]&&measuredBounds[3]>measuredBounds[1],
    'Actual native WebView bounds must have a nonzero size');
  let [left,top,right,bottom]=measuredBounds;
  report.nativeBounds=measuredBounds;
  const nativePoint=p=>[Math.round(left+p.x*(right-left)/p.width),Math.round(top+p.y*(bottom-top)/p.height)];
  const visiblePoint=async (selector,allowHeader=false)=>JSON.parse(await evaluate(`JSON.stringify((()=>{
    // A card has several Watch targets. Its cover center can be obscured by
    // sibling Watch/Listen buttons; choose a genuinely visible target instead.
    for(const b of document.querySelectorAll(${JSON.stringify(selector)})) {
      const r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
      const hit=document.elementFromPoint(x,y);
      if(y>${allowHeader?0:70} && y<innerHeight-75 && (hit===b || b.contains(hit)))
        return {x,y,width:innerWidth,height:innerHeight};
    }
    return null;
  })())`));
  const tapVisible=async (selector,allowHeader=false)=>{
    const measured=await settledNativeTapPoint({
      readBounds:()=>evaluate("window.Capacitor.nativePromise('IrgunPlayback','qaWindowBounds',{})"),
      readPoint:()=>visiblePoint(selector,allowHeader),delay
    });
    [left,top,right,bottom]=measured.bounds;
    adb('shell','input','tap',...measured.point.map(String));report.gestures.push({selector,...measured});
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
  const searchState=async()=>JSON.parse(await evaluate("JSON.stringify({screen:window.ISTReleaseQA?.snapshot?.().screen,focused:document.activeElement?.id||'',value:document.getElementById('homeLibrarySearch')?.value??null,query:window.ISTReleaseQA?.snapshot?.().searchQuery??null})"));
  let observedSearch;
  for(let i=0;i<30;i++) {observedSearch=await searchState();if(observedSearch.focused==='homeLibrarySearch')break;await delay(150);}
  report.searchBeforeTyping=observedSearch;
  assert.equal(observedSearch.focused,'homeLibrarySearch','Actual Android tap must focus Home search before sending text');
  await typeObservedNativeText({value:code,delay,
    readValue:async()=>{const s=await searchState();assert.equal(s.focused,'homeLibrarySearch','Each real native key must target the focused Home search');return s.value;},
    typeCharacter:character=>adb('shell','input','text',character)
  });
  observedSearch=await searchState();report.searchAfterTyping=observedSearch;
  assert.equal(observedSearch.focused,'homeLibrarySearch','Feed refresh must preserve Home input focus');
  assert.equal(observedSearch.value,code,'Native keyboard text must remain in the actual Home search input');
  adb('shell','input','keyevent','KEYCODE_ENTER');
  for(let i=0;i<40;i++) {observedSearch=await searchState();if(observedSearch.screen==='shiurim')break;await delay(200);}
  report.searchAfterSubmit=observedSearch;
  assert.equal(observedSearch.screen,'shiurim','Enter in the focused search input must open search results, not a lecture');
  assert.equal(observedSearch.query,code,'Actual search results must use the typed lecture code');
  // Enter already navigated to Shiurim and destroyed the focused Home field.
  // Android 16 can report a stale mInputShown=true after this navigation;
  // sending BACK at that moment finishes the Activity and opens Pixel Launcher.
  // Do not treat a stale IME service flag as permission to press Android Back.
  await delay(500);
  assert.equal((await searchState()).screen,'shiurim','Search submission must remain on results');
  const postSearchBounds = await evaluate("window.Capacitor.nativePromise('IrgunPlayback','qaWindowBounds',{})");
  assert.equal(postSearchBounds.focused,true,'Search navigation must keep Irgun in the Android foreground');

  // Perform the Watch and Audio/Video taps on the physical Android emulator.
  // CDP only observes state, so the test cannot pass from injected JS setters.
  const selector=`.media-primary-overlay button[data-watch="${target.id}"],button.media-title[data-watch="${target.id}"]`;
  for(let i=0;i<12 && !(await visiblePoint(selector));i++) {
    adb('shell','input','swipe',String(right-40),String(bottom-130),String(right-40),String(top+190),'450');
    await delay(400);
  }
  await tapVisible(selector);
  const sample=async()=>({
    ...(await read()),
    media3:await evaluate("window.Capacitor.nativePromise('IrgunNativeVideo','snapshot',{})")
  });
  const waitNative=async(predicate,label,limitMs=45000)=>{
    let result;
    for(let n=0;n<limitMs/400;n++){
      result=await sample();
      if(predicate(result))return result;
      await delay(400);
    }
    throw new Error(label+'; last='+JSON.stringify(result));
  };
  const captureVisibleNativePicture=(snapshot,name)=>{
    const m=snapshot.media3;
    assert.ok(m.surfaceVisibleOnScreen && m.surfaceVisibleWidth>120 &&
      m.surfaceVisibleHeight>65 && m.surfaceX>=0 && m.surfaceY>=0,
      'Native decoded frames are NOT enough: Android PlayerView must be physically visible, not parked at x=-12000; '+JSON.stringify(m));
    const png='emulator-report/'+name+'.png';
    writeFileSync(png,execFileSync('adb',['exec-out','screencap','-p']));
    const w=Math.max(10,Math.round(m.surfaceVisibleWidth*.56));
    const h=Math.max(10,Math.round(m.surfaceVisibleHeight*.55));
    const x=Math.round(m.surfaceX+(m.surfaceVisibleWidth-w)/2);
    const y=Math.round(m.surfaceY+(m.surfaceVisibleHeight-h)/2);
    // This fixed HLS fixture shows a well-lit beis midrash. An entirely black
    // Android screencap is a failed Video test even if ExoPlayer decodes frames.
    // -alpha off avoids counting PNG alpha as 50% brightness for BLACK pixels.
    const mean=Number(execFileSync('convert',[png,'-crop',w+'x'+h+'+'+x+'+'+y,
      '+repage','-alpha','off','-colorspace','Gray','-format','%[fx:mean]','info:'],
      {encoding:'utf8'}).trim());
    assert.ok(Number.isFinite(mean)&&mean>.075,
      'SCREEN BLACK: real Android video viewport has luminance '+mean+
      ' despite a moving ExoPlayer clock; screenshot='+png+'; native='+JSON.stringify(m));
    report.checks.push({label:'Real Android screenshot shows nonblack VIDEO pixels',
      image:png,physicalViewport:{x,y,w,h},meanLuminance:mean});
    return mean;
  };
  const first=await waitNative(s=>s.activeMode==='video'&&
    s.media3.active&&s.media3.videoSelected&&s.media3.playing&&
    s.media3.sourceType==='hls'&&s.media3.firstFrame&&
     s.media3.width>0&&s.media3.height>0&&s.media3.frames>=8&&
    s.media3.surfaceVisibleOnScreen&&s.media3.surfaceVisibleWidth>120,
    'Native Media3 must render real moving HLS video, without MP4/WebView fallback');
  assert.equal(first.native.mode,'VIDEO','Media3 session must own VIDEO playback');
  assert.equal(first.iframeSrc,'about:blank','Vimeo must not load while native Media3 owns Video');
  assert.equal(first.video,null,'WebView must not create another HTML video decoder');
  assert.ok(first.media3.positionMs>0&&first.media3.bufferedPositionMs>first.media3.positionMs,
    'Native ExoPlayer must have real prepared media');
  report.checks.push({label:'Native HLS decodes visible frames with exactly one Media3 player',snapshot:first.media3});
  captureVisibleNativePicture(first,'media3-first-frames');
  await delay(3000);
  const moved=await sample();
  assert.ok(moved.media3.positionMs>first.media3.positionMs+1800,'Native VIDEO clock must progress');
  assert.ok(moved.media3.frames>first.media3.frames+12,'Native VIDEO must render more real frames');
  assert.equal(moved.media3.sourceType,'hls','Actual Media3 must keep HLS, not fall back to MP4');
  report.checks.push({label:'Native video advances frames and one playback clock',before:first.media3,after:moved.media3});

  await tapVisible('[data-watch-mode="audio"]');
  const audio=await waitNative(s=>s.activeMode==='audio' && s.media3.active &&
    !s.media3.videoSelected && s.media3.playing && s.native.mode==='AUDIO',
    'Physical Video to Audio switch must preserve the native Media3 session');
  const audioStart=audio.media3.positionMs;
  assert.ok(audioStart>=moved.media3.positionMs-1250,
    'Changing presentation must not restart the lecture or rewind the shared clock');
  await delay(4500);
  const audioProgress=await sample();
  assert.ok(audioProgress.media3.playing&&!audioProgress.media3.videoSelected,
    'Native Audio must continue without pressing Play again');
  assert.ok(audioProgress.media3.positionMs>audioStart+2500,
    'The same Media3 HLS audio clock must keep moving after Video is hidden');
  assert.equal(audioProgress.media3.sourceType,'hls','Switching to Audio must not replace the HLS MediaItem');
  report.checks.push({label:'Video to Audio switches only the video track, no new decoder/clock',before:audio.media3,after:audioProgress.media3});
  await tapVisible('[data-watch-mode="video"]');
  const resumed=await waitNative(s=>s.activeMode==='video'&&s.media3.active&&
    s.media3.videoSelected&&s.media3.playing&&s.media3.firstFrame&&
    s.native.mode==='VIDEO'&&s.media3.frames>audioProgress.media3.frames+12&&
    s.media3.surfaceVisibleOnScreen&&s.media3.surfaceVisibleWidth>120,
    'Physical Audio to Video switch must display freshly rendered native frames');
  assert.ok(resumed.media3.positionMs>=audioProgress.media3.positionMs-1250,
    'Returning to Video must preserve the SAME advancing Media3 clock');
  assert.equal(resumed.media3.sourceType,'hls','Track-only Video restore must retain original HLS');
  assert.equal(resumed.video,null,'No second WebView video player may be created during mode switches');
  report.checks.push({label:'Audio to Video resumes moving decoded frames in the same Media3 engine',snapshot:resumed.media3});
  const restoredLuminance=captureVisibleNativePicture(resumed,'media3-video-restored');
  report.restoredVisiblePicture={luminance:restoredLuminance,frameCount:resumed.media3.frames,
    surfaceX:resumed.media3.surfaceX,surfaceY:resumed.media3.surfaceY};

  // Every action below is a physical Android touch. CDP only observes state.
  const tapNativeLabel=async (description, text) => {
    const controlKey={
      'Choose video quality':'qualityButtonRect',
      'Enter Picture-in-Picture':'pipButtonRect',
      'Enter video fullscreen':'sizeButtonRect',
      'Exit video fullscreen':'sizeButtonRect',
      'Expand mini video':'miniExpandRect',
      'Pause mini video':'miniPlayPauseRect',
      'Play mini video':'miniPlayPauseRect'
    }[description];
    if (controlKey) {
      for (let attempt=0;attempt<12;attempt++) {
        // Two fresh native geometry reads replace the expensive whole-window
        // hierarchy scan for app-owned buttons. That scan could return a stale
        // visible node just as the 8-second native controller timer expired.
        const first=(await sample()).media3[controlKey];
        await delay(80);
        const state=(await sample()).media3, second=state[controlKey];
        if (first && second && Math.abs(first.x-second.x)<=1 &&
            Math.abs(first.y-second.y)<=1 && second.width>0 && second.height>0) {
          const point=[Math.round(second.x+second.width/2),Math.round(second.y+second.height/2)];
          adb('shell','input','tap',...point.map(String));
          report.gestures.push({nativeDescription:description,point,nativeRect:second});
          return;
        }
        if (!['Expand mini video','Pause mini video','Play mini video'].includes(description)) await showNativeControls();
        else await delay(200);
      }
      throw new Error('Actual native control has no stable visible rectangle: '+description);
    }
    let xml;
    for (let attempt=0; attempt<12; attempt++) {
      xml=nativeHierarchy();
      const nodes=xml.match(/<node\b[^>]*>/g)||[];
      const node=nodes.find(n=>(description && n.includes('content-desc="'+description+'"')) ||
        (text && n.includes('text="'+text+'"')));
      const b=node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      if (b && Number(b[3])>Number(b[1]) && Number(b[4])>Number(b[2])) {
        const x=Math.round((Number(b[1])+Number(b[3]))/2);
        const y=Math.round((Number(b[2])+Number(b[4]))/2);
        adb('shell','input','tap',String(x),String(y));
        report.gestures.push({nativeDescription:description,text,point:[x,y]});
        return;
      }
      if (['Choose video quality','Enter video fullscreen','Exit video fullscreen',
          'Enter Picture-in-Picture'].includes(description)) {
        // The hierarchy observer may take longer than Media3's control timeout.
        // Reopen the actual controls with a physical video tap when observation
        // confirms they disappeared; never inject a controller visibility setter.
        await showNativeControls();
      }
      await delay(300);
    }
    throw new Error('Actual native control not visible: '+description+' / '+text+'; '+xml);
  };
  const showNativeControls=async()=>{
    const s=await sample(), m=s.media3;
    if (!m.qualityButtonVisible) {
      adb('shell','input','tap',String(Math.round(m.surfaceX+m.surfaceVisibleWidth*.95)),
        String(Math.round(m.surfaceY+m.surfaceVisibleHeight*.48)));
    }
    return waitNative(s=>s.media3.pipButtonVisible&&s.media3.qualityButtonVisible,
      'Native PiP and quality buttons must be visible on the actual video',10000);
  };
  const samePlayback=(before,after,label,elapsed)=>{
    assert.equal(after.playerIdentity,before.playerIdentity,label+' created/replaced ExoPlayer');
    assert.equal(after.mediaItemIdentity,before.mediaItemIdentity,label+' replaced the MediaItem');
    assert.ok(after.positionMs>=before.positionMs-1250,label+' rewound playback');
    assert.ok(after.positionMs<=before.positionMs+elapsed+5000,label+' jumped playback forward');
    assert.equal(after.sourceType,'hls',label+' changed the source');
  };
  let controls=await showNativeControls();
  assert.ok(controls.media3.availableResolutions.length>=2,
    'Quality integration fixture must contain at least two actual HLS resolutions');
  const resolutions=controls.media3.availableResolutions;
  for (const height of [resolutions.at(-1),resolutions[0]]) {
    const before=(await showNativeControls()).media3,started=Date.now();
    await tapNativeLabel('Choose video quality');
    await tapNativeLabel('',height+'p');
    const selected=await waitNative(s=>s.media3.qualityHeight===height&&
      s.media3.height===height&&s.media3.playing&&s.media3.frames>before.frames+5,
      'Actual Media3 decoder must change to selected HLS resolution '+height+'p',65000);
    samePlayback(before,selected.media3,'Quality '+height+'p',Date.now()-started);
    report.checks.push({label:'Physical quality menu selects real decoded HLS '+height+'p with same player/item/clock',
      before,after:selected.media3});
  }
  controls=await showNativeControls();
  await tapNativeLabel('Choose video quality');
  await tapNativeLabel('','Auto');
  await waitNative(s=>s.media3.qualityHeight===0&&s.media3.playing,'Auto must restore adaptive Media3 selection');

  // Two actual native taps on each side must seek exactly once on the same engine.
  for(const direction of [1,-1]) {
    await delay(500);
    const before=(await sample()).media3,started=Date.now();
    const x=Math.round(before.surfaceX+before.surfaceVisibleWidth*(direction>0?.90:.10));
    const y=Math.round(before.surfaceY+before.surfaceVisibleHeight*.50);
    const pid=adb('shell','pidof','org.irgunshiuraitorah.app');
    const touch=adb('shell','am','instrument','-w','-r','-e','x',String(x),'-e','y',String(y),
      'org.irgunshiuraitorah.qa/.NativeTouch');
    assert.match(touch,/INSTRUMENTATION_CODE: -1/,'Actual touchscreen injection must succeed');
    const interval=Number(touch.match(/tapIntervalMs=(\d+)/)?.[1]);
    assert.ok(interval>0&&interval<=250,'Both real Android taps must fit the actual double-tap interval');
    assert.equal(adb('shell','pidof','org.irgunshiuraitorah.app'),pid,'Touch test may not restart Irgun');
    report.gestures.push({nativeDoubleTap:[x,y],tapIntervalMs:interval});
    const sought=await waitNative(s=>s.media3.doubleTapSeekCount===before.doubleTapSeekCount+1&&
      s.media3.playing&&s.media3.frames>before.frames+3&&
      s.media3.positionMs>=s.media3.doubleTapSeekTargetMs-1250&&
      s.media3.positionMs<=s.media3.doubleTapSeekTargetMs+s.media3.doubleTapSeekAgeMs+2000,
      'Physical Video double tap must seek '+direction*15+' seconds once',12000);
    const expected=Math.max(0,before.positionMs+direction*15000);
    assert.ok(sought.media3.doubleTapSeekTargetMs>=expected-1250&&
      sought.media3.doubleTapSeekTargetMs<=expected+Date.now()-started+1250,
      'Touch must request the actual current position plus exactly 15 seconds once');
    assert.equal(sought.media3.playerIdentity,before.playerIdentity,'Double tap must keep ExoPlayer');
    assert.equal(sought.media3.mediaItemIdentity,before.mediaItemIdentity,'Double tap must keep MediaItem');
    report.checks.push({label:'Physical Video double tap seeks '+direction*15+' seconds on same player',before,after:sought.media3});
  }

  // Scroll from below the video to avoid the separate downward-to-mini gesture.
  const beforeScroll=(await sample()).media3;
  const scrollX=Math.round(beforeScroll.surfaceX+beforeScroll.surfaceVisibleWidth*.5);
  const scrollY=Math.round(beforeScroll.surfaceY+beforeScroll.surfaceVisibleHeight+90);
  adb('shell','input','swipe',String(scrollX),String(scrollY),String(scrollX),
    String(scrollY-Math.round(beforeScroll.surfaceVisibleHeight*.65)),'700');
  const partial=await waitNative(s=>s.media3.playing&&s.media3.surfaceVisibleOnScreen&&
    s.media3.surfaceVisibleHeight>20&&s.media3.surfaceVisibleHeight<beforeScroll.surfaceVisibleHeight*.9,
    'Partly scrolled video must retain a visible native picture');
  await delay(1200);const partialMoved=await sample();
  assert.ok(partialMoved.media3.frames>partial.media3.frames+5,'Clipped Video must keep rendering frames');
  captureVisibleNativePicture(partialMoved,'media3-partially-scrolled');
  adb('shell','input','swipe',String(scrollX),String(scrollY-Math.round(beforeScroll.surfaceVisibleHeight*.65)),
    String(scrollX),String(scrollY),'700');
  await waitNative(s=>s.media3.surfaceVisibleHeight>=beforeScroll.surfaceVisibleHeight-3&&s.media3.playing,
    'Scrolling back must restore the same whole native picture');
  report.checks.push({label:'Physical scroll clips the visible picture without removing or restarting it',before:beforeScroll,partial:partialMoved.media3});

  // Swipe the actual native picture, not a WebView proxy behind it.
  const beforeSwipe=(await sample()).media3,swipeStart=Date.now();
  const sx=Math.round(beforeSwipe.surfaceX+beforeSwipe.surfaceVisibleWidth*.5);
  const sy=Math.round(beforeSwipe.surfaceY+beforeSwipe.surfaceVisibleHeight*.5);
  adb('shell','input','swipe',String(sx),String(sy),String(sx),
    String(sy+Math.max(110,Math.round(beforeSwipe.surfaceVisibleHeight*.9))),'480');
  report.gestures.push({nativeSwipeDown:[sx,sy]});
  const mini=await waitNative(s=>s.media3.mini&&s.media3.miniHitTargetVisible&&
    s.media3.playing&&s.media3.surfaceVisibleOnScreen,'Real downward video swipe must open mini player');
  samePlayback(beforeSwipe,mini.media3,'Swipe to mini',Date.now()-swipeStart);
  await delay(2000);
  const miniMoved=await sample();
  assert.ok(miniMoved.media3.positionMs>mini.media3.positionMs+900&&
    miniMoved.media3.frames>mini.media3.frames+5,'Mini must keep playing real moving video');
  const originalLang=await evaluate('document.documentElement.lang');
  for (let language=0;language<2;language++) {
    if(language===1){
      await tapVisible('[data-language-toggle]',true);
      for(let n=0;n<30&&(await evaluate('document.documentElement.lang'))===originalLang;n++)await delay(150);
      assert.notEqual(await evaluate('document.documentElement.lang'),originalLang,'Physical language toggle must change real layout direction');
    }
    for(let cycle=0;cycle<2;cycle++) {
      const before=(await sample()).media3,started=Date.now();
      assert.ok(before.miniPlayPauseRect,'Mini must expose a visible native Pause button');
      assert.equal(before.miniPlayPauseLabel,'Pause mini video');
      await tapNativeLabel('Pause mini video');
      const paused=await waitNative(s=>s.media3.mini&&!s.media3.playWhenReady&&!s.media3.playing&&
        s.media3.miniPlayPauseLabel==='Play mini video','Physical Mini Pause must stop real Media3 playback without expanding');
      await delay(1300);const stopped=await sample();
      assert.ok(!stopped.media3.playWhenReady&&!stopped.media3.playing,'Mini must remain explicitly paused');
      assert.ok(Math.abs(stopped.media3.positionMs-paused.media3.positionMs)<250,'Actual Mini Pause must freeze the native clock');
      samePlayback(before,stopped.media3,'Mini Pause',Date.now()-started);
      await tapNativeLabel('Play mini video');
      const continued=await waitNative(s=>s.media3.mini&&s.media3.playWhenReady&&s.media3.playing&&
        s.media3.positionMs>stopped.media3.positionMs+500&&s.media3.frames>stopped.media3.frames+5&&
        s.media3.miniPlayPauseLabel==='Pause mini video','Physical Mini Play must resume moving video at saved position');
      samePlayback(before,continued.media3,'Mini Resume',Date.now()-started);
      report.checks.push({label:'Actual Mini Pause/Play stops and resumes one native clock without expansion',
        language:await evaluate('document.documentElement.lang'),cycle,before,paused:stopped.media3,after:continued.media3});
    }
  }
  await tapVisible('[data-language-toggle]',true);
  for(let n=0;n<30&&(await evaluate('document.documentElement.lang'))!==originalLang;n++)await delay(150);
  assert.equal(await evaluate('document.documentElement.lang'),originalLang,'Restore actual original language after Mini controls');
  await tapNativeLabel('Expand mini video');
  const expanded=await waitNative(s=>!s.media3.mini&&s.media3.surfaceVisibleWidth>120&&
    s.media3.playing,'Physical mini thumbnail tap must expand the existing video');
  samePlayback(beforeSwipe,expanded.media3,'Mini expand',Date.now()-swipeStart);
  report.checks.push({label:'Physical swipe minimizes and physical mini thumbnail expands with continuous same-player playback',
    before:beforeSwipe,mini:mini.media3,after:expanded.media3});

  controls=await showNativeControls();
  await tapNativeLabel('Enter video fullscreen');
  await waitNative(s=>s.media3.fullscreen,'Native fullscreen control must expand video');
  await delay(900);
  const education=fullscreenEducationTapPoint(nativeHierarchy());
  if (education) adb('shell','input','tap',...education.map(String));
  await showNativeControls();
  await tapNativeLabel('Exit video fullscreen');
  await waitNative(s=>!s.media3.fullscreen,'Native Shrink control must exit fullscreen');

  const beforePip=(await showNativeControls()).media3,pipStart=Date.now();
  await tapNativeLabel('Enter Picture-in-Picture');
  const pip=await waitNative(s=>s.media3.systemPip&&s.media3.videoSelected&&s.media3.playing,
    'PiP button must enter Android system PiP without switching to Audio');
  assert.match(adb('shell','dumpsys','activity','activities'),/mode=pinned/,
    'Android ActivityManager must confirm a real pinned PiP task');
  assert.equal(pip.media3.pipButtonVisible,false,'App controls must hide in system PiP');
  await delay(3000);
  const pipMoved=await sample();
  assert.ok(pipMoved.media3.positionMs>pip.media3.positionMs+1500&&
    pipMoved.media3.frames>pip.media3.frames+5,'System PiP must keep decoding and advancing');
  samePlayback(beforePip,pipMoved.media3,'PiP entry',Date.now()-pipStart);
  writeFileSync('emulator-report/native-system-pip.png',execFileSync('adb',['exec-out','screencap','-p']));
  adb('shell','am','start','-W','-n','org.irgunshiuraitorah.app/.MainActivity');
  const afterPip=await waitNative(s=>!s.media3.systemPip&&s.media3.videoSelected&&
    s.media3.playing&&s.media3.surfaceVisibleWidth>120,'Returning from PiP must restore actual moving video');
  samePlayback(beforePip,afterPip.media3,'PiP return',Date.now()-pipStart);
  assert.equal(afterPip.video,null,'PiP must never create a WebView video decoder');
  assert.ok(afterPip.webAudio.every(a=>a.paused||a.muted||a.volume===0),'No second audible WebView audio in PiP');
  report.checks.push({label:'Physical PiP button enters real Android pinned task and returns without player/item/clock change',
    before:beforePip,pip:pipMoved.media3,after:afterPip.media3});

  if (process.env.IRGUN_NATIVE_MEDIA3_SOAK === '1') {
    // A REAL wall-clock 15-minute Media3 HLS soak, not a mock clock or a
    // WebView/HLS.js precondition. Keep checking one ExoPlayer and its decoded
    // frames, native Audio position, media notification and Android lifecycle.
    const soakStart=Date.now(),initialPid=adb('shell','pidof','org.irgunshiuraitorah.app').trim();
    const memory=()=>{
      const raw=adb('shell','dumpsys','meminfo','org.irgunshiuraitorah.app');
      const value=raw.match(/TOTAL PSS:\s*(\d+)/)?.[1]||raw.match(/^\s*TOTAL\s+(\d+)\s/m)?.[1];
      assert.ok(value,'Android must expose native app memory during Media3 soak');
      return Number(value);
    };
    report.soak={requiredMinutes:15,startedAt:new Date(soakStart).toISOString(),samples:[],events:[]};
    await tapVisible('[data-watch-mode="audio"]');
    let last=await waitNative(s=>s.media3.active && s.media3.playing &&
      !s.media3.videoSelected && s.native.mode==='AUDIO',
      'Soak must start with audible Media3 Audio in the same HLS source');
    assert.equal(last.media3.sourceType,'hls','Native soak must not use MP4 fallback');
    const baselinePss=memory();
    report.soak.samples.push({minute:0,positionMs:last.media3.positionMs,pssKb:baselinePss});
    for(let minute=1;minute<=15;minute++) {
      // Start time is the FIRST native Audio snapshot; waits use actual time.
      await delay(Math.max(0,soakStart+minute*60000-Date.now()));
      if ([4,9,13].includes(minute)) {
        adb('shell','input','keyevent','KEYCODE_POWER');
        await delay(2500);
        assert.ok(adb('shell','dumpsys','media_session').includes('org.irgunshiuraitorah.app'),
          'Native MediaSession must remain registered with the screen locked');
        adb('shell','input','keyevent','KEYCODE_POWER');
        adb('shell','input','keyevent','KEYCODE_MENU');
        await delay(1200);
        report.soak.events.push({minute,action:'screen lock/unlock and native MediaSession'});
      }
      if ([6,12].includes(minute)) {
        adb('shell','input','keyevent','KEYCODE_HOME');
        await delay(2600);
        assert.ok(adb('shell','dumpsys','notification','--noredact').includes('org.irgunshiuraitorah.app'),
          'Native Media3 notification must remain posted during Home');
        assert.ok(adb('shell','dumpsys','media_session').includes('org.irgunshiuraitorah.app'),
          'Media3 session must survive Home');
        adb('shell','am','start','-W','-n','org.irgunshiuraitorah.app/.MainActivity');
        await delay(1600);
        report.soak.events.push({minute,action:'Home, media notification, reopen'});
      }
      if ([2,7,11].includes(minute)) {
        const beforeVideo=await sample();
        assert.ok(beforeVideo.media3.active && beforeVideo.media3.playing,
          'Native Audio must still be playing before Video presentation change');
        await tapVisible('[data-watch-mode="video"]');
        const video=await waitNative(s=>s.media3.active&&s.media3.videoSelected&&s.media3.playing&&
          s.media3.sourceType==='hls'&&s.media3.frames>beforeVideo.media3.frames+12,
          'Soak Video must resume with freshly decoded native HLS frames');
        assert.ok(video.media3.positionMs>=beforeVideo.media3.positionMs-1250,
          'Native video track enable must never rewind the same Media3 clock');
        await delay(1400);
        const frames=await sample();
        assert.ok(frames.media3.frames>video.media3.frames+3&&
          frames.media3.positionMs>video.media3.positionMs+650,
          'Soak needs real moving native frames, not only Media3 READY state');
        await tapVisible('[data-watch-mode="audio"]');
        const audio=await waitNative(s=>s.media3.active&&!s.media3.videoSelected&&s.media3.playing&&
          s.native.mode==='AUDIO'&&s.media3.sourceType==='hls',
          'Soak Video-to-Audio must keep the SAME native HLS stream playing');
        assert.ok(audio.media3.positionMs>=frames.media3.positionMs-1250,
          'Changing to Audio must preserve the original Media3 position');
        report.soak.events.push({minute,action:'physical Video to Audio with native decoded frames'});
      }
      assert.equal(adb('shell','pidof','org.irgunshiuraitorah.app').trim(),initialPid,
        'Android process must not crash or restart during the true 15-minute soak');
      const current=await sample();
      assert.ok(current.media3.active && current.media3.playing &&
        !current.media3.videoSelected && current.native.mode==='AUDIO',
        'Audible native HLS Audio must remain playing after minute '+minute);
      assert.equal(current.media3.sourceType,'hls',
        '15-minute soak must never fall back to MP4 or WebView video');
      assert.equal(current.video,null,'No HTML video decoder may appear during native soak');
      assert.ok(current.media3.positionMs>last.media3.positionMs+22000,
        'Native Media3 playback position froze or rewound at minute '+minute);
      const pss=memory();
      report.soak.samples.push({minute,positionMs:current.media3.positionMs,pssKb:pss,
        source:current.media3.sourceType});
      last=current;
      console.log('Native Media3 soak minute '+minute+' OK, HLS seconds '+(current.media3.positionMs/1000).toFixed(1));
    }
    assert.ok(Date.now()-soakStart>=15*60*1000,
      'This must be at least 15 minutes of genuine wall-clock playback');
    const peak=Math.max(...report.soak.samples.map(s=>s.pssKb));
    report.soak.memoryBudget={baselineKb:baselinePss,peakKb:peak,
      maxGrowthKb:131072,maxPssKb:393216};
    assert.ok(peak<=393216&&peak-baselinePss<=131072,
      '15-minute native Media3 player must stay within app memory limits');
    report.soak.actualElapsedMs=Date.now()-soakStart;
    report.checks.push({label:'Real 15-minute native Media3 HLS, lock/Home/reopen, Audio/Video and memory',
      minutes:15,samples:report.soak.samples.length,events:report.soak.events.length});
  }
  report.result='passed';

} catch (error) {
  report.result='failed';report.error=String(error.stack||error);
  try {writeFileSync('emulator-report/media3-video-failure.png',execFileSync('adb',['exec-out','screencap','-p']));}catch{}
  process.exitCode=1;
} finally {
  ws?.close();
  writeFileSync('emulator-report/native-media3-playback.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}

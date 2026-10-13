import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const service=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunPlaybackService.java','utf8');
const bridge=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunNativeVideoPlugin.java','utf8');
const app=readFileSync('src/main.js','utf8');
const adapter=readFileSync('src/android-native-media3-video.js','utf8');
const gradle=readFileSync('android/app/build.gradle','utf8');

test('Android uses Media3 exclusively and refuses silent WebView/Vimeo fallback',()=>{
  assert.match(app,/if \(Capacitor\.getPlatform\(\) === 'android'\) \{/);
  assert.match(app,/player = await createNativeMedia3VideoPlayer\(/);
  assert.doesNotMatch(app,/createAndroidHlsPlayer\(/,'WebView HLS decoder may not be reached or imported by the Android app');
  assert.doesNotMatch(app,/from ['"]\.\/android-hls-video\.js['"]/,'Legacy WebView HLS code must not enter the app bundle');
  assert.doesNotMatch(adapter,/from ['"]\.\/android-hls-video\.js['"]/,'Media3 source lookup must not import WebView HLS');
  assert.match(adapter,/from '\.\/android-media-source\.js'/,'Pure source descriptor must be independent of the retired decoder');
  assert.match(app,/Android Video requires native Media3/);
  assert.match(app,/showAndroidNativeVideoError\(frame,nativeError\)/);
  assert.match(app,/Retry native Video/,'Unplayable native video must show a user-directed retry, not a second video player');
  assert.match(app,/Capacitor\.getPlatform\(\) === 'android' \? 'about:blank'/,'The initial Android iframe must never load Vimeo');
  assert.doesNotMatch(adapter,/VITE_ANDROID_MEDIA3_VIDEO_BETA/,'Media3 must no longer depend on a build feature flag');
});
test('native video and native audio use the SAME ExoPlayer instance and MediaSession',()=>{
  assert.match(service,/private ExoPlayer player;/);
  assert.match(service,/public static ExoPlayer nativeVideoPlayer\(\)/);
  assert.match(service,/return s == null \|\| !s\.nativeVideoSourceActive \? null : s\.player/);
  assert.doesNotMatch(bridge,/new ExoPlayer\s*\(/,'Plugin must never create a second audio/video player');
  assert.match(bridge,/surface\.setPlayer\(player\)/);
  assert.match(gradle,/media3-exoplayer-hls/);
  assert.match(gradle,/media3-ui/);
});
test('native Video to Audio retains its media item and exact playback position',()=>{
  const start=service.indexOf('private void switchNativeVideoPresentationInternal(');
  const end=service.indexOf('public static void nativeVideoPresentation(',start);
  assert.ok(start>=0&&end>start);
  const fn=service.slice(start,end);
  assert.match(fn,/setTrackTypeDisabled\(C\.TRACK_TYPE_VIDEO, !showVideo\)/);
  const unchanged=fn.slice(fn.indexOf('// No file swap when the user'),fn.indexOf('nativeVideoSelected = showVideo;'));
  assert.ok(unchanged.length>60,'Normal Media3 presentation must have its own no-file-swap path');
  assert.doesNotMatch(unchanged,/seekTo\(|setMediaItem\(|clearMediaItems\(|\.pause\(|\.prepare\(/,
    'Normal Audio/Video switching must NEVER replace/restart the native stream');
  assert.match(fn,/if \(restoreVideoSource \|\| useLocalAudio\)/,
    'Only explicitly saved offline MP3s may trigger a one-player source swap');
  assert.match(fn,/setMediaItem\(source, position\)/);
  assert.match(fn,/setPlayWhenReady\(playIntent\)/,
    'An offline file swap must retain actual playback intent');
  assert.match(service,/if \(nativeVideoSourceActive\) return;/,'Legacy Vimeo clock must not overwrite native source');
  assert.match(service,/nativeVideoRenderedFrames\+\+/,'Actual video frames, not only clock, must be tracked');
});
test('Android native controls expose only bounded and source-safe commands',()=>{
  assert.match(bridge,/API_HOST = "api\.irgunshiuraitorah\.com"/);
  assert.match(bridge,/startsWith\("\/media\/"\)/);
  assert.match(bridge,/case "seek":/);
  assert.match(bridge,/case "pause":/);
  assert.match(bridge,/case "speed":/);
  assert.match(bridge,/void close\(PluginCall call\)/);
  assert.match(adapter,/s\.frames>=2&&s\.width>0/);
});

test('native Video surface yields to Save picker, then restores the SAME player',async()=>{
  const start=adapter.indexOf('  const viewportFrame=()=>{');
  const end=adapter.indexOf('  const scheduleFrame=',start);
  assert.ok(start>0&&end>start,'Use actual live viewport and placement code');
  const calls=[];
  let modalVisible=true;
  const placeholder={isConnected:true,getBoundingClientRect:()=>({
    x:12,y:80,left:12,top:80,right:312,bottom:249,width:300,height:169
  })};
  const context={
    destroyed:false,mode:'video',placeholder,framePlacedOnScreen:false,
    document:{
      querySelector:selector=>selector==='.playlist-picker-backdrop'&&modalVisible?{}:null,
      querySelectorAll:()=>[placeholder],
      getElementById:()=>null
    },
    native:{frame:async args=>{calls.push(args);}},
    innerWidth:320,innerHeight:600
  };
  const actual=adapter.slice(start,end);
  runInNewContext(actual+'\nthis.positionFrame=positionFrame;',context);
  await context.positionFrame();
  assert.equal(calls.length,1);
  assert.equal(calls[0].width,0,'Physical Media3 PlayerView must hide while Save is on top');
  assert.equal(calls[0].height,0);
  assert.ok(!['.pause(','.stop(','.seekTo(','setMode('].some(part=>actual.includes(part)),
    'A modal must not interrupt, seek or replace existing Media3 Audio');
  modalVisible=false;
  await context.positionFrame();
  assert.equal(calls[1].x,12,'Restored native surface must be at its actual visible X');
  assert.equal(calls[1].width,300,'The same native video surface returns after closing Save');
  assert.equal(calls[1].height,169);
  assert.ok(app.includes('state.watchVimeo?.updateFrame?.()'),
    'App must refresh native surface after in-place picker dismissal');
});

test('native Media3 refuses an offscreen -12000px iframe after Audio to Video',async()=>{
  const start=adapter.indexOf('  const viewportFrame=()=>{');
  const end=adapter.indexOf('  const scheduleFrame=',start);
  assert.ok(start>0&&end>start);
  let parked=true,activeVideo=true;
  const calls=[];
  const frame={isConnected:true,getBoundingClientRect:()=>{
    const left=parked?-12000:12;
    return {x:left,y:80,left,top:80,right:left+300,bottom:249,width:300,height:169};
  }};
  const host={classList:{
    contains:name=>name==='watch-audio-parked'&&parked,
    remove:name=>{if(name==='watch-audio-parked')parked=false;},
    add:()=>{}
  }};
  const context={
    destroyed:false,mode:'video',framePlacedOnScreen:false,placeholder:frame,
    document:{
      querySelector:selector=>selector==='.media-switch [data-watch-mode="video"].active'&&activeVideo?{}:null,
      querySelectorAll:()=>[frame],
      getElementById:id=>id==='persistentVideoMount'?host:null,
      body:{classList:{remove:()=>{}}}
    },
    native:{frame:async args=>{calls.push(args);}},
    innerWidth:320,innerHeight:600
  };
  runInNewContext(adapter.slice(start,end)+'\nthis.positionFrame=positionFrame;',context);
  await context.positionFrame();
  assert.equal(parked,false,'Native Audio to Video must unpark the legacy offscreen host');
  assert.equal(calls[0].x,12,'Native surface MUST be placed on-screen, not x=-12000');
  assert.equal(calls[0].width,300);

  parked=true;activeVideo=false;
  await context.positionFrame();
  assert.equal(calls[1].width,0,'Do not render a physically offscreen native surface while Audio is selected');
  assert.ok(calls.every(v=>v.x===undefined||v.x>=0),'No native PlayerView positioning event may use negative X');
  assert.match(app,/player\.updateFrame\?\.\(\)/,
    'Committed Media3 handoff must request the real visible surface placement');
  assert.match(bridge,/surfaceVisibleOnScreen/,
    'Native test observations must check globally visible Android geometry');
  const integration=readFileSync('scripts/android-emulator-native-media3.mjs','utf8');
  assert.match(integration,/SCREEN BLACK:/,'Emulator test must fail a black real screenshot');
  assert.match(integration,/surfaceVisibleOnScreen/);
  assert.match(integration,/-alpha','off/, 'Emulator test must not count PNG alpha as picture brightness');
});

test('native fullscreen expands the SAME PlayerView and Android Back exits without closing the lecture',()=>{
  const main=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/MainActivity.java','utf8');
  assert.match(bridge,/public void fullscreen\(PluginCall call\)/);
  assert.match(bridge,/Math\.max\(1, root\.getWidth\(\)\)/);
  assert.match(bridge,/Math\.max\(1, root\.getHeight\(\)\)/);
  assert.match(bridge,/surface\.setLayoutParams\(full\)/);
  assert.match(bridge,/response\.put\("surfaceWidth"/);
  assert.match(bridge,/response\.put\("rootWidth"/);
  assert.doesNotMatch(bridge,/new ExoPlayer\s*\(/,'Fullscreen must never create another ExoPlayer');
  assert.match(app,/window\.__irgunExitNativeVideoFullscreen/);
  assert.match(app,/data-native-video-fullscreen/);
  assert.match(main,/__irgunExitNativeVideoFullscreen/);
});

test('expanded Android tests observe actual Media3 and physical Android network conditions',()=>{
  const ext=readFileSync('scripts/android-regression-extensions.mjs','utf8');
  assert.match(ext,/s\.media3=await evaluate\("window\.Capacitor\.nativePromise\('IrgunNativeVideo','snapshot'/);
  assert.match(ext,/s\.media3\.frames>=2/);
  assert.match(ext,/s\.media3\.bufferedPositionMs>s\.media3\.positionMs/);
  assert.match(ext,/adb\('emu','network','speed','umts'\)/);
  assert.match(ext,/adb\('shell','input','keyevent','KEYCODE_MEDIA_FAST_FORWARD'\)/);
  assert.match(ext,/if\(start\.videoEngine==='native-media3'\)/);
  assert.match(ext,/assert\.equal\(s\.webViewVideo,null/);
  assert.match(ext,/nativeHierarchy\(/,'Real Android native UI remains instrumented');
});

test('offline Audio chooses a verified private MP3, then restores HLS in the SAME Media3 engine',()=>{
  assert.match(bridge,/getFilesDir\(\).*"irgun-offline"/,
    'Native file source must be restricted to app-private offline directory');
  assert.match(bridge,/getCanonicalFile\(\)/,'Canonical path must prevent traversal');
  assert.match(bridge,/audio\.isFile\(\)/,'Offline copy must exist on actual Android storage');
  assert.match(bridge,/IrgunPlaybackService\.nativeVideoPresentation\(video, approved\)/);
  assert.match(service,/nativeVideoOfflineAudioActive = true/);
  assert.match(service,/MimeTypes\.AUDIO_MPEG/,'Real Media3 MP3 decoder must be selected');
  assert.match(service,/source = nativeVideoMediaItem\(url, nativeVideoUsingHls\)/,
    'Same Media3 player must restore original video source at the live clock');
  assert.match(service,/nativeVideoOfflineAudioActive \&\& !s\.nativeVideoSelected/,
    'Read-only native snapshot must distinguish real MP3 from HLS');
  assert.match(app,/player\.setMode\(mode,\{offlineUri\}\)/);
  assert.match(app,/offline:true, offlineKey:offlineRecord\.key/);
  assert.match(adapter,/offlineUri:next==='audio'/,'Only Audio is allowed to use downloaded file');
  const ext=readFileSync('scripts/android-regression-extensions.mjs','utf8');
  assert.match(ext,/Audio playback must select the offline file/);
});

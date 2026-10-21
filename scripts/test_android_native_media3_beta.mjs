import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';

const service=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunPlaybackService.java','utf8');
const bridge=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunNativeVideoPlugin.java','utf8');
const app=readFileSync('src/main.js','utf8');
const adapter=readFileSync('src/android-native-media3-video.js','utf8');

test('persistent Android watch controls bind once across page renders and alongside permanent chrome',()=>{
 const start=app.indexOf('function bindWatchClick('),end=app.indexOf('\nfunction ',start+1);
 assert.ok(start>0&&end>start);
 let requested=0;const listeners=[],button={dataset:{},addEventListener:(name,fn)=>listeners.push(fn)};
 const context={Capacitor:{getPlatform:()=> 'android'}};
 runInNewContext(app.slice(start,end)+'\nthis.bind=bindWatchClick;',context);
 for(let n=0;n<8;n++)context.bind(button,()=>requested++);
 assert.equal(button.dataset.bound,'1','Permanent chrome must see that the original Android button is bound');
 assert.equal(listeners.length,1);listeners[0]();assert.equal(requested,1,'One real click must request PiP only once');
});

test('silent HLS segment buffering has bounded recovery on the SAME Media3 player and item',()=>{
 const start=service.indexOf('private void scheduleNativeVideoStallWatch()');
 const end=service.indexOf('public void onCreate()',start);
 assert.ok(start>0&&end>start,'Native silent buffering watchdog must exist');
 const watchdog=service.slice(start,end);
 assert.match(watchdog,/!nativeVideoFirstFrameRendered/,'Do not restart normal initial video buffering');
 assert.match(watchdog,/Player\.STATE_BUFFERING/,'Only genuine buffering can trigger recovery');
 assert.match(watchdog,/!engine\.getPlayWhenReady\(\)/,'Paused lectures must not restart');
 assert.match(watchdog,/networkRecoveryPending/,'Actual network recovery must take priority');
 assert.match(watchdog,/nativeVideoStallRestarts >= MAX_NATIVE_VIDEO_STALL_RESTARTS/,
   'A failed stream cannot loop endless preparation');
 assert.match(watchdog,/engine\.getCurrentMediaItem\(\) != media/,
   'Late timers must never change a new lecture');
 assert.match(watchdog,/engine\.stop\(\)/);
 assert.match(watchdog,/engine\.seekTo\(position\)/);
 assert.match(watchdog,/engine\.prepare\(\)/);
 assert.match(watchdog,/engine\.setPlaybackSpeed\(speed\)/,"Respect the user's selected speed");
 assert.doesNotMatch(watchdog,/setMediaItem\(|new ExoPlayer|new MediaSession|setVideoSurface/,
   'Silent buffering must keep exactly one player, media item and rendering surface');
 assert.match(service,/if \(state == Player\.STATE_BUFFERING\) scheduleNativeVideoStallWatch\(\)/);
 assert.match(service,/if \(!showVideo\) cancelNativeVideoStallWatch\(\)/);
 assert.match(service,/public void onDestroy\(\) \{\s*cancelNativeVideoStallWatch\(\)/);
});

test('native network recovery clears error UI only after the same video renders new frames',async()=>{
 const start=adapter.indexOf('  const tick=async()=>{'),end=adapter.indexOf('  const timer=setInterval',start);
 assert.ok(start>0&&end>start);
 const player={identity:'same player'},errors=[],recovered=[];
 let sample={active:true,videoSelected:true,playing:false,playWhenReady:true,error:'NETWORK',frames:100,positionMs:4000,durationMs:60000};
 const context={destroyed:false,ticking:false,mode:'video',framePlacedOnScreen:false,lastPlaying:false,reportedError:'',failedFrames:0,
  refresh:async()=>({...sample}),scheduleFrame(){},trackFrame(){},emit(){},console:{warn(){}},
  native:{frame:async()=>{}},innerWidth:320,innerHeight:640,adapter:player,
  onError:err=>errors.push(err.message),onRecovered:value=>recovered.push(value)};
 runInNewContext(adapter.slice(start,end)+'\nthis.tick=tick;',context);
 await context.tick();await context.tick();assert.equal(errors.length,1,'One persistent error must not repeatedly create notices');
 sample={...sample,error:'',playing:true};await context.tick();
 assert.equal(recovered.length,0,'A cleared error alone cannot count as recovered moving video');
 sample={...sample,frames:108,positionMs:5000};await context.tick();await context.tick();
 assert.deepEqual(recovered,[player]);
 const callback=app.slice(app.indexOf('          onRecovered:()=>{'),app.indexOf('          onError:error=>{'));
 let removed=0,placed=0;
 const state={watchVimeoGeneration:4,watchMode:'video',watchNativeVideoFailedId:'lecture',watchVimeo:{updateFrame:()=>placed++}};
 const model={state,generation:4,frame:{parentElement:{querySelector:()=>({remove:()=>removed++})}}};
 const config=runInNewContext('({'+callback+'})',model);config.onRecovered();
 assert.equal(state.watchNativeVideoFailedId,'');assert.equal(removed,1);assert.equal(placed,1);
 state.watchVimeoGeneration=5;config.onRecovered();assert.equal(removed,1,'Old lecture recovery cannot clear a newer lecture notice');
});
const gradle=readFileSync('android/app/build.gradle','utf8');

test('video errors show a readable message without promising a nonexistent audio source',()=>{
  const start=app.indexOf('function showAndroidNativeVideoError('),end=app.indexOf('\nfunction initWatchVimeo(',start);
  for(const [detail,expected] of [[{code:'VIDEO_NOT_READY'},'not available yet'],[new Error('Network timeout'),'Check your connection']]){
    const nodes=[],container={querySelector:()=>null,append:notice=>nodes.push(notice)};
    const document={createElement:()=>({dataset:{},style:{},setAttribute(){},addEventListener(){},append(...children){this.children=children;}})};
    const context={document,state:{watchVimeo:null},currentLanguage:()=> 'en',console:{warn(){}},frame:{style:{},parentElement:container},detail};
    runInNewContext(app.slice(start,end)+'\nshowAndroidNativeVideoError(frame,detail);',context);
    const [message,retry]=nodes[0].children;
    assert.ok(message.textContent.includes(expected));assert.doesNotMatch(message.textContent,/Audio remains|Native/);
    assert.equal(retry.textContent,'Try video again');
  }
});

test('the actual watch header exposes an icon PiP control on small Android screens and keeps iOS markup',()=>{
  const header=app.match(/<header class="watch-top">.*?<\/header>/)?.[0];
  assert.ok(header);
  for(const platform of ['android','ios']){
    const html=runInNewContext('`'+header+'`',{state:{watchMode:'video'},v:{title:'Lecture'},
      Capacitor:{getPlatform:()=>platform},currentLanguage:()=> 'en',nativePipPlugin:()=>({}),
      esc:x=>x,displayShiurTitle:x=>x,svgIcon:name=>'<svg data-icon="'+name+'"></svg>'});
    assert.match(html,/data-video-pip="1"/);assert.match(html,/data-icon="pip"/);
    assert.equal(html.includes('data-native-video-fullscreen'),platform==='android');
  }
  const buttons=bridge.slice(bridge.indexOf('pipButton=iconButton'),bridge.indexOf('controllerVisible = surface.isControllerFullyVisible()'));
  assert.doesNotMatch(buttons,/hasSystemFeature/,'Do not silently remove PiP when Android reports it unsupported');
  assert.match(bridge,/new LinearLayout.LayoutParams\(dp\(44\),dp\(44\)\)/);
});

test('Android native sources use Media3 and never switch to Vimeo after a transport/decoder error',()=>{
  assert.match(app,/if \(Capacitor\.getPlatform\(\) === 'android'\) \{/);
  assert.match(app,/player = await createNativeMedia3VideoPlayer\(/);
  assert.doesNotMatch(app,/createAndroidHlsPlayer\(/,'WebView HLS decoder may not be reached or imported by the Android app');
  assert.doesNotMatch(app,/from ['"]\.\/android-hls-video\.js['"]/,'Legacy WebView HLS code must not enter the app bundle');
  assert.doesNotMatch(adapter,/from ['"]\.\/android-hls-video\.js['"]/,'Media3 source lookup must not import WebView HLS');
  assert.match(adapter,/from '\.\/android-media-source\.js'/,'Pure source descriptor must be independent of the retired decoder');
  assert.match(app,/Android Video requires native Media3/);
  assert.match(app,/showAndroidNativeVideoError\(frame,nativeError\)/);
  assert.match(app,/Try video again/,'Unplayable native video must show a user-directed retry, not a second video player');
  assert.match(app,/Capacitor\.getPlatform\(\) === 'android' \? 'about:blank'/,'The initial Android iframe must never load Vimeo');
  assert.doesNotMatch(adapter,/VITE_ANDROID_MEDIA3_VIDEO_BETA/,'Media3 must no longer depend on a build feature flag');
  const native=app.slice(app.indexOf("if (Capacitor.getPlatform() === 'android' && !androidVimeoOnly)"),app.indexOf('    if (!player && androidVimeoOnly)'));
  assert.match(native,/catch \(nativeError\)/);
  assert.match(native,/showAndroidNativeVideoError\(frame,nativeError\);\s*return;/,
    'Native transport/decoder errors must stop before the Vimeo-only route');
});
test('Android native Audio to Video never detaches TextureView from the same Media3 player',()=>{
 const start=bridge.indexOf('public void mode(PluginCall call)');
 const end=bridge.indexOf('public void playback(PluginCall call)',start);
 assert.ok(start>=0&&end>start);
 const mode=bridge.slice(start,end);
 assert.match(mode,/IrgunPlaybackService\.nativeVideoPresentation\(video, approved\)/);
 assert.match(mode,/surface\.setPlayer\(IrgunPlaybackService\.nativeVideoPlayer\(\)\)/);
 assert.match(mode,/surface\.setVisibility\(View\.INVISIBLE\)/);
 assert.doesNotMatch(mode,/surface\.setPlayer\(null\)/,
  'Audio mode deselects video tracks; unbinding TextureView causes black Video after handoff');
 assert.match(bridge,/RESIZE_MODE_ZOOM/);
 assert.match(bridge,/FrameLayout\.LayoutParams params = new FrameLayout\.LayoutParams\(visibleW,visibleH\)/,
  'Clipped TextureView must be contained in its visible rectangle, not shifted negative');
 assert.doesNotMatch(bridge,/params\.topMargin = -t/,
  'Negative TextureView offsets black out the Android 15 cropped picture');
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
  const sourcePolicy=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/NativeVideoSourcePolicy.java','utf8');
  assert.match(sourcePolicy,/API_HOST = "api\.irgunshiuraitorah\.com"/);
  assert.match(sourcePolicy,/path\.startsWith\("\/media\/"\)/);
  assert.match(sourcePolicy,/VIMEO_PLAYER_HOST = "player\.vimeo\.com"/);
  assert.match(sourcePolicy,/VIMEO_CDN_SUFFIX = "\.vimeocdn\.com"/);
  assert.match(bridge,/NativeVideoSourcePolicy\.isPermitted\(url\)/);
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
      body:{classList:{contains:()=>false}},
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

test('native video never covers the persistent navigation on a short viewport and releases that clip when navigation hides',async()=>{
  const start=adapter.indexOf('  const viewportFrame=()=>{'),end=adapter.indexOf('  const scheduleFrame=',start);
  let visible=true;const calls=[];
  const frame={getBoundingClientRect:()=>({x:0,y:100,left:0,top:100,right:320,bottom:280,width:320,height:180})};
  const context={destroyed:false,mode:'video',framePlacedOnScreen:false,placeholder:frame,
    document:{body:{classList:{contains:()=>false}},querySelector:selector=>selector==='#androidBottomNavigationMount .bottom-nav'?{
      getBoundingClientRect:()=>visible?{width:300,height:72,top:238}:{width:0,height:0,top:0}}:null,
      querySelectorAll:()=>[frame],getElementById:()=>null},
    native:{frame:async value=>calls.push(value)},innerWidth:320,innerHeight:320};
  runInNewContext(adapter.slice(start,end)+'\nthis.place=positionFrame;',context);
  await context.place();assert.equal(calls[0].height,180,'Do not resize or replace the decoder just to apply a clip');
  assert.equal(calls[0].clip.bottom,130,'Native PlayerView must end above the actual navigation touch targets');
  visible=false;await context.place();assert.equal(calls[1].clip.bottom,180,'Hidden fullscreen/PiP navigation must not clip video');
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
      body:{classList:{remove:()=>{},contains:()=>false}}
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
  assert.match(bridge,/Math\.max\(1,\s*root\.getWidth\(\)\)/);
  assert.match(bridge,/Math\.max\(1,\s*root\.getHeight\(\)\)/);
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
  assert.match(ext,/adb\('emu','network','speed','hsdpa'\)/);
  assert.match(ext,/adb\('emu','network','delay','edge'\)/);
  assert.match(ext,/await seekAudio\(target\/1000\)/,
    'When hardware FF is ignored during a stall, physically seek with the real Watch range instead');
  assert.match(ext,/Math\.abs\(s\.media3\.positionMs-target\)<8000/,
    'Physical seek must actually update the Media3 clock');
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

test('real mini thumbnail taps expand native PlayerView and rotation restores physical view',async()=>{
  assert.match(adapter,/mini:document\.body\.classList\.contains\('irgun-watch-mini-hosted'\)/,
    'The native renderer must know when the permanent video host becomes mini');
  assert.match(bridge,/miniExpandTarget\.setOnClickListener\(/,
    'Thumbnail needs an Android-native click target over PlayerView, not just a WebView hit test');
  assert.match(bridge,/web\.evaluateJavascript\(/);
  assert.match(bridge,/__irgunExpandNativeMiniVideo/);
  assert.match(app,/window\.__irgunExpandNativeMiniVideo\s*=\s*\(\)/);
  assert.match(app,/void expandPersistentWatch\(\)/);
  assert.match(bridge,/miniExpandTarget\.setVisibility\(View\.VISIBLE\)/);
  assert.match(bridge,/surface\.setUseController\(!mini\)/,
    'Mini thumb must not show native playback controls when tapping Expand');
  assert.match(bridge,/root\.addOnLayoutChangeListener\(rootLayoutListener\)/,
    'Android view MUST reflow after root orientation changes');
  assert.match(bridge,/if \(visible\) ensureSurface\(\)/,
    'Each physical frame update must rebind to the current Activity/root');
  assert.match(adapter,/!s\.surfaceVisibleOnScreen/,
    'A moving decoder must not count as a visible video after Android rotation');
  const frameCode=adapter.slice(adapter.indexOf('  const viewportFrame=()=>{'),
    adapter.indexOf('  const scheduleFrame=',adapter.indexOf('  const viewportFrame=()=>{')));
  const frame={getBoundingClientRect:()=>({x:12,y:493,left:12,top:493,right:124,bottom:556,width:112,height:63})};
  const requests=[];
  const ctx={
    destroyed:false,mode:'video',framePlacedOnScreen:false,
    document:{
      querySelector:()=>null,querySelectorAll:()=>[frame],getElementById:()=>null,
      body:{classList:{contains:name=>name==='irgun-watch-mini-hosted'}}
    },
    native:{frame:async payload=>requests.push(payload)},
    innerWidth:320,innerHeight:640
  };
  runInNewContext(frameCode+'\nthis.positionFrame=positionFrame;',ctx);
  await ctx.positionFrame();
  assert.equal(requests[0].mini,true,'Mini frames must expose their native tap target');
  assert.equal(requests[0].width,112);
  assert.equal(requests[0].height,63);
  assert.equal(requests[0].x,12);
});


test('Android landscape reserves a genuinely visible PlayerView rectangle',()=>{
  const css=readFileSync('src/style.css','utf8');
  assert.match(css,/@media \(orientation: landscape\) and \(max-height: 480px\)/);
  assert.match(css,/#persistentVideoMount\.watch-full-host \.watch-frame/);
  assert.match(css,/height: clamp\(96px, calc\(100dvh - 118px\), 360px\) !important/);
  assert.match(css,/aspect-ratio: auto !important/);
  assert.match(adapter,/r\.left<innerWidth&&r\.top<innerHeight/,
    'Never claim a VIDEO pass if the real frame extends beyond Android window');
  const landscapeHeight=296,top=44+33,frame=Math.max(96,Math.min(landscapeHeight-118,360));
  assert.ok(top+frame<landscapeHeight,
    'The landscape frame must physically fit in a 640x296 Android WebView');
});

test('logged-out Android Library exposes offline files before unavailable account sections',()=>{
  assert.match(app,/if \(!state\.user\) \{\s*const index=tabs\.findIndex/,
    'Offline downloads should be first on the signed-out Library strip');
  assert.match(app,/tabs\.unshift\(\.\.\.tabs\.splice\(index,1\)\)/);
  assert.match(app,/state\.screen === 'library' && !state\.user/);
  assert.match(app,/state\.librarySection='downloads'/);
  assert.match(app,/data-offline-play=/,
    'Offline downloads must expose physical Play buttons in local Library');
});

test('MP3 download leaves active native Video playing and gives HLS buffer headroom',async()=>{
  const start=app.indexOf('async function prepareNativeVideoBufferForOfflineTransfer()');
  const end=app.indexOf('\nasync function saveOffline',start);
  assert.ok(start>=0&&end>start,'Prebuffer logic must be tied to actual offline transfer');
  assert.match(app,/if \(normalizedKind==='video'\) await prepareNativeVideoBufferForOfflineTransfer\(\)/);
  const script=app.slice(start,end);
  assert.doesNotMatch(script,/\.pause\(|\.seekTo\(|setMode\(|\.prepare\(|\.setMediaItem\(/,
    'The downloader may not pause/seek/replace video while preparing HLS');
  let snapshots=0;
  const context={
    Capacitor:{getPlatform:()=> 'android'},
    state:{watchVimeo:{isIrgunNativeVideoPlayer:true},watchMode:'video'},
    IrgunNativeVideo:{snapshot:async()=>{snapshots++;return {
      active:true,videoSelected:true,playing:true,playWhenReady:true,
      positionMs:200000,bufferedPositionMs:226000
    };}},
    Date,console,setTimeout
  };
  runInNewContext(script+'\nthis.prepareBuffer=prepareNativeVideoBufferForOfflineTransfer',context);
  await context.prepareBuffer();
  assert.equal(snapshots,1,'Enough genuinely buffered HLS must start the download immediately');
});


test('actual native swipe policy minimizes downward drags and preserves taps, seeks and upward drags',()=>{
  const dir=mkdtempSync(join(tmpdir(),'native-video-swipe-'));
  try {
    const probe=join(dir,'SwipeProbe.java');
    writeFileSync(probe,`package org.irgunshiuraitorah.app;
public class SwipeProbe {
  static void check(boolean value) { if (!value) throw new AssertionError(); }
  public static void main(String[] args) {
    check(NativeVideoSwipe.shouldMinimize(0,48,1));
    check(NativeVideoSwipe.shouldMinimize(10,160,3));
    check(!NativeVideoSwipe.shouldMinimize(0,47,1));
    check(!NativeVideoSwipe.shouldMinimize(0,100,3));
    check(!NativeVideoSwipe.shouldMinimize(60,50,1));
    check(!NativeVideoSwipe.shouldMinimize(0,-100,1));
    check(!NativeVideoSwipe.shouldMinimize(0,0,1));
    check(!NativeVideoSwipe.shouldMinimize(0,100,0));
    System.out.println("native swipe checks passed");
  }
}`);
    execFileSync('javac',['-d',dir,'android/app/src/main/java/org/irgunshiuraitorah/app/NativeVideoSwipe.java',probe]);
    assert.match(execFileSync('java',['-cp',dir,'org.irgunshiuraitorah.app.SwipeProbe'],{encoding:'utf8'}),/checks passed/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('native PiP, resolution and swipe controls are exercised through real Android touches',()=>{
  const integration=readFileSync('scripts/android-emulator-native-media3.mjs','utf8');
  assert.match(bridge,/new NativePlayerView/);
  assert.match(bridge,/dispatchTouchEvent/);
  assert.match(bridge,/NativeVideoSwipe.shouldMinimize/);
  assert.match(bridge,/__irgunEnterSystemPipFromNative/);
  assert.doesNotMatch(bridge.slice(bridge.indexOf('pipButton=iconButton'),bridge.indexOf('pipButton.setVisibility')),/enterIrgunPictureInPicture\(/,
    'Toolbar PiP must never bypass the working prepared JS entry path');
  const quality=bridge.slice(bridge.indexOf('    private void applyQualityChoice('),bridge.indexOf('    private void updateVideoActions()'));
  assert.match(quality,/getTrackSelectionParameters/);
  assert.match(quality,/showRotatedChoiceMenu\("quality"/);
  assert.match(quality,/applyQualityChoice\(player,choices,which\)/);
  assert.match(quality,/clearOverridesOfType\(C.TRACK_TYPE_VIDEO\)/);
  assert.match(quality,/new TrackSelectionOverride/);
  assert.doesNotMatch(quality,/seekTo|setMediaItem|\.prepare\(|new ExoPlayer/);
  assert.match(integration,/tapNativeLabel\('Enter Picture-in-Picture'\)/);
  assert.match(integration,/mode=pinned/);
  assert.match(integration,/tapNativeLabel\('Choose video quality'\)/);
  assert.match(integration,/s.media3.height===height/);
  assert.match(integration,/tapNativeLabel\('Expand mini video'\)/);
  assert.match(integration,/after.playerIdentity,before.playerIdentity/);
  assert.match(integration,/after.mediaItemIdentity,before.mediaItemIdentity/);
});

test('native top PiP and video header PiP share one prepared entry; rejected PiP keeps fullscreen intact',()=>{
  const activity=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/MainActivity.java','utf8');
  const top=bridge.slice(bridge.indexOf('pipButton=iconButton'),bridge.indexOf('pipButton.setVisibility'));
  const enter=activity.slice(activity.indexOf('public boolean enterIrgunPictureInPicture()'),activity.indexOf('private void rollbackRejectedPictureInPicture()'));
  const rollback=activity.slice(activity.indexOf('private void rollbackRejectedPictureInPicture()'),activity.indexOf('private void explainUnavailablePip()'));
  const callback=activity.slice(activity.indexOf('public void onPictureInPictureModeChanged('),activity.indexOf('public void onWindowFocusChanged('));
  assert.match(top,/__irgunEnterSystemPipFromNative/);
  assert.match(app,/window\.__irgunEnterSystemPipFromNative = \(\) =>/);
  assert.match(app,/pip\.addEventListener\('click', event => \{ event\.stopPropagation\(\); enterSystemPictureInPicture\(\)/);
  assert.doesNotMatch(enter,/IrgunNativeVideoPlugin\.systemPipChanged\(/,
    'PiP entry cannot resize/reflow the native view until Android confirms it');
  assert.match(rollback,/if \(videoFullscreen\) hideSystemBarsForVideo\(\)/,
    'Entry failure must retain the previous native fullscreen window');
  assert.match(activity,/confirmRejectedPictureInPictureAfterSettling\(attempt\)/,
    'Do not launch a permission dialog before the actual Android PiP callback settles');
  assert.match(activity,/attempt != pipEntrySerial \|\| confirmedSystemPip/,
    'A delayed PiP rejection must be cancelled by actual OS confirmation');
  assert.match(activity,/\+\+pipEntrySerial; \/\/ Cancel any delayed rejection after real PiP/);
  assert.doesNotMatch(rollback,/IrgunNativeVideoPlugin\.systemPipChanged\(false\);/);
  assert.match(callback,/if \(isInPictureInPictureMode\) \{[\s\S]*?systemPipChanged\(true\)/);
  assert.match(callback,/else if \(wasConfirmed\) \{[\s\S]*?systemPipChanged\(false\)/);
  assert.match(activity,/else if \(videoFullscreen\) \{\s*\/\/ A failed PiP attempt[\s\S]*?hideSystemBarsForVideo\(\)/);
  assert.match(app,/state\.watchVimeo\.updateFrame\?\.\(\)/,
    'Real PiP exit must recalculate the native Media3 viewport');
  // Execute actual JS top-button delegate, not only a source-pattern check.
  const start=app.indexOf('window.__irgunEnterSystemPipFromNative = () => {');
  const end=app.indexOf('async function restoreAfterSystemPip()',start);
  assert.ok(start>0&&end>start);
  let calls=0;
  const window={},state={watchVideo:{id:'lecture'},watchMode:'video',
    watchVimeo:{isIrgunNativeVideoPlayer:true},systemPipActive:false};
  runInNewContext(app.slice(start,end),{window,state,Capacitor:{getPlatform:()=> 'android'},
    enterSystemPictureInPicture:()=>{calls++;return Promise.resolve();}});
  window.__irgunEnterSystemPipFromNative();
  assert.equal(calls,1);
  state.systemPipActive=true;window.__irgunEnterSystemPipFromNative();
  assert.equal(calls,1,'No second PiP transition while already pinned');
});

test('native PiP restoration only repositions the same engine and cannot seek a stale saved clock',async()=>{
  const start=app.indexOf('async function restoreAfterSystemPip()');
  const end=app.indexOf('window.__irgunSetSystemPip',start);
  let updated=0,bars=0;
  const context={
    state:{watchVideo:{id:'lecture'},watchMode:'video',systemPipLastSeconds:15,watchResumeSeconds:10,
      watchVimeo:{isIrgunNativeVideoPlayer:true,updateFrame:()=>updated++,
        setCurrentTime:()=>{throw new Error('Stale PiP clock must never seek native Media3');}}},
    Capacitor:{getPlatform:()=> 'android'},
    setNativeVideoFullscreen:async enabled=>{assert.equal(enabled,false);bars++;}
  };
  runInNewContext(app.slice(start,end)+'\nthis.restore=restoreAfterSystemPip;',context);
  await context.restore();
  assert.equal(updated,1);assert.equal(bars,1);
});


test('native Mini transports ignore legacy readiness and pause by play intent during buffering',async()=>{
  const start=app.indexOf('async function togglePersistentMiniVideoPlayback(');
  const end=app.indexOf('function bindPersistentVideoChrome()',start);
  const calls=[];
  const context={state:{watchVimeoReady:false,watchVimeo:{isIrgunNativeVideoPlayer:true,
      refresh:async()=>({playing:false,playWhenReady:true})}},
    PlaybackController:{pause:async()=>calls.push('pause'),play:async()=>calls.push('play')}};
  runInNewContext(app.slice(start,end)+'\nthis.toggle=togglePersistentMiniVideoPlayback;',context);
  await context.toggle({stopPropagation:()=>{}});
  assert.deepEqual(calls,['pause'],'Buffering native Video must honor Pause even before the legacy ready flag');
  context.state.watchVimeo.refresh=async()=>({playing:false,playWhenReady:false});
  await context.toggle();assert.deepEqual(calls,['pause','play']);
});

test('duration loss keeps the known same-lecture seek range and cannot reuse another lecture duration',()=>{
  const start=app.indexOf('function nativeAudioDurationSeconds()');
  const end=app.indexOf('function playbackPositionSeconds()',start);
  const context={state:{nativePlayback:{lectureId:'a',durationMs:6177000},watchVideo:{id:'a',duration:6100}},
    videoId:v=>v.id};
  runInNewContext(app.slice(start,end)+'\nthis.duration=nativeAudioDurationSeconds;',context);
  assert.equal(context.duration(),6177);
  context.state.nativePlayback.durationMs=0;
  assert.equal(context.duration(),6177,'Transient Media3 timeline loss cannot disable the real seek bar');
  context.state.nativePlayback.lectureId='b';
  assert.equal(context.duration(),0,'Another lecture must never inherit this duration');
  context.state.watchVideo={id:'b',duration:3000};
  assert.equal(context.duration(),3000,'Known matching catalog duration is a safe fallback');
});

test('native Mini receives the real Pause rectangle even when RTL places it over the thumbnail',async()=>{
  const start=adapter.indexOf('  const viewportFrame=()=>{');
  const end=adapter.indexOf('  const scheduleFrame=',start);
  const frame={getBoundingClientRect:()=>({x:12,y:493,left:12,top:493,right:124,bottom:556,width:112,height:63})};
  const button={getBoundingClientRect:()=>({x:24,y:501,left:24,top:501,right:66,bottom:543,width:42,height:42})};
  const requests=[];
  const ctx={destroyed:false,mode:'video',framePlacedOnScreen:false,innerWidth:320,innerHeight:640,
    document:{querySelector:selector=>selector.includes('data-mini-video-play-toggle')?button:null,
      querySelectorAll:()=>[frame],getElementById:()=>null,body:{classList:{contains:()=>true}}},
    native:{frame:async value=>requests.push(value)}};
  runInNewContext(adapter.slice(start,end)+'\nthis.position=positionFrame;',ctx);
  await ctx.position();
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0].miniPlay)),{x:24,y:501,width:42,height:42});
  assert.match(bridge,/miniPlayPauseTarget.setElevation\(20f\)/);
  assert.match(bridge,/player.getPlayWhenReady\(\)\) IrgunPlaybackService.pause\(\)/);
});


test('native Video double taps require same-side timely taps, cancel drags and clamp the real seek target',()=>{
  const dir=mkdtempSync(join(tmpdir(),'native-double-tap-'));
  try {
    const probe=join(dir,'DoubleTapProbe.java');
    writeFileSync(probe,`package org.irgunshiuraitorah.app;
public class DoubleTapProbe {
 static void check(boolean value) { if(!value) throw new AssertionError(); }
 public static void main(String[] args) {
  NativeVideoDoubleTap tap=new NativeVideoDoubleTap();
  check(tap.tap(1000,10,60,300,300,50)==0);
  check(tap.tap(1150,12,60,300,300,50)==-1);
  check(tap.tap(1200,12,60,300,300,50)==0);
  tap.cancel(); check(tap.tap(1300,12,60,300,300,50)==0);
  check(tap.tap(1800,12,60,300,300,50)==0);
  check(tap.tap(1900,290,60,300,300,50)==0);
  check(tap.tap(2000,290,60,300,300,50)==1);
  check(tap.tap(2100,150,60,300,300,50)==0);
  check(tap.tap(2150,150,60,300,300,50)==0);
  check(NativeVideoDoubleTap.seekTarget(9000,60000,-1)==0);
  check(NativeVideoDoubleTap.seekTarget(55000,60000,1)==60000);
  check(NativeVideoDoubleTap.seekTarget(20000,-1,1)==35000);
 }
}`);
    execFileSync('javac',['-d',dir,'android/app/src/main/java/org/irgunshiuraitorah/app/NativeVideoDoubleTap.java',probe]);
    execFileSync('java',['-cp',dir,'org.irgunshiuraitorah.app.DoubleTapProbe']);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('actual service Play/Pause reaches native Video without affecting a legacy shadow player',()=>{
  const start=service.indexOf('    private void playInternal()');
  const end=service.indexOf('    private void seekToInternal',start);
  const methods=service.slice(start,end);
  const dir=mkdtempSync(join(tmpdir(),'native-video-transport-'));
  try {
    const probe=join(dir,'TransportProbe.java');
    writeFileSync(probe,`public class TransportProbe {
 enum PlaybackMode { AUDIO, VIDEO }
 static class Player { int plays,pauses; void play(){plays++;} void pause(){pauses++;} }
 Player player=new Player(); PlaybackMode playbackMode=PlaybackMode.VIDEO;
 boolean nativeVideoSourceActive=true;
 ${methods}
 public static void main(String[] args) {
  TransportProbe p=new TransportProbe();p.pauseInternal();p.playInternal();
  if(p.player.pauses!=1||p.player.plays!=1)throw new AssertionError("Native VIDEO transport ignored");
  p.nativeVideoSourceActive=false;p.pauseInternal();p.playInternal();
  if(p.player.pauses!=1||p.player.plays!=1)throw new AssertionError("Legacy shadow transport changed");
 }
}`);
    execFileSync('javac',['-d',dir,probe]);execFileSync('java',['-cp',dir,'TransportProbe']);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('partially scrolled Video keeps the original native geometry with a clipped visible picture',async()=>{
  const start=adapter.indexOf('  const viewportFrame=()=>{');
  const end=adapter.indexOf('  const scheduleFrame=',start);
  const viewport={left:0,top:44,right:320,bottom:600};
  const frame={getBoundingClientRect:()=>({x:0,y:-70,left:0,top:-70,right:320,bottom:110,width:320,height:180}),
    closest:()=>({getBoundingClientRect:()=>viewport})};
  const requests=[];
  const context={destroyed:false,mode:'video',framePlacedOnScreen:false,innerWidth:320,innerHeight:640,
    document:{querySelector:()=>null,querySelectorAll:()=>[frame],getElementById:()=>null,
      body:{classList:{contains:()=>false}}},native:{frame:async value=>requests.push(value)}};
  runInNewContext(adapter.slice(start,end)+'\nthis.position=positionFrame;',context);
  await context.position();
  assert.equal(requests[0].height,180,'Keep original video framing even while scrolled');
  assert.equal(requests[0].y,-70);
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0].clip)),{left:0,top:114,right:320,bottom:180});
});

test('foreground Home return ignores stale native Audio snapshots after VIDEO restoration begins',()=>{
  const start=app.indexOf('function reconcileNativeWatchAudio(snapshot)');
  const end=app.indexOf('const PlaybackController =',start);
  let parked=0,nativeAudioCalls=0;
  const context={
    state:{watchMode:'video',watchVideo:{id:'a'},watchResumeSeconds:50,
      mediaSwitchBusy:false,nativeBackgroundHandoff:false,
      watchVimeo:{isIrgunNativeVideoPlayer:true,setMode:()=>{nativeAudioCalls++;}}},
    videoId:v=>v.id,document:{hidden:false},
    ensureNativeAudioCurrentForWatch:()=>{throw new Error('Stale Home Audio must not own foreground Video');},
    parkHostedVideoForAudio:()=>{parked++},render:()=>{throw new Error('Video must not rerender as Audio');}
  };
  runInNewContext(app.slice(start,end)+'\nthis.reconcile=reconcileNativeWatchAudio;',context);
  context.reconcile({mode:'AUDIO',lectureId:'a',audioAuthorityCommitted:true,
    resumeVideoOnForeground:false,currentPositionMs:92000});
  assert.equal(context.state.watchMode,'video');
  assert.equal(context.state.watchResumeSeconds,92);
  assert.equal(nativeAudioCalls,0,'Do not deselect Video based on the delayed Home snapshot');
  assert.equal(parked,0,'The existing native PlayerView must stay visible');
});

test('background Audio observation never hides restored foreground native Video',async()=>{
  const start=adapter.indexOf('  const tick=async()=>{');
  const end=adapter.indexOf('  const timer=setInterval',start);
  const calls=[],context={
    destroyed:false,ticking:false,mode:'video',framePlacedOnScreen:true,
    lastPlaying:false,reportedError:'',failedFrames:0,
    refresh:async()=>({active:true,videoSelected:false,playing:false,frames:0}),
    scheduleFrame(){},emit(){},console:{warn(){}},
    native:{frame:value=>{calls.push(value);return Promise.resolve();}},
    document:{hidden:false},innerWidth:320,innerHeight:640
  };
  runInNewContext(adapter.slice(start,end)+'\nthis.tick=tick;',context);
  await context.tick();
  assert.equal(calls.length,0,'Transient foreground AUDIO snapshots must not hide Video');
  context.document.hidden=true;
  await context.tick();
  assert.equal(calls.length,1,'Home background Audio still hides the physical PlayerView');
  assert.equal(calls[0].width,0);
});

test('temporary Home Audio snapshot preserves the selected native Video view and advancing position',()=>{
  const start=app.indexOf('function reconcileNativeWatchAudio(snapshot)');
  const end=app.indexOf('const PlaybackController =',start);
  const context={state:{watchMode:'video',watchVideo:{id:'a'},watchVimeo:{isIrgunNativeVideoPlayer:true}},
    videoId:v=>v.id,document:{hidden:true},ensureNativeAudioCurrentForWatch:()=>{throw new Error('Home may not select Audio');}};
  runInNewContext(app.slice(start,end)+'\nthis.reconcile=reconcileNativeWatchAudio;',context);
  context.reconcile({mode:'AUDIO',lectureId:'a',audioAuthorityCommitted:true,resumeVideoOnForeground:true,currentPositionMs:91000});
  assert.equal(context.state.watchMode,'video');assert.equal(context.state.watchResumeSeconds,91);
});

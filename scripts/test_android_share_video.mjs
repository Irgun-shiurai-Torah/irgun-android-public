import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const js=readFileSync('src/main.js','utf8');
const activity=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/MainActivity.java','utf8');
const native=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunNativeVideoPlugin.java','utf8');
const adapter=readFileSync('src/android-native-media3-video.js','utf8');

function exerciseShare({platform='android',kind='video',shareFails=false}={}){
  const from=js.indexOf('async function shareItem(kind, id) {');
  const to=js.indexOf('\nfunction closeDownloadDialog()',from);
  assert.ok(from>0 && to>from,'Must exercise the actual installed Share handler');
  const events=[];
  const player={isIrgunNativeVideoPlayer:true,
    updateFrame:()=>events.push('frame'),
    pause:()=>{throw new Error('Share must not pause Media3');},
    destroy:()=>{throw new Error('Share must not destroy Media3');},
    setMode:()=>{throw new Error('Share must not toggle native video tracks');}};
  const state={watchVideo:{id:'lecture'},watchMode:'video',watchVimeo:player,
    videoById:new Map([['lecture',{title:'Lecture'}]]),audioById:new Map()};
  const Capacitor={getPlatform:()=>platform,isNativePlatform:()=>platform!=='web'};
  const Share={share:async()=>{
    events.push('share');
    if(shareFails)throw new Error('User dismissed Share chooser');
  }};
  const IrgunNativeVideo={shareSheet:async options=>events.push(options.active?'arm':'clear')};
  const context={state,Capacitor,Share,IrgunNativeVideo,
    WEBSITE:'https://irgunshiuraitorah.com/',
    displayShiurTitle:(value)=>value,videoId:video=>video?.id||'',tr:value=>value,
    navigator:{share:async()=>events.push('web-share')},
    requestAnimationFrame:fn=>fn(),setTimeout:fn=>fn(),console:{warn:()=>{}},
    encodeURIComponent};
  runInNewContext(js.slice(from,to)+'\nthis.callShare=shareItem;',context);
  return {events,player,state,call:()=>context.callShare(kind,'lecture')};
}

test('Share sheet prepares a temporary native guard before ACTION_CHOOSER without audio handoff',async()=>{
  const f=exerciseShare();
  await f.call();
  assert.deepEqual(f.events.slice(0,3),['arm','share','clear'],
    'Video must remain in the same native presentation throughout system Share');
  assert.equal(f.events.filter(e=>e==='frame').length,3,
    'Returning from Share remeasures existing PlayerView without reloading the stream');
  assert.equal(f.state.watchVimeo,f.player,'Keep the exact same Media3 player');
  assert.equal(f.state.watchMode,'video');
});
test('Android Share dismissal always clears the guard and keeps video authority',async()=>{
  const f=exerciseShare({shareFails:true});
  await f.call();
  assert.deepEqual(f.events.slice(0,3),['arm','share','clear']);
  assert.equal(f.state.watchVimeo,f.player);
  assert.equal(f.state.watchMode,'video');
});
test('non-Android platforms and Audio do not invoke the Android Share guard',async()=>{
  const ios=exerciseShare({platform:'ios'});await ios.call();
  assert.deepEqual(ios.events,['share']);
  const androidAudio=exerciseShare({kind:'audio'});await androidAudio.call();
  assert.deepEqual(androidAudio.events,['share']);
});
test('Android rejects Home handoff ONLY while the explicitly opened Share sheet is active',()=>{
  const leave=activity.slice(activity.indexOf('protected void onUserLeaveHint()'),
    activity.indexOf('public void onPictureInPictureModeChanged(',activity.indexOf('protected void onUserLeaveHint()')));
  assert.match(leave,/!isIrgunPipVisible\(\) && !nativeShareSheetIsOpening\(\)/);
  assert.match(leave,/IrgunPlaybackPlugin\.handleAppBackgrounded\(\)/);
  assert.match(activity,/private long nativeShareSheetGuardUntilMs = 0L;/);
  assert.match(activity,/SystemClock\.elapsedRealtime\(\) \+ 120000L/);
  assert.match(activity,/public void onResume\(\) \{[\s\S]*?setNativeShareSheetActive\(false\)/);
  assert.match(native,/public void shareSheet\(PluginCall call\)/);
  assert.match(native,/\.setNativeShareSheetActive\(active\)/);
  const share=js.slice(js.indexOf('async function shareItem(kind, id) {'),
    js.indexOf('function closeDownloadDialog()'));
  assert.ok(share.indexOf("shareSheet({active:true})")<share.indexOf('await Share.share('));
  assert.match(share,/finally \{[\s\S]*?shareSheet\(\{active:false\}\)/);
  assert.doesNotMatch(share,/\.pause\(|\.destroy\(|\.setMode\(|\.setMediaItem\(/,
    'Share must not stop or reconstruct the native player');
});
test('Audio-to-Video restores parked host before enabling native tracks and rolls back on failure',()=>{
  const switcher=js.slice(js.indexOf('async function performWatchModeSwitch(mode) {'),
    js.indexOf('async function switchWatchMode(mode) {'));
  assert.ok(switcher.indexOf('const videoHostPrepared = mode')<
    switcher.indexOf('await player.setMode(mode,{offlineUri})'),
    'Host must be on-screen BEFORE enabling the Video track');
  assert.match(switcher,/if\(videoHostPrepared\)\s*\{\s*parkHostedVideoForAudio\(\);[\s\S]*?render\(\);\s*\}/, 'Failed native Video activation must park the host and restore Audio UI');
  assert.match(switcher,/if\(mode==='video'\)\{\s*clearCurrentAudioStateForVideo\(\)/);
  assert.doesNotMatch(switcher,/new ExoPlayer\(|new MediaItem\(/);
});

test('native Media3 adapter prepositions the old PlayerView without replacing or seeking the MediaItem',async()=>{
  const from=adapter.indexOf('    setMode:async (next, options={})=>{');
  const to=adapter.indexOf('    updateFrame:trackFrame,',from);
  assert.ok(from>0 && to>from);
  const calls=[];
  const code=`let mode='audio',framePlacedOnScreen=true;
    const native={mode:async options=>{calls.push('native-'+options.mode);}};
    const trackFrame=()=>calls.push('position-'+mode);
    const positionFrame=async()=>calls.push('physical-frame-'+mode);
    const adapter={${adapter.slice(from,to)}};
    this.setMode=adapter.setMode;
    this.getMode=()=>mode;`;
  const ctx={calls,Error,String};
  runInNewContext(code,ctx);
  await ctx.setMode('video');
  assert.equal(ctx.getMode(),'video');
  assert.deepEqual(calls,['position-video','native-video','position-video','physical-frame-video']);
  calls.length=0;
  await ctx.setMode('audio');
  assert.deepEqual(calls,['native-audio'],'Return to Audio must not recreate or seek the Video source');
  assert.equal(ctx.getMode(),'audio');

  const failing={calls};
  const badCode=code.replace("calls.push('native-'+options.mode);",
    "calls.push('native-'+options.mode);throw Error('mode error');");
  runInNewContext(badCode,failing);
  await assert.rejects(failing.setMode('video'),/mode error/);
  assert.equal(failing.getMode(),'audio','The adapter must roll back its mode after a native rejection');
});


test('Android Audio tap waits for pending native Media3 adapter instead of racing a second player handoff',()=>{
  const switcher=js.slice(js.indexOf('async function performWatchModeSwitch(mode) {'),
    js.indexOf('async function switchWatchMode(mode) {'));
  const guard=switcher.slice(0,switcher.indexOf('if (state.watchVimeo?.isIrgunNativeVideoPlayer) {'));
  assert.match(guard,/nativeAndroidExpected/);
  assert.match(guard,/!isAndroidVimeoOnlyVideo\(video\)/,
    'Vimeo-only playback keeps its existing dedicated route');
  assert.match(guard,/watchVimeoInitFlight/);
  assert.match(guard,/void initWatchVimeo\(true\)/);
  assert.match(guard,/await new Promise\(resolve=>setTimeout\(resolve,100\)\)/);
  assert.match(guard,/const tellNativeStillStarting=\(\)=>\{[\s\S]*?return false;/);
  assert.match(guard,/if \(state\.watchVimeo\) return tellNativeStillStarting\(\)/,
    'Do not layer Audio over an unexpected non-native player');
  assert.match(guard,/if \(!state\.watchVimeo\?\.isIrgunNativeVideoPlayer &&[\s\S]*?return tellNativeStillStarting\(\);/,
    'Do not enter the legacy Audio handoff while native Video initialization is pending');
});

test('native Video readiness cancels cleanly when a fast Audio switch takes ownership',()=>{
  const ready=adapter.slice(adapter.indexOf('    ready:async()=>{'),
    adapter.indexOf('    destroy:async()=>{',adapter.indexOf('    ready:async()=>{')));
  assert.match(ready,/if\(mode!=='video'\)return false/);
  const init=js.slice(js.indexOf('async function initWatchVimeoOnce('),
    js.indexOf('\nasync function loadComments()',js.indexOf('async function initWatchVimeoOnce(')));
  assert.match(init,/const playerReady = await player\.ready\(\);[\s\S]*?playerReady === false[\s\S]*?await player\.destroy\?\.\(\);[\s\S]*?return;/,
    'Audio selection during Video startup must retain Audio and skip the false Video error path');
});


test('late native Video startup errors cannot replace the selected Audio UI',()=>{
  const from=js.indexOf('async function initWatchVimeoOnce(');
  const to=js.indexOf('\nasync function loadComments()',from);
  const init=js.slice(from,to);
  assert.match(init,/const playerReady = await player\.ready\(\);[\s\S]*?playerReady === false[\s\S]*?return;/);
  const catchStart=init.indexOf("} catch (error) {");
  const androidCatch=init.slice(catchStart,init.indexOf('\n    if (generation === state.watchVimeoGeneration)',catchStart));
  assert.match(androidCatch,/state\.watchMode !== 'video' \|\| !state\.watchVideo[\s\S]*?await player\?\.destroy\?\.\(\);[\s\S]*?return;/);
  assert.ok(androidCatch.indexOf('return;')<androidCatch.indexOf('showAndroidNativeVideoError'),
    'An abandoned Video init must return before displaying the Video error overlay');
});

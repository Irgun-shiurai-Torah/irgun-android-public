import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  shouldRefreshNativeVideoSource, MAX_NATIVE_RESUME_REFRESHES,
  NATIVE_RESUME_STALE_GAP_MS
} from '../src/android-native-video-recovery.js';

const now = 200000000;
const healthyBeforePause = now - NATIVE_RESUME_STALE_GAP_MS - 1000;
const ready = {active:true, videoSelected:true, playWhenReady:true, error:''};
const args = {snapshot:ready, foreground:true, surfaceVisible:true, nowMs:now,
  lastFrameAtMs:healthyBeforePause, stalledSinceMs:now-8000};

test('long-paused video requests a fresh descriptor after bounded no-frame delay',()=>{
  assert.equal(shouldRefreshNativeVideoSource(args),true);
  assert.equal(shouldRefreshNativeVideoSource({...args,stalledSinceMs:now-4000}),false);
});

test('explicit Pause, background, Audio mode and covered video never restart',()=>{
  for(const change of [
    {snapshot:{...ready,playWhenReady:false}},
    {snapshot:{...ready,videoSelected:false}},
    {snapshot:{...ready,active:false}},
    {foreground:false},
    {surfaceVisible:false}
  ]) assert.equal(shouldRefreshNativeVideoSource({...args,...change}),false);
});

test('restored bookmark with no first frame refreshes after a generous startup window',()=>{
  const opened={...args,lastFrameAtMs:0,resumedAtPosition:true,nativeStartedAtMs:now-15000,stalledSinceMs:now-15000};
  assert.equal(shouldRefreshNativeVideoSource(opened),true);
  assert.equal(shouldRefreshNativeVideoSource({...opened,nativeStartedAtMs:now-12000}),false);
  assert.equal(shouldRefreshNativeVideoSource({...opened,resumedAtPosition:false}),false);
  assert.equal(shouldRefreshNativeVideoSource({...args,lastFrameAtMs:0}),false);
  assert.equal(shouldRefreshNativeVideoSource({...args,stalledSinceMs:0}),false);
});

test('normal transient buffers get the native watchdog before source replacement',()=>{
  const recent=now-10000;
  assert.equal(shouldRefreshNativeVideoSource({...args,lastFrameAtMs:recent}),false);
  assert.equal(shouldRefreshNativeVideoSource({...args,lastFrameAtMs:recent,stalledSinceMs:now-33000}),true);
});

test('terminal resumed-video errors can refresh faster without retry loops',()=>{
  assert.equal(shouldRefreshNativeVideoSource({...args,snapshot:{...ready,error:'SOURCE_ERROR'},stalledSinceMs:now-1200}),true);
  assert.equal(shouldRefreshNativeVideoSource({...args,refreshAttempts:1,lastRefreshAtMs:now-3000}),false);
  assert.equal(shouldRefreshNativeVideoSource({...args,refreshAttempts:1,lastRefreshAtMs:now-20000}),true);
  assert.equal(shouldRefreshNativeVideoSource({...args,refreshAttempts:MAX_NATIVE_RESUME_REFRESHES}),false);
});

test('runtime refresh retains a single native engine and lecture identity guard',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const service=read('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunPlaybackService.java');
  const plugin=read('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunNativeVideoPlugin.java');
  const adapter=read('src/android-native-media3-video.js');
  const main=read('src/main.js');
  assert.match(plugin, /public void refreshSource\(PluginCall call\)/);
  assert.match(plugin, /IrgunPlaybackService\.refreshNativeVideoSource\(/);
  assert.match(plugin, /userRequested/);
  assert.match(adapter, /refreshAttempts\+\+;[\s\S]*?getAndroidHlsSource/);
  assert.match(main, /reconnect\(\{userInitiated:true\}\)/);
  assert.match(service, /private void refreshNativeVideoSourceInternal\(/);
  assert.match(service, /!lectureId\.equals\(cleanStatic\(expectedLectureId\)\)/);
  assert.match(service, /!player\.getPlayWhenReady\(\)/);
  assert.match(service, /player\.setMediaItem\(nativeVideoMediaItem\(source, nativeVideoUsingHls\), position\)/);
  assert.match(adapter, /shouldRefreshNativeVideoSource\(/);
  assert.match(adapter, /await native\.refreshSource\(/);
  assert.match(adapter, /reconnect:options=>reconnect\(options\)/);
  assert.match(main, /state\.watchVimeo\?\.isIrgunNativeVideoPlayer/);
  assert.match(main, /state\.watchVimeo\.reconnect\(/);
});

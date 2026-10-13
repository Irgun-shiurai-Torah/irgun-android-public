import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const service=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunPlaybackService.java','utf8');
const bridge=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunNativeVideoPlugin.java','utf8');
const app=readFileSync('src/main.js','utf8');
const adapter=readFileSync('src/android-native-media3-video.js','utf8');
const gradle=readFileSync('android/app/build.gradle','utf8');

test('beta stays opt-in while existing Android WebView remains the production default',()=>{
  assert.match(adapter,/VITE_ANDROID_MEDIA3_VIDEO_BETA === 'true'/);
  assert.match(app,/if \(Capacitor\.getPlatform\(\) === 'android' && nativeMedia3BetaEnabled\(\)\)/);
  assert.match(app,/if \(!player\) player = await createAndroidHlsPlayer/);
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
  assert.doesNotMatch(fn,/seekTo\(|setMediaItem\(|clearMediaItems\(|\.pause\(|\.prepare\(/);
  assert.match(service,/if \(nativeVideoSourceActive\) return;/,'Legacy Vimeo clock must not overwrite native source');
  assert.match(service,/nativeVideoRenderedFrames\+\+/,'Actual video frames, not only clock, must be tracked');
});
test('Android beta controls expose only bounded and source-safe native commands',()=>{
  assert.match(bridge,/API_HOST = "api\.irgunshiuraitorah\.com"/);
  assert.match(bridge,/startsWith\("\/media\/"\)/);
  assert.match(bridge,/case "seek":/);
  assert.match(bridge,/case "pause":/);
  assert.match(bridge,/case "speed":/);
  assert.match(bridge,/void close\(PluginCall call\)/);
  assert.match(adapter,/s\.frames>=2&&s\.width>0/);
});

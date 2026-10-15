import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAndroidVideoDisplaySync} from '../src/android-video-display.js';
import {assertAndroidVideoTimes,nativeControllerRevealPoint,nativeDoubleTapPoint} from './android-video-display-regression.mjs';

test('native Media3 surface uses TextureView to preserve actual scroll-clipped video pixels',()=>{
 const java=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunNativeVideoPlugin.java','utf8');
 const xml=readFileSync('android/app/src/main/res/xml/irgun_native_texture_player.xml','utf8');
 assert.match(xml,/app:surface_type="texture_view"/);
 assert.match(java,/surface = createClippableVideoSurface\(\)/);
 assert.match(java,/super\(getActivity\(\), attrs\)/);
 assert.doesNotMatch(java,/surface = new NativePlayerView\(\)/);
 assert.match(java,/clipHost = new FrameLayout\(getActivity\(\)\)/);
 assert.match(java,/clipHost.setClipChildren\(true\)/);
 assert.match(java,/clipHost.setLayoutParams\(clipParams\)/);
 assert.doesNotMatch(java,/surface.setClipBounds\(new Rect/,
   'Clipping the PlayerView itself must not black out Android 16 video pixels');
});

test('real double taps stay in the unobstructed video area above the seek bar',()=>{
 const short={surfaceX:0,surfaceY:121,surfaceVisibleWidth:320,surfaceVisibleHeight:150,
   seekBarRect:{x:0,y:191,width:320,height:48}};
 const left=nativeDoubleTapPoint(short,-1).map(Number);
 const right=nativeDoubleTapPoint(short,1).map(Number);
 assert.equal(left[0],32);assert.equal(right[0],288);
 assert.equal(left[1],right[1]);
 assert.ok(left[1]>165&&left[1]<179,'Physical taps must clear 44dp top actions and the real seek bar');
 const long=nativeDoubleTapPoint({...short,surfaceVisibleHeight:600,
   seekBarRect:{x:0,y:520,width:320,height:48}},1).map(Number);
 assert.ok(long[1]>175&&long[1]<490);
 assert.throws(()=>nativeDoubleTapPoint({...short,seekBarRect:{x:0,y:169,width:320,height:48}},-1),
   /No unobstructed video area/);
});

test('fullscreen physical taps restore Media3 controls and keep the native hide timeout',()=>{
 const java=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunNativeVideoPlugin.java','utf8');
 assert.match(java,/direction == 0 && tap && fullscreen && !mini && !systemPip/);
 assert.match(java,/post\(\(\) -> \{[\s\S]*?showController\(\)/);
 assert.match(java,/surface\.getUseController\(\) != !systemPip/,
   'Resize/rotation must not repeatedly reset the controller');
 assert.match(java,/if \(surface\.getUseController\(\) != !mini\)/);
 assert.match(java,/setControllerShowTimeoutMs\(8000\)/,
   'Normal video controls must still auto-hide when the user is inactive');
});

test('controller reveal taps never hit a seek bar or custom top controls',()=>{
 const m={surfaceX:0,surfaceY:121,surfaceVisibleWidth:320,surfaceVisibleHeight:150,
   seekBarRect:{x:0,y:191,width:320,height:30}};
 const [x,y]=nativeControllerRevealPoint(m).map(Number);
 assert.ok(x>200&&x<300&&y>=171&&y<179,'The real emulator touch must be above the native seek bar');
 assert.throws(()=>nativeControllerRevealPoint({...m,seekBarRect:{x:0,y:166,width:320,height:30}}),/non-seeking reveal/);
 const wide=nativeControllerRevealPoint({...m,surfaceY:0,surfaceVisibleWidth:800,surfaceVisibleHeight:600,
   seekBarRect:{x:0,y:515,width:800,height:30}}).map(Number);
 assert.ok(wide[1]>50&&wide[1]<500);
});

test('locked tablet rotates native Media3 fullscreen and its corner timestamps inside actual display',()=>{
 const java=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunNativeVideoPlugin.java','utf8');
 assert.match(java,/boolean rotateInWindow=!systemPip && tabletTilt != VideoRotationPolicy\.PORTRAIT/);
 assert.match(java,/surface\.setRotation\(tabletTilt == VideoRotationPolicy\.REVERSE_LANDSCAPE \? -90f : 90f\)/);
 assert.match(java,/surfaceRotationDegrees/);
 assert.match(java,/surface\.setRotation\(0f\)/);
 const media={surfaceX:0,surfaceY:0,surfaceVisibleWidth:800,surfaceVisibleHeight:1280,
   surfaceRotationDegrees:90,positionMs:243000,durationMs:3475000,
   elapsedTimeText:'04:03',durationTimeText:'57:55',
   elapsedTimeRect:{x:20,y:35,width:60,height:20},
   durationTimeRect:{x:20,y:1225,width:60,height:20},
   seekBarRect:{x:90,y:0,width:25,height:1280}};
 assert.doesNotThrow(()=>assertAndroidVideoTimes(media));
 assert.doesNotThrow(()=>assertAndroidVideoTimes({...media,surfaceRotationDegrees:-90,
   elapsedTimeRect:media.durationTimeRect,durationTimeRect:media.elapsedTimeRect}));
 const [x,y]=nativeControllerRevealPoint(media).map(Number);
 assert.ok(x>media.seekBarRect.x+media.seekBarRect.width+15 && y>200&&y<1100);
 const otherSide={...media,surfaceRotationDegrees:-90,seekBarRect:{x:720,y:0,width:48,height:1280}};
 const [rx,ry]=nativeControllerRevealPoint(otherSide).map(Number);
 assert.ok(rx<otherSide.seekBarRect.x-15&&ry>200&&ry<1100,
   'Counter-clockwise video has a RIGHT-side vertical seek bar; safely tap its picture');
 assert.throws(()=>nativeControllerRevealPoint({...otherSide,seekBarRect:{x:500,y:0,width:100,height:1280}}),
   /Rotated controller tap must clear/,
   'Real tap in an occupied seek stripe must still fail loudly');
 assert.throws(()=>assertAndroidVideoTimes({...media,surfaceRotationDegrees:0}),/opposite|right/);
});

test('native time layout observation rejects grouped, reversed, stale and hidden timestamps',()=>{
 const native={surfaceX:0,surfaceVisibleWidth:960,positionMs:243000,durationMs:3475000,
  elapsedTimeText:'04:03',durationTimeText:'57:55',elapsedTimeRect:{x:16,y:508,width:45,height:20},
  durationTimeRect:{x:899,y:508,width:45,height:20},seekBarRect:{x:0,y:470,width:960,height:26}};
 assert.doesNotThrow(()=>assertAndroidVideoTimes(native));
 assert.throws(()=>assertAndroidVideoTimes({...native,durationTimeRect:{...native.durationTimeRect,x:80}}),/opposite|right/);
 assert.throws(()=>assertAndroidVideoTimes({...native,durationTimeRect:native.elapsedTimeRect,elapsedTimeRect:native.durationTimeRect}),/opposite/);
 assert.throws(()=>assertAndroidVideoTimes({...native,elapsedTimeText:'00:00'}),/live Media3/);
 assert.throws(()=>assertAndroidVideoTimes({...native,durationTimeText:'53:52'}),/actual total/);
 assert.throws(()=>assertAndroidVideoTimes({...native,elapsedTimeRect:null}),/visible/);
});

test('real Java rotation policy debounces physical tilt, honors manual exit, and releases screen wake outside video',()=>{
 const dir=mkdtempSync(join(tmpdir(),'irgun-rotation-'));
 try{
  const source='android/app/src/main/java/org/irgunshiuraitorah/app/VideoRotationPolicy.java';
  const harness=join(dir,'RotationCheck.java');
  writeFileSync(harness,`package org.irgunshiuraitorah.app;
public class RotationCheck {
 static void check(boolean ok,String why){if(!ok)throw new AssertionError(why);}
 public static void main(String[] args){
  VideoRotationPolicy p=new VideoRotationPolicy();
  check(p.observe(270,0,false)==-1,"No immediate rotation");
  check(p.observe(260,200,false)==-1,"Tilt must settle");
  check(p.observe(275,400,false)==1,"Sideways phone becomes landscape");
  check(p.observe(274,600,false)==-1,"Do not repeat fullscreen every sensor tick");
  p.manualExit();p.observe(90,800,false);
  check(p.observe(90,1300,false)==-1,"Exit must not be undone by opposite landscape");
  p.observe(0,1400,false);check(p.observe(0,1800,false)==0,"Upright restores regular player");
  p.observe(90,1900,false);check(p.observe(90,2300,false)==2,"Upright rearms reverse landscape");
  p.reset();p.observe(270,0,false);p.observe(-1,400,false);
  check(p.observe(270,500,false)==-1,"Unknown or flat sensor reading breaks a pending tilt");
  check(VideoRotationPolicy.classify(45,false)==-1,"Boundary angles cannot flicker fullscreen");
  check(VideoRotationPolicy.classify(0,true)==1,"Landscape-native tablet is handled");
  check(VideoRotationPolicy.classify(90,true)==0,"Tablet upright is portrait");
  p.reset();p.observe(0,0,true);
  check(p.observe(0,400,true)==1,"Landscape-native tablet requests real landscape fullscreen");
  p.observe(90,500,true);check(p.observe(90,900,true)==0,"Tablet upright restores portrait");
  p.observe(180,1000,true);check(p.observe(180,1400,true)==2,"Tablet rotated the opposite way requests reverse landscape");
  p.observe(270,1500,true);check(p.observe(270,1900,true)==0,"Opposite upright tablet also exits fullscreen");
  check(VideoRotationPolicy.keepAwake(true,true,true,false),"Playing or buffering visible video stays awake");
  check(!VideoRotationPolicy.keepAwake(true,true,false,false),"Paused video releases screen");
  check(!VideoRotationPolicy.keepAwake(false,true,true,false),"Home releases screen");
  check(!VideoRotationPolicy.keepAwake(true,false,true,false),"Audio and closed video release screen");
  check(!VideoRotationPolicy.keepAwake(true,true,true,true),"PiP does not hold foreground screen awake");
 }
}`);
  execFileSync('javac',['-d',dir,source,harness]);
  execFileSync('java',['-cp',dir,'org.irgunshiuraitorah.app.RotationCheck']);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('tablet video keeps an adaptive full-sensor window instead of opting into fixed-orientation letterboxing',()=>{
 const xml=readFileSync('android/app/src/main/AndroidManifest.xml','utf8');
 const main=xml.match(/<activity\b[^>]*android:name="\.MainActivity"[\s\S]*?<\/activity>/)?.[0];
 assert.ok(main);
 assert.doesNotMatch(main,/PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY/,
   'Android 16 must not force a letterboxed tablet Activity under rotation lock');
 assert.doesNotMatch(main,/PROPERTY_COMPAT_IGNORE_REQUESTED_ORIENTATION/);
 assert.match(main,/android:resizeableActivity="true"/,'App stays resizable; rotation applies only while watching video');
 const controller=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunVideoDisplayController.java','utf8');
 assert.match(controller,/smallestScreenWidthDp >= 600/);
 assert.match(controller,/activity\.setNativeVideoTabletTilt\(direction\)/,
   'Large screens must rotate video content rather than force the Android screen orientation');
 assert.doesNotMatch(controller,/SCREEN_ORIENTATION_SENSOR_LANDSCAPE/);
 assert.match(controller,/activity\.setNativeVideoTabletTilt\(VideoRotationPolicy\.PORTRAIT\)/,
   'Tablet manual exit must restore native video direction');
});

test('Android tablet sensor respects locked display while phone requests its actual window orientation',()=>{
 const source=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunVideoDisplayController.java','utf8');
 const method=signature=>{
  const start=source.indexOf(signature);assert.ok(start>=0);let depth=0;
  for(let i=source.indexOf('{',start);i<source.length;i++){
   if(source[i]==='{')depth++;
   if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);
  }throw Error('Unclosed Java method');
 };
 const dir=mkdtempSync(join(tmpdir(),'irgun-display-request-'));
 try{
  const harness=join(dir,'DisplayRequests.java');
  writeFileSync(harness,`package org.irgunshiuraitorah.app;
public class DisplayRequests {
 static class ActivityInfo {static final int SCREEN_ORIENTATION_PORTRAIT=1,SCREEN_ORIENTATION_LANDSCAPE=0,SCREEN_ORIENTATION_REVERSE_LANDSCAPE=8,SCREEN_ORIENTATION_SENSOR_LANDSCAPE=6,SCREEN_ORIENTATION_SENSOR_PORTRAIT=7;}
 static class Configuration {int smallestScreenWidthDp;}
 static class Resources {Configuration c=new Configuration();Configuration getConfiguration(){return c;}}
 static class Activity {Resources r=new Resources();int request=-1;int tilt;boolean full;Resources getResources(){return r;}int getRequestedOrientation(){return request;}void setRequestedOrientation(int n){request=n;}void applySensorVideoFullscreen(boolean n){full=n;}void setNativeVideoTabletTilt(int n){tilt=n;}}
 final Activity activity=new Activity();final VideoRotationPolicy policy=new VideoRotationPolicy();Integer previousOrientation;boolean rotatedFullscreen;
 ${method('void fullscreenChanged(')}
 ${method('private void rotate(')}
 ${method('private boolean useFullSensorWindow(')}
 ${method('private void restoreOrientation(')}
 static void check(boolean ok,String why){if(!ok)throw new AssertionError(why);}
 public static void main(String[] args){
  DisplayRequests tablet=new DisplayRequests();tablet.activity.r.c.smallestScreenWidthDp=800;
  tablet.rotate(VideoRotationPolicy.LANDSCAPE);
  check(tablet.activity.request==-1&&tablet.activity.tilt==VideoRotationPolicy.LANDSCAPE&&tablet.activity.full,
    "Locked tablet rotates the native video instead of the OS screen");
  tablet.rotate(VideoRotationPolicy.PORTRAIT);
  check(tablet.activity.request==-1&&tablet.activity.tilt==VideoRotationPolicy.PORTRAIT&&!tablet.activity.full,
    "Upright tilt restores the original tablet window");
  tablet.rotate(VideoRotationPolicy.REVERSE_LANDSCAPE);tablet.fullscreenChanged(false,false);
  check(tablet.activity.request==-1&&tablet.activity.tilt==VideoRotationPolicy.PORTRAIT&&tablet.previousOrientation==null,
    "Manual Exit resets native rotation and does not change tablet display settings");
  DisplayRequests phone=new DisplayRequests();phone.activity.r.c.smallestScreenWidthDp=320;
  phone.rotate(VideoRotationPolicy.LANDSCAPE);check(phone.activity.request==0,"Phone retains tested landscape request");
  phone.rotate(VideoRotationPolicy.PORTRAIT);check(phone.activity.request==1,"Phone upright restores portrait");
  phone.restoreOrientation();check(phone.activity.request==-1,"Leaving video restores original phone policy");
 }
}`);
  execFileSync('javac',['-d',dir,'android/app/src/main/java/org/irgunshiuraitorah/app/VideoRotationPolicy.java',harness]);
  execFileSync('java',['-cp',dir,'org.irgunshiuraitorah.app.DisplayRequests']);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('actual presentation synchronization distinguishes native video, pause, Mini, Audio and close without per-clock bridge calls',async()=>{
 const state={watchVideo:{id:'lecture'},watchMode:'video',watchVideoPlaying:true,watchMinimized:false,watchVimeo:{isIrgunNativeVideoPlayer:true}};
 const calls=[];const sync=createAndroidVideoDisplaySync({isAndroid:()=>true,read:()=>state,send:v=>{calls.push(v);}});
 sync();sync();assert.equal(calls.length,1);
 assert.deepEqual(calls[0],{active:true,playing:true,expanded:true,nativeEngine:true});
 state.watchVideoPlaying=false;sync();assert.equal(calls.at(-1).playing,false);
 state.watchMinimized=true;sync();assert.equal(calls.at(-1).expanded,false);
 state.watchMode='audio';sync();assert.equal(calls.at(-1).active,false);
 state.watchVideo=null;sync();assert.equal(calls.at(-1).active,false);
});

test('Vimeo-only video receives screen/orientation policy and iOS never calls the Android bridge',()=>{
 const state={watchVideo:{id:'vimeo'},watchMode:'video',watchVideoPlaying:true};const calls=[];
 createAndroidVideoDisplaySync({isAndroid:()=>true,read:()=>state,send:v=>calls.push(v)})();
 assert.equal(calls[0].nativeEngine,false);assert.equal(calls[0].active,true);
 createAndroidVideoDisplaySync({isAndroid:()=>false,read:()=>{throw Error('iOS must remain unchanged');},send:()=>{throw Error('No Android bridge');}})();
});

test('a temporary display bridge failure can retry the same state without altering media',async()=>{
 let attempts=0;const sync=createAndroidVideoDisplaySync({isAndroid:()=>true,
  read:()=>({watchVideo:{},watchMode:'video'}),send:()=>{attempts++;return attempts===1?Promise.reject(Error('bridge not ready')):Promise.resolve();}});
 sync();await Promise.resolve();await Promise.resolve();sync();assert.equal(attempts,2);
 const controller=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunVideoDisplayController.java','utf8');
 assert.doesNotMatch(controller,/\.seekTo\(|\.prepare\(|\.setMediaItem\(|new ExoPlayer|Settings\.System\.put/);
});

test('partly scrolled picture measurement waits for real controller auto-hide without injecting a seek',async()=>{
 const {runInNewContext}=await import('node:vm');
 const source=readFileSync('scripts/android-emulator-native-media3.mjs','utf8');
 const start=source.indexOf('  const captureVisibleNativePicture=');
 const end=source.indexOf('  const first=await waitNative',start);
 assert.ok(start>=0&&end>start);
 const visible={media3:{controllerFullyVisible:true,qualityButtonVisible:true,
  surfaceVisibleOnScreen:true,surfaceVisibleWidth:320,surfaceVisibleHeight:104,surfaceX:0,surfaceY:80}};
 const hidden={media3:{...visible.media3,controllerFullyVisible:false,qualityButtonVisible:false}};
 const commands=[],report={checks:[]};let waited=false,captured=false;
 const capture=runInNewContext(source.slice(start,end)+'captureVisibleNativePicture',{
  assert,report,delay:async()=>{},sample:async()=>{assert.equal(waited,true);return hidden;},
  waitNative:async predicate=>{assert.equal(predicate(visible),false);assert.equal(predicate(hidden),true);waited=true;return hidden;},
  adb:()=>{throw Error('No Android touch or seek is allowed during screenshot observation');},
  writeFileSync:()=>{captured=true;},execFileSync:(command,args)=>{
    commands.push([command,...args]);
    if(command==='adb'){assert.deepEqual(Array.from(args),['exec-out','screencap','-p']);return Buffer.from('png');}
    assert.equal(command,'convert');return '0.5';
  }
 });
 assert.equal(await capture(visible,'partial'),.5);assert.ok(captured);
 assert.equal(commands.length,2);assert.equal(report.checks.length,1);
});

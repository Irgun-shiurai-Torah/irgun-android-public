import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAndroidVideoDisplaySync} from '../src/android-video-display.js';
import {assertAndroidVideoTimes} from './android-video-display-regression.mjs';

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
 assert.doesNotMatch(main,/PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY/);
 assert.match(main,/<property\s+android:name="android\.window\.PROPERTY_COMPAT_IGNORE_REQUESTED_ORIENTATION"\s+android:value="false"/);
 assert.match(main,/android:resizeableActivity="true"/,'App stays resizable; rotation applies only while watching video');
 const controller=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunVideoDisplayController.java','utf8');
 assert.match(controller,/smallestScreenWidthDp >= 600/);
 assert.match(controller,/useFullSensorWindow\(\) \? ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR/);
 assert.match(controller,/if \(useFullSensorWindow\(\)\) restoreOrientation\(\)/,'Tablet manual exit must release the sensor override');
});

test('actual Java orientation requests use the physical tablet sensor and restore the original window policy on manual exit',()=>{
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
 static class ActivityInfo {static final int SCREEN_ORIENTATION_PORTRAIT=1,SCREEN_ORIENTATION_LANDSCAPE=0,SCREEN_ORIENTATION_REVERSE_LANDSCAPE=8,SCREEN_ORIENTATION_FULL_SENSOR=10;}
 static class Configuration {int smallestScreenWidthDp;}
 static class Resources {Configuration c=new Configuration();Configuration getConfiguration(){return c;}}
 static class Activity {Resources r=new Resources();int request=-1;boolean full;Resources getResources(){return r;}int getRequestedOrientation(){return request;}void setRequestedOrientation(int n){request=n;}void applySensorVideoFullscreen(boolean n){full=n;}}
 final Activity activity=new Activity();final VideoRotationPolicy policy=new VideoRotationPolicy();Integer previousOrientation;boolean rotatedFullscreen;
 ${method('void fullscreenChanged(')}
 ${method('private void rotate(')}
 ${method('private boolean useFullSensorWindow(')}
 ${method('private void restoreOrientation(')}
 static void check(boolean ok,String why){if(!ok)throw new AssertionError(why);}
 public static void main(String[] args){
  DisplayRequests tablet=new DisplayRequests();tablet.activity.r.c.smallestScreenWidthDp=800;
  tablet.rotate(VideoRotationPolicy.LANDSCAPE);check(tablet.activity.request==10&&tablet.activity.full,"Tablet uses actual sensor rotation, not fixed landscape letterboxing");
  tablet.rotate(VideoRotationPolicy.PORTRAIT);check(tablet.activity.request==10&&!tablet.activity.full,"Tablet upright stays sensor-driven while returning to regular video");
  tablet.rotate(VideoRotationPolicy.REVERSE_LANDSCAPE);tablet.fullscreenChanged(false,false);
  check(tablet.activity.request==-1&&tablet.previousOrientation==null,"Manual exit restores original tablet orientation policy");
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

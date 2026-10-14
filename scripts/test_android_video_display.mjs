import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAndroidVideoDisplaySync} from '../src/android-video-display.js';

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

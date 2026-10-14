import assert from 'node:assert/strict';

// Real emulator accelerometer and Android input; CDP is observation only.
export async function verifyAndroidVideoDisplay({adb,evaluate,sample,waitNative,delay,report,showControls,tapExit}) {
 const setting=(scope,key)=>adb('shell','settings','get',scope,key).trim();
 const saved=[['system','accelerometer_rotation'],['system','user_rotation'],
  ['system','screen_off_timeout'],['global','stay_on_while_plugged_in']].map(([scope,key])=>[scope,key,setting(scope,key)]);
 const sensor=adb('emu','sensor','get','acceleration').match(/acceleration\s*=\s*([-\d.]+:[-\d.]+:[-\d.]+)/)?.[1];
 assert.ok(sensor,'Observe the actual emulator accelerometer before changing it');
 const window=()=>evaluate("window.Capacitor.nativePromise('IrgunPlayback','qaWindowBounds',{})");
 const shape=()=>evaluate('({width:innerWidth,height:innerHeight})');
 const waitShape=async landscape=>{
  for(let i=0;i<30;i++){const value=await shape();if((value.width>value.height)===landscape)return value;await delay(200);}
  throw Error('Actual Android window did not complete physical '+(landscape?'landscape':'portrait')+' rotation');
 };
 const same=(before,after,elapsed)=>{
  assert.equal(after.playerIdentity,before.playerIdentity,'Rotation must keep the same ExoPlayer');
  assert.equal(after.mediaItemIdentity,before.mediaItemIdentity,'Rotation must keep the same MediaItem');
  assert.ok(after.positionMs>=before.positionMs-1250,'Rotation must not rewind');
  assert.ok(after.positionMs<=before.positionMs+elapsed*(before.playbackSpeed||1)+2500,'Rotation must not seek forward');
  assert.ok(after.frames>before.frames+5,'Rotation must retain moving video');
 };
 try{
  adb('shell','settings','put','system','accelerometer_rotation','0');
  adb('shell','settings','put','system','user_rotation','0');
  adb('emu','sensor','set','acceleration','0:9.81:0');await delay(1200);
  assert.equal(setting('system','accelerometer_rotation'),'0','The actual Android rotation lock must stay on');
  assert.equal((await window()).keepScreenOn,true,'Playing video must set the actual native screen-awake flag');
  adb('shell','settings','put','system','screen_off_timeout','2000');
  adb('shell','settings','put','global','stay_on_while_plugged_in','0');
  await delay(6000);
  assert.match(adb('shell','dumpsys','power'),/mWakefulness=Awake/,'Video must survive a real screen idle timeout');
  assert.equal((await window()).keepScreenOn,true);
  report.checks.push({label:'Playing video keeps the actual display awake beyond its idle timeout with charger stay-awake disabled'});

  // Real media keys exercise the same MediaSession without a JS playback setter.
  adb('shell','input','keyevent','KEYCODE_MEDIA_PAUSE');
  await waitNative(s=>!s.media3.playWhenReady,'Pause must reach the real Media3 player');await delay(350);
  assert.equal((await window()).keepScreenOn,false,'Paused video must release the display');
  adb('shell','input','keyevent','KEYCODE_MEDIA_PLAY');
  await waitNative(s=>s.media3.playing,'Resume must advance the existing video');await delay(350);
  assert.equal((await window()).keepScreenOn,true,'Resuming video must restore screen-awake');
  // Restore the ordinary timeout before longer rotation/menu checks.
  const timeout=saved.find(row=>row[1]==='screen_off_timeout')[2];
  adb('shell','settings','put','system','screen_off_timeout',timeout);

  for(const acceleration of ['9.81:0:0','-9.81:0:0']){
   const before=(await sample()).media3,started=Date.now();
   adb('emu','sensor','set','acceleration',acceleration);
   const full=await waitNative(s=>s.media3.fullscreen&&s.media3.playing&&s.media3.frames>before.frames+5,
    'Physical accelerometer tilt must enter native fullscreen with auto-rotate OFF');
   const landscape=await waitShape(true);assert.ok(landscape.width>landscape.height,'Actual Android/WebView must be landscape');
   same(before,full.media3,Date.now()-started);
   assert.equal(setting('system','accelerometer_rotation'),'0','The app must not change the system auto-rotate preference');
   adb('emu','sensor','set','acceleration','0:9.81:0');
   const regular=await waitNative(s=>!s.media3.fullscreen&&s.media3.playing,
    'Turning upright must restore the regular player');
   const portrait=await waitShape(false);assert.ok(portrait.height>portrait.width,'Actual window must return to portrait');
   same(before,regular.media3,Date.now()-started);
   report.checks.push({label:'Actual sensor landscape/fullscreen and portrait/regular player with rotation lock ON',before,after:regular.media3});
  }
  adb('emu','sensor','set','acceleration','9.81:0:0');
  await waitNative(s=>s.media3.fullscreen,'Landscape must re-enter fullscreen');
  await showControls();await tapExit();
  await waitNative(s=>!s.media3.fullscreen,'Actual fullscreen exit button must exit sensor fullscreen');
  await delay(1200);assert.equal((await sample()).media3.fullscreen,false,'A manual exit must not immediately reopen fullscreen');
  adb('emu','sensor','set','acceleration','0:9.81:0');await delay(1000);
 }finally{
  adb('shell','input','keyevent','KEYCODE_WAKEUP');
  adb('emu','sensor','set','acceleration',sensor);
  for(const [scope,key,value]of saved)
   if(/^\d+$/.test(value))adb('shell','settings','put',scope,key,value);
   else adb('shell','settings','delete',scope,key);
  await delay(700);
 }
}

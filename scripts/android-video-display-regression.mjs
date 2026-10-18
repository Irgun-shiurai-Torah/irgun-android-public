import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

// Real Video controller reveal taps must stay away from Media3's seek bar.
export function nativeControllerRevealPoint(media) {
 const {surfaceX:x,surfaceY:y,surfaceVisibleWidth:w,surfaceVisibleHeight:h,seekBarRect:seek}=media;
 assert.ok([x,y,w,h].every(Number.isFinite)&&w>120&&h>100,'A real video surface is needed before a controller tap');
 if (Math.abs(media.surfaceRotationDegrees||0)===90) {
   // On a portrait-LOCKED tablet the player is rotated visually, so its
   // bottom seek row becomes a VERTICAL stripe. Tap the safe picture center
   // rather than using unrotated seek.y coordinates.
   const px=Math.round(x+w*.68),py=Math.round(y+h*.48);
   // A clockwise player puts the progress stripe on screen LEFT; the
   // counter-clockwise layout puts it on RIGHT. Neither should be tapped.
   // Checking only px > stripe.right incorrectly fails the second side
   // despite a safe real tap and fully visible decoded picture.
   assert.ok(!seek || px < seek.x-15 || px > seek.x+seek.width+15,
     'Rotated controller tap must clear the physical seek bar on EITHER side');
   return [String(px),String(py)];
 }
 const top=y+50;
 const bottom=Math.min(y+h-12,seek?.y===undefined?y+h*.70:seek.y-12);
 assert.ok(bottom>top,'Video controls and seek bar must leave a real non-seeking reveal region');
 const posY=Math.round(Math.max(top,Math.min(y+h*.36,bottom)));
 assert.ok(!seek || posY<seek.y-10,'Controller reveal must not seek the video');
 return [String(Math.round(x+w*.74)),String(posY)];
}

export function assertAndroidVideoTimes(media) {
 const {elapsedTimeRect:p,durationTimeRect:d,seekBarRect:bar}=media;
 assert.ok(p&&d&&bar,'Actual native elapsed time, duration and seek bar must all be visible');
 if (Math.abs(media.surfaceRotationDegrees||0)===90) {
   // Landscape UI inside a portrait-locked physical display. The elapsed and
   // total timestamps must still occupy opposite LANDSCAPE corners, which
   // become opposite vertical ends in physical screen coordinates.
   const py=p.y+p.height/2,dy=d.y+d.height/2;
   assert.ok(Math.abs(py-dy)>media.surfaceVisibleHeight*.50,
     'Rotated elapsed/total time must occupy opposite ends of actual fullscreen video');
   assert.ok(media.surfaceRotationDegrees>0 ? py<dy : py>dy,
     'Elapsed belongs to the physical left of the landscape player, even when rotated');
   assert.ok(Math.abs((p.x+p.width/2)-(d.x+d.width/2))<Math.max(p.width,d.width)*3,
     'Rotated elapsed/total time must share the actual landscape bottom edge');
 } else {
   assert.ok(p.x+p.width<d.x,'Elapsed and total duration must be on opposite sides without a separator');
   assert.ok(p.x+p.width<media.surfaceX+media.surfaceVisibleWidth*.4&&
    d.x>media.surfaceX+media.surfaceVisibleWidth*.6,
    'Elapsed belongs on the left and total duration on the right, including Hebrew layout');
   assert.ok(Math.abs((p.y+p.height/2)-(d.y+d.height/2))<=Math.max(p.height,d.height)*.25,
    'The two actual timestamps must share one bottom row');
   assert.ok(bar.y+bar.height<=Math.min(p.y,d.y)+2,
    'The original seek bar must remain directly above the time row');
 }
 const seconds=value=>{
  assert.match(value,/^\d+:\d{2}(?::\d{2})?$/,'Actual Media3 timestamp must remain readable');
  return value.split(':').reduce((sum,n)=>sum*60+Number(n),0);
 };
 assert.ok(Math.abs(seconds(media.elapsedTimeText)-media.positionMs/1000)<3,
  'Elapsed timestamp must still follow the same live Media3 playback clock');
 assert.ok(Math.abs(seconds(media.durationTimeText)-media.durationMs/1000)<1.1,
  'Right timestamp must show the actual total duration, not remaining time');
}

// The first of two native taps must not hit Media3's seek bar. On short
// in-page videos the seek bar can occupy the lower HALF of PlayerView; the
// old 50%-height double tap scrubbed the lecture before requesting +/-15s.
export function nativeDoubleTapPoint(media,direction) {
 assert.ok(direction===1||direction===-1,'Specify right or left double-tap side');
 const {surfaceX:x,surfaceY:y,surfaceVisibleWidth:w,surfaceVisibleHeight:h,seekBarRect:seek}=media;
 assert.ok([x,y,w,h].every(Number.isFinite)&&w>120&&h>115,
   'Double tap requires a visible real Android video frame');
 // Native custom actions occupy the first 44dp; Media3 seek and time
 // controls occupy the bottom of short players. Use the visible picture
 // gap between them, based on actual measured video/seek rectangles.
 const start=y+53;
 const end=Math.min(y+h-44,
   seek?.y===undefined?y+Math.min(h*.43,180):seek.y-14);
 assert.ok(end>start,'No unobstructed video area for a real double tap');
 const pointY=Math.round(start+(end-start)*.35);
 assert.ok(!seek||pointY<seek.y-12,'Double tap must not scrub the Media3 seek bar');
 return [String(Math.round(x+w*(direction===1?.90:.10))),String(pointY)];
}

// Real emulator accelerometer and Android input; CDP is observation only.
export async function verifyAndroidVideoDisplay({adb,evaluate,sample,waitNative,delay,report,showControls,tapExit,tapNativeLabel,capturePicture,
 naturalLandscape=process.env.IRGUN_TABLET_NATURAL_LANDSCAPE==='1'}) {
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
 const upright=naturalLandscape?'9.81:0:0':'0:9.81:0';
 const sideways=naturalLandscape?['0:9.81:0','0:-9.81:0']:['9.81:0:0','-9.81:0:0'];
 try{
  if(naturalLandscape){
   const actual=await window();
   assert.ok(actual.smallestScreenWidthDp>=600&&actual.physicalDisplayWidth>actual.physicalDisplayHeight,
    'Tablet rotation job must run on a real landscape-native large display, not a phone viewport');
   report.checks.push({label:'Actual landscape-native tablet display verified',window:actual});
  }
  adb('shell','settings','put','system','accelerometer_rotation','0');
  adb('shell','settings','put','system','user_rotation',naturalLandscape?'1':'0');
  adb('emu','sensor','set','acceleration',upright);await delay(1200);
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

  for(const [index,acceleration] of sideways.entries()){
   const before=(await sample()).media3,started=Date.now();
   adb('emu','sensor','set','acceleration',acceleration);
   const full=await waitNative(s=>s.media3.fullscreen&&s.media3.playing&&s.media3.frames>before.frames+5,
    'Physical accelerometer tilt must enter native fullscreen with auto-rotate OFF');
   // Android 16 ignores app-forced orientation on sw600dp+ devices. With
   // the real system rotation lock ON, the physical display MUST stay portrait.
   // The user's video instead rotates inside the full-size native window.
   // If the OS already presents a landscape screen, use the normal orientation.
   let bounds,visible,landscape,screen,png,presentationCorrect=false;
   for(let n=0;n<35;n++){
    bounds=await window();landscape=await shape();visible=(await sample()).media3;
    png=execFileSync('adb',['exec-out','screencap','-p'],{maxBuffer:32*1024*1024});
    screen={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
    const physicalLandscape=screen.width>screen.height;
    const angle=visible.surfaceRotationDegrees||0;
    const rotatedLocked=!physicalLandscape&&Math.abs(angle)===90 &&
      (index===0 ? angle>0 : angle<0);
    presentationCorrect=visible.surfaceVisibleOnScreen&&
      visible.surfaceVisibleWidth>=screen.width*.92&&
      visible.surfaceVisibleHeight>=screen.height*.92&&
      (physicalLandscape?angle===0:rotatedLocked)&&
      // Do not accept a landscape-sized letterbox within a portrait screen.
      (physicalLandscape?landscape.width>landscape.height:landscape.height>landscape.width);
    if(presentationCorrect)break;
    await delay(250);
   }
   writeFileSync('emulator-report/video-landscape-'+index+'.png',png);
   assert.ok(presentationCorrect,'Video must fill the physical tablet display with an upright landscape presentation, NOT a letterboxed fake landscape Activity: '+
     JSON.stringify({screen,bounds,landscape,visible}));
   const shown=await showControls();
   assertAndroidVideoTimes(shown.media3);
   // Physically exercise both native menus on a portrait-locked display where
   // only PlayerView rotates. Observe orientation, make real selections, and
   // prove the same player and MediaItem keep playing without rewind.
   if (screen.height>screen.width && Math.abs(shown.media3.surfaceRotationDegrees||0)===90) {
    const beforeMenu=shown.media3;
    await tapNativeLabel('Choose video quality');
    const qualityMenu=await waitNative(s=>s.media3.rotatedMenuVisible&&s.media3.qualityMenuVisible&&
      Math.abs(s.media3.rotatedMenuParentRotationDegrees)===90,
      'Quality menu must follow locked-landscape PlayerView, not remain portrait');
    assert.ok(qualityMenu.media3.rotatedMenuPanelRect?.width>0,
      'Rotated quality panel must have visible native geometry');
    const targetHeight=qualityMenu.media3.availableResolutions?.[0];
    assert.ok(targetHeight,'Quality menu needs a real supported HLS resolution');
    await tapNativeLabel('',targetHeight+'p');
    const selectedQuality=await waitNative(s=>s.media3.qualityHeight===targetHeight&&
      s.media3.playing&&s.media3.frames>qualityMenu.media3.frames+2,
      'Rotated quality option must select a real Media3 track',45000);
    assert.equal(selectedQuality.media3.playerIdentity,beforeMenu.playerIdentity);
    assert.equal(selectedQuality.media3.mediaItemIdentity,beforeMenu.mediaItemIdentity);
    await tapNativeLabel('Choose playback speed');
    const speedMenu=await waitNative(s=>s.media3.rotatedMenuVisible&&s.media3.speedMenuVisible&&
      Math.abs(s.media3.rotatedMenuParentRotationDegrees)===90,
      'Speed menu must follow locked-landscape PlayerView, not remain portrait');
    assert.ok(speedMenu.media3.rotatedMenuPanelRect?.width>0,
      'Rotated speed panel must have visible native geometry');
    await tapNativeLabel('','1.25×');
    const faster=await waitNative(s=>Math.abs(s.media3.playbackSpeed-1.25)<.01&&s.media3.playing,
      'Rotated speed choice must change real Media3 playback speed');
    assert.equal(faster.media3.playerIdentity,beforeMenu.playerIdentity);
    assert.equal(faster.media3.mediaItemIdentity,beforeMenu.mediaItemIdentity);
    await tapNativeLabel('Choose playback speed');
    await tapNativeLabel('','1×');
    await waitNative(s=>Math.abs(s.media3.playbackSpeed-1)<.01,
      'Playback speed must return to 1x after rotated-menu regression check');
    report.checks.push({label:'Rotation-locked tablet quality and speed menus open landscape and preserve the same player',rotation:shown.media3.surfaceRotationDegrees,quality:targetHeight,speed:1.25});
   }
   assert.equal(setting('system','accelerometer_rotation'),'0',
     'The app must never silently change the tablet rotation-lock preference');
   // The actual recorded screenshot, not ExoPlayer counters, must show pixels.
   if (capturePicture) await capturePicture(await sample(),'tablet-tilt-video-'+index);
   same(before,(await sample()).media3,Date.now()-started);
   adb('emu','sensor','set','acceleration',upright);
   const regular=await waitNative(s=>!s.media3.fullscreen&&s.media3.playing,
    'Turning upright must restore the regular player');
   const portrait=await waitShape(false);assert.ok(portrait.height>portrait.width,'Actual window must return to portrait');
   same(before,regular.media3,Date.now()-started);
   report.checks.push({label:'Real tilt fills entire physical tablet display with correctly rotated landscape video and preserves rotation lock',naturalLandscape,screen,bounds,before,landscape:visible,after:regular.media3});
  }
  adb('emu','sensor','set','acceleration',sideways[0]);
  await waitNative(s=>s.media3.fullscreen,'Landscape must re-enter fullscreen');
  await showControls();await tapExit();
  await waitNative(s=>!s.media3.fullscreen,'Actual fullscreen exit button must exit sensor fullscreen');
  await delay(1200);assert.equal((await sample()).media3.fullscreen,false,'A manual exit must not immediately reopen fullscreen');
  adb('emu','sensor','set','acceleration',upright);await delay(1000);
 }finally{
  adb('shell','input','keyevent','KEYCODE_WAKEUP');
  adb('emu','sensor','set','acceleration',sensor);
  for(const [scope,key,value]of saved)
   if(/^\d+$/.test(value))adb('shell','settings','put',scope,key,value);
   else adb('shell','settings','delete',scope,key);
  await delay(700);
 }
}


/* Real Android input-only controller recovery: no UI state injection, playback
 * setters, or Media3/player rebuild. The toolbar and the time row BOTH count. */
export const nativeControlsReady=m=>Boolean(m?.controllerFullyVisible&&m?.pipButtonVisible&&
  m?.qualityButtonVisible&&m?.elapsedTimeRect&&m?.durationTimeRect&&m?.seekBarRect);
export async function revealNativeControlsWithPhysicalTaps({sample,adb,delay,fresh=false}) {
  let last=await sample(),seekCount=last.media3.doubleTapSeekCount;
  const guard=s=>assert.equal(s.media3.doubleTapSeekCount,seekCount,
    'Physical controller reveal must never seek the lecture');
  if(!fresh&&nativeControlsReady(last.media3))return last; // no 10-second stale visibility wait
  for(let attempt=0;attempt<3;attempt++){
    last=await sample();guard(last);
    if(!fresh&&nativeControlsReady(last.media3))return last;
    const point=nativeControllerRevealPoint(last.media3);
    if(last.media3.controllerFullyVisible) {
      // Custom toolbar may be hidden while Media3's controller says "visible":
      // physically hide then show to force the native listener to refresh.
      adb('shell','input','tap',...point);
      let hidden=false;
      for(let i=0;i<7;i++){await delay(200);last=await sample();guard(last);
        if(!last.media3.controllerFullyVisible){hidden=true;break;}}
      await delay(550); // safely outside Android's double-tap seek window
      // Some Media3 surfaces keep the toolbar visible despite a physical tap.
      // A fully visible toolbar AFTER the actual tap is success, not a failed
      // toggle: the old 'continue' exhausted retries even while ALL native
      // controls, timestamps and the seek bar were visibly present.
      if(!hidden) {
        if(nativeControlsReady(last.media3))return last;
        continue;
      }
    }
    adb('shell','input','tap',...point);
    for(let i=0;i<9;i++){await delay(240);last=await sample();guard(last);
      if(nativeControlsReady(last.media3))return last;}
    await delay(550);
  }
  throw Error('Native controls did not respond to three physical reveal attempts; last='+JSON.stringify(last));
}

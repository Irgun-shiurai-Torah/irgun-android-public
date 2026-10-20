import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {nativeHierarchy} from './android-native-hierarchy.mjs';

const pkg='org.irgunshiuraitorah.app';

export function recentsEducationAction(xml) {
  const nodes=xml.match(/<node\b[^>]*>/g)||[];
  const launcher=nodes.filter(node=>/package="com\.(?:google\.android\.apps\.nexuslauncher|android\.launcher3)"/.test(node)&&/visible="true"/.test(node));
  if(!launcher.some(node=>/text="Select text and images to copy, share, and more"/.test(node)))return null;
  const close=launcher.find(node=>/resource-id="[^"]*:id\/dismiss"/.test(node)&&/clickable="true"/.test(node));
  const rect=close?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)?.slice(1).map(Number);
  return rect?{tap:[Math.round((rect[0]+rect[2])/2),Math.round((rect[1]+rect[3])/2)]}:{back:true};
}

const recentTasks=dump=>dump.split(/Visible recent tasks|Visible recent task list/i)[0]
  .split(/(?=^[ \t]*\*?[ \t]*Recent #\d+:)/m)
  // The Launcher/Recents HOME task is often Recent #0, even when the
  // Irgun card is the top dismissible app (Recent #1). Only compare app
  // tasks; never mistake HOME for the current foreground app task.
  .filter(block=>/^[ \t]*\*?[ \t]*Recent #\d+:/.test(block)&&
    !/\btype=(?:home|recents)\b/.test(block.split('\n',1)[0]));
const irgunTask=block=>/(?:realActivity=|cmp=)org\.irgunshiuraitorah\.app\//.test(block||'');
export function hasIrgunRecentTask(dump) {
  return recentTasks(dump).some(irgunTask);
}
export function topRecentTaskIsIrgun(dump) {
  return irgunTask(recentTasks(dump)[0]);
}

export function recentsDismissGesture(xml,{width,height,topTaskIsIrgun=false,attempt=0}) {
  const nodes=xml.match(/<node\b[^>]*>/g)||[];
  const cards=nodes.filter(node=>/visible="true"/.test(node)&&
    /resource-id="[^"]*:(?:id\/)(?:snapshot|thumbnail)"/.test(node)&&
    /bounds="\[\d+,\d+\]\[\d+,\d+\]"/.test(node));
  const card=cards.find(node=>/content-desc="[^"]*Irgun Shiurai Torah[^"]*"/.test(node))||
    (topTaskIsIrgun&&cards.length===1&&/content-desc=""/.test(cards[0])?cards[0]:null);
  const rect=card?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)?.slice(1).map(Number);
  assert.ok(rect&&rect[0]>=0&&rect[1]>=0&&rect[2]<=width&&rect[3]<=height&&
    rect[2]>rect[0]&&rect[3]>rect[1],'Actual Recents must expose the visible Irgun screenshot card before swiping');
  // Pixel Launcher's task screenshot has rounded/clipped edges. The previous
  // touch at rect.right-6 hit the edge rather than the draggable task: the
  // actual Android screenshot was byte-identical before and after the swipe.
  // Start well inside the real, observed Irgun card, but off its centre where
  // Overview's image/text selection affordances can intercept a gesture.
  const variant=Math.max(0,Math.min(2,Math.floor(Number(attempt)||0)));
  // Pixel Launcher/emulator builds can ignore a fling starting over preview
  // selection affordances. Retries use distinct observed points inside the
  // same card and a stronger upward travel; task removal is checked separately.
  const xRatio=variant===1?.50:variant===2?.28:.72;
  const yRatio=variant===1?.82:.65;
  const x=rect[0]+Math.round((rect[2]-rect[0])*xRatio);
  const y=Math.round(rect[1]+(rect[3]-rect[1])*yRatio);
  const endY=variant===0?Math.max(1,Math.round(height*.05)):Math.max(1,Math.round(height*.01));
  assert.ok(x>=rect[0]+12&&x<=rect[2]-12&&y>rect[1]&&y<rect[3]&&
    endY<y,'Recents fling must start INSIDE the visible card and travel upward');
  return [x,y,x,endY];
}

// Do not mistake historical media-button receiver names for a live session.
export function hasRegisteredIrgunMediaSession(dump) {
  return dump.split('\n').some(line =>
    /(?:MediaSessionRecord|MediaSession2Record|Session2Record)\{/.test(line) &&
    /\borg\.irgunshiuraitorah\.app(?:\b|\/)/.test(line));
}

export function hasActivePlaybackNotification(dump) {
  const active=dump.split(/Historical notifications:|Historical Notification List:|Notification History:/i)[0];
  return active.split(/(?=NotificationRecord\()/).some(record=>
    /\bpkg=org\.irgunshiuraitorah\.app\b/.test(record)&&/MediaStyle/.test(record));
}

// Only actual Android keys/gestures mutate the app. CDP reads its real clock;
// Android service/session/notification dumps prove teardown even if the process
// or WebView disappears after the task is removed.
export async function verifyAndroidTaskDismissal({adb,sample,delay,report}) {
  const before=await sample();
  assert.ok(before.media3.active&&before.media3.playing,'Task dismissal starts with actual native playback');
  adb('shell','input','keyevent','KEYCODE_HOME');
  await delay(2500);
  const home=await sample();
  assert.equal(home.media3.playerIdentity,before.media3.playerIdentity,'Home retains the same player');
  assert.ok(home.media3.playing&&home.media3.positionMs>before.media3.positionMs+1000,
    'Pressing Home must keep actual playback and its clock advancing');
  report.checks.push({label:'Home continues the same native lecture before explicit task dismissal',before:before.media3,after:home.media3});
  const size=adb('shell','wm','size').match(/(?:Override|Physical) size: (\d+)x(\d+)/g)?.at(-1)?.match(/(\d+)x(\d+)/);
  assert.ok(size,'Android must report its current display size');
  adb('shell','input','keyevent','KEYCODE_APP_SWITCH');
  await delay(1200);
  let hierarchy=nativeHierarchy('emulator-report/task-dismissal-recents.xml');
  const education=recentsEducationAction(hierarchy);
  if(education){
    if(education.tap)adb('shell','input','tap',...education.tap.map(String));
    else adb('shell','input','keyevent','KEYCODE_BACK');
    report.gestures.push({dismissRecentsEducation:education});
    await delay(500);
    hierarchy=nativeHierarchy();
    // Back can close Overview along with its first-use tip. Reopen it as a
    // separate navigation action before attempting the one task-dismiss swipe.
    if(!/resource-id="[^"]*:id\/(?:overview_panel|snapshot|thumbnail)"/.test(hierarchy)){
      adb('shell','input','keyevent','KEYCODE_APP_SWITCH');await delay(800);
      hierarchy=nativeHierarchy();
    }
    assert.equal(recentsEducationAction(hierarchy),null,'Recents education must be dismissed before a task swipe');
  }
  writeFileSync('emulator-report/task-dismissal-recents.xml',hierarchy);
  const recentDump=adb('shell','dumpsys','activity','-a','recents');
  writeFileSync('emulator-report/task-dismissal-activity-recents.txt',recentDump);
  assert.equal(topRecentTaskIsIrgun(recentDump),true,
    'Android ActivityManager must expose the actual Irgun task before dismissal');
  let recentAfter='',taskDismissed=false,lastGesture=gesture;
  // Retry only with fresh accessibility bounds and physical swipes at distinct
  // points in the verified Irgun card. Never force-stop or shell-remove a task.
  for(let attempt=0;attempt<3&&!taskDismissed;attempt++){
    if(attempt>0){
      let currentHierarchy=nativeHierarchy();
      if(!/package="com\.google\.android\.apps\.nexuslauncher"/.test(currentHierarchy)||
          !/resource-id="[^"]*:id\/(?:overview_panel|snapshot|thumbnail)"/.test(currentHierarchy)){
        adb('shell','input','keyevent','KEYCODE_APP_SWITCH');
        await delay(900);
        currentHierarchy=nativeHierarchy();
      }
      assert.ok(/package="com\.google\.android\.apps\.nexuslauncher"/.test(currentHierarchy)&&
        /resource-id="[^"]*:id\/(?:overview_panel|snapshot|thumbnail)"/.test(currentHierarchy),
        'Android Recents must remain visible before retrying a task-dismiss gesture');
      recentAfter=adb('shell','dumpsys','activity','-a','recents');
      if(!hasIrgunRecentTask(recentAfter)){taskDismissed=true;break;}
      assert.equal(topRecentTaskIsIrgun(recentAfter),true,
        'Retry may only swipe the real Irgun task, never an unrelated app');
      hierarchy=currentHierarchy;
      lastGesture=recentsDismissGesture(hierarchy,{
        width:Number(size[1]),height:Number(size[2]),topTaskIsIrgun:true,attempt
      });
    }
    const beforePath=attempt===0?'emulator-report/task-dismissal-before.png':
      `emulator-report/task-dismissal-before-attempt-${attempt+1}.png`;
    writeFileSync(beforePath,execFileSync('adb',['exec-out','screencap','-p'],{maxBuffer:32*1024*1024}));
    const duration=[180,100,120][attempt];
    adb('shell','input','swipe',...lastGesture.map(String),String(duration));
    report.gestures.push({recentsSwipeUp:lastGesture,attempt:attempt+1,durationMs:duration});
    for(let n=0;n<12;n++){
      recentAfter=adb('shell','dumpsys','activity','-a','recents');
      if(!hasIrgunRecentTask(recentAfter)){taskDismissed=true;break;}
      await delay(250);
    }
    if(!taskDismissed&&attempt===2){
      writeFileSync('emulator-report/task-dismissal-after-activity-recents.txt',recentAfter);
      try {
        writeFileSync('emulator-report/task-dismissal-after.png',
          execFileSync('adb',['exec-out','screencap','-p'],{maxBuffer:32*1024*1024}));
      } catch (_) { /* keep the original, specific assertion */ }
      try { nativeHierarchy('emulator-report/task-dismissal-after-recents.xml'); }
      catch (_) { /* task presence is already grounded in ActivityManager */ }
    }
  }
  assert.ok(taskDismissed,
    'Physical Recents swipes did not remove the Irgun task; playback service '+
    'cannot be expected to stop until Android removes that task. '+
    'See before/after Recents screenshots and native hierarchy; attempts='+
    JSON.stringify(report.gestures.filter(g=>g.recentsSwipeUp)));
  const stopped=()=>{
    const logs=adb('shell','logcat','-d','-s','IrgunPlayback:D','*:S');
    const services=adb('shell','dumpsys','activity','services',pkg);
    const sessions=adb('shell','dumpsys','media_session');
    const notifications=adb('shell','dumpsys','notification','--noredact');
    return {destroyed:logs.includes('Media3 service destroyed'),
      taskPresent:hasIrgunRecentTask(adb('shell','dumpsys','activity','-a','recents')),
      servicePresent:/ServiceRecord\{[^\n]*IrgunPlaybackService/.test(services),
      sessionPresent:hasRegisteredIrgunMediaSession(sessions),notificationPresent:hasActivePlaybackNotification(notifications)};
  };
  let state;
  for(let n=0;n<30;n++){
    state=stopped();
    if(state.destroyed&&!state.taskPresent&&!state.servicePresent&&!state.sessionPresent&&!state.notificationPresent)break;
    await delay(300);
  }
  if (state.sessionPresent) writeFileSync('emulator-report/task-dismissal-media-session.txt',adb('shell','dumpsys','media_session'));
  assert.ok(state.destroyed&&!state.taskPresent&&!state.servicePresent&&!state.sessionPresent&&!state.notificationPresent,
    'Actual Recents swipe must destroy playback service, release session, and remove notification: '+JSON.stringify(state));
  await delay(2200);
  const later=stopped();
  assert.ok(!later.taskPresent&&!later.servicePresent&&!later.sessionPresent&&!later.notificationPresent,
    'A delayed handoff, retry or bridge command must not restart a dismissed lecture');
  report.checks.push({label:'Physical Recents swipe closes the lecture and removes service/session/notification without a delayed restart',state:later});
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {recentsDismissGesture, hasActivePlaybackNotification,recentsEducationAction,hasIrgunRecentTask,topRecentTaskIsIrgun,hasRegisteredIrgunMediaSession} from './android-task-dismissal-regression.mjs';

test('actual Java task-removal and bridge callbacks stop playing, paused and buffering lectures without late restart', () => {
  const source=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunPlaybackService.java','utf8');
  const method=signature=>{
    const start=source.indexOf(signature);assert.ok(start>=0);
    let level=0;
    for(let i=source.indexOf('{',start);i<source.length;i++){
      if(source[i]==='{')level++;
      if(source[i]==='}'&&--level===0)return source.slice(start,i+1);
    }
    throw Error('Unclosed Java method');
  };
  const dir=mkdtempSync(join(tmpdir(),'irgun-task-dismissal-'));
  try {
    writeFileSync(join(dir,'IrgunPlaybackService.java'),`
import java.util.*;
public class IrgunPlaybackService {
 static class Intent {}
 static class Log {static void e(String t,String m,Throwable e){throw new AssertionError(e);}}
 static class IrgunPlaybackPlugin {static void handlePlaybackError(String m){throw new AssertionError(m);}}
 static class Handler {
   List<Runnable> queue=new ArrayList<>();
   void post(Runnable r){queue.add(r);}
   void removeCallbacksAndMessages(Object token){queue.clear();}
   void drain(){for(Runnable r:new ArrayList<>(queue))r.run();queue.clear();}
 }
 static String TAG="test";
 static List<Runnable> pendingBridgeCommands=new ArrayList<>();
 static IrgunPlaybackService activeInstance;
 static IrgunPlaybackService active(){return activeInstance;}
 static void clearPendingBridgeCommands(){pendingBridgeCommands.clear();}
 boolean taskRemoved=false,playing,buffering,hasItem=true,notification=true,stopped=false;
 Handler mainHandler=new Handler();
 int stopCount;
 void stopAudioInternal(boolean clear){
   if(!clear)throw new AssertionError("Closed lecture must not leave a resumable media item");
   playing=false;buffering=false;hasItem=false;stopCount++;
 }
 void pauseAllPlayersAndStopSelf(){
   if(hasItem||playing||buffering)throw new AssertionError("Playback must stop before service teardown");
   notification=false;stopped=true;
 }
 ${method('public void onTaskRemoved(Intent rootIntent)')}
 ${method('private static void onMain(Runnable runnable)')}
 static void check(boolean value,String why){if(!value)throw new AssertionError(why);}
 public static void main(String[] args){
   for(int state=0;state<3;state++){
     IrgunPlaybackService s=new IrgunPlaybackService();activeInstance=s;
     s.playing=state==0;s.buffering=state==2;
     onMain(()->s.playing=true);s.mainHandler.drain();
     check(s.playing&&!s.stopped,"Ordinary bridge commands/Home keep playback alive");
     s.playing=state==0;
     onMain(()->s.playing=true); // Already queued Play / background handoff.
     pendingBridgeCommands.add(()->s.playing=true);
     s.onTaskRemoved(new Intent());s.mainHandler.drain();
     check(!s.playing&&!s.buffering&&!s.hasItem&&!s.notification&&s.stopped,
       "Task dismissal must stop every playback state and notification");
     check(pendingBridgeCommands.isEmpty(),"No pending bridge commands survive dismissal");
     onMain(()->s.playing=true);s.mainHandler.drain();
     check(!s.playing&&s.stopCount==1,"Late bridge Play cannot resurrect dismissed task");
   }
   IrgunPlaybackService old=new IrgunPlaybackService();activeInstance=old;
   onMain(()->{throw new AssertionError("Stale service command executed on replacement");});
   activeInstance=new IrgunPlaybackService();old.mainHandler.drain();
   final boolean[] played={false};onMain(()->played[0]=true);activeInstance.mainHandler.drain();
   check(played[0],"A fresh user launch can play normally after dismissal");
 }
}`);
    execFileSync('javac',['-d',dir,join(dir,'IrgunPlaybackService.java')]);
    execFileSync('java',['-cp',dir,'IrgunPlaybackService']);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('Recents gesture targets the observed Irgun card and refuses another app or offscreen thumbnail',()=>{
  const card=(name,bounds='[30,180][290,550]')=>`<hierarchy><node content-desc="${name}" resource-id="com.google.android.apps.nexuslauncher:id/snapshot" visible="true" bounds="${bounds}"></node></hierarchy>`;
  assert.deepEqual(recentsDismissGesture(card('Screenshot of Irgun Shiurai Torah'),{width:320,height:640}),[284,421,284,32]);
  assert.throws(()=>recentsDismissGesture(card(''),{width:320,height:640}),/Irgun/);
  assert.deepEqual(recentsDismissGesture(card(''),{width:320,height:640,topTaskIsIrgun:true}),[284,421,284,32]);
  assert.throws(()=>recentsDismissGesture(card('Screenshot of Settings'),{width:320,height:640,topTaskIsIrgun:true}),/Irgun/);
  assert.throws(()=>recentsDismissGesture(card('Screenshot of Settings'),{width:320,height:640}),/Irgun/);
  assert.throws(()=>recentsDismissGesture(card('Screenshot of Irgun Shiurai Torah','[-290,180][-30,550]'),{width:320,height:640}),/Irgun/);
});

test('dismissal accepts historical receiver metadata but rejects an actual session record',()=>{
 const historical='Last media button receiver: org.irgunshiuraitorah.app/.SplashActivity\n  remembered package: org.irgunshiuraitorah.app';
 const active='Sessions Stack - have 1 sessions:\n  MediaSessionRecord{4f88 u0 org.irgunshiuraitorah.app/IrgunPlaybackService}\n'+historical;
 assert.equal(hasRegisteredIrgunMediaSession(historical),false);
 assert.equal(hasRegisteredIrgunMediaSession(active),true);
 assert.equal(hasRegisteredIrgunMediaSession(active.replaceAll('org.irgunshiuraitorah.app','org.other.app')),false);
});

test('notification verification ignores historical and unrelated records but detects an actual app MediaStyle record',()=>{
  const record='NotificationRecord(0x key=org.irgunshiuraitorah.app)\n  pkg=org.irgunshiuraitorah.app\n  android.template=android.app.Notification$MediaStyle';
  assert.equal(hasActivePlaybackNotification('Notification List:\n'+record+'\nHistorical notifications:\n'),true);
  assert.equal(hasActivePlaybackNotification('Notification List:\nHistorical notifications:\n'+record),false);
  assert.equal(hasActivePlaybackNotification('Notification List:\n'+record.replaceAll('org.irgunshiuraitorah.app','another.app')),false);
});

test('first-use Overview tips are handled before the actual task swipe, with and without a Close control',()=>{
 const tip='<node text="Select text and images to copy, share, and more" package="com.google.android.apps.nexuslauncher" visible="true">';
 const close='<node content-desc="Close" resource-id="com.google.android.apps.nexuslauncher:id/dismiss" package="com.google.android.apps.nexuslauncher" visible="true" clickable="true" bounds="[266,519][306,559]">';
 assert.deepEqual(recentsEducationAction(tip+close),{tap:[286,539]});
 assert.deepEqual(recentsEducationAction(tip),{back:true});
 assert.equal(recentsEducationAction('<node text="Close" package="org.irgunshiuraitorah.app" visible="true">'),null);
});

test('task dismissal requires the actual ActivityManager recent task to disappear, independently of the service',()=>{
 const task='Recent tasks:\n  * Recent #0: Task{abc #12 type=standard}\n    realActivity=org.irgunshiuraitorah.app/.SplashActivity\n  * Recent #1: Task{def #11}\n    realActivity=com.android.settings/.Settings';
 assert.equal(hasIrgunRecentTask(task),true);
 assert.equal(topRecentTaskIsIrgun(task),true);
 assert.equal(topRecentTaskIsIrgun('Recent #0: Task{x}\n realActivity=other.app/.Main\n'+task),false);
 assert.equal(hasIrgunRecentTask(task.replace('org.irgunshiuraitorah.app/.SplashActivity','other.app/.Main')),false);
});

test('Android Recents HOME entry preceding Irgun must not fail real app task discovery',()=>{
 const dump=[
   'ACTIVITY MANAGER RECENT TASKS',
   '  Recent tasks:',
   '  * Recent #0: Task{abc #8 visible=false type=home A=1000:com.google.android.apps.nexuslauncher}',
   '    intent={cmp=com.google.android.apps.nexuslauncher/.NexusLauncherActivity}',
   '  * Recent #1: Task{def #9 visible=false type=standard A=10168:org.irgunshiuraitorah.app}',
   '    intent={cmp=org.irgunshiuraitorah.app/.SplashActivity}',
   '  * Recent #2: Task{ghi #10 visible=false type=standard A=com.android.settings}',
   '    intent={cmp=com.android.settings/.Settings}',
   '  Visible recent tasks (most recent first):',
   '  * RecentTaskInfo #0:',
   '    baseIntent=Intent { cmp=org.irgunshiuraitorah.app/.SplashActivity }'
 ].join('\n');
 assert.equal(hasIrgunRecentTask(dump),true);
 assert.equal(topRecentTaskIsIrgun(dump),true,'HOME must not masquerade as an app card');
 const settingsFirst=dump.replace('type=standard A=10168:org.irgunshiuraitorah.app','type=standard A=com.android.settings')
   .replace('intent={cmp=org.irgunshiuraitorah.app/.SplashActivity}', 'intent={cmp=com.android.settings/.Settings}');
 assert.equal(topRecentTaskIsIrgun(settingsFirst),false,'An unrelated first app must still be rejected');
});

test('separate visible-task section cannot misattribute an unrelated actual recent task',()=>{
 const other='Recent tasks:\n  * Recent #0: Task{abc #12 type=standard}\n    realActivity=other.app/.Main\n';
 const visible='\nVisible recent tasks (most recent first):\n * RecentTaskInfo #0:\n realActivity=org.irgunshiuraitorah.app/.MainActivity';
 assert.equal(hasIrgunRecentTask(other+visible),false);
 assert.equal(topRecentTaskIsIrgun(other+visible),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {recentsDismissGesture, hasActivePlaybackNotification} from './android-task-dismissal-regression.mjs';

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
  assert.deepEqual(recentsDismissGesture(card('Screenshot of Irgun Shiurai Torah'),{width:320,height:640}),[160,421,160,32]);
  assert.throws(()=>recentsDismissGesture(card('Screenshot of Settings'),{width:320,height:640}),/Irgun/);
  assert.throws(()=>recentsDismissGesture(card('Screenshot of Irgun Shiurai Torah','[-290,180][-30,550]'),{width:320,height:640}),/Irgun/);
});

test('notification verification ignores historical and unrelated records but detects an actual app MediaStyle record',()=>{
  const record='NotificationRecord(0x key=org.irgunshiuraitorah.app)\n  pkg=org.irgunshiuraitorah.app\n  android.template=android.app.Notification$MediaStyle';
  assert.equal(hasActivePlaybackNotification('Notification List:\n'+record+'\nHistorical notifications:\n'),true);
  assert.equal(hasActivePlaybackNotification('Notification List:\nHistorical notifications:\n'+record),false);
  assert.equal(hasActivePlaybackNotification('Notification List:\n'+record.replaceAll('org.irgunshiuraitorah.app','another.app')),false);
});

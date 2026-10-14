import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('actual native network recovery retains the engine, source, authority and user Pause with bounded attempts',()=>{
 const source=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunPlaybackService.java','utf8');
 const start=source.indexOf('    private void cancelNetworkRecovery()'),end=source.indexOf('    @Override\n    public void onCreate()',start);
 const methods=source.slice(start,end);assert.ok(methods.includes('ERROR_CODE_IO_NETWORK_CONNECTION_FAILED'));
 assert.match(source,/if \(scheduleNetworkRecovery\(error.errorCode\)\) return;/);
 assert.match(source,/if \(networkRecoveryPending && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST\)/);
 assert.match(source,/if \(networkRecoveryPending && player.getPlayerError\(\) == null\) cancelNetworkRecovery\(\)/);
 assert.match(source,/registerDefaultNetworkCallback\(networkCallback\)/);
 assert.match(readFileSync('android/app/src/main/AndroidManifest.xml','utf8'),/android.permission.ACCESS_NETWORK_STATE/);
 const dir=mkdtempSync(join(tmpdir(),'irgun-network-'));
 try {
  const path=join(dir,'NativeNetworkRegression.java');
  writeFileSync(path,`public class NativeNetworkRegression {
   enum PlaybackMode {VIDEO,AUDIO}
   static class PlaybackException {static final int ERROR_CODE_IO_NETWORK_CONNECTION_FAILED=2001,ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT=2002;}
   static class ExoPlayer {long position=24933;boolean wanted=true;int prepares;float volume=0;boolean getPlayWhenReady(){return wanted;}long getCurrentPosition(){return position;}void setVolume(float v){volume=v;}void seekTo(long p){position=p;}void prepare(){prepares++;}void setPlayWhenReady(boolean v){wanted=v;}}
   static class Handler {Runnable pending;void removeCallbacks(Runnable r){if(pending==r)pending=null;}void postDelayed(Runnable r,long delay){pending=r;}}
   static class Log {static void d(String tag,String text){}}
   static final String TAG="test";ExoPlayer player=new ExoPlayer();Handler mainHandler=new Handler();
   String lectureId="lecture",audioUrl="https://api.example/audio/lecture";PlaybackMode playbackMode=PlaybackMode.VIDEO;
   boolean nativeVideoSourceActive=false;
   boolean networkRecoveryPending,networkRecoveryWanted,syncingVideoShadow,externalVideoPlaying=true;float logicalVolume=1;long networkRecoveryPositionMs,networkRecoveryGeneration,externalVideoPositionMs=28690;int networkRecoveryAttempts;Runnable networkRecoveryRunnable;
   void suppressVideoMirrorCallbacks(){}void setCandidateAudioFocus(boolean value){}void publishNativeState(){}void refreshMediaNotification(){}
   ${methods}
   static void require(boolean value,String message){if(!value)throw new AssertionError(message);}
   void run(){Runnable task=mainHandler.pending;require(task!=null,"Actual retry must be queued");mainHandler.pending=null;task.run();}
   public static void main(String[] args){
    NativeNetworkRegression s=new NativeNetworkRegression();ExoPlayer engine=s.player;
    require(s.scheduleNetworkRecovery(2001),"Observed Wi-Fi disconnect is recoverable");s.run();
    require(s.player==engine&&s.player.position==28690&&s.player.volume==0&&s.player.wanted,"Video recovery uses its real clock in the same silent shadow");
    require(s.lectureId.equals("lecture")&&s.playbackMode==PlaybackMode.VIDEO,"A network failure cannot clear or replace the visible lecture");
    s.scheduleNetworkRecovery(2001);s.run();s.scheduleNetworkRecovery(2002);s.run();s.scheduleNetworkRecovery(2001);
    require(s.player.prepares==3&&s.mainHandler.pending==null&&s.networkRecoveryPending,"Exhaustion waits for real connectivity; no fake readiness or endless retry");
    s.networkRecoveryAttempts=0;s.queueNetworkRecovery(250);s.run();require(s.player.prepares==4,"Actual network return can restart the bounded retry budget");
    s.cancelNetworkRecovery();s.playbackMode=PlaybackMode.AUDIO;s.player.position=743000;s.player.wanted=true;s.scheduleNetworkRecovery(2001);
    s.networkRecoveryWanted=false;s.run();require(s.player.position==743000&&!s.player.wanted&&s.player.volume==1,"User Pause while disconnected must remain Pause at its saved Audio position");
    s.cancelNetworkRecovery();s.scheduleNetworkRecovery(2001);Runnable stale=s.mainHandler.pending;int before=s.player.prepares;s.cancelNetworkRecovery();stale.run();require(s.player.prepares==before,"Stop cancels old asynchronous recovery");
    s.scheduleNetworkRecovery(2001);stale=s.mainHandler.pending;s.audioUrl="https://api.example/audio/another";stale.run();require(s.player.prepares==before,"Stale callbacks cannot restart another source");s.cancelNetworkRecovery();
    require(!s.scheduleNetworkRecovery(2004)&&!s.scheduleNetworkRecovery(2005),"HTTP/file failures are not fabricated network successes");
    s.audioUrl="file:///private/lecture.mp3";require(!s.scheduleNetworkRecovery(2001),"File corruption cannot be retried as transport failure");
    s.nativeVideoSourceActive=true;s.playbackMode=PlaybackMode.VIDEO;s.player.position=91000;s.player.wanted=true;
    s.scheduleNetworkRecovery(2002);s.networkRecoveryWanted=false;s.run();
    require(s.player==engine&&s.player.position==91000&&!s.player.wanted&&s.player.volume==1,
      "Native Video transport retries the exact engine/clock with audible volume and respects user Pause");
    s.cancelNetworkRecovery();s.player.wanted=true;s.player.position=120000;s.scheduleNetworkRecovery(2001);s.run();
    require(s.player.position==120000&&s.player.wanted&&s.player.volume==1,
      "Native Video recovery must not use stale external Vimeo position or silence native audio");
    System.out.println("passed");
   }
  }`);
  execFileSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',dir,path],{stdio:'pipe'});
  assert.match(execFileSync('java',['-cp',dir,'NativeNetworkRegression'],{encoding:'utf8'}),/passed/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('actual native Home readiness accepts an advancing shadow and rebinds only the session view',()=>{
 const source=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunPlaybackService.java','utf8');
 const begin=source.indexOf('    private void continueBackgroundHandoffIfReady()');
 // Extract only the actual instance methods under test. The production
 // service exposes a separate static bridge with Android dependencies.
 const home=source.slice(begin,source.indexOf('    public static void onBackgroundWebViewStopped()',begin));
 assert.ok(home.includes('private void onBackgroundWebViewStoppedInternal()'),
  'Unit harness must exercise the real stopped-WebView handoff');
 const activity=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/MainActivity.java','utf8');
 const stopped=activity.slice(activity.indexOf('public void onStop()'),activity.indexOf('public void onResume()'));
 assert.match(stopped,/IrgunPlaybackService\.onBackgroundWebViewStopped\(\);/,
  'Activity.onStop must deliver the background WebView-stop signal to Media3');
 const refreshStart=source.indexOf('    private void refreshMediaNotification()');
 const refresh=source.slice(refreshStart,source.indexOf('\n    }\n',refreshStart)+7);
 const callbackStart=source.indexOf('public void onIsPlayingChanged('),callbackEnd=source.indexOf('                @Override',callbackStart);
 assert.match(source.slice(callbackStart,callbackEnd),/if \(isPlaying && pendingBackgroundHandoff\) continueBackgroundHandoffIfReady\(\)/,
  'READY may precede isPlaying: the actual listener must resume the waiting handoff');
 const dir=mkdtempSync(join(tmpdir(),'irgun-native-home-'));
 try {
  const harness=join(dir,'NativeHomeRegression.java');
  writeFileSync(harness,`public class NativeHomeRegression {
   enum PlaybackMode {VIDEO,AUDIO}
   static class Player {static final int STATE_READY=3;long position=735922;boolean playing=true;int seeks;int getPlaybackState(){return STATE_READY;}boolean isPlaying(){return playing;}long getCurrentPosition(){return position;}void seekTo(long value){seeks++;position=value;}}
   static class SessionPlayer extends Player {final Player engine;SessionPlayer(Player p){engine=p;}}
   static class MediaSession {Player view;int rebinds;void setPlayer(Player p){view=p;rebinds++;}}
   static class android {static class os {static class SystemClock {static long now=1800;static long elapsedRealtime(){return now;}}}}
   static class Log {static void d(String tag,String message){}static void w(String tag,String message){}static void w(String tag,String message,Throwable error){}}
   static class IrgunPlaybackPlugin {static int requests;static void requestPauseVimeoForBackground(long id){requests++;}}
   static class Handler {Runnable pending;void postDelayed(Runnable run,long delay){pending=run;}}
   final String TAG="QA";final long DRIFT_LIMIT_MS=750;final Handler mainHandler=new Handler();
   boolean pendingBackgroundHandoff=true,backgroundPauseRequested=false,backgroundWebViewStopped=false;long pendingBackgroundPositionMs=734122,backgroundHandoffStartedMs=0,backgroundHandoffId=11;
   boolean pendingBackgroundWasPlaying=true;float logicalSpeed=1;Player player=new Player(),sessionPlayer;MediaSession mediaSession=new MediaSession();
   PlaybackMode playbackMode=PlaybackMode.VIDEO,sessionPlayerMode=PlaybackMode.VIDEO;int notifications;
   boolean isSessionAdded(MediaSession s){return true;}void addSession(MediaSession s){}void triggerNotificationUpdate(){notifications++;}
   void completeBackgroundHandoffInternal(){pendingBackgroundHandoff=false;playbackMode=PlaybackMode.AUDIO;}
   ${home}
   ${refresh}
   static void require(boolean value,String message){if(!value)throw new AssertionError(message);}
   public static void main(String[] args){
    NativeHomeRegression s=new NativeHomeRegression();Player engine=s.player;
    s.player.playing=false;s.continueBackgroundHandoffIfReady();require(IrgunPlaybackPlugin.requests==0,"Do not transfer to a silent unready source");
    s.player.playing=true;s.continueBackgroundHandoffIfReady();require(s.player.seeks==0,"Observed advancing shadow must not rewind to fixed Home clock");require(IrgunPlaybackPlugin.requests==1,"Ready playing transition must request actual Video pause");
    s.continueBackgroundHandoffIfReady();require(IrgunPlaybackPlugin.requests==1,"No duplicate pause transaction");
    s.mainHandler.pending.run();require(s.playbackMode==PlaybackMode.AUDIO,"The existing bounded suspended-WebView completion stays active");
    s.refreshMediaNotification();require(s.mediaSession.rebinds==1,"Audio authority must refresh controller view");require(((SessionPlayer)s.mediaSession.view).engine==engine,"Rebinding must keep the single actual engine");
    s.refreshMediaNotification();require(s.mediaSession.rebinds==1,"Position ticks must not repeatedly replace the controller view");
    s.playbackMode=PlaybackMode.VIDEO;s.refreshMediaNotification();require(s.mediaSession.rebinds==2,"Video authority must also refresh the real logical view");require(s.player==engine,"No new playback engine");
    s.pendingBackgroundHandoff=true;s.backgroundPauseRequested=false;s.player.position=930000;s.continueBackgroundHandoffIfReady();require(s.player.seeks==1&&s.player.position==734122,"Wrong lecture position is still rejected/corrected");
    // Activity.onStop allows immediate audible takeover only after the actual
    // source is advancing; a stopped but unready shadow must never count as pass.
    s.pendingBackgroundHandoff=true;s.backgroundPauseRequested=false;s.player.position=734122;
    s.player.playing=false;s.onBackgroundWebViewStoppedInternal();
    require(s.pendingBackgroundHandoff&&s.playbackMode==PlaybackMode.VIDEO&&s.backgroundWebViewStopped,
      "Stopping the WebView must not authorize silent/unready audio");
    s.player.playing=true;s.continueBackgroundHandoffIfReady();
    require(s.playbackMode==PlaybackMode.AUDIO&&!s.pendingBackgroundHandoff,
      "Ready native Audio must take over immediately after the Video surface stops");
    s.backgroundWebViewStopped=false;s.onBackgroundWebViewStoppedInternal();
    require(!s.backgroundWebViewStopped,"Unrelated lifecycle stop cannot restart an already completed handoff");
    System.out.println("passed");
   }
  }`);
  execFileSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',dir,harness],{stdio:'pipe'});
  assert.match(execFileSync('java',['-cp',dir,'NativeHomeRegression'],{encoding:'utf8'}),/passed/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('native seek guard rejects the observed 10s to 93s jump with one real-source retry',()=>{
  const dir=mkdtempSync(join(tmpdir(),'irgun-seek-'));
  try {
    const harness=join(dir,'AudioSeekGuardRegression.java');
    writeFileSync(harness,`package org.irgunshiuraitorah.app;
public final class AudioSeekGuardRegression {
  static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
  public static void main(String[] args) {
    AudioSeekGuard guard = new AudioSeekGuard();
    guard.begin(10656, 0);
    require(guard.verify(93204, 9400) == AudioSeekGuard.Decision.RELOAD, "Observed native jump must not count as a successful seek");
    require(guard.targetMs() == 10656, "Retry must use the exact requested position");
    require(guard.verify(10732, 12000) == AudioSeekGuard.Decision.ACCEPT, "Accept only real position after source reload");
    require(guard.verify(98000, 13000) == AudioSeekGuard.Decision.NONE, "Completed seek must not restart later playback");
    guard.begin(10656, 0);
    require(guard.verify(93204, 9400) == AudioSeekGuard.Decision.RELOAD, "First mismatch may retry");
    require(guard.verify(93204, 12000) == AudioSeekGuard.Decision.FAIL, "Persistent mismatch must fail, never loop or fabricate success");
    guard.begin(600000, 0); guard.begin(300000, 1500);
    require(guard.verify(300150, 2000) == AudioSeekGuard.Decision.ACCEPT, "Latest user seek supersedes the previous target");
    guard.begin(600000, 0); guard.clear();
    require(guard.verify(700000, 2000) == AudioSeekGuard.Decision.NONE, "Authority change cancels the old seek");
    guard.begin(10000, 0);
    require(guard.verify(70000, 31000) == AudioSeekGuard.Decision.NONE, "Unrelated later buffering must not replay an expired seek");
    guard.begin(10000, 0); guard.verify(93000, 10000);
    require(guard.verify(93000, 31000) == AudioSeekGuard.Decision.FAIL, "Expired retry must fail explicitly instead of leaving muted playback running");
    System.out.println("Observed seek jump, verified recovery, retry limit, supersession and cancellation passed");
  }
}`);
    execFileSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',dir,
      'android/app/src/main/java/org/irgunshiuraitorah/app/AudioSeekGuard.java',harness],{stdio:'pipe'});
    const output=execFileSync('java',['-cp',dir,'org.irgunshiuraitorah.app.AudioSeekGuardRegression'],{encoding:'utf8'});
    assert.match(output,/passed/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('native Audio authority survives delayed Video callbacks until an explicit Video transaction',()=>{
  const dir=mkdtempSync(join(tmpdir(),'irgun-authority-'));
  try {
    const harness=join(dir,'PlaybackAuthorityRegression.java');
    writeFileSync(harness,`package org.irgunshiuraitorah.app;
public final class PlaybackAuthorityRegression {
  static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
  public static void main(String[] args) {
    PlaybackAuthorityGuard guard = new PlaybackAuthorityGuard();
    require(guard.acceptsVideoUpdate(true), "A new initial Video must be able to start");
    require(!guard.isAudioCommitted(), "A prewarmed Audio snapshot must not describe an Audio authority commit");
    guard.commitAudio();
    require(guard.isAudioCommitted(), "A real Home/Audio transaction must publish its committed owner");
    require(!guard.acceptsVideoUpdate(true), "Delayed Video callback must not mute Audio after Home");
    require(!guard.acceptsVideoUpdate(false), "Non-authoritative updates must not claim Video");
    require(!guard.acceptsVideoUpdate(true), "The Audio owner must survive notification reopening and delays");
    guard.allowVideo();
    require(guard.acceptsVideoUpdate(true), "Explicit synchronized Audio-to-Video commit may change owner");
    require(!guard.isAudioCommitted(), "Committed Video clears Audio ownership in its snapshot");
    guard.commitAudio();
    require(!guard.acceptsVideoUpdate(true), "Rollback must restore the Audio fence");
    guard.allowVideo();
    require(guard.acceptsVideoUpdate(true), "A different lecture may start Video normally");
    System.out.println("Home Audio, delayed callbacks, explicit Video and rollback passed");
  }
}`);
    execFileSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',dir,
      'android/app/src/main/java/org/irgunshiuraitorah/app/PlaybackAuthorityGuard.java',harness],{stdio:'pipe'});
    const output=execFileSync('java',['-cp',dir,'org.irgunshiuraitorah.app.PlaybackAuthorityRegression'],{encoding:'utf8'});
    assert.match(output,/passed/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('native metadata reload preserves the advancing Audio clock and accepted Play or Pause',()=>{
  const dir=mkdtempSync(join(tmpdir(),'irgun-metadata-'));
  try {
    // Compile the actual production method with a controllable player surface.
    // This reproduces the API 36 reload at 659235ms while Audio was at 665219ms.
    const source=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunPlaybackService.java','utf8');
    const method=source.slice(source.indexOf('    private void setLectureInternal('),source.indexOf('    private void ensureAudioMediaItemInternal('));
    assert.ok(method.includes('boolean sameLecture'),'Production native method must be extracted');
    const harness=join(dir,'NativeMetadataRegression.java');
    writeFileSync(harness,`package org.irgunshiuraitorah.app;
public final class NativeMetadataRegression {
  enum PlaybackMode { AUDIO, VIDEO }
  static final class Player { static final int STATE_IDLE=1; }
  static final class Log { static void d(String tag,String text) {} }
  static final String TAG="test";
  static final long DRIFT_LIMIT_MS=750;
  final AudioSeekGuard audioSeekGuard=new AudioSeekGuard();
  final PlaybackAuthorityGuard authorityGuard=new PlaybackAuthorityGuard();
  String lectureId="lecture",audioUrl="https://example.test/audio/lecture";
  String vimeoId,title,speaker,image,mediaKind,sourceId,paidAudioId,trackId,videoSource;
  float logicalSpeed=1,logicalVolume=1;
  boolean syncingVideoShadow;
  boolean nativeVideoSourceActive=false,nativeVideoSelected=false,nativeVideoOfflineAudioActive=false;
  boolean resumeVideoOnForeground=false;
  PlaybackMode playbackMode=PlaybackMode.AUDIO;
  FakePlayer player=new FakePlayer();
  static final class FakePlayer {
    long position=665219;int items=1,state=3,seeks=0,prepares=0;boolean wanted=true;float volume=1;
    void setPlaybackSpeed(float speed) {} void setVolume(float value) {volume=value;}
    void pause() {wanted=false;} void clearMediaItems() {items=0;}
    int getMediaItemCount() {return items;} long getCurrentPosition() {return position;}
    void seekTo(long value) {position=value;seeks++;} int getPlaybackState() {return state;}
    void prepare() {prepares++;state=3;}
  }
  static String cleanStatic(String value) {return value==null?"":value.trim();}
  static float clamp01(float value) {return Math.max(0,Math.min(1,value));}
  void publishNativeState() {} void suppressVideoMirrorCallbacks() {} void setCandidateAudioFocus(boolean committed) {}
  void cancelNetworkRecovery() {}
  void ensureAudioMediaItemInternal(long target) {if(player.items==0){player.items=1;player.position=target;}}
  ${method}
  void load(String id,String url,long position) {
    setLectureInternal(id,id,"Shiur","Speaker","",url,"vimeo","video-audio",id,"","",position,1,1,true);
  }
  static void require(boolean value,String message) {if(!value)throw new AssertionError(message);}
  public static void main(String[] args) {
    NativeMetadataRegression service=new NativeMetadataRegression();service.authorityGuard.commitAudio();
    service.load("lecture",service.audioUrl,659235);
    require(service.player.position==665219 && service.player.seeks==0,"A delayed Video prewarm must not rewind advancing Audio");
    require(service.player.wanted && service.player.volume==1,"Metadata cannot pause or mute the Audio owner");
    service.player.wanted=false;service.player.position=700000;
    service.load("lecture",service.audioUrl,659235);
    require(!service.player.wanted && service.player.position==700000,"An explicit user Pause must remain paused at its actual position");
    service.load("different","https://example.test/audio/different",0);
    require(service.player.items==0 && !service.player.wanted,"Loading a different lecture must still clear the previous source");
    service.playbackMode=PlaybackMode.VIDEO;service.player.state=Player.STATE_IDLE;
    service.load("different",service.audioUrl,659235);
    require(service.player.items==1 && service.player.position==659235 && service.player.volume==0 && service.player.prepares==1,
      "Initial Video must still prepare one muted native shadow at its requested position");
    // Native Media3 HLS is a new opt-in source inside this exact same player.
    // Asynchronous UI metadata refreshes must not replace or rewind it with
    // the old MP3 shadow while the picture is already moving.
    service.nativeVideoSourceActive=true;service.nativeVideoSelected=true;
    service.player.position=1001100;
    int staged=service.player.items,seeks=service.player.seeks;
    service.load("different",service.audioUrl,659235);
    require(service.nativeVideoSourceActive && service.nativeVideoSelected,
      "A same-lecture refresh must preserve native Video ownership");
    require(service.player.items==staged && service.player.position==1001100 &&
      service.player.seeks==seeks,"A native HLS item must never be reloaded/rewound by metadata");
    System.out.println("Actual native metadata reload preserves Audio progress and intent; native Video source is safe; all checks passed");
  }
}`);
    execFileSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',dir,
      'android/app/src/main/java/org/irgunshiuraitorah/app/AudioSeekGuard.java',
      'android/app/src/main/java/org/irgunshiuraitorah/app/PlaybackAuthorityGuard.java',harness],{stdio:'pipe'});
    const output=execFileSync('java',['-cp',dir,'org.irgunshiuraitorah.app.NativeMetadataRegression'],{encoding:'utf8'});
    assert.match(output,/passed/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('actual native teardown recovery distinguishes observed focus loss from user Pause and another source',()=>{
  const dir=mkdtempSync(join(tmpdir(),'irgun-teardown-'));
  try {
    const source=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunPlaybackService.java','utf8');
    const start=source.indexOf('    private void restoreAudioAfterVideoTeardownInternal(');
    const method=source.slice(start,source.indexOf('    public static void restoreAudioAfterVideoTeardown(',start));
    assert.ok(start>=0&&method.includes('player.play()'));
    const path=join(dir,'NativeTeardownRegression.java');
    writeFileSync(path,`package org.irgunshiuraitorah.app;
public final class NativeTeardownRegression {
  enum PlaybackMode { AUDIO, VIDEO }
  static final class Player {
    static final int PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS=2;
    boolean wanted; int plays; boolean getPlayWhenReady(){return wanted;}
    void play(){wanted=true;plays++;}
  }
  static final class Log {static void d(String tag,String message){}}
  final String TAG="QA"; Player player=new Player(); String lectureId="lecture";
  PlaybackMode playbackMode=PlaybackMode.AUDIO; int lastPlayIntentReason=2;
  static String cleanStatic(String value){return value==null?"":value.trim();}
  ${method}
  static void require(boolean value,String message){if(!value)throw new AssertionError(message);}
  public static void main(String[] args) {
    NativeTeardownRegression s=new NativeTeardownRegression();
    s.restoreAudioAfterVideoTeardownInternal("lecture");
    require(s.player.plays==1&&s.player.wanted,"Observed focus-loss stop must resume the same Audio without seeking");
    s.restoreAudioAfterVideoTeardownInternal("lecture");require(s.player.plays==1,"Playing Audio must not restart");
    s.player.wanted=false;s.lastPlayIntentReason=1;
    s.restoreAudioAfterVideoTeardownInternal("lecture");require(s.player.plays==1&&!s.player.wanted,"Subsequent user/notification Pause must stay paused");
    s.lastPlayIntentReason=2;s.lectureId="different";
    s.restoreAudioAfterVideoTeardownInternal("lecture");require(s.player.plays==1,"Closing the old decoder cannot play another lecture");
    s.lectureId="lecture";s.playbackMode=PlaybackMode.VIDEO;
    s.restoreAudioAfterVideoTeardownInternal("lecture");require(s.player.plays==1,"A Video owner cannot gain duplicate native sound");
    s.restoreAudioAfterVideoTeardownInternal(null);s.player=null;
    s.restoreAudioAfterVideoTeardownInternal("lecture");
    System.out.println("Actual native focus-loss repair, user Pause, source supersession and duplicate-sound guards passed");
  }
}`);
    execFileSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',dir,path],{stdio:'pipe'});
    assert.match(execFileSync('java',['-cp',dir,'org.irgunshiuraitorah.app.NativeTeardownRegression'],{encoding:'utf8'}),/passed/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('actual native source replacement prevents the observed deleted-MP3 seek while preserving Video and paused Audio',()=>{
  const dir=mkdtempSync(join(tmpdir(),'irgun-offline-source-'));
  try {
    const source=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunPlaybackService.java','utf8');
    const start=source.indexOf('    private boolean replaceOfflineAudioSourceInternal(');
    const method=source.slice(start,source.indexOf('    public static boolean replaceOfflineAudioSourceNow(',start));
    assert.ok(start>=0&&method.includes('player.clearMediaItems()'));
    const path=join(dir,'OfflineSourceRegression.java');
    writeFileSync(path,`package org.irgunshiuraitorah.app;
public final class OfflineSourceRegression {
  enum PlaybackMode { AUDIO, VIDEO }
  static final class Uri {String scheme;static Uri parse(String value){Uri u=new Uri();u.scheme=java.net.URI.create(value).getScheme();return u;}String getScheme(){return scheme;}}
  static final class Log {static void d(String tag,String message){}}
  static final class Player {
    String uri="file:///private/lecture.mp3";long position=12000;boolean wanted=true;float volume=0;int items=1;
    long getCurrentPosition(){return position;}boolean getPlayWhenReady(){return wanted;}
    void clearMediaItems(){items=0;}void setVolume(float value){volume=value;}void prepare(){}
    void setPlayWhenReady(boolean value){wanted=value;}
    void seekTo(long value){if(uri.startsWith("file:"))throw new AssertionError("ERROR_CODE_IO_FILE_NOT_FOUND after deletion");position=value;}
  }
  final String TAG="QA";Player player=new Player();String audioUrl=player.uri;
  long externalVideoPositionMs=201465;boolean externalVideoPlaying=true,syncingVideoShadow=false,focus;
  boolean nativeVideoSourceActive=false,nativeVideoOfflineAudioActive=false;
  String nativeVideoNetworkAudioUrl="";
  PlaybackMode playbackMode=PlaybackMode.VIDEO;float logicalVolume=1;
  static String cleanStatic(String s){return s==null?"":s.trim();}
  void suppressVideoMirrorCallbacks(){}void publishNativeState(){}
  void setCandidateAudioFocus(boolean value){focus=value;}
  void ensureAudioMediaItemInternal(long position){player.uri=audioUrl;player.position=position;player.items=1;}
  // Stub ONLY the private native-video handoff which is separately
  // exercised against the complete Android Media3 implementation. In this
  // isolated test the exact production replaceOfflineAudioSourceInternal is
  // injected above; preserve its choice of legacy vs active native source.
  void switchNativeVideoPresentationInternal(boolean showVideo,String local,boolean forceNetworkAudio){
    require(nativeVideoSourceActive&&nativeVideoOfflineAudioActive,
      "Native deletion must operate on the actual active offline source");
    require(!showVideo&&local.isEmpty()&&forceNetworkAudio,
      "Only explicit deletion may force downloaded Audio back to network");
    long position=player.position;boolean wanted=player.wanted;
    audioUrl=nativeVideoNetworkAudioUrl;player.uri=audioUrl;
    player.position=position;player.wanted=wanted;player.volume=logicalVolume;
    nativeVideoOfflineAudioActive=false;playbackMode=PlaybackMode.AUDIO;
  }
  ${method}
  static void require(boolean value,String message){if(!value)throw new AssertionError(message);}
  public static void main(String[] args) {
    String network="https://api.example/audio/lecture";OfflineSourceRegression s=new OfflineSourceRegression();Player same=s.player;
    require(s.replaceOfflineAudioSourceInternal(s.audioUrl,network),"The active offline URI must be replaced before deletion");
    require(s.player==same&&s.player.items==1,"Source replacement must retain exactly one native player/item");
    require(s.playbackMode==PlaybackMode.VIDEO&&s.player.volume==0&&!s.focus,"Background shadow must remain silent while Video owns sound");
    require(s.player.position==201465&&s.player.wanted,"Use the real Video clock and play intent when replacing the shadow source");
    s.player.seekTo(203716);require(s.player.position==203716,"Later HLS/network seek must read HTTPS rather than a deleted MP3");
    require(!s.replaceOfflineAudioSourceInternal("file:///other.mp3",network),"Deleting an unused download must not replace current playback");
    s=new OfflineSourceRegression();s.playbackMode=PlaybackMode.AUDIO;s.player.wanted=false;s.player.position=711560;
    s.replaceOfflineAudioSourceInternal(s.audioUrl,network);
    require(!s.player.wanted&&s.player.position==711560&&s.player.volume==1,"Paused Audio must keep its actual position and Pause intent");
    s=new OfflineSourceRegression();try{s.replaceOfflineAudioSourceInternal(s.audioUrl,"file:///other.mp3");throw new AssertionError("Invalid replacement accepted");}catch(IllegalArgumentException expected){}
    require(s.player.uri.startsWith("file:")&&s.player.items==1,"Invalid replacement must retain the existing saved source");
    // NEW production branch: deleting an MP3 while native HLS/MP4 is active
    // uses a same-ExoPlayer source transition, not the old Vimeo shadow.
    s=new OfflineSourceRegression();s.nativeVideoSourceActive=true;
    s.nativeVideoOfflineAudioActive=true;s.playbackMode=PlaybackMode.AUDIO;
    s.player.position=706200;s.player.wanted=false;s.player.volume=1;
    Player original=s.player;
    require(s.replaceOfflineAudioSourceInternal(s.audioUrl,network),
      "Active native offline Audio must replace its file before unlinking");
    require(s.player==original&&s.player.uri.equals(network)&&
      s.player.position==706200&&!s.player.wanted&&s.player.volume==1&&
      !s.nativeVideoOfflineAudioActive,
      "Native downloaded MP3 deletion must restore network audio in SAME Media3 player without losing Pause/clock");
    System.out.println("Actual offline source swap, post-deletion seek, native Media3 restoration, one player and Pause preservation passed");
  }
}`);
    execFileSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',dir,path],{stdio:'pipe'});
    assert.match(execFileSync('java',['-cp',dir,'org.irgunshiuraitorah.app.OfflineSourceRegression'],{encoding:'utf8'}),/passed/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

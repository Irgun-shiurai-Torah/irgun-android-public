import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

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
    guard.commitAudio();
    require(!guard.acceptsVideoUpdate(true), "Delayed Video callback must not mute Audio after Home");
    require(!guard.acceptsVideoUpdate(false), "Non-authoritative updates must not claim Video");
    require(!guard.acceptsVideoUpdate(true), "The Audio owner must survive notification reopening and delays");
    guard.allowVideo();
    require(guard.acceptsVideoUpdate(true), "Explicit synchronized Audio-to-Video commit may change owner");
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
    System.out.println("Actual native metadata reload preserves Audio progress and intent; new-source staging passed");
  }
}`);
    execFileSync('java',['-m','jdk.compiler/com.sun.tools.javac.Main','-d',dir,
      'android/app/src/main/java/org/irgunshiuraitorah/app/AudioSeekGuard.java',
      'android/app/src/main/java/org/irgunshiuraitorah/app/PlaybackAuthorityGuard.java',harness],{stdio:'pipe'});
    const output=execFileSync('java',['-cp',dir,'org.irgunshiuraitorah.app.NativeMetadataRegression'],{encoding:'utf8'});
    assert.match(output,/passed/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

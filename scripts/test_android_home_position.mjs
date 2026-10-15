import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';

const service=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunPlaybackService.java','utf8');
assert.match(service,/pendingBackgroundPositionMs = BackgroundHandoffPosition\.choose\(/,
  'The real Android service must use the tested clock resolver');
const path='android/app/src/main/java/org/irgunshiuraitorah/app/BackgroundHandoffPosition.java';
const source=readFileSync(path,'utf8');
assert.match(source,/media3ReadyAndPlaying/);

test('actual compiled Java Home handoff preserves fresh native position, rejects large/stale mismatch',()=>{
  const dir=mkdtempSync(join(tmpdir(),'irgun-android-home-'));
  try {
    const file=join(dir,'BackgroundHandoffPositionProbe.java');
    writeFileSync(file,`package org.irgunshiuraitorah.app;
public final class BackgroundHandoffPositionProbe {
  static void expect(long want,long video,long nativeMs,boolean ready,float speed) {
    long actual=BackgroundHandoffPosition.choose(video,nativeMs,ready,speed);
    if(actual!=want)throw new AssertionError("expected "+want+" got "+actual);
  }
  public static void main(String[] args) {
    expect(748605L,746844L,748605L,true,1f);
    expect(100500L,100000L,100500L,true,1f);
    expect(748000L,748000L,746000L,true,1f);
    expect(748000L,748000L,769000L,true,1f);
    expect(748000L,748000L,749600L,false,1f);
    expect(0L,-100L,0L,false,1f);
    expect(505000L,500000L,505000L,true,2f);
    expect(500000L,500000L,507000L,true,2f);
    System.out.println("Android Home position checks passed");
  }
}
`);
    execFileSync('javac',['-d',dir,resolve(path),file],{encoding:'utf8',timeout:30000});
    const output=execFileSync('java',['-cp',dir,'org.irgunshiuraitorah.app.BackgroundHandoffPositionProbe'],{encoding:'utf8',timeout:10000});
    assert.match(output,/checks passed/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('foreground Audio requests cannot pause a Media3 session already committed by Home',async()=>{
  const code=readFileSync('src/main.js','utf8');
  const start=code.indexOf('async function switchVideoToAudioSeamlessly(');
  const end=code.indexOf('\n}\n\nasync function resumeParkedVideoFromAudio(',start);
  assert.ok(start>0&&end>start,'Extract real transition implementation');
  const calls=[];
  const snapshot={mode:'AUDIO',audioAuthorityCommitted:true,lectureId:'lecture',
    audioIsPlaying:true,audioPlayWhenReady:true,audioPositionMs:748605,playbackSpeed:1};
  const state={watchVimeo:{pause(){throw Error('Must not pause existing Media3 audio');}},
    watchVideo:{id:'lecture'},watchMode:'video',nativePlayback:{},watchVideoToAudioHandoff:false,
    watchAudioToVideoHandoff:false,watchAudioToVideoHandoffId:'',watchAudioToVideoTargetSeconds:0};
  const context={state,console,Promise,usesNativeUnifiedAudio:()=>true,
    nativeMediaPlugin:()=>({getState:async()=>snapshot}),
    reconcileNativeWatchAudio:s=>{calls.push(s);state.watchMode='audio';},
    PlaybackController:{loadLecture(){throw Error('Committed audio must not reload');},
      startAudioAt(){throw Error('Committed audio must not be restarted');}}
  };
  runInNewContext(code.slice(start,end+2)+'\nthis.transition=switchVideoToAudioSeamlessly;',context);
  assert.equal(await context.transition({id:'lecture'},'lecture'),true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].audioPlayWhenReady,true);
  assert.equal(state.nativePlayback.audioPlayWhenReady,true);
  assert.equal(state.watchMode,'audio');
});

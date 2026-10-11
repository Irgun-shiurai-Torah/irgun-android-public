import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
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

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitForInitialVideoBuffer} from '../src/android-video-startup-buffer.js';

function media(ahead=0) {
  return {currentTime:30,duration:3600,playbackRate:1,readyState:4,seeking:false,
    buffered:{length:1,start:()=>30,end:()=>30+ahead},setAhead(value){ahead=value;}};
}
test('one- and two-second buffers do not release startup until real six-second buffer exists',async()=>{
  const video=media(1),observed=[];let clock=0;
  const result=await waitForInitialVideoBuffer(video,{now:()=>clock,onSample:s=>observed.push(s.ahead),
    delay:async()=>{clock+=150;video.setAhead(clock<300?2:7);}});
  assert.deepEqual(observed,[1,2,7]);assert.equal(result.ahead,7);assert.equal(video.currentTime,30);
});
test('2x startup requires twelve seconds of real media, while near-end videos require their remainder',async()=>{
  const video=media(12);video.playbackRate=2;
  assert.equal((await waitForInitialVideoBuffer(video)).required,12);
  video.currentTime=3597;video.buffered={length:1,start:()=>3597,end:()=>3600};
  assert.equal((await waitForInitialVideoBuffer(video)).required,3);
});
test('Pause or Home cancellation never reports a ready startup buffer',async()=>{
  const video=media(1);let cancelled=false;
  const result=await waitForInitialVideoBuffer(video,{isCancelled:()=>cancelled,delay:async()=>{cancelled=true;}});
  assert.equal(result,null);assert.equal(video.currentTime,30);
});
test('an exhausted initial buffering wait fails instead of starting from insufficient bytes',async()=>{
  const video=media(1);let clock=0;
  await assert.rejects(waitForInitialVideoBuffer(video,{timeoutMs:300,now:()=>clock,delay:async()=>{clock+=150;}}),/enough to start smoothly/);
  assert.equal(video.currentTime,30);
});

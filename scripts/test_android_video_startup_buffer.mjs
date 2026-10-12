import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bufferedVideoSecondsAhead, waitForInitialVideoBuffer, firstBufferedStartupFrame} from '../src/android-video-startup-buffer.js';

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

test('the actual HLS range beginning at 0.066666 seconds releases real buffered startup without changing time',async()=>{
  const video=media();video.currentTime=0;
  video.buffered={length:1,start:()=>.066666,end:()=>60.013333};
  const result=await waitForInitialVideoBuffer(video);
  assert.ok(result.ahead>59.9);assert.equal(result.required,6);
  assert.equal(video.currentTime,0,'Buffer observation must not manufacture progress');
});
test('a priming gap never counts as buffered bytes and a distant range cannot release startup',async()=>{
  const video=media();video.currentTime=0;
  video.buffered={length:1,start:()=>.066666,end:()=>5.966666};
  assert.ok(Math.abs(bufferedVideoSecondsAhead(video)-5.9)<.000001);
  for(const start of [.066666,1]) {
    video.buffered={length:1,start:()=>start,end:()=>start===1?60:5.966666};
    let clock=0;
    await assert.rejects(waitForInitialVideoBuffer(video,{timeoutMs:300,now:()=>clock,delay:async()=>{clock+=150;}}),/enough to start smoothly/);
  }
  assert.equal(video.currentTime,0);
});

test('aligns only the real first HLS frame before Play, not a distant unbuffered seek',async()=>{
  const video=media();video.currentTime=0;
  video.buffered={length:1,start:()=>.066666,end:()=>12.066666};
  assert.equal(firstBufferedStartupFrame(video),.066666);
  video.currentTime=firstBufferedStartupFrame(video);
  assert.ok((await waitForInitialVideoBuffer(video)).ahead>=6,
    'Alignment must still be backed by real contiguous media bytes');
  assert.equal(video.currentTime,.066666,'Alignment must not jump past the true first buffered frame');
  video.currentTime=0;
  video.buffered={length:1,start:()=>.15,end:()=>60};
  assert.equal(firstBufferedStartupFrame(video),null,'Large gaps must not be treated as tiny encoded-frame priming gaps');
  video.buffered={length:1,start:()=>.066666,end:()=>5.066666};
  assert.equal(firstBufferedStartupFrame(video),null,'Never align based on fewer than six actual buffered seconds');
  video.currentTime=600;
  video.buffered={length:1,start:()=>600.066666,end:()=>630};
  assert.equal(firstBufferedStartupFrame(video),600.066666,'Resuming an HLS lecture must use the same real-frame alignment');
});

test('a seek in progress cannot release initial playback even with six seconds buffered',async()=>{
  const video=media(9);video.seeking=true;let now=0;
  const result=await waitForInitialVideoBuffer(video,{now:()=>now,delay:async()=>{now+=150;video.seeking=false;}});
  assert.ok(result&&result.ahead>=6);
  assert.equal(video.seeking,false,'The first WebView seek must settle before Play');
});

test('MP4 silent prime measures the six real downloaded seconds from original start, not hidden moving decoder',async()=>{
  const video=media(2);video.currentTime=0;
  video.buffered={length:1,start:()=>0,end:()=>2};
  let elapsed=0;
  const samples=[];
  const prepared=await waitForInitialVideoBuffer(video,{
    now:()=>elapsed,
    bufferFromSeconds:()=>0,
    onSample:sample=>samples.push(sample),
    delay:async()=>{
      elapsed+=150;
      // Real muted MP4 playback advances while its buffer end downloads
      // slightly faster. It never has 6s *ahead* of the hidden playhead.
      video.currentTime=elapsed/1000;
      video.buffered={length:1,start:()=>0,end:()=>2+elapsed/1000};
    }
  });
  assert.ok(prepared.ahead>=6,'Playback can prime only once six actual initial media seconds have arrived');
  assert.ok(video.currentTime>0,'Hidden priming playback is allowed to move under its cover');
  assert.ok(bufferedVideoSecondsAhead(video)<6,
    'An unanchored moving-playhead check would have waited forever');
  // The production player pauses and returns to this exact original start
  // before it exposes Video. The same real buffer must still pass the gate.
  video.currentTime=0;
  assert.ok((await waitForInitialVideoBuffer(video)).ahead>=6);
  assert.ok(samples.some(s=>s.ahead<6),'The gate must have observed actual insufficient media before release');
});

import {test} from 'node:test';
import {mediaNotificationControlPoint,settledMediaNotificationControlPoint} from './android-system-ui-observation.mjs';
import assert from 'node:assert/strict';
import {fullscreenEducationTapPoint, mediaNotificationClock, offlineConfirmationTapPoint, settledOfflineConfirmationPoint} from './android-system-ui-observation.mjs';

const node = attributes => '<node package="com.android.systemui" visible="true" ' + attributes + '/>';
test('notification reads actual Android 16 spoken elapsed time, excluding total duration', () => {
  const xml = node('resource-id="com.android.systemui:id/media_progress_bar" class="android.widget.SeekBar" content-desc="12 minutes, 29 seconds of 1 hour, 1 minute, 3 seconds"');
  assert.equal(mediaNotificationClock(xml), 749);
});
test('notification reads hours, singular units and colon formats', () => {
  for (const [value, expected] of [['1 hour, 1 minute, 3 seconds of 2 hours',3663],['1 second of 1 hour',1],['0:00 of 1:01:03',0],['1:01:03 of 2:00:00',3663]]) {
    assert.equal(mediaNotificationClock(node('resource-id="media_progress_bar" content-desc="'+value+'"')),expected);
  }
});
test('notification never substitutes status bar clock or hidden media timer', () => {
  for (const xml of [node('resource-id="clock" text="9:34"'),node('resource-id="elapsedTime" text="12:29"').replace('visible="true"','visible="false"'),node('resource-id="media_progress_bar" content-desc="loading"')]) {
    assert.throws(()=>mediaNotificationClock(xml),/actual Android notification/i);
  }
});
test('notification supports separately visible elapsed-time text', () => {
  assert.equal(mediaNotificationClock(node('resource-id="com.android.systemui:id/elapsedTime" text="12:29"')),749);
});

test('actual Android 11 brightness slider and unlabeled media bar use the visible media elapsed text',()=>{
 const xml=node('resource-id="com.android.systemui:id/slider" class="android.widget.SeekBar" text="Display brightness" content-desc=""')+
   node('resource-id="com.android.systemui:id/media_progress_bar" class="android.widget.SeekBar" content-desc=""')+
   node('resource-id="com.android.systemui:id/media_elapsed_time" text="12:28"')+
   node('resource-id="com.android.systemui:id/media_total_time" text="1:01:03"');
 assert.equal(mediaNotificationClock(xml),748);
 assert.equal(mediaNotificationClock(xml.replace('12:28','12:32')),752);
 assert.throws(()=>mediaNotificationClock(node('resource-id="com.android.systemui:id/slider" class="android.widget.SeekBar" content-desc="12:32"')),
   /elapsed media timer/,'Brightness/status clocks must never masquerade as playback time');
});
test('fullscreen education dismisses only the real identified SystemUI prompt', () => {
  const xml=node('text="Viewing full screen"')+node('text="Got it" clickable="true" bounds="[212,181][296,230]"');
  assert.deepEqual(fullscreenEducationTapPoint(xml),[254,206]);
  assert.equal(fullscreenEducationTapPoint(xml.replaceAll('com.android.systemui','org.irgunshiuraitorah.app')),null);
  assert.equal(fullscreenEducationTapPoint(node('text="Got it" clickable="true" bounds="[212,181][296,230]"')),null);
  assert.equal(fullscreenEducationTapPoint(node('text="Irgun is not responding"')+node('text="Wait" clickable="true"')),null);
});
test('fullscreen education fails for missing actual button geometry', () => {
  assert.throws(()=>fullscreenEducationTapPoint(node('text="Viewing full screen"')),/Got it button/);
});

const offlineDialog = x => '<node package="org.irgunshiuraitorah.app" visible="true" resource-id="android:id/message" text="Remove the saved offline copy?"/>'+
  '<node package="org.irgunshiuraitorah.app" visible="true" resource-id="android:id/button1" text="OK" clickable="true" bounds="['+x+',320]['+(x+64)+',368]"/>';
test('actual offline confirmation requires the correct app, message and positive button',()=>{
  assert.deepEqual(offlineConfirmationTapPoint(offlineDialog(220)),[252,344]);
  assert.equal(offlineConfirmationTapPoint(offlineDialog(220).replaceAll('org.irgunshiuraitorah.app','android')),null);
  assert.equal(offlineConfirmationTapPoint(offlineDialog(220).replace('Remove the saved offline copy?','Different action?')),null);
});
test('physical offline confirmation waits for two consistent observed dialog positions',async()=>{
  const samples=[offlineDialog(220),offlineDialog(215),offlineDialog(215)],waits=[];
  const point=await settledOfflineConfirmationPoint({readHierarchy:()=>samples.shift(),delay:ms=>waits.push(ms)});
  assert.deepEqual(point,[247,344]);assert.deepEqual(waits,[200,200]);
});
test('unstable offline dialog never produces a physical tap target',async()=>{
  let n=0;await assert.rejects(settledOfflineConfirmationPoint({readHierarchy:()=>offlineDialog(n++%2?215:220),delay:async()=>{},samples:4}),/no tap was performed/);
});
test('the observed Android 14 Play icon must never be tapped as notification Pause',()=>{
 const play='<hierarchy><node text="" content-desc="Play" resource-id="com.android.systemui:id/actionPlayPause" package="com.android.systemui" clickable="true" visible="true" bounds="[240,256][288,304]"></node></hierarchy>';
 const pattern=/(?:content-desc="Pause"|resource-id="[^"]*actionPlayPause")/;
 assert.throws(()=>mediaNotificationControlPoint(play,'pause',pattern),/opposite action/);
 const pause=play.replace('content-desc="Play"','content-desc="Pause"');
 assert.deepEqual(mediaNotificationControlPoint(pause,'pause',pattern),[264,280]);
 assert.throws(()=>mediaNotificationControlPoint(pause.replace('com.android.systemui" clickable','org.irgunshiuraitorah.app" clickable'),'pause',pattern),/button must be present/);
});

const mediaButton = (label,x=240) => node('content-desc="'+label+'" resource-id="com.android.systemui:id/actionPlayPause" clickable="true" bounds="['+x+',256]['+(x+48)+',304]"');
test('buffering notification is observed until the real Pause action and its coordinates settle',async()=>{
 const observations=[mediaButton('Connecting'),mediaButton('Play'),mediaButton('Pause',230),mediaButton('Pause'),mediaButton('Pause')];
 const waits=[];
 const point=await settledMediaNotificationControlPoint({readHierarchy:()=>observations.shift(),action:'pause',pattern:/actionPlayPause/,delay:ms=>waits.push(ms)});
 assert.deepEqual(point,[264,280]);assert.deepEqual(waits,[250,250,250,250]);
});
test('notification observation never accepts Play, Connecting or an absent Pause after the bounded deadline',async()=>{
 for(const xml of [mediaButton('Play'),mediaButton('Connecting'),mediaButton('Pause').replace('visible="true"','visible="false"')]){
  let elapsed=0,reads=0;
  await assert.rejects(settledMediaNotificationControlPoint({readHierarchy:()=>{reads++;return xml;},action:'pause',pattern:/actionPlayPause/,now:()=>elapsed,timeoutMs:500,delay:ms=>{elapsed+=ms;}}),/no tap was performed/);
  assert.equal(reads,2);assert.equal(elapsed,500);
 }
});
test('notification hierarchy transport failure remains a failure without repeating an input',async()=>{
 let reads=0;
 await assert.rejects(settledMediaNotificationControlPoint({readHierarchy:()=>{reads++;throw new Error('ADB disconnected');},action:'pause',pattern:/actionPlayPause/,delay:async()=>{}}),/ADB disconnected/);
 assert.equal(reads,1);
});

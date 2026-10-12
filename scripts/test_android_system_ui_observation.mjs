import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fullscreenEducationTapPoint, mediaNotificationClock} from './android-system-ui-observation.mjs';

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

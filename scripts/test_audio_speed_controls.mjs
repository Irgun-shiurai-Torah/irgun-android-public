import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {AUDIO_PLAYBACK_SPEEDS, refreshAudioSpeedControls} from '../src/audio-speed-controls.js';

const app = readFileSync('src/main.js', 'utf8');
const ios = app.includes('async function setAudioPlaybackSpeed(');

test('all open audio views reflect the selected rate without rebuilding controls', () => {
  const buttons = [...AUDIO_PLAYBACK_SPEEDS, ...AUDIO_PLAYBACK_SPEEDS].map(rate => ({
    dataset: {speedChoice: String(rate)}, attrs: {},
    classList: {toggle(name, active) { this.active = active; }},
    setAttribute(name, value) { this.attrs[name] = value; }
  }));
  const labels = [{textContent: '1×'}, {textContent: '1×'}];
  const root = {querySelectorAll: selector => selector === '[data-speed-choice]' ? buttons : labels};
  for (const rate of AUDIO_PLAYBACK_SPEEDS) {
    refreshAudioSpeedControls(root, rate);
    assert.equal(buttons.filter(button => button.attrs['aria-pressed'] === 'true').length, 2);
    assert.ok(buttons.every(button => button.classList.active === (Number(button.dataset.speedChoice) === rate)));
    assert.ok(labels.every(label => label.textContent === `${rate}×`));
  }
});

function fixture({native = true, reject = false, paused = false} = {}) {
  const state = {playbackSpeed: 1, watchMode: 'audio', current: {id: 'lecture'}};
  const calls = [], saved = new Map();
  const audio = {playbackRate: 1, currentTime: 613, paused};
  const engine = {rate: 1, position: 613, paused};
  const changeRate = async rate => {
    calls.push(rate);
    if (reject) throw Error('Native rate command failed');
    engine.rate = rate;
  };
  const context = {state, audio, SPEED_KEY: 'speed',
    localStorage: {setItem: (key, value) => saved.set(key, value)},
    document: {querySelectorAll: () => []}, refreshAudioSpeedControls,
    iosNativeActive: () => native, iosUnified: {speed: changeRate},
    usesNativeUnifiedAudio: () => native,
    nativeMediaPlugin: () => ({setSpeed: ({rate}) => changeRate(rate)}),
    Capacitor: {getPlatform: () => native ? 'android' : 'web'}};
  let source;
  if (ios) {
    const start = app.indexOf('async function setAudioPlaybackSpeed(');
    source = app.slice(start, app.indexOf('\nfunction bind()', start)) + '\nthis.change = setAudioPlaybackSpeed;';
  } else {
    const start = app.indexOf('  async setSpeed(rate) {');
    source = 'this.controller = {' + app.slice(start, app.indexOf('\n  async setPresentation(', start)) + '}; this.change = rate => controller.setSpeed(rate);';
  }
  runInNewContext(source, context);
  return {state, calls, saved, audio, engine, change: context.change};
}

for (const paused of [true, false]) test(`native audio rate changes preserve position and ${paused ? 'paused' : 'playing'} state`, async () => {
  const f = fixture({paused});
  for (const rate of AUDIO_PLAYBACK_SPEEDS) {
    await f.change(rate);
    assert.equal(f.engine.rate, rate);
    assert.equal(f.engine.position, 613);
    assert.equal(f.engine.paused, paused);
    assert.equal(f.state.playbackSpeed, rate);
    assert.equal(f.saved.get('speed'), String(rate));
    assert.equal(f.audio.playbackRate, 1, 'Native speed cannot start or control a second HTML player');
  }
  assert.deepEqual(f.calls, AUDIO_PLAYBACK_SPEEDS);
});

test('a rejected native rate does not save or display a speed that was never applied', async () => {
  const f = fixture({reject: true});
  await assert.rejects(f.change(1.75), /Native rate command failed/);
  assert.equal(f.state.playbackSpeed, 1);
  assert.equal(f.engine.rate, 1);
  assert.equal(f.saved.size, 0);
});

test('browser audio fallback changes rate without seeking or resuming paused audio', async () => {
  const f = fixture({native: false, paused: true});
  await f.change(1.25);
  assert.equal(f.audio.playbackRate, 1.25);
  assert.equal(f.audio.currentTime, 613);
  assert.equal(f.audio.paused, true);
  assert.equal(f.calls.length, 0);
});

if (!ios) test('Android native video speed is retained for audio; idle defaults cannot overwrite it', () => {
  const f = fixture();
  const context = {state: f.state, SPEED_KEY: 'speed',
    localStorage: {setItem: (key, value) => f.saved.set(key, value)}, refreshAndroidPlayerSpeedChoices() {}};
  const start = app.indexOf('function syncNativePlaybackSpeed(');
  runInNewContext(app.slice(start, app.indexOf('\nconst PlaybackController', start)), context);
  context.syncNativePlaybackSpeed({lectureId: 'lecture', playbackSpeed: 1.75});
  assert.equal(f.state.playbackSpeed, 1.75);
  assert.equal(f.saved.get('speed'), '1.75');
  context.syncNativePlaybackSpeed({lectureId: '', playbackSpeed: 1});
  context.syncNativePlaybackSpeed({lectureId: 'lecture', playbackSpeed: Infinity});
  assert.equal(f.state.playbackSpeed, 1.75);
});

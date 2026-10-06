import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAndroidHlsPlayer } from '../src/android-hls-video.js';

class Element extends EventTarget {
  constructor(tag) {
    super(); this.tagName = tag; this.children = []; this.nodes = new Map();
    this.classList = { add(){}, remove(){}, contains(){return false;}, toggle(){} };
    this.style = { setProperty(){}, removeProperty(){} };
    this.readyState = 1; this.duration = 3663; this.currentTime = 0; this.paused = true; this.volume = 1;
  }
  setAttribute(){} removeAttribute(){} load(){} pause(){this.paused = true;}
  play(){this.paused = false; return Promise.resolve();}
  canPlayType(){return 'maybe';}
  appendChild(child){child.parentElement = this; this.children.push(child);}
  insertBefore(child){this.appendChild(child);}
  querySelector(selector){if(!this.nodes.has(selector)) this.nodes.set(selector, new Element('button')); return this.nodes.get(selector);}
  replaceWith(child){child.parentElement = this.parentElement;}
}
async function fixture(descriptor, videoId = '1182395717', resumeSeconds = 0) {
  const original = { document:globalThis.document, window:globalThis.window, fetch:globalThis.fetch };
  const calls = [];
  const doc = new EventTarget(); doc.createElement = tag => new Element(tag); doc.body = new Element('body');
  globalThis.document = doc;
  globalThis.window = {Hls:{isSupported:()=>false}};
  globalThis.fetch = async url => {calls.push(url);return {ok:true,json:async()=>descriptor};};
  const iframe = new Element('iframe'); new Element('div').appendChild(iframe);
  try {
    const player = await createAndroidHlsPlayer({apiBase:'https://api.example.test',platform:'android',videoId,iframe,resumeSeconds});
    await player.ready();
    return { source:player.getSourceType(), url:player.getVideoElement().src, position:await player.getCurrentTime(), paused:await player.getPaused(), calls };
  } finally {
    Object.assign(globalThis,original);
  }
}
for (const id of ['1182395717','drivev-example']) test(`MP4-only shiur ${id} starts in the direct player`,async()=>{
  const r = await fixture({video:{hls:null,mp4:'https://media.example.test/video.mp4'}},id,42);
  assert.equal(r.source,'mp4');assert.equal(r.url,'https://media.example.test/video.mp4');
  assert.equal(r.position,42);assert.equal(r.paused,true);assert.equal(r.calls.length,1);
});
test('HLS remains the preferred source when both sources exist',async()=>{
  const r = await fixture({video:{hls:'https://media.example.test/master.m3u8',mp4:'https://media.example.test/video.mp4'}});
  assert.equal(r.source,'hls');assert.equal(r.url,'https://media.example.test/master.m3u8');
});
test('no direct source still rejects so the existing Vimeo fallback can run',async()=>{
  await assert.rejects(fixture({video:{hls:null,mp4:null}}),/No HLS or MP4 source is ready/);
});

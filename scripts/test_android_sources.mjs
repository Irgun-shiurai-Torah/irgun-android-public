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

const {vimeoEmbedSource} = await import('../src/vimeoEmbed.js');
test('actual unlisted Vimeo ID preserves its privacy hash separately',()=>{
  const url = new URL(vimeoEmbedSource('1233236785:585d5d53db'));
  assert.equal(url.pathname,'/video/1233236785');
  assert.equal(url.searchParams.get('h'),'585d5d53db');
  assert.ok(url.search.startsWith('?h=585d5d53db&'));
});
test('public Vimeo embeds keep their existing options',()=>{
  assert.equal(vimeoEmbedSource('1182395717'),'https://player.vimeo.com/video/1182395717?playsinline=1&autoplay=1&title=0&byline=0&portrait=0');
});
test('unlisted embeds retain resume position and audio handoff mute',()=>{
  const url = new URL(vimeoEmbedSource('1233236785:585d5d53db',{resumeSeconds:42.9,muted:true}));
  assert.equal(url.searchParams.get('h'),'585d5d53db');
  assert.equal(url.searchParams.get('muted'),'1');assert.equal(url.hash,'#t=42s');
});
test('invalid Vimeo IDs never turn into a different numeric video',()=>{
  assert.equal(vimeoEmbedSource('drivev-123'),'about:blank');
  assert.equal(vimeoEmbedSource('123:bad/hash'),'about:blank');
});

// Exercise the production host lifecycle with an old-WebView DOM surface that
// deliberately has no replaceChildren, while keeping the same iframe identity.
const {readFileSync} = await import('node:fs');
const {runInNewContext} = await import('node:vm');
const mainSource = readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function hostFixture() {
  class Node {
    constructor(){this.children=[];this.classList={remove(){},toggle(){}};}
    set textContent(value){assert.equal(value,'');for(const child of this.children)child.parentElement=null;this.children=[];}
    appendChild(child){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(c=>c!==child);child.parentElement=this;this.children.push(child);}
    querySelector(selector){return selector==='.watch-overlay'?this.children.find(c=>c===overlay)||null:selector==='#watchVimeoFrame'?this.children.includes(overlay)?iframe:null:null;}
  }
  const mount=new Node(),app=new Node(),overlay=new Node(),iframe={};app.appendChild(overlay);
  const state={watchVideo:{id:'1233236785:585d5d53db'},watchMode:'video'};
  const presentations=[];
  const context={persistentVideoMount:mount,state,document:{body:new Node(),querySelector:()=>app.children.includes(overlay)?overlay:null},bindPersistentVideoChrome(){},PlaybackController:{setPresentation:async mode=>presentations.push(mode)}};
  const extract=(name,next)=>mainSource.slice(mainSource.indexOf(`function ${name}(`),mainSource.indexOf(next,mainSource.indexOf(`function ${name}(`)));
  runInNewContext(extract('clearPersistentVideoMount','function refreshPersistentMiniVideoChrome')+extract('hostCurrentWatchOverlay','async function resetWatchVimeoPlayer')+'\nthis.host=hostCurrentWatchOverlay;this.clear=clearPersistentVideoMount;',context);
  return {mount,overlay,state,iframe,presentations,host:context.host,clear:context.clear};
}
test('old Android WebView hosts full/mini video without rebuilding its iframe',()=>{
  const f=hostFixture();assert.equal(f.mount.replaceChildren,undefined);
  assert.equal(f.host('full'),true);assert.equal(f.mount.children[0],f.overlay);
  assert.equal(f.host('mini'),true);assert.equal(f.mount.children[0],f.overlay);
  assert.equal(f.mount.querySelector('#watchVimeoFrame'),f.iframe);
  assert.equal(f.state.watchMinimized,true);assert.deepEqual(f.presentations,['FULL','MINI']);
});
test('old Android WebView clears the persistent host on close',()=>{
  const f=hostFixture();f.host('full');f.clear();
  assert.equal(f.mount.children.length,0);assert.equal(f.overlay.parentElement,null);assert.equal(f.state.watchHostedExternally,false);
});

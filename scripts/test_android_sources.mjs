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

function handoffFixture({movingClock=true,movingFrames=true,paused=false,focusStopped=false}={}) {
  let now=0, position=600, frames=100;
  const state={watchAudioToVideoHandoff:true,watchAudioToVideoHandoffId:'lecture',watchMode:'video',
    watchAudioToVideoTargetSeconds:600,watchVideo:{id:'lecture'},
    nativePlayback:{mode:'AUDIO',audioIsPlaying:!focusStopped,audioPlayWhenReady:!focusStopped}};
  const element={paused,seeking:false,readyState:4,videoWidth:1920,getVideoPlaybackQuality:()=>({totalVideoFrames:frames})};
  const player={getCurrentTime:async()=>position,getPaused:async()=>element.paused,getVideoElement:()=>element,
    setCurrentTime:async n=>{position=n;return n;}};
  const context={state,console:{warn(){}},Date:{now:()=>now},usesNativeUnifiedAudio:()=>true,
    playbackPositionSeconds:()=>600+(focusStopped?0:now/1000),
    setTimeout:callback=>{now+=350;if(movingClock&&!paused)position+=.35;if(movingFrames&&!paused)frames+=10;callback();}};
  const start=mainSource.indexOf('async function waitForVimeoHandoffReady(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('function videoAudioPlaybackItem(',start))+'\nthis.wait=waitForVimeoHandoffReady;',context);
  return {state,player,wait:context.wait};
}
test('Audio handoff rejects an advancing clock with frozen decoded frames',async()=>{
  const f=handoffFixture({movingFrames:false});assert.equal(await f.wait(f.player,'lecture',800),null);
});
test('Audio handoff rejects a stationary destination and preserves explicit Pause',async()=>{
  for(const options of [{movingClock:false,movingFrames:false},{paused:true}]){
    const f=handoffFixture(options);assert.equal(await f.wait(f.player,'lecture',800),null);
  }
});
test('Audio handoff accepts a synchronized destination only after clocks and frames advance',async()=>{
  const f=handoffFixture();assert.ok(await f.wait(f.player,'lecture',800)>600);
});
test('MP4 handoff waits for the following byte range before transferring sound',async()=>{
  for(const [ahead,expected] of [[1,false],[15,true]]) {
    const f=handoffFixture();const element=f.player.getVideoElement();element.duration=3663;
    element.buffered={length:1,start:()=>590,end:()=>600+ahead};f.player.getSourceType=()=> 'mp4';
    const position=await f.wait(f.player,'lecture',800);
    assert.equal(position!=null,expected);
  }
});
test('MP4 handoff near the end does not require buffer beyond the lecture',async()=>{
  const f=handoffFixture();const element=f.player.getVideoElement();element.duration=605;
  element.buffered={length:1,start:()=>590,end:()=>605};f.player.getSourceType=()=> 'mp4';
  assert.ok(await f.wait(f.player,'lecture',800)>600);
});
test('MP4 buffers without rewinding to an Audio clock stopped by WebView focus',async()=>{
  const f=handoffFixture({focusStopped:true});const element=f.player.getVideoElement();element.duration=3663;
  element.buffered={length:1,start:()=>590,end:()=>element.framesReady?620:601};
  f.player.getSourceType=()=> 'mp4';
  const originalRead=f.player.getCurrentTime;let reads=0,seeks=0;
  f.player.getCurrentTime=async()=>{if(++reads>12)element.framesReady=true;return originalRead();};
  const originalSeek=f.player.setCurrentTime;
  f.player.setCurrentTime=async n=>{seeks++;return originalSeek(n);};
  assert.ok(await f.wait(f.player,'lecture',8000)>601);
  assert.equal(seeks,0,'Do not restart byte-range downloads by rewinding the advancing picture');
});
test('cancelled native handoff cannot masquerade as a completed transfer',async()=>{
  const f=handoffFixture();f.state.watchAudioToVideoHandoff=false;
  assert.equal(await f.wait(f.player,'lecture',800),null);
});
test('live Audio callbacks keep the destination visible while handoff buffers',()=>{
  const state={watchVideo:{id:'lecture'},watchMode:'video',watchAudioToVideoHandoff:true,watchAudioToVideoHandoffId:'lecture',
    playbackAuthorityFence:{mode:'VIDEO',lectureId:'lecture',expiresAt:Date.now()+5000}};
  const context={state,Date,videoId:v=>v.id,ensureNativeAudioCurrentForWatch(){throw Error('unexpected reconciliation');}};
  const extract=(name,next)=>mainSource.slice(mainSource.indexOf(`function ${name}(`),mainSource.indexOf(next,mainSource.indexOf(`function ${name}(`)));
  runInNewContext(extract('reconcileNativeWatchAudio','const PlaybackController =')+extract('nativeSnapshotConflicts','function nativeAudioPositionSeconds')+'\nthis.reconcile=reconcileNativeWatchAudio;this.conflicts=nativeSnapshotConflicts;',context);
  const snapshot={mode:'AUDIO',lectureId:'lecture',currentPositionMs:601000};
  assert.equal(context.conflicts(snapshot),false);context.reconcile(snapshot);assert.equal(state.watchMode,'video');
});

function resumeFixture({ready=600.35,commitFails=false,focusStopped=false}={}) {
  const item={id:'lecture'};
  const state={current:item,watchResumeSeconds:600,nativePlayback:{mode:'AUDIO'},playbackSpeed:1};
  const events=[];
  const player={getCurrentTime:async()=>600,setPlaybackRate:async()=>{},play:()=>new Promise(()=>{}),pause:async()=>events.push('pause')};
  state.watchVimeo=player;
  const context={state,console:{debug(){},warn(){}},setTimeout(){},usesNativeUnifiedAudio:()=>true,
    playbackPositionSeconds:()=>600,setVimeoHandoffMuted:async(_,muted)=>events.push(muted?'mute':'unmute'),
    waitForVimeoHandoffReady:async()=>{events.push('verify');return ready;},
    finishAudioToVideoHandoff:async()=>{events.push('commit');state.current=null;state.nativePlayback.mode='VIDEO';if(commitFails)throw Error('native error');return true;},
    nativeMediaPlugin:()=>({getState:async()=>({...state.nativePlayback,audioPositionMs:603000,audioPlayWhenReady:!focusStopped})}),
    setPlaybackAuthorityFence:mode=>events.push(mode),
    PlaybackController:{startAudioAt:async(position,playing,options)=>{events.push({position,playing,volume:options.volume});state.nativePlayback.mode='AUDIO';}},
    refreshPersistentMiniVideoChrome(){},videoAudioPlaybackItem:()=>item};
  const start=mainSource.indexOf('async function resumeParkedVideoFromAudio(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('function watchHtml(',start))+'\nthis.resume=resumeParkedVideoFromAudio;',context);
  return {state,item,events,resume:()=>context.resume({duration:3663},'lecture',true)};
}
test('pending WebView play promise does not abort a destination with moving frames',async()=>{
  const f=resumeFixture();assert.equal(await f.resume(),true);
  assert.ok(f.events.indexOf('verify')<f.events.indexOf('commit'));
});
test('failed readiness keeps the current Audio item and never commits VIDEO',async()=>{
  const f=resumeFixture({ready:null});assert.equal(await f.resume(),false);
  assert.equal(f.state.current,f.item);assert.equal(f.state.nativePlayback.mode,'AUDIO');assert.ok(!f.events.includes('commit'));
});
test('partial native commit rolls back to audible Audio at its advancing shadow position',async()=>{
  const f=resumeFixture({commitFails:true});assert.equal(await f.resume(),false);
  assert.equal(f.state.current,f.item);assert.equal(f.state.nativePlayback.mode,'AUDIO');
  assert.deepEqual(f.events.find(e=>typeof e==='object'),{position:603,playing:true,volume:1});
  assert.ok(f.events.lastIndexOf('mute')<f.events.indexOf('AUDIO'));
});
test('failed preparation restarts Audio if muted WebView playback took its focus',async()=>{
  const f=resumeFixture({ready:null,focusStopped:true});assert.equal(await f.resume(),false);
  assert.equal(f.state.current,f.item);assert.ok(!f.events.includes('commit'));
  assert.deepEqual(f.events.find(e=>typeof e==='object'),{position:603,playing:true,volume:1});
});

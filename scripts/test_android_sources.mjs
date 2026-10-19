import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAndroidHlsPlayer } from '../src/android-hls-video.js';
import { audioDownloadPath, isPlausibleOfflineAudio, minimumOfflineAudioBytes } from '../src/offline-validation.js';
import { downloadOfflineAudio } from '../src/offline-download.js';
import {preserveAndroidPlayerSheetScroll} from '../src/android-player-controls.js';

class Element extends EventTarget {
  constructor(tag) {
    super(); this.tagName = tag; this.children = []; this.nodes = new Map(); this.dataset = {};
    this.classList = { add(){}, remove(){}, contains(){return false;}, toggle(){} };
    this.style = { setProperty(){}, removeProperty(){} };
    this.readyState = 4; this.duration = 3663;
    this.buffered = {length:1,start:()=>0,end:()=>this.duration}; this.currentTime = 0; this.paused = true; this.volume = 1; this.muted = false;
  }
  setAttribute(){} removeAttribute(){} load(){} pause(){this.paused = true;}
  add(){}
  play(){this.paused = false; return Promise.resolve();}
  canPlayType(){return 'maybe';}
  appendChild(child){child.parentElement = this; this.children.push(child);}
  insertBefore(child){this.appendChild(child);}
  querySelector(selector){if(!this.nodes.has(selector)) this.nodes.set(selector, new Element('button')); return this.nodes.get(selector);}
  replaceWith(child){child.parentElement = this.parentElement;}
}
async function fixture(descriptor, videoId = '1182395717', resumeSeconds = 0, {nativeHls = true, Hls, onReady, isPictureInPicture, fetchSource} = {}) {
  const original = { document:globalThis.document, window:globalThis.window, fetch:globalThis.fetch, Option:globalThis.Option };
  const calls = [];
  const doc = new EventTarget(); doc.createElement = tag => {
    const element = new Element(tag);
    if (tag === 'video') element.canPlayType = () => nativeHls ? 'maybe' : '';
    return element;
  }; doc.body = new Element('body');
  globalThis.document = doc;
  globalThis.window = {Hls:Hls || {isSupported:()=>false}};
  globalThis.Option = class {};
  globalThis.fetch = async url => {calls.push(url);return fetchSource ? fetchSource(url,calls.length) : {ok:true,json:async()=>descriptor};};
  const iframe = new Element('iframe'); new Element('div').appendChild(iframe);
  let player;
  try {
    player = await createAndroidHlsPlayer({apiBase:'https://api.example.test',platform:'android',videoId,iframe,resumeSeconds,isPictureInPicture});
    await player.ready();
    if (onReady) await onReady(player);
    return { source:player.getSourceType(), url:player.getVideoElement().src, position:await player.getCurrentTime(), paused:await player.getPaused(), calls };
  } finally {
    // Dispose the real player's watchdog before restoring the mocked DOM.
    // Leaving it alive prevents node --test from exiting and blocks the APK jobs.
    await player?.destroy();
    Object.assign(globalThis,original);
  }
}
test('Android range tap commits a real HLS seek on pointerup without waiting for change',async()=>{
  const r=await fixture({video:{hls:'https://media.example.test/master.m3u8',mp4:null}},'1182395717',42,{
    onReady:async player=>{
      const video=player.getVideoElement();
      const controls=video.parentElement.children.find(child=>child.className==='watch-hls-controls');
      assert.ok(controls,'Real player controls must exist');
      const slider=controls.querySelector('[data-hls-seek]');
      slider.getBoundingClientRect=()=>({left:10,width:200});
      video.duration=3600;
      slider.dispatchEvent(new Event('pointerdown'));
      const event=new Event('pointerup');
      Object.defineProperty(event,'clientX',{value:10+8+184*.3});
      slider.dispatchEvent(event);
      assert.ok(video.currentTime>1070&&video.currentTime<1090,'Pointer seek must change the actual media clock without a change event');
      assert.equal(video.dataset.hlsSeekOrigin,'pointer');
      assert.ok(Math.abs(Number(video.dataset.hlsSeekRequestedSeconds)-1080)<1);
      slider.value='500';
      slider.dispatchEvent(new Event('change'));
      assert.ok(video.currentTime>1799&&video.currentTime<1801,'Native range change must remain accessible for keyboards');
    }
  });
  assert.ok(r.position>1799&&r.position<1801);
});
for (const id of ['1182395717','drivev-example']) test(`MP4-only shiur ${id} starts in the direct player`,async()=>{
  const r = await fixture({video:{hls:null,mp4:'https://media.example.test/video.mp4'}},id,42);
  assert.equal(r.source,'mp4');assert.equal(r.url,'https://media.example.test/video.mp4');
  assert.equal(r.position,42);assert.equal(r.paused,true);assert.equal(r.calls.length,1);
});
test('transient source.json network error retries once before any Video stage is created',async()=>{
  const desc={video:{hls:'https://media.example.test/master.m3u8',mp4:'https://media.example.test/video.mp4'}};
  let attempts=0;
  const r=await fixture(desc,'1182395717',42,{fetchSource:async url=>{
    attempts++;
    if(attempts===1) {
      const error=new Error('The user aborted a request.');error.name='AbortError';throw error;
    }
    return {ok:true,json:async()=>desc};
  }});
  assert.equal(attempts,2,'A temporary timeout receives exactly one retry');
  assert.equal(r.calls.length,2);
  assert.ok(r.calls[1].includes('?retry='),'Second lookup must bypass stale request caches');
  assert.equal(r.source,'hls','Successful retry must retain direct HLS playback');
  assert.equal(r.paused,true,'Descriptor retry must not start audio or media more than once');
});
test('permanent missing video source does not retry or restart playback',async()=>{
  let attempts=0;
  await assert.rejects(fixture({},'1182395717',0,{
    fetchSource:async()=>{
      attempts++;
      return {ok:false,status:404,json:async()=>({})};
    }
  }),/Video sources unavailable \(404\)/);
  assert.equal(attempts,1,'A permanent HTTP 404 is not a temporary network failure');
});
test('HLS remains the preferred source when both sources exist',async()=>{
  const r = await fixture({video:{hls:'https://media.example.test/master.m3u8',mp4:'https://media.example.test/video.mp4'}});
  assert.equal(r.source,'hls');assert.equal(r.url,'https://media.example.test/master.m3u8');
});
test('unplayable HLS uses the direct MP4 before Vimeo fallback',async()=>{
  const r = await fixture({video:{hls:'https://media.example.test/master.m3u8',mp4:'https://media.example.test/video.mp4'}},'1233236785:585d5d53db',0,{nativeHls:false});
  assert.equal(r.source,'mp4');assert.equal(r.url,'https://media.example.test/video.mp4');
});
test('no direct source still rejects so the existing Vimeo fallback can run',async()=>{
  await assert.rejects(fixture({video:{hls:null,mp4:null}}),/No HLS or MP4 source is ready/);
});

class RecoveringHls {
  static Events = {MANIFEST_PARSED:'manifest',ERROR:'error'};
  static ErrorTypes = {MEDIA_ERROR:'media',NETWORK_ERROR:'network'};
  static isSupported(){return true;}
  constructor(){RecoveringHls.current=this;this.levels=[];this.listeners=new Map();this.starts=0;}
  attachMedia(){} loadSource(){} stopLoad(){} destroy(){}
  startLoad(){this.starts++;}
  on(name,callback){this.listeners.set(name,callback);if(name==='manifest')queueMicrotask(callback);}
  emitError(){this.listeners.get('error')?.('error',{fatal:true,type:'other',details:'test decoder failure'});}
}
const settleRecovery = async () => {for(let i=0;i<8;i++)await Promise.resolve();};
const recoverySources = {video:{hls:'https://media.example.test/master.m3u8',mp4:'https://media.example.test/video.mp4'}};
test('frozen HLS catch-up retargets one fragment without rebuilding the video or stopping audio',async()=>{
  await fixture(recoverySources,'1233236785:585d5d53db',600,{Hls:RecoveringHls,onReady:async player=>{
    const video=player.getVideoElement(),engine=RecoveringHls.current;
    assert.equal(await player.retargetStalledHandoff(618),false,'An intentionally paused decoder must never be woken by a stale handoff');
    video.paused=false;video.currentTime=606;video.buffered={length:1,start:()=>600,end:()=>607};
    const original=video;
    assert.equal(await player.retargetStalledHandoff(618),true,'One stalled unbuffered handoff may request the actual Audio clock');
    assert.equal(video.currentTime,618);
    assert.equal(engine.starts,1,'HLS must start loading at the new position once');
    assert.equal(video.dataset.hlsHandoffRetargetAt,'618');
    assert.equal(await player.retargetStalledHandoff(630),false,'The same decoder must not be repeatedly reset');
    assert.equal(engine.starts,1);
    assert.equal(player.getVideoElement(),original,'Keep the original media element and native audio authority');
    assert.equal(video.paused,false);
  }});
});
test('Android HLS handoff can resume one decoder-generated pause, never a user Pause or repeated resume',async()=>{
  await fixture(recoverySources,'1233236785:585d5d53db',600,{Hls:RecoveringHls,onReady:async player=>{
    const video=player.getVideoElement();
    let plays=0;
    video.play=async()=>{plays++;video.paused=false;};
    // The first actual HLS frame was already shown, and Audio is still the
    // audible owner while the video is muted for the transaction.
    await player.setMuted(true);
    await player.play();
    video.dispatchEvent(new Event('playing'));
    video.paused=true;
    assert.equal(await player.resumeStalledHandoff(),true,'Decoder-generated HLS pause should resume once while still muted');
    assert.equal(plays,2,'One actual HLS resume must occur after initial Play');
    video.paused=true;
    assert.equal(await player.resumeStalledHandoff(),false,'Do not retry the same decoder endlessly');
    assert.equal(plays,2);
    await player.pause();
    assert.equal(player.getPlaybackIntent(),false,'Explicit Pause removes playback intent');
    assert.equal(await player.resumeStalledHandoff(),false,'Explicit Pause can never be undone by handoff retry');
    assert.equal(plays,2);
    await player.play();
    video.paused=true;
    assert.equal(await player.resumeStalledHandoff(),true,
      'A second deliberate Audio-to-Video switch receives its own single bounded recovery');
    assert.equal(plays,4,'The second handoff plays once and recovers once without repeated automatic restarts');
    assert.equal(video.muted,true,'Muted handoff must not create overlapping Audio');
  }});
});
test('Android MP4 handoff resumes a decoder-generated pause once, without overriding user Pause or unbuffered seeks',async()=>{
  for(const cached of [true,false]) {
    await fixture({video:{mp4:'https://media.example.test/video.mp4'}},'lecture',723,{onReady:async player=>{
      const video=player.getVideoElement();
      video.readyState=4;video.videoWidth=640;video.muted=true;
      video.buffered={length:1,start:()=>720,end:()=>750};
      let plays=0;
      video.play=async()=>{plays++;video.paused=false;};
      await player.setMuted(true);
      await player.play();video.dispatchEvent(new Event('playing'));
      assert.equal(plays,1);
      video.paused=true;
      if(!cached)video.buffered={length:1,start:()=>700,end:()=>720};
      assert.equal(await player.resumeStalledHandoff(),cached,
        'Only a prior playing, currently buffered, muted MP4 handoff can resume');
      assert.equal(plays,cached?2:1,'An absent MP4 byte range must not start or replay video');
      video.paused=true;
      assert.equal(await player.resumeStalledHandoff(),false,'Only one recovery is allowed');
      await player.pause();
      assert.equal(await player.resumeStalledHandoff(),false,'An actual Pause must never be overridden');
    }});
  }
});
test('pausing during an HLS visual retry cannot restart parked video or select MP4',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date']});
  await fixture(recoverySources,'1233236785:585d5d53db',0,{Hls:RecoveringHls,onReady:async player=>{
    const video=player.getVideoElement();video.videoWidth=640;video.readyState=2;
    video.getVideoPlaybackQuality=()=>({totalVideoFrames:0});
    let plays=0;video.play=()=>{plays++;video.paused=false;return Promise.resolve();};
    await player.play();video.dispatchEvent(new Event('playing'));
    t.mock.timers.tick(12000);await settleRecovery();
    assert.equal(RecoveringHls.current.starts,1,'The test must reach a real pending visual retry');
    await player.pause();
    t.mock.timers.tick(8500);await settleRecovery();
    t.mock.timers.tick(10000);await settleRecovery();
    t.mock.timers.tick(12000);await settleRecovery();
    assert.equal(plays,1,'Cancelled HLS recovery must never replay video');
    assert.equal(video.paused,true);
    assert.equal(player.getSourceType(),'hls','A cancelled visual retry must not attach fallback media');
    assert.equal(RecoveringHls.current.starts,1,'Cancelled recovery must not load another HLS retry');
  }});
});
test('pausing while a fatal HLS fallback loads metadata cannot autoplay that fallback',async()=>{
  await fixture(recoverySources,'1233236785:585d5d53db',0,{Hls:RecoveringHls,onReady:async player=>{
    const video=player.getVideoElement();let plays=0;
    video.play=()=>{plays++;video.paused=false;return Promise.resolve();};
    await player.play();
    video.readyState=0;
    RecoveringHls.current.emitError();
    assert.equal(player.getSourceType(),'mp4','The test must reach the pending fatal-error fallback');
    await player.pause();
    video.readyState=1;video.dispatchEvent(new Event('loadedmetadata'));
    await settleRecovery();
    assert.equal(plays,1,'An old play intent must not restart video after an Audio handoff');
    assert.equal(video.paused,true);
  }});
});
test('a WebView decoder error which pauses HLS recovers MP4 with the accepted play intent',async()=>{
  await fixture(recoverySources,'1233236785:585d5d53db',0,{Hls:RecoveringHls,onReady:async player=>{
    const video=player.getVideoElement();let plays=0;
    video.play=()=>{plays++;video.paused=false;return Promise.resolve();};
    await player.play();
    // Android reported error=3 and paused=true while the user was playing.
    video.error={code:3};video.paused=true;video.readyState=0;
    video.dispatchEvent(new Event('error'));
    assert.equal(player.getSourceType(),'mp4');
    video.error=null;video.readyState=1;video.dispatchEvent(new Event('loadedmetadata'));
    await settleRecovery();
    assert.equal(plays,2,'Recovery must resume the previously playing lecture');
    assert.equal(video.paused,false);
  }});
});

test('Home cancels a queued WebView Play before a notification can reveal it',async()=>{
  await fixture(recoverySources,'lecture',0,{onReady:async player=>{
    const video=player.getVideoElement();await player.play();
    const queued=player.play();
    document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
    await queued;
    assert.equal(video.paused,true,'Home must cancel a pending play even if Android itself paused the element');
    assert.equal(video.muted,true,'The parked video must not retain audible output');
    document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await settleRecovery();
    assert.equal(video.paused,true,'Notification reopening must leave native Audio in charge');
    await player.setMuted(false);await player.play();
    assert.equal(video.paused,false,'A later explicit Video transaction may still play');
  }});
});
test('Home cancels a decoder recovery that was waiting for metadata',async()=>{
  await fixture(recoverySources,'lecture',0,{Hls:RecoveringHls,onReady:async player=>{
    const video=player.getVideoElement();let plays=0;
    video.play=()=>{plays++;video.paused=false;return Promise.resolve();};
    await player.play();video.readyState=0;RecoveringHls.current.emitError();
    document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
    video.readyState=1;video.dispatchEvent(new Event('loadedmetadata'));await settleRecovery();
    document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await settleRecovery();
    assert.equal(plays,1,'A recovery queued before Home must not reclaim WebView audio focus');
    assert.equal(video.paused,true);assert.equal(video.muted,true);
  }});
});
test('entering actual PiP keeps video playing when the Activity becomes hidden',async()=>{
  await fixture(recoverySources,'lecture',0,{isPictureInPicture:()=>true,onReady:async player=>{
    const video=player.getVideoElement();video.muted=false;await player.play();
    document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(video.paused,false);assert.equal(video.muted,false);
  }});
});

class BufferedQualityHls extends RecoveringHls {
  constructor(){super();this.levels=[{height:360},{height:480}];this.recoveries=0;}
  attachMedia(video){this.video=video;}
  recoverMediaError(){this.recoveries++;this.video.readyState=0;this.video.currentTime=0;this.video.paused=true;}
}
const chooseQuality = video => {
  const controls=video.parentElement.children.find(e=>e.className==='watch-hls-controls');
  const select=controls.querySelector('[data-hls-quality]');
  select.value='1';select.dispatchEvent(new Event('change'));
};
const stalledQualityVideo = video => {
  video.currentTime=42;video.readyState=2;video.videoWidth=640;
  video.getVideoPlaybackQuality=()=>({totalVideoFrames:100});
  video.buffered={length:1,start:()=>36,end:()=>60};
};
test('quality selection recovers a stationary buffered HLS decoder at the saved position',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date']});
  await fixture(recoverySources,'lecture',0,{Hls:BufferedQualityHls,onReady:async player=>{
    const video=player.getVideoElement();stalledQualityVideo(video);await player.play();chooseQuality(video);
    t.mock.timers.tick(2000);await settleRecovery();
    assert.equal(BufferedQualityHls.current.recoveries,1,'A frozen buffered decoder must receive a bounded HLS recovery');
    video.readyState=2;video.dispatchEvent(new Event('loadedmetadata'));await settleRecovery();
    assert.equal(video.currentTime,42,'Reattaching the decoder must preserve lecture position');
    assert.equal(video.paused,false);assert.equal(player.getSourceType(),'hls');
  }});
});
test('Audio handoff cancels a pending quality recovery without replaying video',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date']});
  await fixture(recoverySources,'lecture',0,{Hls:BufferedQualityHls,onReady:async player=>{
    const video=player.getVideoElement();stalledQualityVideo(video);let plays=0;
    video.play=()=>{plays++;video.paused=false;return Promise.resolve();};
    await player.play();chooseQuality(video);t.mock.timers.tick(2000);await settleRecovery();
    assert.equal(BufferedQualityHls.current.recoveries,1,'Reach a pending metadata recovery before cancelling');
    await player.pause();video.readyState=2;video.dispatchEvent(new Event('loadedmetadata'));await settleRecovery();
    assert.equal(plays,1);assert.equal(video.paused,true);assert.equal(player.getSourceType(),'hls');
  }});
});
test('quality selection leaves healthy motion and a network underrun alone',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date']});
  for(const healthy of [true,false])await fixture(recoverySources,'lecture',0,{Hls:BufferedQualityHls,onReady:async player=>{
    const video=player.getVideoElement();stalledQualityVideo(video);await player.play();chooseQuality(video);
    if(healthy)video.currentTime+=1;
    else video.buffered={length:1,start:()=>36,end:()=>42.2};
    t.mock.timers.tick(2000);await settleRecovery();assert.equal(BufferedQualityHls.current.recoveries,0);
  }});
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

test('an interrupted native MP3 GET cleans its partial file before a single bounded retry',async()=>{
  const events=[];let calls=0;
  const options={url:'https://api.example.test/audio/lecture',path:'file:///audio.mp3',headers:{'X-Irgun-App':'1'},progress:true};
  const result=await downloadOfflineAudio(options,{
    download:async received=>{assert.equal(received,options);events.push('download');if(++calls===1)throw {code:'OS-PLUG-FLTR-0008'};},
    removePartial:async()=>events.push('cleanup'),onRetry:async info=>events.push('attempt:'+info.attempt),
    delay:async ms=>{assert.equal(ms,1000);events.push('backoff');}
  });
  assert.equal(result.attempts,2);assert.deepEqual(events,['download','cleanup','attempt:2','backoff','download']);
});
test('persistent native connection failures stay failed after the bounded retry',async()=>{
  let calls=0,cleanups=0;
  const error={code:'OS-PLUG-FLTR-0008',message:'Failed to connect to server.'};
  await assert.rejects(downloadOfflineAudio({}, {download:async()=>{calls++;throw error;},
    removePartial:async()=>cleanups++,delay:async()=>{}}),received=>received===error);
  assert.equal(calls,2);assert.equal(cleanups,1);
});
test('HTTP, authentication, permission and unknown download errors are never retried',async()=>{
  for(const error of [{code:'OS-PLUG-FLTR-0010',data:{httpStatus:503}},
    {code:'OS-PLUG-FLTR-0010',data:{httpStatus:401}},{code:'OS-PLUG-FLTR-0006'},
    {code:'OS-PLUG-FLTR-0011'},{code:'OS-PLUG-FLTR-0008',httpStatus:500},
    new Error('Incomplete or non-audio download')]){
    let calls=0;
    await assert.rejects(downloadOfflineAudio({}, {download:async()=>{calls++;throw error;},
      removePartial:async()=>{throw Error('A non-transport failure must not reach retry cleanup');}}),received=>received===error);
    assert.equal(calls,1);
  }
});
test('a partial file that cannot be removed prevents another native transfer',async()=>{
  let calls=0;
  const error=new Error('Cannot delete partial file');
  await assert.rejects(downloadOfflineAudio({}, {download:async()=>{calls++;throw {code:'OS-PLUG-FLTR-0008'};},
    removePartial:async()=>{throw error;}}),received=>received===error);
  assert.equal(calls,1);
});

function offlineSaveFixture({failure,actualBytes=60268750}={}) {
  const id='1233236785:585d5d53db',url='https://api.example.test/audio/'+encodeURIComponent(id),key='video:'+id;
  const item={id,hasAudio:true,duration:3663};let progress,calls=0,bytes=0,removed=0;
  const state={offlineDownloads:new Map(),offlineJobs:new Map(),videoById:new Map([[id,item]]),screen:'shiurim',token:''};
  const events=[];
  const context={state,API:'https://api.example.test',CSS:{escape:value=>value},Date,console:{warn(){}},
    Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android'},Directory:{Data:'DATA'},
    Filesystem:{mkdir:async()=>{},getUri:async()=>({uri:'file:///audio.mp3'}),stat:async()=>({size:bytes}),
      deleteFile:async()=>{events.push('cleanup');bytes=0;removed++;}},
    FileTransfer:{addListener:async(_,listener)=>{progress=listener;return {remove:async()=>removed++};},
      downloadFile:async()=>{
        events.push('download');calls++;
        if(failure==='connection'&&calls===1){bytes=4301864;progress({url,bytes,contentLength:60268750});throw {code:'OS-PLUG-FLTR-0008'};}
        if(failure==='persistent'||failure==='http'){
          bytes=4301864;progress({url,bytes,contentLength:60268750});
          throw {code:failure==='http'?'OS-PLUG-FLTR-0010':'OS-PLUG-FLTR-0008',message:'Failed download'};
        }
        bytes=actualBytes;progress({url,bytes,contentLength:60268750});
      }},
    downloadOfflineAudio:(options,deps)=>downloadOfflineAudio(options,{...deps,delay:async()=>{}}),
    isPlausibleOfflineAudio,minimumOfflineAudioBytes,audioDownloadPath,
    offlineKeyFor:()=>key,usageAnalytics:{event(){}},videoId:()=>id,mediaApiId:()=>id,
    itemTitle:()=> 'Shiur',itemSubtitle:()=> 'Speaker',document:{querySelector:()=>null},
    refreshOfflineButtonsForKey(){},refreshInteractiveUi(){},persistOfflineDownloads(){},setToast(){},currentLanguage:()=> 'en'};
  // Exercise the ACTUAL production prebuffer helper together with Save,
  // rather than extracting Save without the helper and failing before any
  // real HTTP retry / incomplete-file assertions run. In this test fixture
  // video is not actively playing, so the production helper returns normally.
  const prepare=mainSource.indexOf('async function prepareNativeVideoBufferForOfflineTransfer()');
  const start=mainSource.indexOf('async function saveOffline(',prepare);
  assert.ok(prepare>=0&&start>prepare,'Offline Save must include its real HLS prebuffer prerequisite');
  runInNewContext(mainSource.slice(prepare,mainSource.indexOf('async function deleteOffline(',start))+'\nthis.save=saveOffline;',context);
  return {state,events,key,save:()=>context.save('video',id),calls:()=>calls,removed:()=>removed,bytes:()=>bytes};
}
test('the actual Offline Save recovers the observed 4.3MB interruption and records only the complete MP3',async()=>{
  const f=offlineSaveFixture({failure:'connection'});await f.save();
  assert.equal(f.calls(),2);assert.deepEqual(f.events,['download','cleanup','download']);
  const record=f.state.offlineDownloads.get(f.key);assert.equal(record.bytes,60268750);assert.equal(record.downloadAttempts,2);
  assert.equal(f.state.offlineJobs.size,0);assert.equal(f.state.offlineSaveLastError,'');assert.equal(f.removed(),2);
});
test('the actual Offline Save never marks a failed, truncated or HTTP-error transfer saved',async()=>{
  for(const options of [{failure:'persistent'},{failure:'http'},{actualBytes:4301864}]){
    const f=offlineSaveFixture(options);await f.save();
    assert.equal(f.state.offlineDownloads.size,0);assert.equal(f.state.offlineJobs.size,0);assert.equal(f.bytes(),0);
    assert.ok(f.state.offlineSaveLastError);assert.equal(f.calls(),options.failure==='persistent'?2:1);
  }
});
function authRenderFixture({busy=false,mode='login'}={}) {
  const state={screen:'account',authMode:mode,authBusy:busy,user:null};
  const field=id=>({id,value:'',selectionStart:3,selectionEnd:3,focus(){document.activeElement=this;},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}});
  let fields=new Map(['authEmail','authPassword'].map(id=>[id,field(id)]));
  const form=()=>({dataset:{authDraftMode:'login'}});
  const document={activeElement:fields.get('authPassword'),getElementById:id=>id==='authForm'?form():fields.get(id)};
  fields.get('authEmail').value='qa@example.test';fields.get('authPassword').value='typed-in-dom';
  const app={set innerHTML(_){fields=new Map(['authEmail','authPassword'].map(id=>[id,field(id)]));document.activeElement=null;}};
  const context={state,document,app,syncAndroidBottomNavigation(){},syncAndroidVideoDisplay(){},homeSearchRenderDeferred:false,tabSwipeRenderGate:{shouldDefer:()=>false},
    androidPlayerSheetRenderGate:{shouldDefer:()=>false},preserveAndroidPlayerSheetScroll,Capacitor:{getPlatform:()=> 'android'},usageAnalytics:{setScreen(){}},analyticsScreenLabel:()=>'',
    accountHtml:()=>'',shell:x=>x,playlistPickerHtml:()=>'',bind(){},syncLivePlaybackAnalytics(){},updatePlayerUi(){},refreshOfflineButtonsForKey(){}};
  const start=mainSource.indexOf('function preserveHomeSearchDraft(');
  const renderStart=mainSource.indexOf('function render()');
  const source=(start>=0?mainSource.slice(start,renderStart):'')+mainSource.slice(renderStart,mainSource.indexOf('function syncOpenFilterChecks(',renderStart));
  runInNewContext(source+'\nthis.renderApp=render;',context);
  return {render:context.renderApp,field:id=>fields.get(id),document};
}
test('background render preserves sign-in fields and focused selection in the live DOM',()=>{
  const f=authRenderFixture();f.render();
  assert.equal(f.field('authEmail').value,'qa@example.test');assert.equal(f.field('authPassword').value,'typed-in-dom');
  assert.equal(f.document.activeElement,f.field('authPassword'));assert.equal(f.field('authPassword').selectionStart,3);
});
test('login submission and auth-mode changes discard the previous credential draft',()=>{
  for(const options of [{busy:true},{mode:'register'}]){
    const f=authRenderFixture(options);f.render();
    assert.equal(f.field('authPassword').value,'');assert.equal(f.field('authEmail').value,'');
  }
});
test('clicking Login submits once without the form becoming an auth-mode button',()=>{
  const state={authMode:'login',authBusy:false,authMessage:''};
  const htmlStart=mainSource.indexOf('function authHtml()');
  const form=new EventTarget();form.dataset={};let connected=true,logins=0,renders=0;
  const fields={authForm:form,authEmail:{value:'qa@example.test'},authPassword:{value:'test-password'}};
  const document={getElementById:id=>fields[id],querySelectorAll:selector=>selector==='[data-auth-mode]'&&form.dataset.authMode?[form]:[]};
  const context={state,document,Capacitor:{isNativePlatform:()=>false},esc:x=>x,tr:x=>x,googleGIcon:()=>'',
    render(){renders++;connected=false;},login(email,password){assert.equal(email,'qa@example.test');assert.equal(password,'test-password');logins++;}};
  runInNewContext(mainSource.slice(htmlStart,mainSource.indexOf('function relatedVideos(',htmlStart))+'\nthis.html=authHtml();',context);
  const tag=context.html.match(/<form\b[^>]*id="authForm"[^>]*>/)?.[0];assert.ok(tag);
  const mode=tag.match(/\bdata-auth-mode="([^"]*)"/);if(mode)form.dataset.authMode=mode[1];
  const modeStart=mainSource.indexOf("  document.querySelectorAll('[data-auth-mode]')");
  const submitStart=mainSource.indexOf("  const authForm = document.getElementById('authForm');");
  runInNewContext(mainSource.slice(modeStart,mainSource.indexOf("  document.querySelectorAll('[data-google-login]')",modeStart))+
    mainSource.slice(submitStart,mainSource.indexOf('  const forgotPasswordForm',submitStart)),context);
  // A submit-button click bubbles through its form before the default submit.
  // Removing the form during that click cancels the browser's default action.
  form.dispatchEvent(new Event('click',{bubbles:true}));
  if(connected)form.dispatchEvent(new Event('submit',{cancelable:true}));
  assert.equal(renders,0,'Mode buttons must not handle clicks on the form or its fields');
  assert.equal(logins,1,'A physical Login click must reach the real login handler exactly once');
});
function hostFixture() {
  class Node {
    constructor(){this.children=[];this.dataset={};this.classList={remove(){},toggle(){}};}
    set textContent(value){assert.equal(value,'');for(const child of this.children)child.parentElement=null;this.children=[];}
    appendChild(child){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(c=>c!==child);child.parentElement=this;this.children.push(child);}
    querySelector(selector){return selector==='.watch-overlay'?this.children.find(c=>c===overlay)||null:selector==='#watchVimeoFrame'?this.children.includes(overlay)?iframe:null:null;}
  }
  const mount=new Node(),app=new Node(),overlay=new Node(),iframe={};app.appendChild(overlay);
  const state={watchVideo:{id:'1233236785:585d5d53db'},watchMode:'video'};
  const presentations=[];
  const context={persistentVideoMount:mount,state,videoId:v=>v.id,Capacitor:{getPlatform:()=> 'android'},document:{body:new Node(),querySelector:()=>app.children.includes(overlay)?overlay:null},reconcileAndroidNativeWatchOverlay(){},bindPersistentVideoChrome(){},PlaybackController:{setPresentation:async mode=>presentations.push(mode)}};
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


test('Android Follow uses website-reviewed keys and EXACT title-derived website auto-key in Hebrew and English',()=>{
  const slice=(from,to)=>{
    const a=mainSource.indexOf(from),b=mainSource.indexOf(to,a);
    assert.ok(a>=0&&b>a,'Missing production Follow dependency '+from);
    return mainSource.slice(a,b);
  };
  const state={
    metadata:{lectures:{'reviewed-lecture':{speakerIds:['shmuel-yehuda-brisk']}}},
    speakerAliasToId:new Map([
      ['שמואל יהודה בריסק','shmuel-yehuda-brisk'],
      ['zev smith','zev-smith']
    ]),
    speakerById:new Map([
      ['shmuel-yehuda-brisk',{
        id:'shmuel-yehuda-brisk',displayHe:'הרב שמואל יהודה בריסק',displayEn:'Rav Shmuel Yehuda Brisk'
      }],
      ['zev-smith',{id:'zev-smith',displayHe:'הרב זאב סמיט',displayEn:'Rav Zev Smith'}]
    ]),
    topicById:new Map(),follows:new Map()
  };
  let language='he';
  const context={state,currentLanguage:()=>language,videoId:v=>String(v?.id||''),
    tr:key=>language==='he' ? ({Follow:'עקבו אחרי',Following:'עוקבים אחרי'}[key]||key):key,
    generatedEnglishSpeakerName:()=>'',generatedHebrewSpeakerName:()=>''};
  runInNewContext(
    slice('function normalizeText(', 'const SPEAKER_TOKEN_EN_COUNTS')+
    slice('function bareSpeakerName(', 'function incrementSpeakerTokenCount(')+
    slice('function speakerLabel(', 'function getVisitorId(')+
    slice('function extractSpeakerFromTitle(', 'function resolveTopicFromTag(')+
    slice('function cleanSpeakerDisplayName(', 'function cleanTopicDisplayName(')+
    slice('function esc(', 'function shiurTitleParts(')+
    slice('function followButtonText(', 'function commentsHtml()')+
    '\nthis.renderFollow=currentFollowButtons;',context);
  // Website metadata overrides an inferred title: account identity stays
  // identical between Android and site for reviewed speakers.
  const reviewed={id:'reviewed-lecture',title:'הרב שמואל יהודה בריסק - שאלות חדשות',
    _speakerIds:[],_speakerLabel:'הרב שמואל יהודה בריסק',_topicId:''};
  let html=context.renderFollow(reviewed);
  assert.match(html,/data-follow-type="speaker"/);
  assert.match(html,/data-follow-key="shmuel-yehuda-brisk"/);
  assert.match(html,/עקבו אחרי הרב שמואל יהודה בריסק/);
  assert.deepEqual(Array.from(reviewed._speakerIds),['shmuel-yehuda-brisk']);
  state.follows.set('speaker:shmuel-yehuda-brisk',{type:'speaker',key:'shmuel-yehuda-brisk'});
  assert.match(context.renderFollow(reviewed),/עוקבים אחרי הרב שמואל יהודה בריסק/);
  language='en';assert.match(context.renderFollow(reviewed),/Following Rav Shmuel Yehuda Brisk/);
  // A known speaker in the directory must use its canonical follow key,
  // even if the lecture has no per-lecture reviewed mapping.
  const canonicalEnglish={id:'canonical-zev',title:'Rav Zev Smith - The Beginning of Shemone Esrei',
    _speakerIds:[],_speakerLabel:'Rav Zev Smith'};
  html=context.renderFollow(canonicalEnglish);
  assert.match(html,/data-follow-key="zev-smith"/);
  assert.doesNotMatch(html,/data-follow-key="auto-zev-smith"/);
  assert.deepEqual(Array.from(canonicalEnglish._speakerIds),['zev-smith']);

  // Genuinely unknown speakers retain the website auto-<slug> key, not the
  // unrelated app-only auto-speaker:<name> key.
  state.speakerAliasToId.delete('שמואל יהודה בריסק');
  language='he';
  const unreviewed={id:'unreviewed',title:'הרב שמואל יהודה בריסק - שאלות חדשות',
    _speakerIds:['auto-speaker:שמואל יהודה בריסק'],_speakerLabel:'הרב שמואל יהודה בריסק'};
  html=context.renderFollow(unreviewed);
  assert.match(html,/data-follow-key="auto-שמואל-יהודה-בריסק"/);
  assert.doesNotMatch(html,/auto-speaker:/);
  assert.deepEqual(Array.from(unreviewed._speakerIds),['auto-שמואל-יהודה-בריסק']);
  assert.match(html,/עקבו אחרי הרב שמואל יהודה בריסק/);
  state.follows.set('speaker:auto-שמואל-יהודה-בריסק',{type:'speaker',key:'auto-שמואל-יהודה-בריסק'});
  assert.match(context.renderFollow(unreviewed),/עוקבים אחרי/);
  // Fallback is still allowed for a canonical speaker field without a tagged title.
  state.speakerAliasToId.set('שמואל יהודה בריסק','shmuel-yehuda-brisk');
  const bySpeaker={id:'other',title:'שאלות חדשות',speakerHe:'הרב שמואל יהודה בריסק',_speakerIds:[]};
  assert.match(context.renderFollow(bySpeaker),/data-follow-key="shmuel-yehuda-brisk"/);
  assert.equal(context.renderFollow({id:'unknown',title:'Untitled recording',_speakerIds:[]}), '',
    'Do not create an unusable fake speaker Follow on lectures lacking a Rav or topic');
});

test('Android Video-to-Audio handoff preserves user Play intent during MP4 priming and respects actual Pause',async()=>{
  for(const options of [
    {intent:true,decoderPaused:true,stalePlaying:false,expected:true},
    {intent:false,decoderPaused:false,stalePlaying:true,expected:false},
    {intent:null,decoderPaused:false,stalePlaying:false,expected:true}
  ]) {
    const errors=[];
    const player={getPaused:async()=>options.decoderPaused,pause:async()=>{},play:async()=>{}};
    if(options.intent!==null)player.getPlaybackIntent=()=>options.intent;
    const state={watchVimeo:player,watchMode:'video',watchVideoPlaying:options.stalePlaying,
      watchResumeSeconds:605,user:null,current:null,nativePlayback:{}};
    const starts=[],items=[];
    const context={state,setTimeout,console:{debug(){},warn:(_message,error)=>errors.push(String(error?.stack||error))},usesNativeUnifiedAudio:()=>true,
      nativeMediaPlugin:()=>({getState:async()=>({mode:'VIDEO',audioAuthorityCommitted:false,lectureId:'lecture'})}),
      quickVimeoTime:async()=>605,
      videoAudioPlaybackItem:(_video,id)=>({id,url:'https://media.example.test/audio.mp3'}),
      offlineRecordForAudioItem:()=>null,offlineFileUrl:()=>'',setPlaybackAuthorityFence:()=>{},
      PlaybackController:{
        loadLecture:async(item,seconds)=>items.push({item,seconds}),
        startAudioAt:async(seconds,playing)=>{starts.push({seconds,playing});return {mode:'AUDIO',currentPositionMs:605000,audioPositionMs:605000,audioIsPlaying:playing};}
      },parkHostedVideoForAudio:()=>{},render:()=>{},updatePlayerUi:()=>{}};
    const start=mainSource.indexOf('async function switchVideoToAudioSeamlessly(');
    runInNewContext(mainSource.slice(start,mainSource.indexOf('async function resumeParkedVideoFromAudio(',start))+
      '\nthis.switchAudio=switchVideoToAudioSeamlessly;',context);
    const transferred=await context.switchAudio({duration:3663},'lecture');
    assert.deepEqual(errors,[],'Native Audio switch must not enter rollback: '+errors.join('; '));
    assert.equal(transferred,true);
    assert.equal(items.length,1,'Real native audio source preparation must happen');
    assert.equal(starts.length,1,'Start Media3 exactly once');
    assert.equal(starts[0].playing,options.expected,'Media3 must use the listener Play/Pause intent, not MP4 decoder paused');
    assert.equal(starts[0].seconds,605);
    assert.equal(state.watchMode,'audio');
  }
});
function handoffFixture({movingClock=true,movingFrames=true,paused=false,focusStopped=false,framesReadyAfterMs=0}={}) {
  let now=0, position=600, frames=100;
  const state={watchAudioToVideoHandoff:true,watchAudioToVideoHandoffId:'lecture',watchMode:'video',
    watchAudioToVideoTargetSeconds:600,watchVideo:{id:'lecture'},
    nativePlayback:{mode:'AUDIO',audioIsPlaying:!focusStopped,audioPlayWhenReady:!focusStopped}};
  const element={paused,seeking:false,readyState:4,videoWidth:1920,getVideoPlaybackQuality:()=>({totalVideoFrames:frames})};
  const player={getCurrentTime:async()=>position,getPaused:async()=>element.paused,getVideoElement:()=>element,
    setCurrentTime:async n=>{position=n;return n;}};
  const context={state,console:{warn(){}},Date:{now:()=>now},usesNativeUnifiedAudio:()=>true,
    playbackPositionSeconds:()=>600+(focusStopped?0:now/1000),
    setTimeout:callback=>{now+=350;if(movingClock&&!paused)position+=.35;if(movingFrames&&!paused&&now>=framesReadyAfterMs)frames+=10;callback();}};
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
for(const cached of [true,false])test('Android 11 1.5x Audio-to-Video handoff uses at most one VERIFIED buffered live-clock correction, cached='+cached,async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  let position=441,lastSeekAt=0,liveSeekAt=null,frames=100;
  const seeks=[];
  const element={
    paused:false,seeking:false,readyState:4,videoWidth:640,
    playbackRate:1.5,
    buffered:{length:1,start:()=>430,end:()=>cached?600:460},
    getVideoPlaybackQuality:()=>({totalVideoFrames:100+Math.floor(Date.now()/30)})
  };
  const videoSeconds=()=>{
    if(liveSeekAt!==null)return position+(Date.now()-liveSeekAt)/1000*1.5;
    // The decoded Android 11 picture advances at only 1x while Media3 Audio
    // is at the user's 1.5x speed. Changing HTML playbackRate cannot catch up.
    return 441+Date.now()/1000;
  };
  const player={getSourceType:()=> 'hls',getVideoElement:()=>element,
    getPaused:async()=>false,getCurrentTime:async()=>videoSeconds(),
    setCurrentTime:async target=>{
      seeks.push({target,at:Date.now()});position=target;liveSeekAt=Date.now();return target;
    }};
  const state={playbackSpeed:1.5,watchAudioToVideoHandoff:true,
    watchAudioToVideoHandoffId:'lecture',watchAudioToVideoTargetSeconds:457,
    nativePlayback:{mode:'AUDIO',audioIsPlaying:true,audioPlayWhenReady:true}};
  const context={state,Date,setTimeout,usesNativeUnifiedAudio:()=>true,
    playbackPositionSeconds:()=>457+Date.now()/1000*1.5,
    console:{warn(){}}};
  const start=mainSource.indexOf('async function waitForVimeoHandoffReady(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('function videoAudioPlaybackItem(',start))+
    '\nthis.wait=waitForVimeoHandoffReady;',context);
  let settled=false,result;
  const pending=context.wait(player,'lecture',15000).then(value=>{settled=true;result=value;});
  for(let i=0;i<200&&!settled;i++){
    t.mock.timers.tick(100);
    for(let j=0;j<18;j++)await Promise.resolve();
  }
  assert.equal(settled,true,'A bounded 15s handoff must settle; never hang CI');
  await pending;
  if(cached) {
    assert.equal(seeks.length,1,'Only one buffered live HLS correction may occur');
    assert.ok(seeks[0].at>=5000,'Do not abort the first pending keyframe before true motion');
    assert.ok(Math.abs(seeks[0].target-(457+seeks[0].at/1000*1.5))<.2,
      'Seek to the actual Media3 Audio clock, not the old Video timestamp');
    assert.ok(result>460,'After correction, genuinely advancing frames must be accepted');
    assert.ok(Math.abs(result-context.playbackPositionSeconds())<=1.01,'Audio and Video clocks must match');
  } else {
    assert.equal(seeks.length,0,'Never seek to a live segment not actually buffered');
    assert.equal(result,null,'Unrecoverable HLS delay must fail instead of duplicating audio');
  }
  assert.equal(state.nativePlayback.mode,'AUDIO',
    'Native Audio is kept authoritative until the caller commits a proven Video picture');
  assert.equal(element.playbackRate,1.5,'The selected 1.5x speed must be restored');
});
test('HLS handoff lets a keyframe decode before chasing the advancing Audio clock',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  let decodeAt=3000,basePosition=606,position=606,frames=327,decoded=false,lastAdvancedAt=0;
  const seeks=[];
  // API 35 briefly reports seeking=false before a keyframe can play. Metadata
  // and a resolved seek setter are not proof that the decoder has settled.
  const element={paused:false,seeking:false,readyState:1,videoWidth:640};
  const advance=()=>{
    if(Date.now()<decodeAt)return;
    decoded=true;element.readyState=4;
    position+=(Date.now()-Math.max(decodeAt,lastAdvancedAt))/1000*(Number(element.playbackRate)||1);
    lastAdvancedAt=Date.now();
    frames=327+Math.floor((Date.now()-decodeAt)/1000*30);
  };
  element.getVideoPlaybackQuality=()=>{advance();return {totalVideoFrames:frames};};
  const player={getPaused:async()=>false,getSourceType:()=> 'hls',getVideoElement:()=>element,
    getCurrentTime:async()=>{advance();return position;},setCurrentTime:async n=>{
      seeks.push({at:Date.now(),position:n});position=basePosition=n;
      decodeAt=Date.now()+(decoded?100:3000);lastAdvancedAt=decodeAt;element.readyState=1;return n;
    }};
  const state={watchAudioToVideoHandoff:true,watchAudioToVideoHandoffId:'lecture',
    nativePlayback:{mode:'AUDIO',audioIsPlaying:true,audioPlayWhenReady:true}};
  const context={state,Date,setTimeout,console:{warn(){}},usesNativeUnifiedAudio:()=>true,
    playbackPositionSeconds:()=>606+Date.now()/1000};
  const start=mainSource.indexOf('async function waitForVimeoHandoffReady(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('function videoAudioPlaybackItem(',start))+'\nthis.wait=waitForVimeoHandoffReady;',context);
  let settled=false,result;
  const transaction=context.wait(player,'lecture',15000).then(value=>{settled=true;result=value;});
  for(let i=0;i<170&&!settled;i++){
    t.mock.timers.tick(100);
    for(let j=0;j<12;j++)await Promise.resolve();
  }
  await transaction;
  assert.ok(result>609,'A buffered HLS destination must become synchronized instead of restarting its pending decode');
  assert.ok(seeks.every(s=>s.at>=3000),'Do not replace a pending keyframe with another live-clock seek');
  assert.ok(Math.abs(result-context.playbackPositionSeconds())<=1.8,'The completed transfer must retain the live Audio position');
});
test('HLS handoff gives a distant segment time to decode without relaxing frame or position checks',async()=>{
  const early=handoffFixture({framesReadyAfterMs:9000});
  assert.equal(await early.wait(early.player,'lecture',8000),null,'An eight-second wait must reject the still-frozen picture');
  const f=handoffFixture({framesReadyAfterMs:9000});
  const transaction=resumeFixture({readyWait:(_,id,budget)=>f.wait(f.player,id,budget)});
  assert.equal(await transaction.resume(),true,'A synchronized HLS picture decoding after nine seconds must complete the handoff');
});
test('API 35 HLS decoder stall retargets the live Audio segment once and requires real moving frames',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  let position=590,frames=50,lastAt=0,rate=1,retargets=0,retargeted=false,seeks=0;
  const advance=()=>{
    const until=retargeted?Date.now():Math.min(Date.now(),1800);
    const ms=Math.max(0,until-lastAt);
    if(ms){position+=ms/1000*rate;frames+=Math.floor(ms*30/1000);lastAt=until;}
  };
  const element={paused:false,seeking:false,readyState:4,videoWidth:640,
    buffered:{length:1,start:()=>580,end:()=>602},
    get playbackRate(){return rate;},set playbackRate(next){advance();rate=next;},
    getVideoPlaybackQuality(){advance();return {totalVideoFrames:frames};}};
  const player={getSourceType:()=> 'hls',getVideoElement:()=>element,getPaused:async()=>false,
    getCurrentTime:async()=>{advance();return position;},
    setCurrentTime:async n=>{seeks++;position=n;return n;},
    retargetStalledHandoff:async target=>{
      assert.equal(retargets,0,'Only one new fragment request is allowed per stalled handoff');
      assert.ok(target>=606,'The new fragment must use the actual live Audio clock');
      retargets++;retargeted=true;position=target;lastAt=Date.now();
      element.buffered={length:1,start:()=>target-1,end:()=>target+20};
      return true;
    }};
  const state={playbackSpeed:1,watchAudioToVideoHandoff:true,watchAudioToVideoHandoffId:'lecture',
    nativePlayback:{mode:'AUDIO',audioIsPlaying:true,audioPlayWhenReady:true}};
  const context={state,Date,setTimeout,console:{warn(){}},usesNativeUnifiedAudio:()=>true,
    playbackPositionSeconds:()=>606+Date.now()/1000};
  const start=mainSource.indexOf('async function waitForVimeoHandoffReady(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('function videoAudioPlaybackItem(',start))+'\nthis.wait=waitForVimeoHandoffReady;',context);
  let settled=false,result;const task=context.wait(player,'lecture',15000).then(v=>{result=v;settled=true;});
  for(let i=0;i<170&&!settled;i++){t.mock.timers.tick(100);for(let j=0;j<12;j++)await Promise.resolve();}
  await task;
  assert.equal(retargets,1,'A stalled HLS catch-up must retarget the live segment exactly once');
  assert.equal(seeks,0,'Do not repeatedly discard decoding progress with regular seeks');
  assert.ok(result>606,'Destination must decode moving video before readiness is accepted');
  assert.ok(Math.abs(result-context.playbackPositionSeconds())<=1.8,'Video must be synchronized with the advancing Audio clock');
  assert.equal(state.nativePlayback.mode,'AUDIO','Native Audio must remain authoritative until readiness is proven');
  assert.equal(element.playbackRate,1,'Temporary catch-up speed must be restored');
});
for(const [cancel,decodeDelay] of [[false,6000],[true,6000],[false,10000]])test('HLS catch-up preserves decoded progress and restores requested speed, cancel='+cancel+', decode='+decodeDelay,async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  const rate=decodeDelay===10000?1:1.5,seeks=[],rates=[];let decodeAt=decodeDelay,lastAt=decodeAt,position=606,frames=0,currentRate=rate;
  const state={playbackSpeed:rate,watchAudioToVideoHandoff:true,watchAudioToVideoHandoffId:'lecture',nativePlayback:{mode:'AUDIO',audioIsPlaying:true,audioPlayWhenReady:true}};
  const element={paused:false,seeking:false,readyState:1,videoWidth:640,
    get playbackRate(){return currentRate;},set playbackRate(value){currentRate=value;rates.push(value);if(cancel&&value>rate)state.watchAudioToVideoHandoff=false;}};
  const advance=()=>{
    if(Date.now()<decodeAt)return;
    const elapsed=(Date.now()-Math.max(lastAt,decodeAt))/1000;
    position+=elapsed*currentRate;frames+=Math.round(elapsed*30*currentRate);lastAt=Date.now();element.readyState=4;
  };
  element.getVideoPlaybackQuality=()=>{advance();return {totalVideoFrames:frames};};
  const player={getSourceType:()=> 'hls',getVideoElement:()=>element,getPaused:async()=>false,
    getCurrentTime:async()=>{advance();return position;},setCurrentTime:async value=>{
      seeks.push(value);position=value;decodeAt=Date.now()+decodeDelay;lastAt=decodeAt;element.readyState=1;return value;
    }};
  const context={state,Date,setTimeout,console:{warn(){}},usesNativeUnifiedAudio:()=>true,playbackPositionSeconds:()=>606+Date.now()/1000*rate};
  const start=mainSource.indexOf('async function waitForVimeoHandoffReady(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('function videoAudioPlaybackItem(',start))+'\nthis.wait=waitForVimeoHandoffReady;',context);
  let settled=false,result;const transaction=context.wait(player,'lecture',15000).then(value=>{result=value;settled=true;});
  for(let i=0;i<170&&!settled;i++){t.mock.timers.tick(100);for(let j=0;j<12;j++)await Promise.resolve();}
  await transaction;
  assert.ok(rates.some(value=>value>rate),'The delayed moving destination must catch up without replacing its keyframe');
  assert.equal(seeks.length,0,'Repeated seeks must not discard a decoded HLS destination');
  assert.equal(element.playbackRate,rate,'Success and cancellation must restore the selected speed');
  if(cancel)assert.equal(result,null);
  else {assert.ok(result>606);assert.ok(Math.abs(result-context.playbackPositionSeconds())<=1.8,'Only synchronized advancing playback can finish');}
});
test('logout shows the start of the sign-in form after a scrolled account profile',async()=>{
  const state={screen:'account',accountSection:'settings',user:{id:1}};
  let scrolled=480;const events=[];
  const start=mainSource.indexOf('async function logout(');
  const context={state,apiJson:async()=>events.push('logout'),setToken:value=>events.push(value),
    resetUserState(){state.user=null;},render(){events.push('render');},
    window:{scrollTo(options){assert.equal(events.at(-1),'render');scrolled=options.top;}}};
  runInNewContext(mainSource.slice(start,mainSource.indexOf('async function updateProfile(',start))+'\nthis.logout=logout;',context);
  await context.logout();assert.equal(state.user,null);assert.equal(state.accountSection,'profile');
  assert.equal(scrolled,0,'Email and password must be reachable immediately after logout');
});
test('restart restores the exact Drive-inclusive catalog cache and retains legacy caches',async()=>{
  for(const path of ['/video-map?driveLibrary=1','/video-map']) {
    const video={id:'drivev-restart',title:'Saved Drive lecture'};
    const state={counter:1,trends:{}};
    const cache=new Map([['bootstrap:'+path,{data:[video],savedAt:123}]]);
    const context={state,Math,Map,console:{warn(){}},loadMetadata:async()=>{},
      // Warm-start cache is usable while online without falsely announcing
      // an offline fallback. Its platform/network context must be explicit.
      Capacitor:{getPlatform:()=> 'android'},navigator:{onLine:true},
      offlineCacheGet:async key=>cache.get(key)||null,enrichVideo:v=>v,enrichAudio:v=>v,
      itemDate:()=>0,videoId:v=>v.id,rawAudioId:v=>v.id,render(){}};
    const start=mainSource.indexOf('async function hydrateInitialCatalogCache(');
    runInNewContext(mainSource.slice(start,mainSource.indexOf('async function bootstrap(',start))+'\nthis.hydrate=hydrateInitialCatalogCache;',context);
    assert.equal(await context.hydrate(),true,'The saved '+path+' catalog must be usable after process restart');
    assert.equal(state.loading,false);assert.equal(state.videoById.get(video.id),video);
    assert.equal(state.usingCachedLibrary,false,
      'Cached videos load immediately, but Android must wait for the live check before showing the offline notice');
  }
});
test('Android session restores only verified offline identity for real /me transport failures, never revoked tokens',async()=>{
  const start=mainSource.indexOf('async function restoreSession()');
  const source=mainSource.slice(start,mainSource.indexOf('async function loadUserCollections()',start))
    + '\nthis.restoreSession=restoreSession;';
  for(const scenario of [
    {error:new TypeError('Failed to fetch'),expectedRestored:true,expectedCleared:false},
    {error:{status:503},expectedRestored:true,expectedCleared:false},
    {error:{status:401},expectedRestored:false,expectedCleared:true},
    {error:{status:403},expectedRestored:false,expectedCleared:false}
  ]){
    const state={token:'previously-verified-session',user:null};
    let restores=0,clears=0,cacheClears=0;
    const context={
      state,localStorage:{},apiJson:async()=>{throw scenario.error;},
      restoreOfflineAccount(){restores++;state.user={name:'Cached',email:'cached@example.test'};},
      setToken:()=>{clears++;state.token='';},
      clearCachedAccount:()=>{cacheClears++;},
      resetUserState:()=>{state.user=null;}
    };
    runInNewContext(source,context);
    await context.restoreSession();
    assert.equal(restores,scenario.expectedRestored ? 1 : 0,
      'A network outage may show cached identity but a server rejection must not');
    assert.equal(clears,scenario.expectedCleared ? 1 : 0,
      'Only a confirmed 401 revokes the cached token');
    assert.equal(cacheClears,scenario.error?.status===403?1:0,
      'HTTP 403 must discard the cached display identity even without revoking the token');
    assert.equal(Boolean(state.user),scenario.expectedRestored,
      'Offline identity must never carry over after a rejected session');
  }
});
test('reconnected server rejection clears already-displayed offline identity without treating HTTP 403 as revoked token',async()=>{
  const start=mainSource.indexOf('async function restoreSession()');
  const source=mainSource.slice(start,mainSource.indexOf('async function loadUserCollections()',start))
    + '\nthis.restoreSession=restoreSession;';
  for(const [status,revokeToken] of [[401,true],[403,false]]) {
    const state={token:'previously-verified-session',user:{name:'Cached',email:'cached@example.test'},isAdmin:false};
    let cleared=0,restored=0,tokenChanges=0,cacheClears=0;
    const context={state,localStorage:{},apiJson:async()=>{throw {status};},
      restoreOfflineAccount:()=>restored++,
      setToken:()=>{state.token='';tokenChanges++;},
      clearCachedAccount:()=>{cacheClears++;},
      resetUserState:()=>{state.user=null;cleared++;}};
    runInNewContext(source,context);
    await context.restoreSession();
    assert.equal(restored,0,'Server refusal must not bring back the offline profile');
    assert.equal(cleared,1,'A previously restored identity must be hidden after /me refuses it');
    assert.equal(state.user,null);
    assert.equal(tokenChanges,revokeToken?1:0,'Only HTTP 401 revokes the existing session token');
    assert.equal(cacheClears,status===403?1:0,
      'HTTP 403 must make the cached display identity unavailable on a later offline restart');
  }
});
test('Android cold offline restart restores only verified identity even if network flag incorrectly says online',async()=>{
  const start=mainSource.indexOf('async function bootstrap(options');
  const script=mainSource.slice(start,mainSource.indexOf('async function restoreSession(',start))+
    '\nthis.bootstrap=bootstrap;';
  for(const reportsOnline of [true,false]) {
    const state={libraryReady:false,loading:false,error:'',offlineMode:false,
      usingCachedLibrary:false,offlineCacheSavedAt:0,
      user:null,token:'previously-verified-session',isAdmin:false,screen:'home'};
    let restores=0,sessionRequests=0,renderedAccount=false;
    const context={state,navigator:{onLine:reportsOnline},console:{error(){},warn(){}},
      bootstrapInFlight:false,
      initNativeDownloader:async()=>{},
      loadMetadata:async()=>{throw new TypeError('Network unavailable');},
      restoreOfflineAccount:()=>{
        restores++;state.user={name:'Verified listener',email:'listener@example.test'};
        state.isAdmin=false;return true;
      },
      restoreSession:async()=>{sessionRequests++;},
      render:()=>{renderedAccount ||= Boolean(state.user);},
      updateReconnectTimer:()=>{}};
    runInNewContext(script,context);
    await context.bootstrap({initial:true});
    assert.equal(restores,1,
      'Real catalog failure must attempt offline restore regardless of navigator.onLine');
    assert.equal(sessionRequests,0,'A failed catalog may prevent /me and must not invent server authorization');
    assert.equal(state.user?.name,'Verified listener');
    assert.equal(state.isAdmin,false,'Offline profile must not grant elevated privileges');
    assert.equal(renderedAccount,true,'Cached display identity must render on offline startup');
    assert.equal(state.loading,false,'A failed cold startup must stop displaying its loading indicator');
  }
});
test('ready catalog and restored account remain usable while secondary startup feeds are pending',async()=>{
  const state={libraryReady:false,loading:true,counter:1,trends:{},screen:'home'};
  const rendered=[];const stalled=new Promise(()=>{});
  const context={state,Map,navigator:{onLine:true},console:{error(){},warn(){}},bootstrapInFlight:false,
    // The source slice runs in a VM, so supply the newly introduced offline
    // account helper even though this particular scenario is online.
    restoreOfflineAccount:()=>{},
    loadMetadata:async()=>{},initNativeDownloader:async()=>{},
    bootstrapJson:async()=>[{id:'lecture'}],bootstrapJsonOr:async(_,fallback)=>fallback,
    enrichVideo:v=>v,enrichAudio:v=>v,itemDate:()=>0,videoId:v=>v.id,rawAudioId:v=>v.id,
    restoreSession:async()=>{state.user={id:1};state.playlists=[{id:'server-playlist'}];},
    loadSponsorRibbon:()=>stalled,loadScheduleData:()=>stalled,loadLiveStatus:()=>stalled,
    handleAppReturn:async()=>{},render(){rendered.push({loading:state.loading,loggedIn:!!state.user});},
    updateReconnectTimer(){}};
  const start=mainSource.indexOf('async function bootstrap(options');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('async function restoreSession(',start))+'\nthis.bootstrap=bootstrap;',context);
  const boot=context.bootstrap({initial:true});
  for(let i=0;i<24;i++)await Promise.resolve();
  assert.equal(state.libraryReady,true);assert.equal(state.playlists[0]?.id,'server-playlist');
  assert.equal(state.loading,false,'Secondary sponsor/schedule/live requests must not retain the loading screen');
  assert.ok(rendered.some(r=>!r.loading&&r.loggedIn),'The restored account must render before secondary requests complete');
  await boot;
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
test('queued Audio snapshots cannot overwrite confirmed Video authority during commit',()=>{
  const state={watchAudioToVideoHandoff:true,watchAudioToVideoHandoffId:'lecture',
    nativePlayback:{mode:'VIDEO'},playbackAuthorityFence:{mode:'VIDEO',lectureId:'lecture',expiresAt:Date.now()+5000}};
  const start=mainSource.indexOf('function nativeSnapshotConflicts(');
  const context={state,Date};
  runInNewContext(mainSource.slice(start,mainSource.indexOf('function nativeAudioPositionSeconds',start))+
    '\nthis.conflicts=nativeSnapshotConflicts;',context);
  assert.equal(context.conflicts({mode:'AUDIO',lectureId:'lecture'}),true);
  assert.equal(context.conflicts({mode:'VIDEO',lectureId:'lecture'}),false);
  state.nativePlayback.mode='AUDIO';
  assert.equal(context.conflicts({mode:'AUDIO',lectureId:'lecture'}),false,'Preparation still follows live Audio');
});
test('delayed video source events cannot publish VIDEO over an Audio rollback',async()=>{
  const state={watchMode:'video',playbackAuthorityFence:{mode:'AUDIO'}};
  const calls=[];
  const start=mainSource.indexOf('async function syncNativeMediaSession(');
  const context={state,setNativePipEligibility(){},usesNativeUnifiedAudio:()=>true,
    PlaybackController:{setVideoState:async(...args)=>calls.push(args)}};
  runInNewContext(mainSource.slice(start,mainSource.indexOf('function clearNativeMediaSession(',start))+
    '\nthis.publish=syncNativeMediaSession;',context);
  await context.publish({id:'lecture'},false,613,3663,'video');
  assert.equal(calls.length,0,'The paused destination must not override the restored Audio owner');
  state.playbackAuthorityFence.mode='VIDEO';
  await context.publish({id:'lecture'},true,613,3663,'video');
  assert.equal(calls.length,1,'An explicit new Video selection still publishes normally');
});
test('native Audio reconciliation changes ownership before the parked player emits Pause',()=>{
  let pauses=0,muted=false;
  const state={nativeBackgroundHandoff:true,watchVideo:{id:'lecture'},watchMode:'video',watchVimeo:{pause(){
    assert.equal(state.watchMode,'audio');assert.equal(muted,true);pauses++;return Promise.resolve();
  }}};
  const start=mainSource.indexOf('function reconcileNativeWatchAudio(');
  const context={state,videoId:v=>v.id,ensureNativeAudioCurrentForWatch(){},
    setVimeoHandoffMuted:async(player,value)=>{muted=value;},
    parkHostedVideoForAudio(){},render(){},document:{getElementById(){return {};}}};
  runInNewContext(mainSource.slice(start,mainSource.indexOf('const PlaybackController =',start))+
    '\nthis.reconcile=reconcileNativeWatchAudio;',context);
  context.reconcile({mode:'AUDIO',lectureId:'lecture',currentPositionMs:613000});
  assert.equal(pauses,1);assert.equal(state.watchResumeSeconds,613);
});
test('native Media3 Audio reconciliation never pauses the SAME ExoPlayer as if it were parked WebView video',()=>{
  const calls=[];
  const state={watchVideo:{id:'lecture'},watchMode:'video',watchAudioToVideoHandoff:false,
    nativeBackgroundHandoff:false,watchResumeSeconds:0,
    watchVimeo:{isIrgunNativeVideoPlayer:true,
      setMode:async mode=>{calls.push('mode:'+mode);},
      pause(){throw Error('Native Media3 Audio must never be paused by reconciliation');}}};
  const context={state,videoId:video=>video.id,ensureNativeAudioCurrentForWatch(){},
    setVimeoHandoffMuted(){throw Error('The single player must not be muted for Audio');},
    parkHostedVideoForAudio(){calls.push('park');},
    render(){calls.push('render');},document:{hidden:false,getElementById:()=>null}};
  const start=mainSource.indexOf('function reconcileNativeWatchAudio(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('const PlaybackController =',start))+
    '\nthis.reconcile=reconcileNativeWatchAudio;',context);
  context.reconcile({mode:'AUDIO',lectureId:'lecture',audioAuthorityCommitted:true,currentPositionMs:5000});
  assert.equal(state.watchMode,'audio');
  assert.equal(state.watchResumeSeconds,5);
  assert.ok(calls.includes('mode:audio'));
  assert.ok(calls.includes('park'));
  assert.ok(!calls.includes('pause'),'Audible Media3 Audio cannot be paused during track switch');
});
test('a late Video Play callback cannot prewarm or report playing over the Audio owner',async()=>{
  const state={watchVimeoGeneration:4,watchMode:'audio',watchVideoPlaying:false};
  const events=[];
  const context={state,generation:4,videoKey:'lecture',document:{hidden:false},
    player:{pause:async()=>events.push('pause')},setVimeoHandoffMuted:async(_,muted)=>events.push('muted:'+muted),
    usageAnalytics:{setMedia(){throw Error('Late playback must not be reported');}},
    prewarmVideoAudioMetadata(){throw Error('Late playback must not prewarm');}};
  const start=mainSource.indexOf("player.on('play', async () => {");
  const end=mainSource.indexOf("    player.on('pause',",start);
  runInNewContext(mainSource.slice(start,end).replace("player.on('play', async () => {",'this.onPlay = async () => {').replace(/\}\);\s*$/, '};'),context);
  await context.onPlay();assert.deepEqual(events,['muted:true','pause']);assert.equal(state.watchVideoPlaying,false);
});
test('Video prewarming cannot reload the stale clock while native Audio owns this lecture',()=>{
  const state={watchMode:'video',watchResumeSeconds:659.235,nativePlayback:{mode:'AUDIO',lectureId:'lecture'}};
  let loads=0;
  const context={state,usesNativeUnifiedAudio:()=>true,PlaybackController:{loadLecture:async()=>loads++},
    videoAudioPlaybackItem:()=>({url:'https://api.example.test/audio/lecture'}),offlineRecordForAudioItem:()=>null,offlineFileUrl:()=>''};
  const start=mainSource.indexOf('function prewarmVideoAudioMetadata(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('function currentLanguage(',start))+'\nthis.prewarm=prewarmVideoAudioMetadata;',context);
  context.prewarm({hasAudio:true},'lecture');assert.equal(loads,0);
  state.nativePlayback.mode='VIDEO';context.prewarm({hasAudio:true},'lecture');assert.equal(loads,1);
  state.watchMode='audio';context.prewarm({hasAudio:true},'lecture');assert.equal(loads,1);
});
test('delayed Video snapshots cannot replace the Audio view after its short fence expires',()=>{
  const state={watchVideo:{id:'lecture'},watchMode:'audio',nativePlayback:{mode:'AUDIO'},
    playbackAuthorityFence:{mode:'AUDIO',lectureId:'lecture',expiresAt:0}};
  const context={state,Date,videoId:v=>v.id};
  const start=mainSource.indexOf('function nativeSnapshotConflicts(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('function nativeAudioPositionSeconds(',start))+'\nthis.conflicts=nativeSnapshotConflicts;',context);
  assert.equal(context.conflicts({mode:'VIDEO',lectureId:'lecture'}),true,'A queued Video state must not turn the Audio clock into 0:00');
  assert.equal(context.conflicts({mode:'AUDIO',lectureId:'lecture'}),false,'Actual native Audio progress must still update');
  state.watchMode='video';state.watchAudioToVideoHandoff=true;state.watchAudioToVideoHandoffId='lecture';
  assert.equal(context.conflicts({mode:'VIDEO',lectureId:'lecture'}),false,'A new explicit Video selection can complete its transaction');
});

function resumeFixture({ready=600.35,commitFails=false,focusStopped=false,readyWait}={}) {
  const item={id:'lecture'};
  const state={current:item,watchVideo:{id:'lecture'},watchMode:'video',watchVimeoGeneration:3,watchResumeSeconds:600,nativePlayback:{mode:'AUDIO',audioIsPlaying:!focusStopped,audioPlayWhenReady:!focusStopped},playbackSpeed:1};
  const events=[];
  const player={getCurrentTime:async()=>600,setPlaybackRate:async()=>{},play:()=>new Promise(()=>{}),pause:async()=>events.push('pause')};
  state.watchVimeo=player;
  const context={state,document:{hidden:false},console:{debug(){},warn(){}},setTimeout(){},usesNativeUnifiedAudio:()=>true,
    playbackPositionSeconds:()=>600,setVimeoHandoffMuted:async(_,muted)=>events.push(muted?'mute':'unmute'),
    waitForVimeoHandoffReady:async(...args)=>{events.push('verify');return readyWait?readyWait(...args):ready;},
    finishAudioToVideoHandoff:async()=>{events.push('commit');state.current=null;state.nativePlayback.mode='VIDEO';if(commitFails)throw Error('native error');state.watchAudioToVideoHandoff=false;return true;},
    nativeMediaPlugin:()=>({getState:async()=>({...state.nativePlayback,audioPositionMs:603000})}),
    setPlaybackAuthorityFence:mode=>events.push(mode),
    PlaybackController:{startAudioAt:async(position,playing,options)=>{events.push({position,playing,volume:options.volume});Object.assign(state.nativePlayback,{mode:'AUDIO',audioIsPlaying:playing,audioPlayWhenReady:playing});}},
    refreshPersistentMiniVideoChrome(){},videoAudioPlaybackItem:()=>item};
  const start=mainSource.indexOf('async function resumeParkedVideoFromAudio(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('function watchHtml(',start))+'\nthis.resume=resumeParkedVideoFromAudio;',context);
  return {state,item,events,resume:()=>context.resume({duration:3663},'lecture',true)};
}
test('pending WebView play promise does not abort a destination with moving frames',async()=>{
  const f=resumeFixture();assert.equal(await f.resume(),true);
  assert.ok(f.events.indexOf('verify')<f.events.indexOf('commit'));
});
function initializedHandoffFixture(transaction) {
  const {state}=transaction;
  state.watchVimeoGeneration=3;state.watchVideo={id:'lecture'};state.watchMode='video';
  const ui=[];
  const context={state,document:{hidden:false},videoId:video=>video?.id, resumeParkedVideoFromAudio:()=>transaction.resume(),
    parkHostedVideoForAudio:()=>ui.push('park'),render:()=>ui.push('render'),updatePlayerUi:()=>ui.push('controls')};
  const start=mainSource.indexOf('async function finishInitializedNativeVideoHandoff(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('function initWatchVimeo(',start))+'\nthis.finish=finishInitializedNativeVideoHandoff;',context);
  return {ui,finish:()=>context.finish(state.watchVimeo,state.watchVideo,'lecture')};
}
test('fresh decoder after closing Watch uses the real bounded native handoff, including slow decoded frames',async()=>{
  const clock=handoffFixture({framesReadyAfterMs:9000});
  const transaction=resumeFixture({readyWait:(_,id,budget)=>clock.wait(clock.player,id,budget)});
  const initialized=initializedHandoffFixture(transaction);
  assert.equal(await initialized.finish(),true);
  assert.equal(transaction.state.nativePlayback.mode,'VIDEO');
  assert.equal(transaction.state.watchAudioToVideoHandoff,false);
  assert.ok(transaction.events.indexOf('verify')<transaction.events.indexOf('commit'));
  assert.deepEqual(initialized.ui,[]);
});
test('fresh decoder readiness failure rolls back visible Audio and clears the pending handoff',async()=>{
  const transaction=resumeFixture({ready:null});const initialized=initializedHandoffFixture(transaction);
  assert.equal(await initialized.finish(),false);
  assert.equal(transaction.state.nativePlayback.mode,'AUDIO');
  assert.equal(transaction.state.watchMode,'audio');
  assert.equal(transaction.state.current,transaction.item);
  assert.equal(transaction.state.watchAudioToVideoHandoff,false);
  assert.ok(!transaction.events.includes('commit'));
  assert.deepEqual(initialized.ui,['park','render','controls']);
});
test('fresh decoder cannot repaint a later lecture when its handoff finishes',async()=>{
  const transaction=resumeFixture({readyWait:()=>{transaction.state.watchVimeoGeneration++;return null;}});
  const initialized=initializedHandoffFixture(transaction);
  assert.equal(await initialized.finish(),false);
  assert.deepEqual(initialized.ui,[]);
});
test('failed readiness keeps the current Audio item and never commits VIDEO',async()=>{
  const f=resumeFixture({ready:null});assert.equal(await f.resume(),false);
  assert.equal(f.state.current,f.item);assert.equal(f.state.nativePlayback.mode,'AUDIO');assert.ok(!f.events.includes('commit'));
});
test('partial native commit rolls back to audible Audio at its advancing shadow position',async()=>{
  const f=resumeFixture({commitFails:true});assert.equal(await f.resume(),false);
  assert.equal(f.state.current,f.item);assert.equal(f.state.nativePlayback.mode,'AUDIO');
  assert.deepEqual(f.events.find(e=>typeof e==='object'),{position:603,playing:true,volume:1});
  assert.ok(f.events.indexOf('AUDIO')<f.events.indexOf('pause'),
    'Audio ownership must be fenced before the failed destination emits Pause');
});
test('failed preparation restarts Audio if muted WebView playback took its focus',async()=>{
  const f=resumeFixture({ready:null,focusStopped:true});assert.equal(await f.resume(),false);
  assert.equal(f.state.current,f.item);assert.ok(!f.events.includes('commit'));
  assert.deepEqual(f.events.find(e=>typeof e==='object'),{position:603,playing:true,volume:1});
});

test('Follow binding must not double-submit after a persistent video overlay survives renders', async () => {
  const start = mainSource.indexOf("  document.querySelectorAll('[data-follow-type]').forEach(el => {");
  const end = mainSource.indexOf("  document.querySelectorAll('[data-share-kind]')", start);
  assert.ok(start >= 0 && end > start, 'Follow event binding block must be present');
  const binding = mainSource.slice(start, end);
  const handlers = [];
  const element = {
    dataset: { followType: 'speaker', followKey: 'rav-qa', followLabel: 'Test Speaker' },
    addEventListener(type, handler) { assert.equal(type, 'click'); handlers.push(handler); }
  };
  let followCalls = 0;
  const resolvers = [];
  const context = {
    document: { querySelectorAll: selector => selector === '[data-follow-type]' ? [element] : [] },
    preserveWatchTime: async () => {},
    toggleFollow: () => new Promise(resolve => { followCalls++; resolvers.push(resolve); })
  };
  runInNewContext(binding, context); // Initial video render.
  runInNewContext(binding, context); // Save/Watch Later dialog render.
  runInNewContext(binding, context); // Closing dialog / re-render.
  assert.equal(handlers.length, 1, 'A persistent Follow button must have only one click handler');
  const evt = { stopPropagation() {} };
  const first = handlers[0](evt), second = handlers[0](evt); // Two fast taps.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(followCalls, 1, 'A second tap while waiting must not issue a second request');
  resolvers.shift()();
  await Promise.all([first, second]);
  const third = handlers[0](evt);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(followCalls, 2, 'The Follow button must work again once the request resolves');
  resolvers.shift()();
  await third;
});

test('audio downloads use the validated audio stream and preserve unlisted source identity', () => {
  assert.equal(audioDownloadPath('1233236785:585d5d53db'),'/audio/1233236785%3A585d5d53db');
  assert.equal(audioDownloadPath('drivev-example'),'/audio/drivev-example');
});
test('offline audio rejects 2,407-byte HTML/error page previously saved as one-hour MP3', () => {
  assert.ok(minimumOfflineAudioBytes(3663)>1_000_000);
  assert.equal(isPlausibleOfflineAudio(2407,3663),false);
  assert.equal(isPlausibleOfflineAudio(128_000,3663),false);
  assert.equal(isPlausibleOfflineAudio(4_000_000,3663),true);
});
test('offline audio refuses missing, zero and short downloaded files even without duration metadata', () => {
  assert.equal(isPlausibleOfflineAudio(0),false);
  assert.equal(isPlausibleOfflineAudio(null),false);
  assert.equal(isPlausibleOfflineAudio(8192),false);
  assert.equal(isPlausibleOfflineAudio(65536),true);
});

test('A paused/stalled HLS seek is not restarted continuously while Audio continues playing', async () => {
  const f=handoffFixture({movingClock:false,movingFrames:false});
  const player=f.player, element=player.getVideoElement();
  let attempts=0;
  const prior=player.setCurrentTime;
  player.setCurrentTime=async seconds=>{attempts++;return prior(seconds);};
  const result=await f.wait(player,'lecture',4000);
  assert.equal(result,null,'Frozen video must not be accepted as a successful handoff');
  assert.ok(attempts<=3,'Stalled WebView video must not restart HLS seeks every 90ms (got '+attempts+')');
  element.seeking=true;
  const f2=handoffFixture({movingClock:false,movingFrames:false});
  f2.player.getVideoElement().seeking=true;
  let racing=0;
  f2.player.setCurrentTime=async n=>{racing++;return n;};
  assert.equal(await f2.wait(f2.player,'lecture',2800),null);
  assert.equal(racing,0,'An active media element seek must not be interrupted with a second seek');
});

function homeSearchRenderFixture() {
  const state={screen:'home',scheduleDataLoaded:true,liveStatusLoaded:true};
  const field=()=>({id:'homeLibrarySearch',value:'',selectionStart:4,selectionEnd:4,
    focus(){document.activeElement=this;},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}});
  let input=field();input.value='IST-DL6067';
  const document={activeElement:input,getElementById:id=>id==='homeLibrarySearch'?input:null};
  const app={set innerHTML(_){input=field();document.activeElement=null;}};
  const context={state,document,app,syncAndroidBottomNavigation(){},syncAndroidVideoDisplay(){},homeSearchRenderDeferred:false,tabSwipeRenderGate:{shouldDefer:()=>false},
    androidPlayerSheetRenderGate:{shouldDefer:()=>false},preserveAndroidPlayerSheetScroll,Capacitor:{getPlatform:()=> 'android'},usageAnalytics:{setScreen(){}},analyticsScreenLabel:()=>'',
    homeHtml:()=>'',accountHtml:()=>'',shiurimHtml:()=>'',shell:x=>x,playlistPickerHtml:()=>'',bind(){},
    syncLivePlaybackAnalytics(){},updatePlayerUi(){},refreshOfflineButtonsForKey(){},setTimeout(){}};
  const start=mainSource.indexOf('function preserveHomeSearchDraft('),end=mainSource.indexOf('function syncOpenFilterChecks(',start);
  runInNewContext(mainSource.slice(start,end)+'\nthis.renderApp=render;',context);
  return {render:context.renderApp,state,document,input:()=>input};
}
test('a real Home render preserves typed lecture search, focus and cursor during feed refresh',()=>{
  const f=homeSearchRenderFixture();f.render();
  assert.equal(f.input().value,'IST-DL6067');assert.equal(f.document.activeElement,f.input());
  assert.equal(f.input().selectionStart,4);
});
test('leaving Home does not restore the old search focus or draft onto another screen',()=>{
  const f=homeSearchRenderFixture();f.state.screen='shiurim';f.render();
  assert.equal(f.input().value,'');assert.equal(f.document.activeElement,null);
});

test('a user HLS speed change updates the shared rate; internal catch-up rates do not call it',()=>{
  const source=readFileSync(new URL('../src/android-hls-video.js',import.meta.url),'utf8');
  const begin=source.indexOf("  speedSelect.addEventListener('change'"),end=source.indexOf('  pipButton.hidden',begin);
  let handler;const calls=[],video={playbackRate:1},speedSelect={value:'1.5',addEventListener(_event,callback){handler=callback;}};
  runInNewContext(source.slice(begin,end),{video,speedSelect,onSpeedChange:rate=>calls.push(rate)});
  handler();assert.equal(video.playbackRate,1.5);assert.deepEqual(calls,[1.5]);
  video.playbackRate=1.18;assert.deepEqual(calls,[1.5]);
});

test('native Home search keeps the original focused input connection while feed renders are deferred',()=>{
 const f=homeSearchRenderFixture(),original=f.input();f.render();
 assert.equal(f.input(),original,'Pending native keys must keep their original input node');
 original.value+='9';f.document.activeElement=null;f.render();
 assert.notEqual(f.input(),original);assert.equal(f.input().value,'IST-DL60679');
});
test('Android fullscreen Back exits the actual document fullscreen without changing the lecture',async()=>{
 const begin=mainSource.indexOf('window.__irgunExitDocumentFullscreen ='),end=mainSource.indexOf("document.addEventListener('fullscreenchange'",begin);
 for(const webkit of [false,true]) {
  const lecture={id:'lecture',time:641},window={};let exits=0;
  const document=webkit?{webkitFullscreenElement:{},webkitExitFullscreen(){exits++;this.webkitFullscreenElement=null;}}:{fullscreenElement:{},async exitFullscreen(){exits++;this.fullscreenElement=null;}};
  runInNewContext(mainSource.slice(begin,end),{document,window});await window.__irgunExitDocumentFullscreen();
  assert.equal(exits,1);assert.deepEqual(lecture,{id:'lecture',time:641});
 }
});

test('initial video Play waits for real bytes, deduplicates requests, and Pause cancels it',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date']});
 await fixture(recoverySources,'lecture',0,{onReady:async player=>{
  const video=player.getVideoElement();video.readyState=4;video.currentTime=0;let buffered=1,plays=0;
  video.buffered={length:1,start:()=>0,end:()=>buffered};
  video.play=()=>{plays++;video.paused=false;return Promise.resolve();};
  const first=player.play(),second=player.play();assert.equal(first,second,'Pending initial Play must be one transaction');
  await settleRecovery();t.mock.timers.tick(300);await settleRecovery();assert.equal(plays,0,'One buffered second must not start and stall playback');
  await player.pause();t.mock.timers.tick(300);await first;assert.equal(plays,0,'Pause must cancel startup before any real Play');
  // The HLS player now waits for 16s of real media; the old 8s mock
  // left its mocked Play promise pending forever and timed out CI preflight.
  buffered=18;
  const resumed=player.play();
  await settleRecovery();
  assert.equal(video.dataset.startupBufferRequired,'16',
    'Mocked HLS must enforce the real 16-second startup requirement');
  assert.equal(video.dataset.startupBufferAhead,'18',
    'The mock must expose enough actual buffered media to start once');
  await resumed;
  assert.equal(plays,1,'Sufficient actual media releases exactly one visible Play');
 }});
});

test('initial buffered Play remains allowed in actual system PiP while the Activity is hidden',async()=>{
 await fixture(recoverySources,'lecture',0,{isPictureInPicture:()=>true,onReady:async player=>{
  document.hidden=true;
  await player.play();
  assert.equal(player.getVideoElement().paused,false,'PiP must not be cancelled as a normal Home transition');
 }});
});

test('the observed paused MP4 two-second preload is primed silently and starts once at the requested position',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date']});
 await fixture({video:{mp4:'https://media.example.test/video.mp4'}},'lecture',723,{onReady:async player=>{
  const video=player.getVideoElement();video.readyState=4;video.videoWidth=1920;let end=725.282667;
  video.buffered={length:1,start:()=>723,end:()=>end};const plays=[],events=[];
  player.on('play',()=>events.push({kind:'play',time:video.currentTime}));
  player.on('timeupdate',()=>events.push({kind:'time',time:video.currentTime}));
  video.play=()=>{video.paused=false;plays.push({muted:video.muted,time:video.currentTime});video.dispatchEvent(new Event('play'));video.dispatchEvent(new Event('playing'));return Promise.resolve();};
  const first=player.play(),duplicate=player.play();assert.equal(first,duplicate);
  await settleRecovery();
  t.mock.timers.tick(1600);await settleRecovery();
  assert.equal(plays.length,1);assert.equal(plays[0].muted,true,'Decoder priming must not emit speech before enough bytes exist');
  video.currentTime=724;video.dispatchEvent(new Event('timeupdate'));assert.deepEqual(events,[],'Hidden priming must not publish playback/history at a different position');
  end=739;t.mock.timers.tick(200);await settleRecovery();t.mock.timers.tick(1);await settleRecovery();await first;
  assert.equal(plays.length,2);assert.equal(plays[1].muted,false);assert.equal(plays[1].time,723,'Actual media seek restores the requested position');
  assert.deepEqual(events,[{kind:'play',time:723}]);assert.equal(video.dataset.startupBufferPhase,'ready');
  assert.ok(Number(video.dataset.startupBufferAtStart)>=6,'Start still requires actual media runway');
 }});
});

for (const cancellation of ['pause','home','audio']) test('MP4 decoder priming respects '+cancellation+' and cannot pause a newer Play',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date']});
 await fixture({video:{mp4:'https://media.example.test/video.mp4'}},'lecture',723,{onReady:async player=>{
  const video=player.getVideoElement();let end=725;video.buffered={length:1,start:()=>723,end:()=>end};
  const first=player.play();await settleRecovery();t.mock.timers.tick(1600);await settleRecovery();
  assert.equal(video.muted,true);assert.equal(video.paused,false);
  if(cancellation==='home'){document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));}
  else {if(cancellation==='audio')await player.setMuted(true);await player.pause();}
  assert.equal(video.paused,true);assert.equal(video.muted,cancellation!=='pause');
  if(cancellation==='pause') {
   end=739;await player.play();assert.equal(video.paused,false);assert.equal(video.muted,false);
  }
  t.mock.timers.tick(200);await settleRecovery();await first;
  assert.equal(video.paused,cancellation!=='pause','Cancelled priming cannot stop a newer foreground playback');
  assert.equal(video.muted,cancellation!=='pause','Only the intended playback owner may produce speech');
 }});
});

test('initial native Audio prewarm cannot replace a foreground Video that is still loading',()=>{
  const state={watchVideo:{id:'lecture'},watchMode:'video',watchVimeoReady:false};
  const start=mainSource.indexOf('function reconcileNativeWatchAudio(');
  const context={state,document:{hidden:false},videoId:v=>v.id,
    ensureNativeAudioCurrentForWatch(){throw Error('Metadata must not claim Audio');}};
  runInNewContext(mainSource.slice(start,mainSource.indexOf('const PlaybackController =',start))+'\nthis.reconcile=reconcileNativeWatchAudio;',context);
  context.reconcile({mode:'AUDIO',lectureId:'lecture',currentPositionMs:0,audioAuthorityCommitted:false});
  assert.equal(state.watchMode,'video');
});

for(const home of [false,true])test('real Video authority confirmation preserves the latest Home intent, Home='+home,async()=>{
  let now=1000,cancelled=false;
  const doc={hidden:false},item={id:'lecture'},events=[];
  const element={paused:false,muted:true,volume:1,readyState:4,videoWidth:640};
  const player={getCurrentTime:async()=>600,getDuration:async()=>3663,getVideoElement:()=>element,
    play:async()=>{events.push('play');element.paused=false;}};
  const state={current:item,watchVimeo:player,watchVimeoGeneration:3,watchMode:'video',
    watchAudioToVideoHandoff:true,watchAudioToVideoHandoffId:'lecture'};
  const context={state,document:doc,Date:{now:()=>now},console:{debug(){},warn(){}},
    usesNativeUnifiedAudio:()=>true,setVimeoHandoffMuted:async(_,muted)=>{element.muted=muted;},
    PlaybackController:{switchAuthorityToVideo:async()=>events.push('VIDEO')},
    setTimeout:callback=>{now+=180;if(home&&!cancelled){cancelled=true;doc.hidden=true;state.nativeBackgroundHandoff=true;state.watchAudioToVideoHandoff=false;element.paused=true;}callback();}};
  const start=mainSource.indexOf('async function confirmVideoAudibleAfterAuthority(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('async function waitForVimeoHandoffReady(',start))+'\nthis.finish=finishAudioToVideoHandoff;',context);
  assert.equal(await context.finish('lecture',player),!home);
  assert.equal(state.watchAudioToVideoCommitBusy,false);
  assert.equal(state.current,home?item:null,'A cancelled foreground commit cannot clear background Audio');
  assert.deepEqual(events,['VIDEO'],'Home cancellation must never replay WebView video');
});

for(const playing of [false,true])test('closing a parked Video preserves Audio intent through native teardown, playing='+playing,async()=>{
  const events=[],item={id:'lecture'};
  const player={destroy:async()=>events.push('destroy')};
  const state={watchVideo:{id:'lecture'},watchVimeo:player,watchMode:'audio',watchVimeoGeneration:3,current:item};
  const context={state,usesNativeUnifiedAudio:()=>true,playbackIsPaused:()=>!playing,
    nativeMediaPlugin:()=>({restoreAudioAfterVideoTeardown:async args=>{assert.equal(args.lectureId,'lecture');assert.deepEqual(events,['destroy']);events.push('focus-guard');}}),
    PlaybackController:{refreshFromNative:async()=>events.push('refresh')},
    setTimeout:callback=>callback(),setNativeVideoFullscreen(){},clearPersistentVideoMount(){},render:()=>events.push('render')};
  const start=mainSource.indexOf('async function closeWatch(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('async function performWatchModeSwitch(',start))+'\nthis.close=closeWatch;',context);
  await context.close(false);assert.equal(state.watchVideo,null);assert.equal(state.current,item);
  assert.deepEqual(events,playing?['destroy','focus-guard','refresh','render']:['destroy','render']);
});

test('HLS synchronization accepts actual decoded progress after WebView stopped native Audio focus',async()=>{
  const f=handoffFixture({focusStopped:true});f.player.getSourceType=()=> 'hls';
  assert.ok(await f.wait(f.player,'lecture',3000)>600);
});

for(const failed of [false,true])test('actual offline deletion preserves the saved record when native file removal fails, failure='+failed,async()=>{
  const record={key:'video:lecture',id:'lecture',uri:'file:///private/lecture.mp3',path:'irgun-offline/lecture.mp3'},state={offlineDownloads:new Map([[record.key,record]])};
  const events=[];
  const context={state,usesNativeUnifiedAudio:()=>true,audioUrl:id=>'https://api.example/audio/'+id, nativeMediaPlugin:()=>({replaceOfflineAudioSource:async args=>{assert.equal(args.fileUrl,record.uri);assert.equal(args.networkUrl,'https://api.example/audio/lecture');events.push('swap');}}),Directory:{Data:'DATA'},Filesystem:{deleteFile:async args=>{assert.deepEqual(events,['swap']);assert.equal(args.path,record.path);events.push('delete');if(failed)throw Error('Native deletion failed');}},
    console:{warn(){}},currentLanguage:()=> 'en',persistOfflineDownloads:()=>events.push('persist'),
    setToast:text=>events.push(text),refreshInteractiveUi(){},refreshOfflineButtonsForKey(){}};
  const start=mainSource.indexOf('async function deleteOffline(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('async function playOfflineRecord(',start))+'\nthis.remove=deleteOffline;',context);
  assert.equal(await context.remove(record.key,{stayHere:true}),!failed);
  assert.equal(state.offlineDownloads.has(record.key),failed);
  assert.equal(events.includes('persist'),!failed,'A native error must not persist a fabricated removal');
  assert.equal(events.includes('Offline copy removed.'),!failed);
});

test('a genuine native Audio commit restores Home playback controls even if the WebView missed visibility events',()=>{
  const state={watchVideo:{id:'lecture'},watchMode:'video',watchVimeo:{pause:async()=>{}}};
  let adopted=false;
  const context={state,document:{hidden:false,getElementById:()=>null},videoId:v=>v.id,
    ensureNativeAudioCurrentForWatch:()=>{adopted=true;},setVimeoHandoffMuted:async()=>{},parkHostedVideoForAudio(){},render(){}};
  const start=mainSource.indexOf('function reconcileNativeWatchAudio(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('const PlaybackController =',start))+'\nthis.reconcile=reconcileNativeWatchAudio;',context);
  context.reconcile({mode:'AUDIO',lectureId:'lecture',currentPositionMs:732244,audioAuthorityCommitted:true});
  assert.equal(state.watchMode,'audio');assert.equal(state.watchResumeSeconds,732.244);assert.equal(adopted,true);
});

test('HLS with stopped native focus corrects decoded drift without widening the one-second source position limit',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  let position=604,frames=0,decodeAt=3500,lastAt=decodeAt;const seeks=[];
  const element={paused:false,seeking:false,readyState:1,videoWidth:640,playbackRate:1};
  const advance=()=>{
    if(Date.now()<decodeAt)return;
    element.readyState=4;position+=(Date.now()-Math.max(lastAt,decodeAt))/1000*element.playbackRate;
    frames+=Math.max(1,Math.floor((Date.now()-Math.max(lastAt,decodeAt))/1000*30));lastAt=Date.now();
  };
  element.getVideoPlaybackQuality=()=>{advance();return {totalVideoFrames:frames};};
  const player={getSourceType:()=> 'hls',getVideoElement:()=>element,getPaused:async()=>false,
    getCurrentTime:async()=>{advance();return position;},setCurrentTime:async target=>{
      seeks.push(Date.now());position=target;decodeAt=Date.now()+100;lastAt=decodeAt;element.readyState=1;return target;
    }};
  const state={watchAudioToVideoHandoff:true,watchAudioToVideoHandoffId:'lecture',playbackSpeed:1,
    nativePlayback:{mode:'AUDIO',audioIsPlaying:false,audioPlayWhenReady:false}};
  const context={state,Date,setTimeout,console:{warn(){}},usesNativeUnifiedAudio:()=>true,playbackPositionSeconds:()=>600};
  const start=mainSource.indexOf('async function waitForVimeoHandoffReady(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('function videoAudioPlaybackItem(',start))+'\nthis.wait=waitForVimeoHandoffReady;',context);
  let finished=false,result;
  const flight=context.wait(player,'lecture',8000).then(value=>{finished=true;result=value;});
  for(let i=0;i<100&&!finished;i++){t.mock.timers.tick(100);for(let j=0;j<12;j++)await Promise.resolve();}
  await flight;
  assert.ok(result>=600&&result<=601,'A muted moving decoder must not skip the parked Audio position');
  assert.equal(seeks.length,1,'Correct decoded drift once; do not reset a pending keyframe repeatedly');
  assert.ok(seeks[0]>=3500,'A pending keyframe must decode before a corrective seek');
});

test('offline deletion cannot unlink the active file when native source replacement fails',async()=>{
  const record={key:'video:lecture',id:'lecture',uri:'file:///private/lecture.mp3',path:'irgun-offline/lecture.mp3'};
  const state={offlineDownloads:new Map([[record.key,record]]),current:{id:'lecture',offline:true,offlineKey:record.key}};
  let filesystemCalls=0;
  const context={state,usesNativeUnifiedAudio:()=>true,audioUrl:()=> 'https://api.example/audio/lecture',
    nativeMediaPlugin:()=>({replaceOfflineAudioSource:async()=>{throw Error('Native swap failed');}}),
    Filesystem:{deleteFile:async()=>filesystemCalls++},Directory:{Data:'DATA'},console:{warn(){}},currentLanguage:()=> 'en',setToast(){}};
  const start=mainSource.indexOf('async function deleteOffline(');
  runInNewContext(mainSource.slice(start,mainSource.indexOf('async function playOfflineRecord(',start))+'\nthis.remove=deleteOffline;',context);
  assert.equal(await context.remove(record.key),false);assert.equal(filesystemCalls,0);
  assert.equal(state.offlineDownloads.get(record.key),record);assert.equal(state.current.offline,true);
});

test('offline confirmation stays asynchronous, cancel preserves the file, and duplicate approval cannot delete twice',async()=>{
 const state={offlineDownloads:new Map([['video:lecture',{key:'video:lecture'}]]),offlineDeleteKey:'',offlineDeleteBusy:false};
 const handlers={};let deletes=0,finish;
 const mount={innerHTML:'',querySelector:selector=>({addEventListener:(_event,handler)=>{handlers[selector]=handler;}})};
 const context={state,currentLanguage:()=> 'en',document:{getElementById:()=>mount},
  deleteOffline:async(key,options)=>{assert.equal(key,'video:lecture');assert.equal(options.stayHere,true);deletes++;await new Promise(r=>{finish=r;});}};
 const start=mainSource.indexOf('function requestOfflineDeletion(');
 runInNewContext(mainSource.slice(start,mainSource.indexOf('async function deleteOffline(',start))+'\nthis.request=requestOfflineDeletion;this.approve=confirmOfflineDeletion;',context);
 context.request('video:lecture');assert.match(mount.innerHTML,/role="dialog" aria-modal="true"/);assert.match(mount.innerHTML,/Remove the saved offline copy/);
 assert.equal(deletes,0);handlers['[data-offline-delete-cancel]']();assert.equal(state.offlineDeleteKey,'');assert.equal(deletes,0);assert.ok(state.offlineDownloads.has('video:lecture'));
 context.request('video:lecture');const pending=context.approve();assert.equal(deletes,1);assert.equal(state.offlineDeleteBusy,true);assert.match(mount.innerHTML,/disabled/);
 await context.approve();handlers['[data-offline-delete-cancel]']();assert.equal(deletes,1);assert.equal(state.offlineDeleteKey,'video:lecture');
 finish();await pending;assert.equal(state.offlineDeleteBusy,false);assert.equal(state.offlineDeleteKey,'');assert.equal(mount.innerHTML,'');
});

test('closing Video captures history but does not hold Back behind a pending server write',async()=>{
 const video={id:'lecture',duration:3600},player={getDuration:async()=>3600,destroy:async()=>{}};
 const state={watchVideo:video,watchMode:'video',watchVimeo:player,watchVimeoGeneration:5,watchResumeSeconds:743,current:null};
 let saved,cleared=false;
 const context={state,usesNativeUnifiedAudio:()=>true,playbackIsPaused:()=>false,
  preserveWatchTime:async()=>{},videoId:v=>v?.id||'',saveHistory:(...args)=>{saved=args;return new Promise(()=>{});},
  clearCurrentAudioStateForVideo(){},clearNativeMediaSession:()=>{cleared=true;},setNativeVideoFullscreen(){},
  clearPersistentVideoMount(){},usageAnalytics:{setMedia(){}},render(){},console};
 const start=mainSource.indexOf('async function closeWatch(');
 runInNewContext(mainSource.slice(start,mainSource.indexOf('async function performWatchModeSwitch(',start))+'\nthis.close=closeWatch;',context);
 await context.close();assert.equal(state.watchVideo,null);assert.equal(cleared,true);
 assert.deepEqual(saved.slice(0,5),['lecture','video',743,3600,false]);
});

for(const buffered of [true,false])test('observed HLS 4x catch-up clock stall uses one verified cached seek, buffered='+buffered,async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});let recoveredAt=null,recoveredPosition=0;const seeks=[];
 const native={mode:'AUDIO',audioIsPlaying:true,audioPlayWhenReady:true};
 const state={watchAudioToVideoHandoff:true,watchAudioToVideoHandoffId:'lecture',watchAudioToVideoTargetSeconds:605.58,playbackSpeed:1,nativePlayback:native};
 const position=()=>recoveredAt!=null?recoveredPosition+(Date.now()-recoveredAt)/1000:Date.now()<8000?605.58:Date.now()<11000?605.58+(Date.now()-8000)/1000*2:611.14;
 const element={paused:false,seeking:false,readyState:4,videoWidth:640,playbackRate:1,
  buffered:{length:buffered?1:0,start:()=>600.066666,end:()=>678.018666},
  getVideoPlaybackQuality:()=>({totalVideoFrames:Date.now()<8000?318:318+Math.floor((Date.now()-8000)/30)})};
 const player={getSourceType:()=> 'hls',getVideoElement:()=>element,getPaused:async()=>false,getCurrentTime:async()=>position(),
  setCurrentTime:async value=>{seeks.push({target:value,at:Date.now()});recoveredAt=Date.now();recoveredPosition=value;}};
 const context={state,Date,setTimeout,usesNativeUnifiedAudio:()=>true,playbackPositionSeconds:()=>605.58+Date.now()/1000,console:{warn(){}}};
 const start=mainSource.indexOf('async function waitForVimeoHandoffReady(');
 runInNewContext(mainSource.slice(start,mainSource.indexOf('function videoAudioPlaybackItem(',start))+'\nthis.wait=waitForVimeoHandoffReady;',context);
 let done=false,result;const pending=context.wait(player,'lecture',15000).then(r=>{done=true;result=r;});
 for(let i=0;i<180&&!done;i++){t.mock.timers.tick(100);for(let j=0;j<15;j++)await Promise.resolve();}
 await pending;assert.equal(seeks.length,buffered?1:0,'No repeated keyframe seek or seek to unavailable bytes');
 if(buffered){
  const seek=seeks[0];
  assert.ok(seek.at>=8000 && seek.at<15000,
    'A recovery seek must wait until decoded frames have actually moved, not abort a pending keyframe');
  assert.ok(Math.abs(seek.target-(605.58+seek.at/1000))<=.25,
    'The one verified cached seek must use Media3 Audio\'s actual advancing clock');
  assert.ok(Number.isFinite(result) && result>seek.target+.08,
    'After correcting its clock, Video must advance again with real decoded frames');
  // The faster buffered correction may succeed BEFORE the old hard-coded 617s
  // deadline. Actual synchronization, not an arbitrary lecture timestamp,
  // decides whether the handoff passed.
  assert.ok(Math.abs(result-(605.58+Date.now()/1000))<=1,
    'The one-second Audio/Video synchronization requirement stays active');
 }
 else assert.equal(result,null,'A stalled decoder without cached recovery media must remain a failed handoff');
 assert.equal(element.playbackRate,1,'Internal recovery must restore the chosen rate');
});

test('account QA observations and fixture selection never expose the application session credential',()=>{
 const source=readFileSync('.github/account-tests/observer.js','utf8');
 assert.doesNotMatch(source,/sessionToken|return state\.token|token:state\.token/);
 assert.match(source,/hasStoredSession:!!state\.token/,'Only a session-presence boolean may appear in observations');
 const script=readFileSync('scripts/android-emulator-account.mjs','utf8');
 assert.doesNotMatch(script,/ISTAccountTest\.sessionToken|JSON\.stringify\(state\.token\)|const actualToken=/);
 assert.match(script,/external revocation are unverified/,'Do not claim external revocation coverage without exercising it');
});

test('HLS manifest and fatal-error listeners install before any playlist request',()=>{
  const hlsSource=readFileSync(new URL('../src/android-hls-video.js',import.meta.url),'utf8');
  const start=hlsSource.indexOf('hls = new Hls({');
  const end=hlsSource.indexOf('await manifestReady;',start);
  assert.ok(start>=0&&end>start,'HLS.js attachment and manifest gating must be present');
  const attach=hlsSource.slice(start,end);
  for(const registration of ['Hls.Events.MANIFEST_PARSED','Hls.Events.ERROR',
    'Hls.Events.FRAG_CHANGED','Hls.Events.FRAG_BUFFERED']){
    const listener=attach.indexOf('hls.on('+registration);
    assert.ok(listener>=0&&listener<attach.indexOf('hls.loadSource(url)'),
      registration+' must be subscribed before loadSource can emit events');
    assert.ok(listener<attach.indexOf('hls.attachMedia(video)'),
      registration+' must be subscribed before attaching a media element');
  }
});

test('late HLS startup recovery retains one decoder and exposes real failure causes',()=>{
  const source=readFileSync(new URL('../src/android-hls-video.js',import.meta.url),'utf8');
  const start=source.indexOf("video.dataset.startupBufferPhase = 'late-hls-recovery'");
  const end=source.indexOf('if (priming && startupPrime === prime)',start);
  assert.ok(start>=0 && end>start,'HLS late decoder recovery must be present');
  const retry=source.slice(start,end);
  assert.match(retry,/waitForInitialVideoBuffer\(video/);
  assert.match(retry,/timeoutMs:15000/);
  assert.doesNotMatch(retry,/attachSource\(|new Hls\(|video\.src\s*=/,
    'A recovered HLS start must not replace the existing decoded media source');
  assert.match(source,/video\.dataset\.startupFailureReason/,
    'Startup failure must preserve the actual error for emulator diagnostics');
});


test('Android account regression runs the complete authenticated and media suite',()=>{
 const source=readFileSync('scripts/android-regression-extensions.mjs','utf8');
 const shell=readFileSync('scripts/android-emulator-account.sh','utf8');
 const workflow=readFileSync('.github/workflows/android-release-regressions.yml','utf8');
 assert.match(source,/await section\('Repeated audio\/video handoffs preserve playing position and single audio source'/);
 assert.match(source,/await section\('Small-screen English\/Hebrew layouts retain usable navigation'/);
 assert.match(shell,/node scripts\/android-emulator-account\.mjs/);
 assert.match(workflow,/Independent authenticated comment CRUD, deletion and rejection checks/);
 assert.match(workflow,/Independent Android token and website cookie session sync checks/);
 assert.doesNotMatch(source,/IRGUN_SMALL_SCREEN_ONLY/);
 assert.doesNotMatch(shell,/IRGUN_SMALL_SCREEN_ONLY/);
 assert.doesNotMatch(workflow,/QUICK-CHECK API34|IRGUN_SMALL_SCREEN_ONLY/);
});


test('Android account regression waits for the native Capacitor bridge before taking window bounds',()=>{
 const source=readFileSync(new URL('./android-regression-extensions.mjs',import.meta.url),'utf8');
 const shell=readFileSync(new URL('./android-emulator-account.sh',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../.github/workflows/android-release-regressions.yml',import.meta.url),'utf8');
 assert.match(source,/async function waitForNativeBridgeReady\(timeout=45000\)/);
 assert.match(source,/state\.qa&&state\.nativePromiseType==='function'/);
 assert.match(source,/await connect\(\);await waitForNativeBridgeReady\(\);bounds=await nativeBounds\(\)/);
 assert.match(shell,/node scripts\/android-emulator-account\.mjs/);
 assert.doesNotMatch(workflow,/IRGUN_SMALL_SCREEN_ONLY|QUICK-CHECK API34/);
});

test('Android floating navigation has narrow-viewport class and viewport-anchored layout',()=>{
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 const js=readFileSync(new URL('../src/android-bottom-navigation.js',import.meta.url),'utf8');
 assert.match(js,/innerWidth/);
 assert.match(js,/android-narrow-viewport/);
 assert.match(js,/addEventListener\('resize',syncCompactViewport/);
 assert.match(js,/visualViewport\?\.addEventListener\('resize',syncCompactViewport/);
 assert.match(css,/body\.irgun-android\.android-narrow-viewport #androidBottomNavigationMount\s*\{[\s\S]*?position:fixed!important/);
 assert.match(css,/body\.irgun-android\.android-narrow-viewport #androidBottomNavigationMount \.bottom-nav\.android-floating-nav\s*\{[\s\S]*?position:absolute!important/);
 assert.match(css,/grid-template-columns:\s*repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/pointer-events:auto!important/);
 assert.match(css,/text-overflow:ellipsis!important/);
});

test('Android Library recent searches remain hidden until search focus',()=>{
  const start=mainSource.indexOf('function searchAssistHtml() {');
  const end=mainSource.indexOf('function refreshSearchAssist() {',start);
  assert.ok(start>0&&end>start,'Find the actual search-assist HTML function');
  const platform={current:'android'};
  const state={libraryQuery:'',librarySearchAssistOpen:false,
    recentSearches:['Rav Yosef Sayagh','Rav Yaakov Zev Smith','Rav Asher Anshel Eckstein','bald','Rav Ahron Silberstein'],
    speakerById:new Map([['one',{id:'one'}]]),metadata:{topics:[]}};
  const esc=x=>String(x).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const context={state,Capacitor:{getPlatform:()=>platform.current},
    currentLanguage:()=> 'en',esc,svgIcon:()=>'<svg></svg>',
    lectureCodeQuery:()=>null,normalizeText:value=>String(value).toLowerCase(),
    speakerLabel:()=> 'Rav Yosef Sayagh',topicLabel:()=> ''};
  runInNewContext(mainSource.slice(start,end)+'\nthis.searchAssist=searchAssistHtml;',context);
  assert.equal(context.searchAssist(),'','Recent searches must not occupy page space until the user opens Search');
  state.librarySearchAssistOpen=true;
  const open=context.searchAssist();
  assert.match(open,/class="search-assist android-search-assist"/);
  assert.match(open,/Recent searches/);
  assert.equal((open.match(/class="search-assist-recent"/g)||[]).length,5);
  assert.doesNotMatch(open,/<small>Recent<\/small>/,
    'A compact search row must not repeat the large Recent subtitle');
  state.libraryQuery='Yosef';
  const typed=context.searchAssist();
  assert.match(typed,/data-search-suggestion="Rav Yosef Sayagh"/);
  assert.doesNotMatch(typed,/search-assist-recent/,
    'Typing replaces recent history with normal speaker/topic suggestions');
  state.librarySearchAssistOpen=false;
  assert.equal(context.searchAssist(),'','Choosing a suggestion or leaving the search should close it');
  platform.current='ios';
  state.libraryQuery='';
  assert.match(context.searchAssist(),/<small>Recent<\/small>/,
    'iOS retains its existing recent-search display behavior');
});

test('Android Library autocomplete floats over results and closes on outside interaction',()=>{
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  const c=css.slice(css.indexOf('/* Android Shiurim compact on-focus search history */'));
  assert.ok(c.length>1200);
  assert.match(c,/body\.irgun-android \.library-search-autocomplete/);
  assert.match(c,/position:relative/);
  assert.match(c,/#librarySearchAssist \{[\s\S]*?position:absolute/);
  assert.match(c,/top:calc\(100% \+ 5px\)/);
  assert.match(c,/max-height:min\(42vh,320px\)/);
  assert.match(c,/min-height:44px/);
  const start=mainSource.indexOf('function shiurimHtml() {');
  const end=mainSource.indexOf('function searchHtml() {',start);
  const html=mainSource.slice(start,end);
  assert.match(html,/class="library-search-autocomplete"/);
  assert.match(html,/id="librarySearchAssist"/);
  assert.match(html,/aria-controls="librarySearchAssist"/);
  assert.match(mainSource,/librarySearch\.addEventListener\('focus',openAssist\)/);
  assert.match(mainSource,/librarySearch\.addEventListener\('blur'/);
  assert.match(mainSource,/document\.addEventListener\('pointerdown',event=>\{/);
  assert.match(mainSource,/state\.librarySearchAssistOpen=false;[\s\S]*?runLibrarySearch\(\); refreshSearchAssist\(\);/);
});

// Android native Video must not duplicate Watch when its bridge identity lags
// behind the already-hosted same-lecture video, or reuse another lecture's host.
test('Android Audio to Video keeps exactly one lecture-matched Watch overlay',()=>{
  const helperStart=mainSource.indexOf('function hasPersistentVideoOverlayForCurrentWatch()');
  const helperEnd=mainSource.indexOf('\nfunction refreshPersistentMiniVideoChrome()',helperStart);
  const guardStart=mainSource.indexOf('function reconcileAndroidNativeWatchOverlay()');
  const guardEnd=mainSource.indexOf('\nfunction hostCurrentWatchOverlay(',guardStart);
  assert.ok(helperStart>=0&&helperEnd>helperStart&&guardStart>=0&&guardEnd>guardStart);
  assert.match(mainSource,/!hasPersistentVideoOverlayForCurrentWatch\(\) \? watchHtml\(\) : ''/,
    'Shell must not create another in-app Watch while a native-hosted Video exists');
  const host={dataset:{irgunWatchId:'lecture-1'},
    querySelector:sel=>sel==='.watch-overlay #watchVimeoFrame'?{}:null};
  const state={watchVideo:{id:'lecture-1'},watchMode:'video',
    watchHostedExternally:false,watchVimeo:{isIrgunNativeVideoPlayer:false}};
  let removed=0;
  const context={state,Capacitor:{getPlatform:()=> 'android'},persistentVideoMount:host,
    videoId:v=>v.id,document:{querySelectorAll:selector=>{
      assert.equal(selector,'#app .watch-overlay');
      return [{remove(){removed++;}}];
    }}};
  runInNewContext(mainSource.slice(helperStart,helperEnd)+
    mainSource.slice(guardStart,guardEnd)+
    '\nthis.hasHost=hasPersistentVideoOverlayForCurrentWatch;this.clean=reconcileAndroidNativeWatchOverlay;',context);
  assert.equal(context.hasHost(),true,'The actual video host must not depend on a transient JavaScript player flag');
  context.clean();
  assert.equal(removed,1,'Remove only the in-app duplicate, never the native host');
  assert.equal(state.watchHostedExternally,true);
  state.watchVideo={id:'lecture-2'};removed=0;state.watchHostedExternally=false;
  assert.equal(context.hasHost(),false,'A different lecture cannot reuse a stale player host');
  context.clean();assert.equal(removed,0);assert.equal(state.watchHostedExternally,false);
  state.watchVideo={id:'lecture-1'};state.watchMode='audio';
  assert.equal(context.hasHost(),false,'Parked Video must not hide the currently active Audio UI');
  state.watchMode='video';host.querySelector=()=>null;
  assert.equal(context.hasHost(),false,'Without the native video anchor, a fresh Watch can be shown');
});

test('Samsung Tab S10 regression requires signed-in native page switches and tablet emulator',()=>{
  const account=readFileSync('scripts/android-emulator-account.mjs','utf8');
  const matrix=readFileSync('.github/workflows/android-release-regressions.yml','utf8');
  assert.match(account,/const signedInRoute=\['home','account','shiurim','account','library','account','home','account'\]/);
  assert.match(account,/pass<3/);
  assert.match(account,/await tap\(target\)/);
  assert.match(account,/s\.ready&&s\.loggedIn&&s\.screen===target/);
  const tablet=matrix.split('  authenticated-account-35:')[1]?.split('  authenticated-account-36:')[0];
  assert.ok(tablet,'Android API 35 authenticated account job exists');
  assert.match(tablet,/device: pixel_c/);
  assert.match(tablet,/script: bash scripts\/android-emulator-account\.sh/);
});

test('Samsung signed-in regression runs a release-style minified app, not only debug',()=>{
  const gradle=readFileSync('android/app/build.gradle','utf8');
  const shell=readFileSync('scripts/android-emulator-account.sh','utf8');
  const matrix=readFileSync('.github/workflows/android-release-regressions.yml','utf8');
  const tablet=matrix.split('  authenticated-account-35:')[1]?.split('  authenticated-account-36:')[0];
  assert.match(gradle,/project\.hasProperty\('irgunR8TabletQa'\)/);
  assert.match(gradle,/signingConfig signingConfigs\.debug/);
  assert.match(gradle,/minifyEnabled true/);
  assert.match(shell,/IRGUN_ANDROID_TEST_APK/);
  assert.match(tablet,/-PirgunR8TabletQa=true :app:assembleRelease/);
  assert.match(tablet,/outputs\/mapping\/release\/mapping\.txt/);
  assert.match(tablet,/IRGUN_ANDROID_TEST_APK: android\/app\/build\/outputs\/apk\/release\/app-release\.apk/);
  assert.match(tablet,/device: pixel_c/);
});

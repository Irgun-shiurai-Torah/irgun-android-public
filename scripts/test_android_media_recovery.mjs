import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeVideoPictureVisible} from './android-native-picture-evidence.mjs';

const main=readFileSync('src/main.js','utf8');
const capture=(from,to)=>{
  const a=main.indexOf(from),b=main.indexOf(to,a+from.length);
  assert.ok(a>=0&&b>a,'Missing real Android implementation: '+from);
  return main.slice(a,b);
};
const loadCatalog=capture('async function bootstrapJson(path) {','function offlineBannerHtml() {');
const loadMeta=capture('async function loadMetadata() {','function getVideoFilterMeta(');
const fetchLibrary=(platform,network,cached=null)=>{
  const requests=[],cachedWrites=[],state={offlineMode:true,usingCachedLibrary:false,offlineCacheSavedAt:0};
  const args={API:'https://api.irgunshiuraitorah.com',
    navigator:{onLine:true},Capacitor:{getPlatform:()=>platform},
    state,fetchJsonWithTimeout:async (url,opt,timeout)=>{requests.push({url,timeout});return network(requests.length);},
    offlineCachePut:async (...values)=>{cachedWrites.push(values);},
    offlineCacheGet:async()=>cached,
    console:{warn:()=>{}},setTimeout,Date,Number,Promise};
  const f=new Function(...Object.keys(args),loadCatalog+'return bootstrapJson;')(...Object.values(args));
  return {run:(path='/video-map?driveLibrary=1')=>f(path),requests,cachedWrites,state};
};

test('Android retries a failing live video catalog once; it never substitutes an empty fake catalog',async()=>{
  const real=[{id:'1232214252',hasDriveVideo:true}];
  const r=fetchLibrary('android',attempt=>{
    if(attempt===1)throw Error('WebView network stack not ready');
    return real;
  });
  assert.equal(await r.run(),real);
  assert.equal(r.requests.length,2,'Only one bounded retry is allowed');
  assert.equal(r.requests[0].timeout,20000);
  assert.equal(r.requests[1].timeout,12000);
  assert.match(r.requests[0].url,/attempt=1/);
  assert.match(r.requests[1].url,/attempt=2/);
  assert.equal(r.cachedWrites.length,1,'Only a VERIFIED catalog is cached');
  assert.equal(r.state.offlineMode,false);
  const invalid=fetchLibrary('android',n=>n===1?{}:real);
  assert.equal(await invalid.run(),real,'An invalid JSON object is NOT a successful video catalog');
  assert.equal(invalid.requests.length,2);
});

test('Android still reports a real catalog outage when both attempts fail, and falls back to verified offline cache',async()=>{
  const broken=fetchLibrary('android',()=>{throw Error('network unavailable');});
  await assert.rejects(broken.run(),/network unavailable/);
  assert.equal(broken.requests.length,2);
  assert.equal(broken.cachedWrites.length,0);
  const offline=[{id:'verified-cached-video'}];
  const cached=fetchLibrary('android',()=>{throw Error('network unavailable');},
    {data:offline,savedAt:120});
  assert.equal(await cached.run(),offline);
  assert.equal(cached.state.usingCachedLibrary,true);
  assert.equal(cached.state.offlineMode,true);
  assert.equal(cached.state.offlineCacheSavedAt,120);
  const ios=fetchLibrary('ios',()=>{throw Error('network unavailable');});
  await assert.rejects(ios.run(),/network unavailable/);
  assert.equal(ios.requests.length,1,'iOS network behavior must not change');
  assert.doesNotMatch(ios.requests[0].url,/attempt=/,'iOS catalog request URL must retain its original shape');
});

test('Android retries bounded bundled metadata fetches without changing canonical speaker IDs',async()=>{
  const calls=[],timeouts=[],state={},meta={speakers:[{id:'s123',nameHe:'הרב אברהם יפה'}],topics:[{id:'t1',name:'Torah'}],lectures:{}};
  const args={state,Capacitor:{getPlatform:()=> 'android'},
    WEBSITE:'https://irgunshiuraitorah.com/',
    fetchJsonWithTimeout:async(url,_options,timeout)=>{calls.push(url);timeouts.push(timeout);
      if(calls.length===1)throw Error('AbortError: local asset request timed out');
      return meta;},
    learnSpeakerNameDictionary:()=>{},
    normalizeText:v=>String(v||'').trim().toLowerCase(),setTimeout,console:{warn(){} }};
  const f=new Function(...Object.keys(args),loadMeta+'return loadMetadata;')(...Object.values(args));
  await f();
  assert.deepEqual(calls,['/library-metadata.json','/library-metadata.json'],
    'Android should retry its bundled data without requiring the public internet');
  assert.deepEqual(timeouts,[5000,5000],'Each local metadata attempt must be bounded');
  assert.equal(state.speakerById.get('s123').nameHe,'הרב אברהם יפה');
  assert.equal(state.topicById.get('t1').name,'Torah');
  assert.equal(state.speakerAliasToId.get('הרב אברהם יפה'),'s123');
});

test('Android metadata startup falls back after bounded local failures and bounds the website request',async()=>{
  const calls=[],timeouts=[],state={};
  const args={state,Capacitor:{getPlatform:()=> 'android'},
    WEBSITE:'https://irgunshiuraitorah.com/',
    fetchJsonWithTimeout:async(url,_options,timeout)=>{calls.push(url);timeouts.push(timeout);
      throw Error('AbortError: request timed out');},
    learnSpeakerNameDictionary:()=>{},normalizeText:v=>String(v||'').trim().toLowerCase(),
    setTimeout,console:{warn(){}}};
  const f=new Function(...Object.keys(args),loadMeta+'return loadMetadata;')(...Object.values(args));
  await assert.rejects(f(),/request timed out/);
  assert.deepEqual(calls,['/library-metadata.json','/library-metadata.json',
    'https://irgunshiuraitorah.com/library-metadata.json']);
  assert.deepEqual(timeouts,[5000,5000,10000],
    'A cold Android startup must not wait forever on either local or remote metadata');
});

test('non-Android metadata loading keeps its existing local-first behavior',async()=>{
  const calls=[],state={},meta={speakers:[],topics:[],lectures:{}};
  const args={state,Capacitor:{getPlatform:()=> 'ios'},WEBSITE:'https://irgunshiuraitorah.com/',
    fetch:async url=>{calls.push(url);return {ok:true,json:async()=>meta};},
    fetchJsonWithTimeout:()=>{throw Error('iOS should retain its existing fetch path');},
    learnSpeakerNameDictionary:()=>{},normalizeText:v=>String(v||'').trim().toLowerCase(),setTimeout};
  const f=new Function(...Object.keys(args),loadMeta+'return loadMetadata;')(...Object.values(args));
  await f();assert.deepEqual(calls,['/library-metadata.json']);
});


test('Android startup shows cached lectures immediately without prematurely claiming the network failed',async()=>{
  const warmStart=capture('async function hydrateInitialCatalogCache() {','async function bootstrap(options = {}) {');
  const warm=(platform,online)=>{
    const cache={'bootstrap:/video-map?driveLibrary=1':{
      data:[{id:'cached-shiur',title:'Saved shiur'}],savedAt:987654321
    }};
    const state={libraryReady:false,loading:true,usingCachedLibrary:false,offlineCacheSavedAt:0,
      counter:50,trends:{week:new Map(),month:new Map(),all:new Map()},showVimeoOnlyApp:true};
    const renderCalls=[];
    const deps={state,loadMetadata:async()=>{},offlineCacheGet:async key=>cache[key]||null,
      visibleAndroidVideoCatalog:videos=>videos,
      enrichVideo:v=>v,enrichAudio:v=>v,itemDate:()=>0,videoId:v=>v.id,rawAudioId:v=>v.id,
      render:()=>renderCalls.push({ready:state.libraryReady,offline:state.usingCachedLibrary}),
      console:{warn:()=>{}},Capacitor:{getPlatform:()=>platform},
      navigator:{onLine:online}};
    const hydrate=new Function(...Object.keys(deps),warmStart+'return hydrateInitialCatalogCache;')(...Object.values(deps));
    return {run:hydrate,state,renderCalls};
  };
  const android=warm('android',true);
  assert.equal(await android.run(),true);
  assert.equal(android.state.libraryReady,true);
  assert.equal(android.state.videos[0].id,'cached-shiur');
  assert.equal(android.state.usingCachedLibrary,false,'A warm cache does not prove the live catalog is unavailable');
  assert.equal(android.state.offlineCacheSavedAt,987654321,'Keep the real cached timestamp');
  assert.deepEqual(android.renderCalls,[{ready:true,offline:false}],
    'Show cached lectures immediately, but without a misleading offline notice');
  const disconnected=warm('android',false);
  assert.equal(await disconnected.run(),true);
  assert.equal(disconnected.state.usingCachedLibrary,true,
    'A device reporting a genuine offline state may mark the saved library immediately');
  const ios=warm('ios',true);
  assert.equal(await ios.run(),true);
  assert.equal(ios.state.usingCachedLibrary,true,'Do not change iOS startup behavior');
});

test('Android optional feed outages never flag a working live video catalog as saved',async()=>{
  const real=[{id:'live-shiur'}];
  const f=fetchLibrary('android',attempt=>{
    if(attempt===1)return real;
    throw Error('secondary source not available');
  },{data:{items:[]},savedAt:100});
  assert.deepEqual(await f.run(),real);
  assert.equal(f.state.usingCachedLibrary,false);
  assert.deepEqual(await f.run('/audio-map'),{items:[]});
  assert.equal(f.state.usingCachedLibrary,false,
    'An optional audio cache must not claim the entire video catalog is offline');
  assert.deepEqual(await f.run('/trending?period=week&limit=2500'),{items:[]});
  assert.equal(f.state.offlineMode,false,
    'The successful live video catalog clears offline mode; optional fallback feeds must not re-enable it');
  assert.equal(f.state.usingCachedLibrary,false);
});

test('Android a genuine saved video fallback stays announced even after a secondary feed succeeds',async()=>{
  const fallback=[{id:'saved-shiur'}];
  const f=fetchLibrary('android',attempt=>{
    if(attempt<=2)throw Error('video-map offline');
    return {items:[]};
  },{data:fallback,savedAt:1234567});
  assert.deepEqual(await f.run(),fallback);
  assert.equal(f.state.usingCachedLibrary,true);
  assert.equal(f.state.offlineCacheSavedAt,1234567);
  assert.deepEqual(await f.run('/audio-map'),{items:[]});
  assert.equal(f.state.usingCachedLibrary,true,
    'A successful optional audio request may not hide a real video-map failure');
});

test('Visible moving pixels above partial letterboxing are video; a truly black PlayerView still fails',()=>{
  // Grounded by the recorded Android 15 screenshot: center mean ~.069,
  // significant visible upper video strip despite black bottom letterbox.
  assert.equal(nativeVideoPictureVisible(.069,.156),true);
  assert.equal(nativeVideoPictureVisible(.15,.01),true);
  assert.equal(nativeVideoPictureVisible(0,0),false);
  assert.equal(nativeVideoPictureVisible(.02,.005),false);
  assert.equal(nativeVideoPictureVisible(NaN,.16),false);
  assert.equal(nativeVideoPictureVisible(.08,NaN),false);
  const physical=readFileSync('scripts/android-emulator-native-media3.mjs','utf8');
  assert.match(physical,/nativeVideoPictureVisible\(mean,brightFraction\)/);
  assert.match(physical,/surfaceVisibleOnScreen/);
  assert.match(physical,/partialMoved\.media3\.frames>partial\.media3\.frames\+5/);
  assert.match(physical,/-threshold','18%'/);
});

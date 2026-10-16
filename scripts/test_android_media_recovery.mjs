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
  return {run:()=>f('/video-map?driveLibrary=1'),requests,cachedWrites,state};
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

test('Android retries the bundled speaker metadata without changing its canonical speaker IDs',async()=>{
  const calls=[],state={},meta={speakers:[{id:'s123',nameHe:'הרב אברהם יפה'}],topics:[{id:'t1',name:'Torah'}],lectures:{}};
  const args={state,Capacitor:{getPlatform:()=> 'android'},
    WEBSITE:'https://irgunshiuraitorah.com/',
    fetch:async url=>{calls.push(url);if(calls.length===1)throw Error('WebView local asset not ready');
      return {ok:true,json:async()=>meta};},
    learnSpeakerNameDictionary:()=>{},
    normalizeText:v=>String(v||'').trim().toLowerCase(),setTimeout};
  const f=new Function(...Object.keys(args),loadMeta+'return loadMetadata;')(...Object.values(args));
  await f();
  assert.deepEqual(calls,['/library-metadata.json','/library-metadata.json'],
    'Android should retry its bundled data without requiring the public internet');
  assert.equal(state.speakerById.get('s123').nameHe,'הרב אברהם יפה');
  assert.equal(state.topicById.get('t1').name,'Torah');
  assert.equal(state.speakerAliasToId.get('הרב אברהם יפה'),'s123');
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

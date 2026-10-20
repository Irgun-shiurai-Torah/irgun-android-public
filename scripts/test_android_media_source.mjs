import test from 'node:test';
import assert from 'node:assert/strict';
import {getAndroidHlsSource} from '../src/android-media-source.js';

const descriptor={video:{hls:'https://media.example/master.m3u8',mp4:null}};
test('a missing native video is identified as not ready instead of a connection failure',async()=>{
 await assert.rejects(sourceFixture(async()=>({ok:true,json:async()=>({video:{hls:null,mp4:null}})})),
  error=>error.code==='VIDEO_NOT_READY');
});
async function sourceFixture(fetchImpl,options){
 const original=globalThis.fetch;
 globalThis.fetch=fetchImpl;
 try{return await getAndroidHlsSource('https://api.example','lecture:hash',options);}
 finally{globalThis.fetch=original;}
}
test('offline restart waits for actual connectivity before retrying only the source descriptor',async()=>{
 let elapsed=0,requests=0;const waits=[];
 const source=await sourceFixture(async()=>{
  requests++;if(requests===1)throw new TypeError('Failed to fetch');
  assert.ok(elapsed>=600);return {ok:true,json:async()=>descriptor};
 },{now:()=>elapsed,isOnline:()=>elapsed>=600,wait:ms=>{elapsed+=ms;waits.push(ms);}});
 assert.equal(source.hls,descriptor.video.hls);assert.equal(requests,2);
 assert.deepEqual(waits,[200,200,200,1100]);
});
test('two transient descriptor failures recover with exactly three reads and bounded backoff',async()=>{
 const urls=[],waits=[];
 const source=await sourceFixture(async url=>{
  urls.push(url);if(urls.length<3)throw new TypeError('Failed to fetch');
  return {ok:true,json:async()=>descriptor};
 },{isOnline:()=>true,wait:ms=>waits.push(ms)});
 assert.equal(source.hls,descriptor.video.hls);assert.equal(urls.length,3);
 assert.match(urls[0],/lecture%3Ahash\/source.json\?client=android$/);
 assert.ok(urls.slice(1).every(url=>url.includes('?retry=') && url.includes('&client=android')));
 assert.deepEqual(waits,[1100,2200]);
});
test('persistent offline connection has an eight-second bound and never sends another request',async()=>{
 let elapsed=0,requests=0;
 await assert.rejects(sourceFixture(async()=>{requests++;throw new TypeError('Failed to fetch');},
  {now:()=>elapsed,isOnline:()=>false,wait:ms=>{elapsed+=ms;}}),/Failed to fetch/);
 assert.equal(elapsed,8000);assert.equal(requests,1);
});
test('persistent transport failure stays failed after its three descriptor reads',async()=>{
 let requests=0;
 await assert.rejects(sourceFixture(async()=>{requests++;throw new TypeError('Failed to fetch');},
  {isOnline:()=>true,wait:async()=>{}}),/Failed to fetch/);
 assert.equal(requests,3);
});
test('missing source and authentication failures never repeat a request',async()=>{
 for(const status of [401,403,404]){
  let requests=0;
  await assert.rejects(sourceFixture(async()=>{requests++;return {ok:false,status};},
   {isOnline:()=>true,wait:()=>{throw new Error('Unexpected retry');}}),new RegExp(String(status)));
  assert.equal(requests,1);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWN_NATIVE_MEDIA3_FIXTURE,fetchAndroidEmulatorJson,loadNativeEmulatorCatalogFixture
} from './android-emulator-media-fixture.mjs';

test('transient catalog outage retries then returns actual remote fixture',async()=>{
  let calls=0,waits=0;
  const result=await fetchAndroidEmulatorJson('https://api.example.test/video-map',{
    fetchImpl:async()=>{calls++;if(calls===1)throw new Error('Connection reset');
      return {ok:true,json:async()=>[{id:'id',title:'Real lecture'}]};},
    wait:async()=>{waits++;}
  });
  assert.equal(calls,2);assert.equal(waits,1);assert.equal(result.attempts,2);
});

test('non-retryable auth/permissions do not retry or silently replace fixtures',async()=>{
  let calls=0;
  await assert.rejects(fetchAndroidEmulatorJson('https://api.example.test/video-map',{
    fetchImpl:async()=>{calls++;return {ok:false,status:403};},wait:async()=>{throw Error('unexpected wait');}
  }),/HTTP 403/);
  assert.equal(calls,1);
});

test('a transient catalog transport timeout uses only a known real playable fixture',async()=>{
  const result=await loadNativeEmulatorCatalogFixture('1232214252',{
    getJson:async()=>{throw new Error('emulator network timeout');}
  });
  assert.equal(result.lookup,'pinned-fixture');
  assert.equal(result.target.shiurCode,'CH379');
  assert.equal(result.target.id,KNOWN_NATIVE_MEDIA3_FIXTURE.id);
  await assert.rejects(loadNativeEmulatorCatalogFixture('random-id',{
    getJson:async()=>{throw new Error('emulator network timeout');}
  }),/timeout/);
});

test('live catalog confirms the requested video and takes priority over pinned fallback',async()=>{
  const target={id:'1232214252',title:'Updated live CH379',duration:6100};
  const result=await loadNativeEmulatorCatalogFixture('1232214252',{
    getJson:async()=>({value:[target],attempts:1})
  });
  assert.equal(result.lookup,'live');assert.equal(result.target,target);
});

test('an actual live catalog omission cannot be hidden by pinned fixture',async()=>{
  await assert.rejects(loadNativeEmulatorCatalogFixture('1232214252',{
    getJson:async()=>({value:[{id:'different'}],attempts:1})
  }),/missing from live catalog/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchProbe} from './android-probe-request.mjs';

test('a failed connection is recorded and retried before validating the real response',async()=>{
  const failures=[];let calls=0;
  const response={status:200};
  const received=await fetchProbe('https://example.test/360p.m3u8',{},
    {failures,delay:async()=>{},fetchImpl:async()=>{
      if(++calls===1)throw new TypeError('fetch failed',{cause:{code:'ECONNRESET',message:'connection reset'}});
      return response;
    }});
  assert.equal(received,response);assert.equal(calls,2);
  assert.equal(failures.length,1);assert.equal(failures[0].causeCode,'ECONNRESET');
});
test('HTTP failures reach the original probe assertions without retries',async()=>{
  let calls=0;const failures=[];
  const response=await fetchProbe('https://example.test/360p.m3u8',{},
    {failures,fetchImpl:async()=>{calls++;return {status:503};}});
  assert.equal(response.status,503);assert.equal(calls,1);assert.deepEqual(failures,[]);
  assert.throws(()=>assert.equal(response.status,200));
});
test('persistent connection failures exhaust three attempts and remain failed',async()=>{
  const failures=[];let calls=0;
  await assert.rejects(fetchProbe('https://example.test/360p.m3u8',{},
    {failures,delay:async()=>{},fetchImpl:async()=>{calls++;throw new TypeError('fetch failed');}}),/fetch failed/);
  assert.equal(calls,3);assert.equal(failures.length,3);
});
test('programming errors are never treated as a transient connection failure',async()=>{
  let calls=0;
  await assert.rejects(fetchProbe('https://example.test/360p.m3u8',{},
    {fetchImpl:async()=>{calls++;throw new TypeError('invalid URL');}}),/invalid URL/);
  assert.equal(calls,1);
});

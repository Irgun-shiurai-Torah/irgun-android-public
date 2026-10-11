import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {audioDownloadPath} from '../src/offline-validation.js';

// Verify the actual file consumed by Android FileTransfer.saveOffline.
// Check real response status and bytes rather than accepting a successful fetch
// or a download progress event as proof that the MP3 is playable.
const id=String(process.env.IRGUN_AUDIO_TEST_ID||'1233236785:585d5d53db');
const path=audioDownloadPath(id);
const report={id,path,origin:'https://localhost',startedAt:new Date().toISOString()};
let response;
try {
  response=await fetch('https://api.irgunshiuraitorah.com'+path,{
    headers:{Origin:'https://localhost','X-Irgun-App':'1',Range:'bytes=0-65535'},
    signal:AbortSignal.timeout(50000),redirect:'follow'
  });
  report.status=response.status;
  report.contentType=response.headers.get('content-type');
  report.contentLength=response.headers.get('content-length');
  report.acceptRanges=response.headers.get('accept-ranges');
  report.contentRange=response.headers.get('content-range');
  report.finalHost=new URL(response.url).hostname;
  const cors=response.headers.get('access-control-allow-origin');
  report.cors=cors;
  assert.ok([200,206].includes(response.status),'Audio download must return an actual media response, not an HTTP error');
  assert.ok(/^audio\/|^application\/octet-stream\b/i.test(report.contentType||''),'Audio download returned HTML/JSON instead of MP3 audio');
  assert.ok(cors==='https://localhost'||new URL(response.url).hostname!=='api.irgunshiuraitorah.com',
    'Worker audio must allow the Android https://localhost Origin');
  const reader=response.body.getReader();
  let buffer=new Uint8Array(0),chunkCount=0;
  try{
    while(buffer.length<65536 && chunkCount++<25){
      const {done,value}=await reader.read();if(done)break;
      const limit=Math.min(value.length,65536-buffer.length);
      const next=new Uint8Array(buffer.length+limit);
      next.set(buffer);next.set(value.subarray(0,limit),buffer.length);buffer=next;
    }
  }finally{await reader.cancel().catch(()=>{});}
  report.sampledBytes=buffer.length;
  assert.ok(buffer.length>=4096,'MP3 audio must provide more than the short 2.4 KB HTML/error response');
  const opening=new TextDecoder('utf-8').decode(buffer.slice(0,256)).trimStart().toLowerCase();
  assert.ok(!opening.startsWith('<!doctype')&&!opening.startsWith('<html')&&!opening.startsWith('{'),
    'Downloaded audio is an HTML/JSON error payload, not audio');
  const id3=buffer[0]===0x49&&buffer[1]===0x44&&buffer[2]===0x33;
  const frame=[...buffer.slice(0,512)].some((n,i,arr)=>i<511&&n===0xff&&(arr[i+1]&0xe0)===0xe0);
  assert.ok(id3||frame,'Downloaded media does not start with an MP3 ID3 tag or MP3 frame sync');
  report.result='passed';
}catch(e){report.result='failed';report.error=String(e.stack||e);process.exitCode=1;}
finally{
  report.finishedAt=new Date().toISOString();
  mkdirSync('emulator-report',{recursive:true});
  writeFileSync('emulator-report/android-audio-download.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}

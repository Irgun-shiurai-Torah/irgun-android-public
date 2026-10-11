import assert from 'node:assert/strict';
import { writeFileSync,mkdirSync } from 'node:fs';
import {fetchProbe} from './android-probe-request.mjs';

const base='https://api.irgunshiuraitorah.com';
const id=String(process.env.IRGUN_HLS_TEST_ID||'1232214252');
const origin='https://localhost';
const report={id,origin,requests:[],transportFailures:[],result:'running'};
async function request(path,{range=false,binary=false}={}){
  report.activeRequest=path;
  const response=await fetchProbe(base+path,{headers:{Origin:origin,'X-Irgun-App':'1',...(range?{Range:'bytes=0-65535'}:{})}},
    {failures:report.transportFailures});
  const cors=response.headers.get('access-control-allow-origin');
  report.requests.push({path,status:response.status,cors,contentType:response.headers.get('content-type'),bytes:response.headers.get('content-length'),range:response.headers.get('content-range')});
  assert.equal(cors,origin,path+' must be CORS-accessible from Android WebView origin');
  assert.equal(response.status,range?206:200,path+' HTTP status');
  const payload=binary?new Uint8Array(await response.arrayBuffer()):await response.text();
  if(range)assert.equal(payload.byteLength,65536,'Requested 64KiB ranged HLS segment must return exactly those bytes');
  return payload;
}
try{
  const raw=await request('/media/'+encodeURIComponent(id)+'/source.json');
  const descriptor=JSON.parse(raw);
  assert.ok(descriptor.video?.hls,'Fixture must expose a real HLS URL; MP4 fallback does not count');
  assert.ok(String(descriptor.video.hls).endsWith('/master.m3u8'),'HLS descriptor must point to its master playlist');
  const master=await request('/media/'+encodeURIComponent(id)+'/master.m3u8');
  assert.ok(/^#EXTM3U/m.test(master),'Master must be an HLS playlist');
  assert.ok(/#EXT-X-STREAM-INF/m.test(master),'Master must contain playable variants');
  const media=await request('/media/'+encodeURIComponent(id)+'/360p.m3u8');
  assert.ok(/^#EXTM3U/m.test(media),'360p must be an HLS playlist');
  assert.ok(/#EXTINF/m.test(media),'360p must contain actual media segments');
  await request('/media/'+encodeURIComponent(id)+'/360p.ts',{range:true,binary:true});
  const script=await request('/media-player/hls.js');
  assert.ok(script.length>100000&&script.includes('Hls'),'Proxied HLS.js must be provided, not a redirect/error page');
  // The long October 6 lecture stalled precisely at 9:59.9 after seeking.
  // Inspect the actual server HLS manifest, not only our shorter fixture.
  const reportedId=String(process.env.IRGUN_REPORTED_HLS_TEST_ID||'1233236785:585d5d53db');
  const prefix='/media/'+encodeURIComponent(reportedId);
  const timelineDescriptor=JSON.parse(await request(prefix+'/source.json'));
  assert.ok(timelineDescriptor.video?.hls,'Reported lecture must advertise its HLS source');
  const reportedManifest=await request(prefix+'/360p.m3u8');
  assert.match(reportedManifest,/^#EXTM3U/m,'Reported lecture must serve a valid HLS media playlist');
  const segmentDurations=[...reportedManifest.matchAll(/^#EXTINF:([0-9.]+)/gm)].map(m=>Number(m[1]));
  const totalManifestSeconds=segmentDurations.reduce((sum,v)=>sum+v,0);
  report.reportedLecture={id:reportedId,manifestSegments:segmentDurations.length,manifestDurationSeconds:totalManifestSeconds,
    endList:reportedManifest.includes('#EXT-X-ENDLIST')};
  assert.ok(segmentDurations.length>=50,'Long lecture manifest must contain many media segments');
  assert.ok(totalManifestSeconds>1800,'Reported HLS manifest must cover at least 30 minutes, not stop around 10 minutes');
  report.result='passed';
}catch(e){report.result='failed';report.error=String(e.stack||e);report.cause=String(e.cause?.message||'');report.causeCode=String(e.cause?.code||'');process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();mkdirSync('emulator-report',{recursive:true});writeFileSync('emulator-report/hls-delivery.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}

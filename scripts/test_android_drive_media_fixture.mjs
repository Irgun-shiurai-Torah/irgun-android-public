import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {requireDriveBackedLecture} from './android-drive-media-fixture.mjs';

const catalog=[
  {id:'1233236785',hasDriveVideo:true,hasAudio:true,title:'Long October recording'},
  {id:'1232214252',hasDriveVideo:true,hasAudio:true,title:'QA recording'},
  {id:'1237352749',hasDriveVideo:false,hasAudio:false,title:'Vimeo-only'},
  {id:'video-no-mp3',hasDriveVideo:true,hasAudio:false}
];

test('Canonical Drive-backed fixtures are accepted for HLS and downloadable audio',()=>{
  assert.equal(requireDriveBackedLecture(catalog,'1233236785',{requireAudio:true}).id,'1233236785');
  assert.equal(requireDriveBackedLecture(catalog,'1232214252').id,'1232214252');
});

test('Vimeo-only, missing, invalid and audio-less fixtures are rejected',()=>{
  assert.throws(()=>requireDriveBackedLecture(catalog,'1237352749'),/Vimeo-only or not ingested/);
  assert.throws(()=>requireDriveBackedLecture(catalog,'1237352749',{requireAudio:true}),/Vimeo-only or not ingested/);
  assert.throws(()=>requireDriveBackedLecture(catalog,'1233236785:585d5d53db',{requireAudio:true}),/no longer in the current catalog/);
  assert.throws(()=>requireDriveBackedLecture(catalog,'video-no-mp3',{requireAudio:true}),/no audio/);
  assert.throws(()=>requireDriveBackedLecture(catalog,'unknown'),/no longer in the current catalog/);
  assert.throws(()=>requireDriveBackedLecture({},'1233236785'),/must return an array/);
  assert.throws(()=>requireDriveBackedLecture(catalog,''),/real lecture ID/);
});

test('Audio download and HLS probes select canonical actual Drive fixture by default',()=>{
 const audio=readFileSync('scripts/android-audio-download-probe.mjs','utf8');
 const hls=readFileSync('scripts/android-hls-delivery-probe.mjs','utf8');
 assert.match(audio,/IRGUN_AUDIO_TEST_ID\|\|'1233236785'/);
 assert.match(hls,/IRGUN_REPORTED_HLS_TEST_ID\|\|'1233236785'/);
 assert.match(audio,/requireDriveBackedLecture\(await catalogResponse\.json\(\),id,\{requireAudio:true\}\)/);
 assert.match(hls,/requireDriveBackedLecture\(catalog,reportedId\)/);
});

test('Closing Watch test checks actual same playing native lecture, not obsolete sharing alias',()=>{
  const qa=readFileSync('scripts/android-regression-extensions.mjs','utf8');
  assert.match(qa,/const retainedId=String\(playing\.native\.lectureId\|\|playing\.currentId\|\|''\)/);
  assert.match(qa,/s\.native\.audioIsPlaying&&/);
  assert.match(qa,/Number\(s\.native\.audioPositionMs\)>=previousPosition-1500/);
  assert.doesNotMatch(qa,/s\.currentId==='1233236785:585d5d53db'/);
});

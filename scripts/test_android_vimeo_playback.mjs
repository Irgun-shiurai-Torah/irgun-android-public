import test from 'node:test';
import assert from 'node:assert/strict';
import {createAndroidVimeoPlayer,isAndroidVimeoOnlyVideo} from '../src/android-vimeo-playback.js';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';


const video={id:'1235511026',vimeoId:'1235511026',hasDriveVideo:false};
test('Vimeo is selected only for an explicitly Vimeo-only numeric/unlisted catalog entry',()=>{
 assert.equal(isAndroidVimeoOnlyVideo(video),true);
 assert.equal(isAndroidVimeoOnlyVideo({...video,id:'123:abc',vimeoId:'123:abc'}),true);
 for(const item of [{...video,hasDriveVideo:true},{id:'123'},
   {...video,sourceType:'drive-library'},{hasDriveVideo:false,id:'drivev-123'},null])
  assert.equal(isAndroidVimeoOnlyVideo(item),false);
});
function fixture({movingReads=0,stuck=false,cancelAfterClose=false}={}){
 const calls=[],iframe={style:{visibility:'hidden'},src:'about:blank'};
 let reads=0,current=true;
 const options={video,iframe,resumeSeconds:123,nativeVideo:{close:async params=>{
  calls.push(['close',params]);if(cancelAfterClose)current=false;}},
  playback:{stopAudio:async params=>calls.push(['stopAudio',params]),getState:async()=>{
   calls.push(['observe']);const moving=stuck||reads++<movingReads;
   return {isPlaying:moving,audioIsPlaying:moving,audioPlayWhenReady:moving};}},
  loadSdk:async()=>{calls.push(['sdk']);return {Player:class {
   constructor(frame){calls.push(['player',frame.src]);this.frame=frame;}
  }};},isCurrent:()=>current,wait:async()=>calls.push(['wait'])};
 return {calls,iframe,options};
}
test('native playback is observed silent before exactly one Vimeo iframe/player starts at saved position',async()=>{
 const f=fixture({movingReads:2});const player=await createAndroidVimeoPlayer(f.options);
 assert.equal(player.isAndroidVimeoFallback,true);
 assert.deepEqual(f.calls.map(c=>c[0]),['close','stopAudio','observe','wait','observe','wait','observe','sdk','player']);
 assert.deepEqual(f.calls[0][1],{keepAudio:false});assert.deepEqual(f.calls[1][1],{clearLecture:true});
 assert.match(f.iframe.src,/player\.vimeo\.com\/video\/1235511026\?/);
 assert.match(f.iframe.src,/#t=123s$/);assert.equal(f.iframe.style.visibility,'');
});
test('previous native playback that will not stop prevents Vimeo autoplay within a bounded deadline',async()=>{
 const f=fixture({stuck:true});await assert.rejects(createAndroidVimeoPlayer(f.options),/Previous playback did not stop/);
 assert.equal(f.calls.filter(c=>c[0]==='observe').length,20);
 assert.equal(f.iframe.src,'about:blank');assert.ok(!f.calls.some(c=>c[0]==='sdk'||c[0]==='player'));
});
test('a canceled Vimeo transition cannot stop a newly selected lecture or open a stale iframe',async()=>{
 const f=fixture({cancelAfterClose:true});assert.equal(await createAndroidVimeoPlayer(f.options),null);
 assert.deepEqual(f.calls.map(c=>c[0]),['close']);assert.equal(f.iframe.src,'about:blank');
});
test('a native-ready lecture cannot reach the Vimeo preflight or create a second player',async()=>{
 const f=fixture();f.options.video={...video,hasDriveVideo:true};
 await assert.rejects(createAndroidVimeoPlayer(f.options),/explicitly Vimeo-only/);
 assert.deepEqual(f.calls,[]);
});

test('live Vimeo-only integration is explicitly SKIPPED by default without touching network or ADB',()=>{
  const dir=mkdtempSync(join(tmpdir(),'irgun-vimeo-skip-'));
  try {
    mkdirSync(join(dir,'emulator-report'));
    const processResult=spawnSync(process.execPath,[resolve('scripts/android-emulator-vimeo.mjs')],{
      cwd:dir,
      env:{...process.env,IRGUN_QA_ENABLE_VIMEO_ONLY:'0'},
      encoding:'utf8',timeout:12000
    });
    assert.equal(processResult.status,0,processResult.stderr||processResult.stdout||String(processResult.error));
    const result=JSON.parse(readFileSync(join(dir,'emulator-report','vimeo-only.json'),'utf8'));
    assert.equal(result.status,'skipped','Vimeo-only playback must not masquerade as a passing playback test');
    assert.equal(result.excludedCode,'IST-DL6074');
    assert.match(result.reason,/Google Drive/);
    assert.equal(result.fixture,undefined,'The skip must occur before catalog/network discovery');
    assert.deepEqual(result.checks,[]);
  } finally {
    rmSync(dir,{recursive:true,force:true});
  }
});

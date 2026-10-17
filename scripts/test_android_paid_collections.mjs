import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BELSKY_VOL1_ID,BELSKY_INDEX_URL,belskyAlbumForSession,belskySessionLabel,
  paidFolderPath,paidFolderKey,buildPaidFolderTree,nextPaidTrackInFolder,
  parseBelskyIndex,findBelskyQuestions} from '../src/android-paid-collections.js';
import {paidFolderTreeHtml,paidQuestionResultsHtml,paidQuestionIndexHtml} from '../src/android-paid-catalog-ui.js';
import {paidResumePositionSeconds,createPaidPlaybackEvidence,observePaidPlayback,verifiedPaidTrackEnd} from '../src/android-paid-playback-guard.js';
import {verifiedPurchasedIds,mergeVerifiedPaidCatalog,paidCatalogAccountKey} from '../src/android-paid-entitlements.js';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const product={id:'pap-childrens-stories-complete',owned:true};
const rows=[
  {id:'2',title:'2 - Shabbos',folders:['Volume 1','Shabbos Kodesh']},
  {id:'10',title:'10 - Shabbos',folders:['Volume 1','Shabbos Kodesh']},
  {id:'1',title:'1 - Shabbos',folders:['Volume 1','Shabbos Kodesh']},
  {id:'next-folder',title:'1 - Emunah',folders:['Volume 1','Emunah and Bitachon']},
  {id:'announcement',title:'IST English Announcement',folders:['Volume 1','Shabbos Kodesh']}
];

test('nested public previews aggregate track counts, but never show private tracks or IDs',()=>{
  const preview=[
    {folders:['Volume 1 — Exciting Stories','Tzitzis — Stories and Halachos'],trackCount:11},
    {folders:['Volume 1 — Exciting Stories','Shabbos Kodesh'],trackCount:12},
    {folders:['Volume 3 — Breishis for Children','Noach'],trackCount:3}
  ];
  const tree=buildPaidFolderTree(preview,product.id,{preview:true});
  assert.equal(tree.count,26);
  assert.deepEqual(tree.folders.map(x=>x.name),['Volume 1 — Exciting Stories','Volume 3 — Breishis for Children']);
  assert.equal(tree.folders[0].count,23);
  const html=paidFolderTreeHtml({...product,owned:false,folderPreview:preview},{esc:escape});
  assert.match(html,/Volume 3 — Breishis/);
  assert.match(html,/Shabbos Kodesh/);
  assert.match(html,/26 tracks/);
  assert.doesNotMatch(html,/data-paid-track=/);
  assert.doesNotMatch(html,/playbackUrl|driveId|audio\.mp3/);
});

test('owned tracks are visible only after purchase with nested details',()=>{
  const owned=paidFolderTreeHtml({...product,tracks:rows},{esc:escape});
  const locked=paidFolderTreeHtml({...product,owned:false,folderPreview:[{folders:['Volume 1','Shabbos Kodesh'],trackCount:4}]},{esc:escape});
  assert.match(owned,/<details/);
  assert.match(owned,/data-paid-track="2"/);
  assert.match(owned,/data-paid-folder-key=/);
  assert.doesNotMatch(locked,/data-paid-track=/);
  assert.ok(owned.indexOf('1 - Shabbos')<owned.indexOf('2 - Shabbos'));
  assert.ok(owned.indexOf('2 - Shabbos')<owned.indexOf('10 - Shabbos'));
});

test('native same-folder next-track uses natural number ordering and never crosses folders',()=>{
  assert.equal(nextPaidTrackInFolder(rows,'announcement').id,'1');
  assert.equal(nextPaidTrackInFolder(rows,'1').id,'2');
  assert.equal(nextPaidTrackInFolder(rows,'2').id,'10');
  assert.equal(nextPaidTrackInFolder(rows,'10'),null);
  assert.equal(nextPaidTrackInFolder(rows,'next-folder'),null);
  assert.equal(nextPaidTrackInFolder(rows,'missing'),null);
  assert.equal(nextPaidTrackInFolder([
    {id:'x',title:'A2',folders:['Album','Session 2']},
    {id:'y',title:'A3',folders:['Album','Session 3']}
  ],'x'),null);
});

test('Belsky seven album labels and exact 35 session boundaries are display-only',()=>{
  for(const [session,album] of [[1,1],[6,1],[7,2],[11,2],[12,3],[16,3],[17,4],[21,4],[22,5],[26,5],[27,6],[31,6],[32,7],[35,7]]){
    assert.equal(belskyAlbumForSession(session).number,album);
  }
  assert.equal(belskyAlbumForSession(0),null);
  assert.equal(belskyAlbumForSession(36),null);
  assert.deepEqual(paidFolderPath(BELSKY_VOL1_ID,['RB-01-01']),
    ['Album 1 — Sessions 01–06','Session 01']);
  assert.deepEqual(paidFolderPath(BELSKY_VOL1_ID,['RB-01-35']),
    ['Album 7 — Sessions 32–35','Session 35']);
  assert.equal(paidFolderKey(BELSKY_VOL1_ID,['Album 7 — Sessions 32–35','Session 35']),
    JSON.stringify([BELSKY_VOL1_ID,'Album 7 — Sessions 32–35','Session 35']));
  assert.deepEqual(paidFolderPath(product.id,['RB-01-01']),['RB-01-01']);
  assert.equal(belskySessionLabel(10,1),'Session 10 — Part 1');
  assert.equal(belskySessionLabel(10,2),'Session 10 — Part 2');
});

test('Belsky index searches 35 sessions and preserves Part 1 / Part 2 without mapping a question to audio',()=>{
  const raw={sessions:[]};
  for(let n=1;n<=35;n++)raw.sessions.push({disc:Math.min(7,Math.ceil(n/5)),session:n,part:0,
    topics:[{num:String(n),text:n===2?'Kosher shavers and trimmers':'Introduction'}]});
  raw.sessions[9].part=1;
  raw.sessions.push({disc:2,session:10,part:2,topics:[{num:'17',text:'Shabbos hotplate use'}]});
  const sessions=parseBelskyIndex(raw);
  assert.equal(sessions.length,36);
  assert.equal(findBelskyQuestions(sessions,'shavers').length,1);
  assert.equal(findBelskyQuestions(sessions,'hotplate').length,1);
  assert.equal(findBelskyQuestions(sessions,'hotplate','2').length,1);
  assert.equal(findBelskyQuestions(sessions,'hotplate','1').length,0);
  const html=paidQuestionResultsHtml({sessions,search:'hotplate',owned:false,esc:escape});
  assert.match(html.html,/Shabbos hotplate use/);
  assert.match(html.html,/Part 2/);
  assert.doesNotMatch(html.html,/data-paid-track|playbackUrl/);
  assert.match(paidQuestionIndexHtml({sessions,search:'',esc:escape}),/Search questions/);
});

test('published website JSON is the same index source; Android alone owns behavior changes',()=>{
  const main=readFileSync('src/main.js','utf8');
  const controller=readFileSync('src/android-paid-index-controller.js','utf8');
  const ui=readFileSync('src/android-paid-catalog-ui.js','utf8');
  assert.equal(BELSKY_INDEX_URL,'https://irgunshiuraitorah.com/assets/belsky-question-index.json');
  assert.match(controller,/CapacitorHttp\.get/);
  assert.match(controller,/parseBelskyIndex\(data\)/);
  assert.match(main,/Capacitor\.getPlatform\(\)==='android' \? \(item\.owned \? androidPaidFolderHtml/);
  assert.match(main,/finishPaidNativeTrack\(endedPaid,event\)/);
  assert.match(main,/nextPaidTrackInFolder\(product\.tracks,ended\.trackId\)/);
  assert.match(main,/requestPaidPlaySession\(productId, trackId, false\)/);
  assert.match(main,/await startAudio\(/);
  assert.match(main,/if\(state\.sleepMode==='end'\)/);
  assert.doesNotMatch(ui,/<audio|<video|<iframe|media\.m3u8|driveId/);
  assert.doesNotMatch(controller,/function .*playTrack|playPaidTrack\(/);
});

test('Android folder albums and long paid-track lists use page scrolling, not a trapped nested box',()=>{
  const css=readFileSync('src/style.css','utf8');
  const android=css.slice(css.indexOf('/* Android purchase catalog: website-inspired compact cards'));
  assert.ok(android.length>3000,'Android purchase-scrolling overrides must exist');
  const folderBlock=android.slice(android.indexOf('body.irgun-android .paid-folder-tree {'),
    android.indexOf('body.irgun-android .paid-folder-node {'));
  assert.match(folderBlock,/max-height:none !important/);
  assert.match(folderBlock,/overflow:visible !important/);
  assert.match(folderBlock,/overscroll-behavior-y:auto !important/);
  assert.match(folderBlock,/touch-action:pan-y/);
  assert.doesNotMatch(folderBlock,/overscroll-behavior[^;]*contain|overflow:auto|64vh/);
  assert.match(android,/\.paid-folder-track \{[\s\S]*?touch-action:pan-y/);
  assert.match(android,/\.paid-index-page,[\s\S]*?overscroll-behavior-y:auto/);
  assert.match(android,/\.purchased-library/);
  assert.match(android,/env\(safe-area-inset-bottom\)/);
  assert.match(android,/\.paid-card\.expanded \{ grid-column:1\/-1; \}/);
  const main=readFileSync('src/main.js','utf8');
  assert.match(main,/data-paid-collection-id="/);
  assert.match(main,/scrollIntoView\(\{block:'start',behavior:'smooth'\}\)/);
  assert.match(main,/event\.pointerType==='mouse'\|\|event\.pointerType==='pen'/,
    'Touch scrolling over owned tracks must not start protected playback prefetch');
  const previewHtml=paidFolderTreeHtml({...product,owned:false,folderPreview:[
    {folders:['Volume 1','Shabbos'],trackCount:20},
    {folders:['Volume 2','Pesach'],trackCount:30}
  ]},{esc:escape});
  assert.match(previewHtml,/data-paid-scroll-container="page"/);
  assert.match(previewHtml,/Open a folder to see its tracks/);
  assert.doesNotMatch(previewHtml,/max-height|overflow:|style=".*height/);
  assert.doesNotMatch(previewHtml,/data-paid-track="/);
  const tracks=Array.from({length:125},(_,index)=>({
    id:'track-'+index,title:'Track '+String(index+1),
    folders:['Album '+String(Math.floor(index/25)+1),'Session '+String(Math.floor(index/10)+1)]
  }));
  const html=paidFolderTreeHtml({...product,tracks},{esc:escape});
  assert.equal((html.match(/data-paid-track="/g)||[]).length,125,
    'Folder navigation must not truncate owned audio tracks');
  assert.equal((html.match(/data-paid-folder-key="/g)||[]).length>=5,true);
  assert.match(html,/class="paid-track-info"/);
  assert.match(html,/class="paid-folder-count"/);
  assert.doesNotMatch(html,/<audio|<video|<iframe/,'Native Media3 ownership remains unchanged');
});

test('locked album folders render ONLY inside the closed Description panel',()=>{
  const source=readFileSync('src/main.js','utf8');
  const begin=source.indexOf('function androidPaidFolderHtml(');
  const end=source.indexOf('function paidCheckoutModalHtml()',begin);
  assert.ok(begin>=0&&end>begin,'Paid storefront functions exist');
  const context={
    state:{paidExpandedId:'',paidOpenFolders:new Set(),isAdmin:false,adminMode:false},
    Capacitor:{getPlatform:()=> 'android'}, currentLanguage:()=> 'en',
    paidFolderTreeHtml, esc:escape, BELSKY_VOL1_ID,svgIcon:()=>'',logoArtworkHtml:()=>'<span>logo</span>',
    paidProductImageUrls:()=>[],paidProductTitle:item=>item.title||'Collection',
    paidProductPriceLabel:()=>'$9',paidRichDescription:value=>'<p>'+escape(value||'')+'</p>',
    paidMaterialsHtml:()=>'',
    tr:value=>value
  };
  const card=new Function(...Object.keys(context),source.slice(begin,end)+
    '\nreturn paidProductCard;')(...Object.values(context));
  const locked=card({id:'locked',title:'A paid collection',description:'About these recordings',
    available:true,owned:false,folderPreview:[{folders:['Halacha','Shabbos'],trackCount:12}]});
  const descriptionAt=locked.indexOf('data-paid-description-panel="locked"');
  const folderAt=locked.indexOf('data-paid-scroll-container="page"');
  assert.ok(descriptionAt>0 && folderAt>descriptionAt,'Folder content must follow the hidden Description panel');
  assert.match(locked.slice(descriptionAt,folderAt),/hidden>/);
  assert.doesNotMatch(locked.slice(0,descriptionAt),/paid-folder-overview|data-paid-folder-key=/);
  assert.equal((locked.match(/data-paid-scroll-container="page"/g)||[]).length,1);
  assert.match(locked,/data-paid-description="locked" aria-expanded="false">Description/);
  assert.doesNotMatch(locked,/data-paid-track=/);
  const owned=card({id:'owned',title:'Owned collection',available:true,owned:true,
    tracks:[{id:'t1',title:'Recording',folders:['Halacha']}]});
  assert.match(owned,/<div class="paid-album" hidden>/,'Purchased audio starts collapsed behind Listen');
  assert.match(owned,/data-paid-track="t1"/);
  const ownedDescription=owned.slice(owned.indexOf('data-paid-description-panel="owned"'),owned.indexOf('<div class="paid-album"'));
  assert.doesNotMatch(ownedDescription,/paid-folder-overview/);
});

test('stored paid-track progress at EOF always resumes from the beginning',()=>{
  assert.equal(paidResumePositionSeconds({positionSeconds:180,durationSeconds:180}),0);
  assert.equal(paidResumePositionSeconds({positionSeconds:178,durationSeconds:180}),0);
  assert.equal(paidResumePositionSeconds({positionSeconds:181,durationSeconds:180}),0);
  assert.equal(paidResumePositionSeconds({positionSeconds:90,durationSeconds:180}),90);
  assert.equal(paidResumePositionSeconds({positionSeconds:0,durationSeconds:180}),0);
  assert.equal(paidResumePositionSeconds({positionSeconds:9.5},10),0);
  assert.equal(paidResumePositionSeconds({positionSeconds:20},0),20);
});

test('Media3 buffering, instant END and mismatched old event never advance a paid track',()=>{
  const now=100000;
  const id='pap-whats-halacha-vol1-belsky:track-1';
  const g=createPaidPlaybackEvidence(id,now);
  observePaidPlayback(g,{lectureId:id,mode:'AUDIO',durationMs:180000,
    currentPositionMs:0,isPlaying:false,audioReady:false},now+200);
  assert.equal(verifiedPaidTrackEnd(g,{lectureId:id,durationMs:180000,currentPositionMs:180000},now+350),false);
  observePaidPlayback(g,{lectureId:'other-track',mode:'AUDIO',durationMs:180000,
    currentPositionMs:179000,isPlaying:true},now+1000);
  assert.equal(g.firstPlayingAt,0,'Stale snapshot must not make track ready');
  observePaidPlayback(g,{lectureId:id,mode:'AUDIO',durationMs:180000,
    currentPositionMs:0,isPlaying:true,audioReady:true},now+1100);
  assert.equal(verifiedPaidTrackEnd(g,{lectureId:id,durationMs:180000,currentPositionMs:180000},now+1200),false,
    'A brief prepared source at EOF is not actual listening');
  observePaidPlayback(g,{lectureId:id,mode:'AUDIO',durationMs:180000,
    currentPositionMs:1100,isPlaying:true},now+2300);
  assert.equal(verifiedPaidTrackEnd(g,{lectureId:'other-track',durationMs:180000,
    currentPositionMs:180000},now+2400),false);
  assert.equal(verifiedPaidTrackEnd(g,{lectureId:id,durationMs:180000,
    currentPositionMs:1100},now+2400),false,'Buffering at 1 second cannot finish the album');
  const completed=createPaidPlaybackEvidence(id,now);
  observePaidPlayback(completed,{lectureId:id,mode:'AUDIO',durationMs:180000,
    currentPositionMs:177000,isPlaying:true,audioReady:true},now+1500);
  observePaidPlayback(completed,{lectureId:id,mode:'AUDIO',durationMs:180000,
    currentPositionMs:178300,isPlaying:true,audioReady:true},now+2900);
  observePaidPlayback(completed,{lectureId:id,mode:'AUDIO',durationMs:180000,
    currentPositionMs:179500,isPlaying:true},now+4200);
  assert.equal(verifiedPaidTrackEnd(completed,{lectureId:id,durationMs:180000,
    currentPositionMs:180000},now+4500),true,
    'Verified Media3 duration completion should play next in same folder');
});


test('authenticated purchases are recognized without pressing Buy Securely',()=>{
  const confirmed=verifiedPurchasedIds({items:[
    {id:'pap-whats-halacha-vol1-belsky',accessOwned:true},
    {id:'pap-public',accessOwned:false}
  ]});
  assert.deepEqual([...confirmed],['pap-whats-halacha-vol1-belsky']);
  const catalog=mergeVerifiedPaidCatalog([
    {id:'pap-whats-halacha-vol1-belsky',owned:false,available:true,tracks:[]},
    {id:'pap-public',owned:false,available:true}
  ],confirmed);
  assert.equal(catalog[0].owned,true,'Verified purchase must display Listen, not Buy Securely');
  assert.equal(catalog[1].owned,false,'Do not fabricate a purchase for a different product');
  assert.equal(catalog[0].tracks.length,0,'Ownership UI never invents private media URLs');
  assert.equal(mergeVerifiedPaidCatalog(catalog,confirmed)[0].owned,true);
  assert.equal(paidCatalogAccountKey(null,false),'guest');
  assert.equal(paidCatalogAccountKey({id:12},true),'account:12');
  const main=readFileSync('src/main.js','utf8');
  const load=main.slice(main.indexOf('async function loadPaidCatalog('),
    main.indexOf('function warmNativePaidCatalog('));
  assert.ok(load.indexOf("apiJson('/paid-audio/my')")<load.indexOf('const paidRequest='),
    'Authenticated /my entitlement reconciliation must complete BEFORE catalog fetch');
  assert.match(load,/paidCatalogOwnerKey=identity/);
  assert.match(main,/state\.paidCatalogOwnerKey!==currentPaidCatalogOwnerKey\(\)/);
  assert.match(main,/return Capacitor\.getPlatform\(\)==='android'[\s\S]*?paidCatalogAccountKey/);
});

test('premature paid END is silent during buffering and retries the SAME track only if really stalled',async()=>{
  const source=readFileSync('src/main.js','utf8');
  const begin=source.indexOf('let pendingPaidEndCheck=null;');
  const end=source.indexOf('async function savePaidAudioProgress(',begin);
  assert.ok(begin>=0&&end>begin,'Delayed Media3 end-recovery source must exist');
  const clock={now:100000},timers=new Map(),trace=[];
  let serial=0,playing=false;
  const fakeDate={now:()=>clock.now};
  const setTimer=(fn,delay)=>{const id=++serial;timers.set(id,{fn,at:clock.now+delay});return id;};
  const runUntil=async until=>{
    for(let attempts=0;attempts<20;attempts++){
      const entries=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at);
      const next=entries[0];
      if(!next||next[1].at>until)break;
      clock.now=next[1].at;
      timers.delete(next[0]);
      await next[1].fn();
    }
    clock.now=until;
  };
  const productId=BELSKY_VOL1_ID,id=productId+':t1';
  const product={id:productId,owned:true,tracks:[
    {id:'t1',title:'First',folders:['Halacha','Session 1']},
    {id:'t2',title:'Second',folders:['Halacha','Session 1']},
    {id:'t3',title:'Another',folders:['Halacha','Session 2']}
  ]};
  const state={current:{kind:'paid-audio',id,paidAudioId:productId,trackId:'t1'},
    paidCatalog:[product],paidTrackEvidence:createPaidPlaybackEvidence(id,clock.now-100),
    paidLastFinishedKey:'',paidPrematureRetryId:'',paidPlaybackGeneration:4,
    sleepMode:'off',user:{id:'qa'}};
  const ctx={state,Date:fakeDate,setTimeout:setTimer,clearTimeout:id=>timers.delete(id),
    verifiedPaidTrackEnd,observePaidPlayback,savePaidAudioProgress:async()=>{},
    setToast:m=>trace.push(['toast',m]),updatePlayerUi:()=>{},
    nextPaidTrackInFolder,prefetchPaidTrack:()=>{},
    playPaidTrack:async(p,t,options)=>{trace.push(['play',t,options]);return true;},
    nativeMediaPlugin:()=>({getState:async()=>({
      lectureId:id,mode:'AUDIO',audioReady:playing,hasAudioSource:true,
      isPlaying:playing,audioIsPlaying:playing,
      currentPositionMs:playing?1400:0,durationMs:180000
    })})
  };
  const fns=new Function(...Object.keys(ctx),source.slice(begin,end)+
    '\nreturn {finishPaidNativeTrack,clearPendingPaidEndCheck};')(...Object.values(ctx));
  const ended={...state.current};
  const premature={lectureId:id,mode:'AUDIO',currentPositionMs:180000,durationMs:180000};
  assert.equal(await fns.finishPaidNativeTrack(ended,premature),false);
  assert.equal(trace.length,0,'No immediate error and no premature next-track transition');
  clock.now+=1500;playing=true;
  await runUntil(104000);
  assert.equal(trace.length,0,'Media3 began playing after loading: do NOT emit a failure or retry');
  const evidence=state.paidTrackEvidence;
  assert.equal(evidence.endedHandled,false,'Actual playback evidence must still be observed after early END');
  observePaidPlayback(evidence,{lectureId:id,mode:'AUDIO',isPlaying:true,
    currentPositionMs:177000,durationMs:180000},104100);
  observePaidPlayback(evidence,{lectureId:id,mode:'AUDIO',isPlaying:true,
    currentPositionMs:178400,durationMs:180000},105400);
  assert.equal(await fns.finishPaidNativeTrack(ended,premature),true);
  assert.deepEqual(trace.filter(x=>x[0]==='play').map(x=>x[1]),['t2'],
    'Only a genuine completed recording advances to the next track in the SAME folder');
  // Another fresh recording fails to start for over seven seconds: retry the
  // same recording, NOT track two, and never display a false error at 2 sec.
  state.paidLastFinishedKey='';
  state.paidTrackEvidence=createPaidPlaybackEvidence(id,200000);
  state.paidPrematureRetryId='';
  playing=false;clock.now=200000;
  trace.length=0;
  assert.equal(await fns.finishPaidNativeTrack(ended,premature),false);
  await runUntil(202900);
  assert.deepEqual(trace,[],'First premature native END remains silent while loading');
  await runUntil(208100);
  assert.deepEqual(trace.filter(x=>x[0]==='play').map(x=>x[1]),['t1'],
    'After confirmed stall, retry only the SAME signed track');
  assert.equal(trace.some(x=>x[0]==='toast'&&/Could not load/.test(x[1])),false);
  fns.clearPendingPaidEndCheck();
});

test('paid emulator observes actual selected Purchased tab and safely escaped folder controls',()=>{
  const qa=readFileSync('scripts/android-emulator-paid-playback.mjs','utf8');
  assert.match(qa,/el\.dataset\.librarySection==="purchased"&&el\.classList\.contains\("active"\)/);
  assert.doesNotMatch(qa,/JSON\.stringify\(\{section:state\.librarySection/);
  assert.match(qa,/CSS\.escape\(details\.dataset\.paidFolderKey\)/);
  assert.match(qa,/CSS\.escape\(e\.dataset\.paidTrack\)/);
  assert.match(qa,/openPurchasedLibrary\(\)/);
});

test('paid playback emulator uses interpolated owned collection selectors',()=>{
  const qa=readFileSync('scripts/android-emulator-paid-playback.mjs','utf8');
  assert.ok(qa.includes('tap(`[data-paid-collection-id="${productId}"] [data-paid-expand]`'));
  assert.ok(qa.includes('tap(`[data-paid-collection-id="${productId}"] ${summary}`'));
  assert.ok(qa.includes('tap(`[data-paid-collection-id="${productId}"] ${track.selector}`'));
  assert.ok(!qa.includes("tap('[data-paid-collection-id="),
    'Single-quoted template placeholders never substitute the product ID in actual ADB taps');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BELSKY_VOL1_ID,BELSKY_INDEX_URL,belskyAlbumForSession,belskySessionLabel,
  paidFolderPath,paidFolderKey,buildPaidFolderTree,nextPaidTrackInFolder,
  parseBelskyIndex,findBelskyQuestions} from '../src/android-paid-collections.js';
import {paidFolderTreeHtml,paidQuestionResultsHtml,paidQuestionIndexHtml} from '../src/android-paid-catalog-ui.js';

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
  assert.match(main,/Capacitor\.getPlatform\(\)==='android' \? androidPaidFolderHtml/);
  assert.match(main,/finishPaidNativeTrack\(endedPaid\)/);
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

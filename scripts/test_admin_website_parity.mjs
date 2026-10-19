import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAdminScheduleJson,parseAdminDateCsv,planAdminDateChanges,createWebsiteAdminParity} from '../src/admin-website-parity.js';

test('bulk schedule preview rejects invalid rows and preserves sourceId',()=>{
  const ok=parseAdminScheduleJson(JSON.stringify({sourceId:'2-cheshvan',events:[
    {date:'2026-10-19',startTime:'09:15',location:'Boro Park',speaker:'Rav Smith',title:'Halacha'}
  ]}));
  assert.equal(ok.sourceId,'2-cheshvan');assert.equal(ok.events.length,1);
  assert.throws(()=>parseAdminScheduleJson(''),/Paste schedule/);
  assert.throws(()=>parseAdminScheduleJson('{}'),/events array/);
  assert.throws(()=>parseAdminScheduleJson('not json'),/Invalid JSON/);
  assert.throws(()=>parseAdminScheduleJson(JSON.stringify({events:[{date:'2026-02-31',location:'X'}]})),/valid date/);
  assert.throws(()=>parseAdminScheduleJson(JSON.stringify({events:Array(101).fill(ok.events[0])})),/at most 100/);
});

test('date CSV handles quoted commas, embedded newlines, and BOM',()=>{
  const rows=parseAdminDateCsv('\ufeffVimeo ID,New Lecture Date,Irgun Title (DO NOT CHANGE)\r\n123,2026-10-19,"Topic, Subtopic"\r\n456,2026-10-20,"Two\nlines"\r\n');
  assert.equal(rows.length,3);
  assert.equal(rows[1][2],'Topic, Subtopic');assert.equal(rows[2][2],'Two\nlines');
});

test('date-only plan refuses changed titles, duplicates, missing IDs and impossible dates',()=>{
  const videos=[
    {id:'1',title:'One: Story',lectureDate:'2026-09-01'},
    {id:'2',title:'Second Shiur',lectureDate:'2026-10-10'},
    {id:'3',title:'Third Shiur',lectureDate:'2026-10-15'}
  ];
  const csv='Vimeo ID,New Lecture Date,Irgun Title (DO NOT CHANGE)\n'+
    '1,2026-10-19,One Story\n2,2026-10-10,Second Shiur\n'+
    '3,2026-10-20,Wrong Title\n4,2026-10-20,Other\n'+
    '1,2026-10-21,One Story\n3,2026-02-30,Third Shiur';
  const plan=planAdminDateChanges(csv,videos);
  assert.deepEqual(plan.items.map(x=>x.status),['ready','unchanged','review','missing','invalid','invalid']);
  assert.deepEqual(plan.counts,{ready:1,unchanged:1,review:1,missing:1,invalid:2});
  assert.deepEqual(Object.keys(plan.items[0]).sort(),
    ['id','newDate','csvTitle','currentTitle','currentDate','status'].sort());
  assert.throws(()=>planAdminDateChanges('foo,bar\na,b',videos),/Expected the Irgun/);
});

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

test('website admin panels require authenticated admin, escape data, and never leak between users',async()=>{
  let allowed=false,account='a',rerenders=0;
  const requests=[];
  const controller=createWebsiteAdminParity({
    apiJson:async p=>{requests.push(p);return {items:[{id:'x',text:'<script>',author:'<b>',videoId:'1'}],total:1,page:1,hasMore:false}},
    esc:escapeHtml,isAdmin:()=>allowed,isAdminMode:()=>true,userKey:()=>account,
    render:()=>{rerenders++},toast:()=>{},ask:()=>true
  });
  assert.equal(controller.html(),'');
  allowed=true;
  assert.match(controller.html(),/Comments Management/);
  assert.match(controller.html(),/Playback Routing/);
  const listeners={};
  const host={addEventListener:(name,handler)=>{listeners[name]=handler}};
  controller.bind({getElementById:id=>id==='websiteAdminParity'?host:null});
  assert.equal(typeof listeners.click,'function');
  const choice={dataset:{hubPanel:'comments'}};
  listeners.click({target:{closest:s=>s==='[data-hub-panel]'?choice:null}});
  await controller.loadOpened();
  assert.deepEqual(requests,['/admin/comments?page=1']);
  assert.match(controller.html(),/&lt;script&gt;/);
  assert.doesNotMatch(controller.html(),/<script>/);
  account='b';
  assert.doesNotMatch(controller.html(),/&lt;script&gt;/);
  assert.ok(rerenders>0);
});

test('main app integrates the admin panel without weakening Worker authorization or changing public controls',()=>{
  const main=readFileSync('src/main.js','utf8');
  const mod=readFileSync('src/admin-website-parity.js','utf8');
  assert.match(main,/import \{ createWebsiteAdminParity \} from '\.\/admin-website-parity\.js';/);
  assert.match(main,/isAdmin:\(\)=>Boolean\(state\.user&&state\.isAdmin\)/);
  assert.match(main,/apiJson,esc/);
  assert.match(main,/websiteAdminParity\.html\(\)/);
  assert.match(main,/websiteAdminParity\.bind\(document\)/);
  for(const url of ['/admin/contact-messages','/admin/comments','/admin/playback-routing',
    '/admin/city-admins','/admin/drive-video-cities','/admin/analytics/live',
    '/admin/analytics/history','/admin/video','/admin/schedule'])
    assert.ok(mod.includes(url),'Missing protected endpoint '+url);
  assert.match(mod,/confirmAdminMode/);
  assert.doesNotMatch(mod,/localStorage\.(setItem|getItem)/,'No admin data cached in localStorage');
  assert.doesNotMatch(mod,/Authorization.*Bearer/,'Never assemble or expose an account token in admin panel HTML');
});


test('City Admin upload and edit are protected and reuse the Android authenticated API',async()=>{
  const {createCityAdminController,cityAdminPanelHtml}=await import('../src/admin-city-panel.js');
  const markup=cityAdminPanelHtml();
  for(const id of ['cityAdminCitySelect','cityUploadMediaKind','cityUploadFile',
    'cityAdminUploadForm','cityAdminEditorForm','cityAdminShiurList','cityEditTitle',
    'cityEditLectureDate','cityEditShiurCode'])
    assert.ok(markup.includes('id="'+id+'"'), 'Missing city upload/edit control '+id);
  const controller=createCityAdminController({apiJson:async()=>({}),apiFetch:async()=>({ok:true})});
  assert.equal(typeof controller.bind,'function');
  assert.equal(typeof controller.loadCityAdminPanel,'function');
  controller.reset();
  const src=readFileSync('src/admin-city-panel.js','utf8');
  assert.match(src,/apiJson\(path,\{\.\.\.options,headers\}\)/);
  assert.match(src,/apiFetch\(endpoint,\s*\{/);
  assert.match(src,/city-admin\/upload\/start/);
  assert.match(src,/city-admin\/upload\/complete/);
  assert.match(src,/city-admin\/upload\/.*\/publish/);
  assert.match(src,/city-admin\/shiurim\?city=/);
  assert.match(src,/city-admin\/shiur\/.*DELETE/);
  assert.doesNotMatch(src,/window\.API/,'Do not bypass the native Bearer auth bridge');
  const main=readFileSync('src/main.js','utf8');
  assert.match(main,/apiJson\('\/city-admin\/status'\)/);
  assert.match(main,/state\.isCityAdmin=Array\.isArray\(data\.cities\)&&data\.cities\.length>0/);
  assert.match(main,/state\.accountSection === 'city-admin' && state\.isCityAdmin/);
  assert.match(main,/cityAdminController\.bind\(\)/);
  assert.match(main,/cityAdminController\.reset\(\)/);
});

test('Paid buyers and code discounts keep explicit admin authorization and do not remove untouched promos',()=>{
  const src=readFileSync('src/main.js','utf8');
  assert.match(src,/if\(!state\.isAdmin\|\|state\.adminPaidBuyersLoading\)return/);
  assert.match(src,/apiJson\('\/admin\/paid-purchases'\)/);
  assert.match(src,/data-admin-buyers-refresh/);
  assert.match(src,/adminPaidPromoCode/);
  assert.match(src,/adminPaidPromoType/);
  assert.match(src,/adminPaidPromoMaxUses/);
  assert.match(src,/adminPaidPromoOnePerUser/);
  assert.match(src,/adminPaidPromoDelete/);
  assert.match(src,/if\(state\.adminPaidPromoDirty\)/);
  assert.match(src,/body\.promo=\{/);
  assert.match(src,/previousCode:String\(previous\?\.code\|\|''\)/);
  assert.match(src,/action:'upsert',item/);
  assert.match(src,/state\.adminPaidBuyers = \[\]/,'Buyers must clear on logout');
});

// Full client-side City Admin upload lifecycle with controlled fake Worker.
// The test exercises real chunk boundaries, one transient retry, private
// draft review, and explicit publish without contacting a live account.
test('City Admin performs resumable chunk upload and publishes only after metadata review', async () => {
  const {createCityAdminController} = await import('../src/admin-city-panel.js');
  const originalDocument=globalThis.document;
  const originalCreateObjectUrl=URL.createObjectURL;
  const originalRevokeObjectUrl=URL.revokeObjectURL;
  const registry=new Map();
  const element=id=>{
    if(!registry.has(id)){
      const handlers=new Map();
      registry.set(id,{
        id,dataset:{},style:{},hidden:false,disabled:false,value:'',
        innerHTML:'',textContent:'',files:null,handlers,
        addEventListener:(event,callback)=>handlers.set(event,callback),
        querySelectorAll:()=>[],scrollIntoView:()=>{}
      });
    }
    return registry.get(id);
  };
  const size=5*256*1024, requests=[],actions=[];
  const file={size,name:'test-shiur.mp3',type:'audio/mpeg',
    slice(start,end){return {arrayBuffer:async()=>new Uint8Array(end-start).buffer}}};
  element('cityAdminCitySelect').value='Lakewood';
  element('cityUploadMediaKind').value='audio';
  element('cityUploadFile').files=[file];
  element('cityAdminUploadForm');
  element('cityAdminEditorForm');
  element('cityAdminShiurList');
  const doc={
    getElementById:id=>element(id),
    createElement:()=>{
      const media={duration:96,preload:'',onloadedmetadata:null,onerror:null,
        removeAttribute(){}};
      Object.defineProperty(media,'src',{set(){queueMicrotask(()=>media.onloadedmetadata?.())}});
      return media;
    }
  };
  globalThis.document=doc;
  URL.createObjectURL=()=> 'blob:qa-media';
  URL.revokeObjectURL=()=>{};
  const controller=createCityAdminController({
    apiJson:async(path,options={})=>{
      actions.push({path,method:options.method||'GET'});
      if(path==='/city-admin/status')return {cities:['Lakewood']};
      if(path.startsWith('/city-admin/shiurim?'))return {items:[]};
      if(path==='/city-admin/upload/start')return {uploadId:'qa-test-upload',chunkBytes:512*1024,mimeType:'audio/mpeg'};
      if(path==='/city-admin/upload/complete')return {
        publicId:'qa-test-public',mediaKind:'audio',city:'Lakewood',item:{title:'QA Demo Lecture',speaker:'Rav QA'}};
      if(path==='/city-admin/upload/qa-test-upload/publish')return {mediaKind:'audio'};
      throw new Error('Unexpected QA endpoint '+path);
    },
    apiFetch:async path=>{
      const url=new URL(path,'https://qa.invalid');
      const start=Number(url.searchParams.get('start'));
      const end=Number(url.searchParams.get('end'));
      requests.push([start,end]);
      if(requests.length===1)return {ok:false,status:503,json:async()=>({error:'temporary outage'})};
      return {ok:true,status:200,json:async()=>({
        uploadedBytes:end,complete:end===size,driveFileId:end===size?'qa-drive-file':undefined
      })};
    }
  });
  try{
    assert.equal(await controller.loadCityAdminPanel(true),true);
    controller.bind();
    const upload=element('cityAdminUploadForm').handlers.get('submit');
    assert.equal(typeof upload,'function');
    await upload({preventDefault(){}});
    assert.equal(element('cityAdminEditor').hidden,false,
      'Uploaded file must remain private until Save is explicitly submitted');
    assert.equal(element('cityEditTitle').value,'QA Demo Lecture');
    assert.deepEqual(requests,[
      [0,524288],[0,524288],[524288,1048576],[1048576,1310720]
    ],'A transient 503 must retry the same range without skipping or duplicating bytes');
    assert.equal(actions.some(x=>x.path.includes('/publish')),false,
      'Uploading must never publish automatically');
    await element('cityAdminEditorForm').handlers.get('submit')({preventDefault(){}});
    assert.equal(actions.filter(x=>x.path.endsWith('/publish')).length,1);
    assert.equal(element('cityAdminEditor').hidden,true);
    assert.equal(element('cityUploadButton').disabled,false);
  }finally{
    controller.reset();
    globalThis.document=originalDocument;
    URL.createObjectURL=originalCreateObjectUrl;
    URL.revokeObjectURL=originalRevokeObjectUrl;
  }
});

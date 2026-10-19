import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adminEscape,validIsoDate,validatedScheduleBatch,parseAdminCsv,planDateChanges} from '../src/admin-parity-utils.js';
import {mountAdminParity,resetAdminParity,WEBSITE_ADMIN_EXTRA_SECTIONS} from '../src/admin-parity.js';

test('website admin parity covers every existing full-admin website-only control',()=>{
  assert.deepEqual(WEBSITE_ADMIN_EXTRA_SECTIONS.map(x=>x[0]),[
    'comments','contacts','analytics','routing','schedule','dates','city-admins','cities'
  ]);
  const source=readFileSync('src/admin-parity.js','utf8');
  const main=readFileSync('src/main.js','utf8');
  for(const api of [
    '/admin/comments','/admin/comments/edit','/admin/comments/delete',
    '/admin/contact-messages','/admin/contact-messages/reply',
    '/admin/contact-messages/status','/admin/contact-messages/delete',
    '/admin/analytics/live','/admin/analytics/history',
    '/admin/playback-routing','/admin/schedule','/admin/video',
    '/admin/city-admins','/admin/drive-video-cities'
  ])assert.ok(source.includes(api),'Missing protected API '+api);
  assert.match(main,/mountAdminParity\(websiteAdminMount/);
  assert.match(main,/state\.isAdmin\) mountAdminParity/);
  assert.match(main,/resetAdminParity\(\)/);
  assert.match(source,/assertAdmin\(Boolean\(options && options\.method/);
  assert.match(source,/context\?\.isAdmin\?\.\(\)/);
  assert.match(source,/context\?\.isAdminMode\?\.\(\)/);
  assert.ok(!source.includes('localStorage.setItem('),'Do not persist sensitive admin content');
});

test('bulk schedule requires an explicit batch ID and validates every lecture',()=>{
  assert.throws(()=>validatedScheduleBatch('not JSON'),/Invalid JSON/);
  assert.throws(()=>validatedScheduleBatch('[]'),/unique sourceId/);
  assert.throws(()=>validatedScheduleBatch('{"events":[]}'),/sourceId/);
  assert.throws(()=>validatedScheduleBatch('{"sourceId":"a","events":[]}'),/between 1 and 100/);
  const batch=validatedScheduleBatch(JSON.stringify({sourceId:'2-cheshvan',events:[
    {date:'2026-10-19',startTime:'19:30',location:'Flatbush',speaker:'Rav Zev Smith',title:'Shiur'}
  ]}));
  assert.equal(batch.sourceId,'2-cheshvan');
  assert.equal(batch.events.length,1);
  assert.throws(()=>validatedScheduleBatch(JSON.stringify({
    sourceId:'2-cheshvan',events:[{date:'2026-10-32',startTime:'19:30',title:'test',speaker:'speaker'}]
  })),/invalid date|missing location/);
});

test('date importer keeps titles untouched and skips mismatches, duplicates and unchanged dates',()=>{
  const csv='Vimeo ID,New Lecture Date,Irgun Title (DO NOT CHANGE)\n'
    +'123,2026-10-18,"Original, Title"\n'
    +'123,2026-10-20,"Original, Title"\n'
    +'124,2026-10-18,Different Title\n'
    +'125,2026-10-18,Unchanged\n'
    +'999,2026-10-18,Unknown\n'
    +'126,2026-11-32,Some title\n';
  const map=[
    {id:'123',title:'Original, Title',lectureDate:'2026-10-16'},
    {id:'124',title:'A Different Title',lectureDate:'2026-10-16'},
    {id:'125',title:'Unchanged',lectureDate:'2026-10-18'},
    {id:'126',title:'Some title',lectureDate:'2026-10-10'}
  ];
  const plan=planDateChanges(csv,map);
  assert.deepEqual(plan.counts,{ready:1,unchanged:1,review:1,missing:1,invalid:2});
  assert.equal(plan.items[0].id,'123');
  assert.equal(plan.items[0].newDate,'2026-10-18');
  assert.equal(plan.items[0].currentTitle,'Original, Title');
  assert.ok(!('item' in plan.items[0]),'Importer must not rewrite titles or media');
  assert.equal(parseAdminCsv('"x\ny",z').length,1);
  assert.equal(parseAdminCsv('a,"b""c"')[0][1],'b"c');
  assert.equal(validIsoDate('2026-02-29'),false);
  assert.equal(validIsoDate('2024-02-29'),true);
});

test('admin text is escaped before being inserted into sensitive management lists',()=>{
  assert.equal(adminEscape('<script>" &'), '&lt;script&gt;&quot; &amp;');
  assert.equal(adminEscape(null),'');
});

test('admin parity renders behind authenticated role and uses existing app API bridge',async()=>{
  resetAdminParity();
  const listeners={};
  const root={
    isConnected:true,innerHTML:'',
    addEventListener(name,listener){listeners[name]=listener;},
    querySelector(){return null;}
  };
  let requests=[];
  const options={
    owner:'admin-id',isAdmin:()=>true,isAdminMode:()=>false,
    apiJson:async path=>{requests.push(path);return {items:[],total:0,page:1,hasMore:false};}
  };
  mountAdminParity(root,options);
  assert.match(root.innerHTML,/Comments Management/);
  assert.match(root.innerHTML,/Analytics Dashboard/);
  assert.ok(!root.innerHTML.includes('sessionToken'));
  const control={dataset:{paOpen:'comments'},disabled:false};
  listeners.click({target:{closest(selector){return selector==='[data-pa-open]'?control:null;}}});
  await new Promise(r=>setImmediate(r));
  assert.ok(requests.some(x=>x.startsWith('/admin/comments?page=1')));
  assert.match(root.innerHTML,/No comments found/);
  // A non-admin account must not get a fresh admin panel even when called.
  resetAdminParity();
  const guestRoot={isConnected:true,innerHTML:'private',addEventListener(){}};
  mountAdminParity(guestRoot,{owner:'guest',isAdmin:()=>false});
  assert.equal(guestRoot.innerHTML,'private');
});

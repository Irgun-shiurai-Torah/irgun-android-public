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

import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const base='https://api.irgunshiuraitorah.com';
const email=String(process.env.IRGUN_TEST_EMAIL||'').trim().toLowerCase();
const password=String(process.env.IRGUN_TEST_PASSWORD||'');
assert.ok(email && password,'This test requires dedicated IRGUN_TEST_EMAIL / IRGUN_TEST_PASSWORD repository secrets');
const report={status:'running',checks:[],startedAt:new Date().toISOString()};
const record=label=>{report.checks.push(label);console.log('PASS '+label);};
const appHeaders={Origin:'https://localhost','X-Irgun-App':'1'};
const webHeaders={Origin:'https://irgunshiuraitorah.com'};
const deadline=ms=>AbortSignal.timeout(ms);
let appToken='', webCookie='', qaPlaylistId='', changedLike=false, initialLiked=false;
const targetId=String(process.env.IRGUN_CROSS_DEVICE_VIDEO_ID||'1232214252');
function headers(client,more={}){
  return {...(client==='app'?appHeaders:webHeaders),
    ...(client==='app'&&appToken?{Authorization:'Bearer '+appToken}:{}),
    ...(client==='website'&&webCookie?{Cookie:webCookie}:{}),...more};
}
async function api(client,path,{method='GET',body,authenticated=true}={}) {
  const opts={method,headers:headers(client,body?{'Content-Type':'application/json'}:{}),signal:deadline(35000)};
  if(!authenticated){delete opts.headers.Authorization;delete opts.headers.Cookie;}
  if(body)opts.body=JSON.stringify(body);
  const response=await fetch(base+path,opts);
  const data=await response.json().catch(()=>({}));
  return {status:response.status,data,response};
}
const ok=(result,label)=>{
  assert.equal(result.status,200,label+' expected HTTP 200, got '+result.status+' ('+String(result.data?.error||'')+')');
  return result.data;
};
const signedIn=(x,label)=>{
  assert.equal(x.loggedIn,true,label+' must be logged in');
  assert.equal(String(x.user?.email||'').trim().toLowerCase(),email,label+' must be the approved QA account');
  assert.equal(Boolean(x.user?.admin),false,label+' must never use an administrator');
};
async function getList(client,path,key){
  const data=ok(await api(client,path),client+' '+path);
  assert.ok(Array.isArray(data[key]),client+' '+path+' must return an array');
  return data[key];
}
const normalize=items=>items.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).sort();
async function likes(client){return (await getList(client,'/my-like-ids','ids')).map(String);}
async function playlists(client){return await getList(client,'/custom-playlists','items');}
async function verifyLike(client,expected){const ids=await likes(client);assert.equal(ids.includes(targetId),expected,client+' Like state mismatch');}
async function verifyPlaylist(client,name,present){
  const rows=await playlists(client);
  assert.equal(rows.some(x=>x.name===name),present,client+' playlist synchronization mismatch');
}

try {
  const wrong=await api('app','/login',{method:'POST',body:{email,password:password+'-wrong'},authenticated:false});
  assert.equal(wrong.status,401,'Wrong password must not authenticate');
  assert.ok(!wrong.data.sessionToken,'Wrong password must not issue a session token');
  record('Wrong-password login rejected with HTTP 401');

  const a=await api('app','/login',{method:'POST',body:{email,password},authenticated:false});
  const app=ok(a,'Android login');
  assert.equal(String(app.user?.email||'').toLowerCase(),email);
  assert.ok(/^[A-Za-z0-9-]{16,200}$/.test(String(app.sessionToken||'')),'Android must receive a session token');
  appToken=app.sessionToken;
  const b=await api('website','/login',{method:'POST',body:{email,password},authenticated:false});
  ok(b,'Website login');
  webCookie=String(b.response.headers.get('set-cookie')||'').split(';')[0];
  assert.ok(webCookie.startsWith('session='),'Website login must set its HttpOnly session cookie');
  assert.ok(!b.data.sessionToken,'Website must not expose Android session tokens');
  signedIn(ok(await api('app','/me'),'Android /me'),'Android');
  signedIn(ok(await api('website','/me'),'Website /me'),'Website');
  record('Independent Android token and website cookie sessions log in to the same non-admin account');

  // Invalid bearer tokens must not authorize user data. /me is designed to
  // return {loggedIn:false} rather than an HTTP 401.
  const invalid=await fetch(base+'/history',{headers:{...appHeaders,Authorization:'Bearer '+randomUUID()},signal:deadline(20000)});
  assert.equal(invalid.status,401,'A nonexistent/expired-equivalent bearer session must not access history');
  record('Invalid/expired-equivalent session rejected for protected history');

  for(const [path,key] of [['/watch-later','items'],['/follows','items'],['/custom-playlists','items']]) {
    const aa=normalize(await getList('app',path,key));
    const bb=normalize(await getList('website',path,key));
    assert.deepEqual(aa,bb,'Website and Android state differs for '+path);
  }
  const al=await likes('app'),bl=await likes('website');
  assert.deepEqual(al.slice().sort(),bl.slice().sort(),'Website/Android Likes differ before mutation');
  record('Same Likes, Watch Later, Following and playlists visible in both sessions');

  // Use only the dedicated QA account. Restore the original Like even if the
  // verification step fails; do not leave a user's real account modified.
  initialLiked=al.includes(targetId);
  const changed=ok(await api('app','/like',{method:'POST',body:{videoId:targetId}}),'Android Like toggle');
  changedLike=true;
  assert.equal(Boolean(changed.liked),!initialLiked,'Like must toggle from initial state');
  await verifyLike('website',!initialLiked);
  record('Like toggled in Android session appears immediately on website');
  const restored=ok(await api('website','/like',{method:'POST',body:{videoId:targetId}}),'Website Like restore');
  changedLike=false;
  assert.equal(Boolean(restored.liked),initialLiked,'Website must restore original Like state');
  await verifyLike('app',initialLiked);
  record('Website Like change returns to Android, restoring original state');

  const name='IRGUN-ANDROID-WEBSITE-QA-'+Date.now();
  const created=ok(await api('app','/custom-playlists/create',{method:'POST',body:{name}}),'Android create QA playlist');
  qaPlaylistId=String(created.playlist?.id||'');
  assert.ok(qaPlaylistId,'Playlist create must return its real server ID');
  await verifyPlaylist('website',name,true);
  record('Playlist created on Android is visible in website account');
  ok(await api('website','/custom-playlists/delete',{method:'POST',body:{playlistId:qaPlaylistId}}),'Website delete QA playlist');
  qaPlaylistId='';
  await verifyPlaylist('app',name,false);
  record('Playlist deletion on website syncs back to Android');

  // Logout revokes only the Android token. Website session must remain valid.
  ok(await api('app','/logout',{method:'POST'}),'Android logout');
  const revoked=ok(await api('app','/me'),'Android /me after logout');
  assert.equal(revoked.loggedIn,false,'Logout did not invalidate Android token');
  signedIn(ok(await api('website','/me'),'Website session after Android logout'),'Website');
  record('Android logout invalidates its token without logging out website session');

  report.status='passed';
} catch(error) {
  report.status='failed';
  report.error=String(error.message||error).replaceAll(email,'[QA email]').replaceAll(password,'[redacted]');
  process.exitCode=1;
} finally {
  // Best-effort cleanup of the QA account always executes. Mark report failed
  // when we cannot confidently restore an applied mutation.
  if(changedLike&&appToken){
    try{
      const now=await likes('website');
      if(now.includes(targetId)!==initialLiked)
        ok(await api('website','/like',{method:'POST',body:{videoId:targetId}}),'QA Like cleanup');
      const again=await likes('website');
      assert.equal(again.includes(targetId),initialLiked,'QA Like cleanup not confirmed');
    }catch(e){report.status='failed';report.cleanupError='QA Like restoration not verified';process.exitCode=1;}
  }
  if(qaPlaylistId&&appToken){
    try{
      ok(await api('app','/custom-playlists/delete',{method:'POST',body:{playlistId:qaPlaylistId}}),'QA playlist cleanup');
    }catch{report.status='failed';report.cleanupPlaylistError='QA playlist cleanup not verified';process.exitCode=1;}
  }
  if(webCookie){try{await api('website','/logout',{method:'POST'});}catch{}}
  if(appToken){try{await api('app','/logout',{method:'POST'});}catch{}}
  report.finishedAt=new Date().toISOString();
  mkdirSync('emulator-report',{recursive:true});
  writeFileSync('emulator-report/account-cross-device.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
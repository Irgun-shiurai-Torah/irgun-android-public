import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {nativeHierarchy} from './android-native-hierarchy.mjs';
import {settledNativeTapPoint} from './android-native-tap-point.mjs';
import {accountSwipeDirection, watchPlayerReturnGesture, watchCommentsGesture} from './android-account-native-scroll.mjs';
import {observedAdb} from './android-adb-observer.mjs';
import {selectAccountPlaybackFixture} from './android-account-playback-fixture.mjs';
const email=process.env.IRGUN_TEST_EMAIL,password=process.env.IRGUN_TEST_PASSWORD;
assert.ok(email&&password,'Configure dedicated verified account secrets IRGUN_TEST_EMAIL and IRGUN_TEST_PASSWORD');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const report={checks:[],credentialsRecorded:false,startedAt:new Date().toISOString()};let ws;
// Retry only an actual read-only ADB observation after a transient offline
// connection. Never replay a password, physical tap, or other mutation;
// require the same running app PID before retrying the observed IME state.
const adb=observedAdb(report);
let qaCommentId='',qaCommentMarker='',accountDisplayName='',restartPlaylistName='',deletedQaCommentId='',playbackFixtureId='';
async function connect(){
 // The WebView CDP target can briefly disappear during IME/dialog lifecycle.
 // Retry discovery against the ACTUAL running app process. Never manufacture a
 // snapshot or restart a crashed app and pretend its ongoing test succeeded.
 let page=null, lastDiscoveryError='';
 for(let attempt=1;attempt<=12;attempt++){
  const pid=adb('shell','pidof','org.irgunshiuraitorah.app').trim().split(/\s+/)[0];
  if(!/^\d+$/.test(pid))throw new Error('Android app process disappeared while opening the QA WebView observer at '+String(report.stage||'startup'));
  try{
   adb('forward','tcp:9222',`localabstract:webview_devtools_remote_${pid}`);
   const response=await fetch('http://127.0.0.1:9222/json/list',{signal:AbortSignal.timeout(2500),cache:'no-store'});
   if(!response.ok)throw new Error('CDP target discovery HTTP '+response.status);
   const pages=await response.json();
   page=pages.find(p=>p.type==='page'&&/localhost/.test(p.url)&&p.webSocketDebuggerUrl);
   if(page)break;
   lastDiscoveryError='No live localhost WebView page among '+pages.length+' CDP targets';
  }catch(error){lastDiscoveryError=String(error.message||error).slice(0,240);}
  await delay(650);
 }
 if(!page)throw new Error('App WebView inspection target remained unavailable at '+String(report.stage||'startup')+': '+lastDiscoveryError);
 ws=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 const socket=ws;let id=0;const pending=new Map();
 socket.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Observation connection closed'));}pending.clear();});
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);
  if(m.error||m.result?.exceptionDetails){
   const detail=String(m.error?.message||m.result.exceptionDetails.exception?.description||m.result.exceptionDetails.text||'Unknown observer exception');
   p.reject(new Error('Observation failed: '+detail.replaceAll(email,'[email]').replaceAll(password,'[password]').slice(0,450)));
  }else p.resolve(m.result.result.value);
 });
 return (expression='JSON.stringify(window.ISTAccountTest ? window.ISTAccountTest.snapshot() : {ready:false,observerReady:false})')=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(new Error('Observation timeout'));},10000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));}).then(JSON.parse);
}
let readSnapshot;
async function read(){
 for(let attempt=0;attempt<3;attempt++){
  try{return await readSnapshot();}
  catch(e){
   if(!/Observation (timeout|connection closed)/.test(e.message)||attempt===2)throw e;
   report.observationReconnects=(report.observationReconnects||0)+1;
   ws?.close();readSnapshot=await connect();await delay(300);
  }
 }
}

async function closeSavePicker(){if((await read()).playlistPickerOpen)await tap('closePicker');await wait(s=>!s.playlistPickerOpen,'Save dialog did not close');}
async function wait(test,message){report.stage=message;let s;const deadline=Date.now()+30000;while(Date.now()<deadline){s=await read();if(test(s))return s;await delay(300);}throw new Error(message);}

async function readNativeBounds() {
 const window=await readSnapshot("window.Capacitor.nativePromise('IrgunPlayback','qaWindowBounds',{}).then(JSON.stringify)");
 assert.equal(window.focused,true,'Irgun must own the actual foreground window before an app tap');
 const value=[window.left,window.top,window.right,window.bottom];
 assert.ok(value.every(Number.isFinite)&&value[2]>value[0]&&value[3]>value[1],
   'Fresh native WebView geometry must have a nonzero size');
 report.nativeBounds=value;
 return value;
}

let bounds;
function native(p,s){return [Math.round(bounds[0]+p.x*(bounds[2]-bounds[0])/s.width),Math.round(bounds[1]+p.y*(bounds[3]-bounds[1])/s.height)];}
async function fixturePoint() {
 // Observe only the verified fixture's real, unobscured card. All navigation
 // still uses physical ADB taps/swipes; the QA observer remains unchanged.
 return readSnapshot(`JSON.stringify((()=>{for(const e of document.querySelectorAll('[data-watch]')){
   if(e.getAttribute('data-watch')!==${JSON.stringify(playbackFixtureId)})continue;
   const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);
   if(!e.disabled&&r.width>0&&r.height>0&&x>0&&y>0&&x<innerWidth&&y<innerHeight&&h&&(h===e||e.contains(h)))return {x,y};
 }return null;})())`);
}
async function tap(key) {
 report.stage='Native tap: '+key;
 for(let i=0;i<9;i++) {
  bounds=await readNativeBounds();
  const s=await read(),p=key==='open'?await fixturePoint():s.controls[key];
  if(p) {
   const measured=await settledNativeTapPoint({delay,
    readBounds:async()=>{const b=await readNativeBounds();return {left:b[0],top:b[1],right:b[2],bottom:b[3],focused:true};},
    readPoint:async()=>{const observed=await read(),point=key==='open'?await fixturePoint():observed.controls[key];return point?{...point,width:observed.width,height:observed.height}:null;}
   });
   bounds=measured.bounds;
   adb('shell','input','tap',...measured.point.map(String));
   await delay(700);
   if(key==='closeWatch')await wait(s=>!s.watchId,'The actual Back tap must close Watch before account navigation');
   return;
  }
  if(key==='playlists' && s.screen==='library' && s.libraryTabStrip) {
   const strip=s.libraryTabStrip;
   assert.ok(strip.scrollWidth>strip.clientWidth, 'Library tabs must be horizontally scrollable');
   const y=strip.y+strip.height/2;
   const from=native({x:strip.x+strip.width*0.84,y},s);
   const to=native({x:strip.x+strip.width*0.16,y},s);
   adb('shell','input','swipe',...from.map(String),...to.map(String),'420');
   report.libraryTabSwipes=(report.libraryTabSwipes||0)+1;
   await delay(500);
   continue;
  }
  // Watch playback controls sit above the details, Follow and related items.
  // On tall Watch pages return to the actual player with a physical swipe,
  // verifying that the real scroll offset moved rather than looping blindly.
  if (['audioMode','videoMode','audioPlay'].includes(key) && s.watchId && s.watchScroll) {
    const sc=s.watchScroll;
    if (sc.top>4) {
      const gesture=watchPlayerReturnGesture(sc);
      const from=native(gesture.from,s),to=native(gesture.to,s);
      adb('shell','input','swipe',...from.map(String),...to.map(String),'460');
      await delay(550);
      const after=await read();
      assert.equal(after.watchId,s.watchId,'Returning to player changed the selected shiur');
      report.watchPlayerReturnSwipes=report.watchPlayerReturnSwipes||[];
      report.watchPlayerReturnSwipes.push({key,beforeTop:sc.top,afterTop:Number(after.watchScroll?.top||0)});
      if (!(after.watchScroll && after.watchScroll.top<sc.top-1))
        throw new Error('Native player return swipe did not move Watch scroll towards Audio/Video controls');
      continue;
    }
  }
  const commentAction=['commentText','postComment','editQaComment','editedQaText','saveQaComment','deleteQaComment'].includes(key);
  if(commentAction && s.watchScroll) {
    const sc=s.watchScroll;
    assert.ok(sc.heightTotal>sc.visibleHeight+20,
      'Comment editor below the fold, but actual Watch scroll container is not scrollable');
    const gesture=watchCommentsGesture(sc);
    const start=native(gesture.from,s),finish=native(gesture.to,s);
    adb('shell','input','swipe',...start.map(String),...finish.map(String),'520');
    await delay(600);
    const after=await read();
    report.commentScrollGestures=report.commentScrollGestures||[];
    report.commentScrollGestures.push({key,beforeTop:sc.top,afterTop:Number(after.watchScroll?.top||0),
      heightTotal:sc.heightTotal,visibleHeight:sc.visibleHeight,start,finish});
    if(i>=3 && Number(after.watchScroll?.top||0)<=sc.top+1)throw new Error(
      'Native swipe inside measured Watch scroll did not move comments: '+
      JSON.stringify(report.commentScrollGestures.slice(-4)));
    continue;
  }
  // Account fields are ordered Email -> Password -> Login. With the IME
  // covering the bottom of the screen, Password requires scrolling DOWN the
  // form (physical swipe UP), not scrolling back toward Email.
  const direction=accountSwipeDirection(key);
  const x=Math.round(bounds[2]-25),yStart=bounds[3]-150,yEnd=bounds[1]+135;
  if(direction==='down')adb('shell','input','swipe',String(x),String(yEnd),String(x),String(yStart),'480');
  else adb('shell','input','swipe',String(x),String(yStart),String(x),String(yEnd),'480');
  await delay(500);
 }
 const final=await read();
 throw new Error(`Visible control missing: ${key}; watchId=${final.watchId||'none'}; scrollTop=${final.watchScroll?.top??'n/a'}; mode=${final.watchMode||'none'}`);
}
async function type(key,value){assert.match(value,/^[a-zA-Z0-9@._+!-]+$/,'Dedicated credentials must use characters supported by native adb text input');await tap(key);
 if(key==='email'||key==='password') {
   const field=key==='email'?'authEmail':'authPassword';
   const length=await readSnapshot('JSON.stringify(document.getElementById('+JSON.stringify(field)+').value.length)');
   if(length>0) {adb('shell','input','keyevent','KEYCODE_MOVE_END');adb('shell','input','keyevent',...Array(length).fill('KEYCODE_DEL'));}
 }
 adb('shell','input','text',value);
 // BACK without a visible IME can dismiss the edit dialog or navigate out of
 // the app. Dismiss ONLY the actual keyboard (never invent a screen tap).
 const ime=adb('shell','dumpsys','input_method');
 if(/(?:mInputShown|isInputViewShown)=true/.test(ime))adb('shell','input','keyevent','4');
 await delay(500);}
async function dismissKeyboardBeforeSave(){
 const shown=()=>/(?:mInputShown|isInputViewShown)=true/.test(adb('shell','dumpsys','input_method'));
 if(shown()){
  adb('shell','input','keyevent','KEYCODE_BACK');
  const deadline=Date.now()+7000;
  while(shown()&&Date.now()<deadline)await delay(250);
  assert.equal(shown(),false,'The actual Android keyboard must close before tapping comment Save');
  await delay(500);
 }
 // IME resizing changes the mapping between DOM points and native pixels.
 // Re-measure the actual window after dismissal; retain all saved-text assertions.
 bounds=await readNativeBounds();
 report.commentSaveKeyboardDismissed=true;
}
async function acceptDeleteConfirmation(){
 const xml=nativeHierarchy('emulator-report/account-confirm.xml');
 const nodes=xml.match(/<node\b[^>]*>/g)||[];
 const positive=nodes.find(n=>/text="(OK|Yes|Delete)"/i.test(n)&&/clickable="true"/.test(n));
 assert.ok(positive,'Actual Android native confirm button must be shown');
 const b=positive.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)?.slice(1).map(Number);
 assert.ok(b,'Native Delete confirmation must have actual coordinates');
 adb('shell','input','tap',String(Math.floor((b[0]+b[2])/2)),String(Math.floor((b[1]+b[3])/2)));
}
async function verifyServerPlaylist(name,count,id) {
 const headers={Origin:'https://localhost','X-Irgun-App':'1','Content-Type':'application/json'};
 const response=await fetch('https://api.irgunshiuraitorah.com/login',{method:'POST',headers,body:JSON.stringify({email,password}),signal:AbortSignal.timeout(16000)});
 assert.equal(response.status,200,'Independent QA session required to verify actual playlist edits');
 const session=await response.json();assert.ok(session.sessionToken&&String(session.user?.email||'').toLowerCase()===email.trim().toLowerCase(),'Playlist verification must use the approved QA account');
 const authenticated={...headers,Authorization:'Bearer '+session.sessionToken};
 try {
  const deadline=Date.now()+20000;let found;
  while(Date.now()<deadline) {
   let result;
   try { result=await fetch('https://api.irgunshiuraitorah.com/custom-playlists',{
     headers:authenticated,signal:AbortSignal.timeout(Math.max(1,Math.min(12000,deadline-Date.now())))
   }); } catch(error) {
     // Only repeat this independent read, within the original deadline.
     // Native Save and server mutations are never repeated on an uncertain outcome.
     if(!((error instanceof TypeError&&error.message==='fetch failed')||error.name==='TimeoutError'))throw error;
     report.playlistReadTransportFailures=(report.playlistReadTransportFailures||0)+1;
     if(Date.now()>=deadline)throw error;
     await delay(500);continue;
   }
   assert.equal(result.status,200,'Actual server playlists must be readable');
   const data=await result.json();found=(data.items||[]).find(p=>p.name===name&&Array.isArray(p.items)&&p.items.length===count&&(!count||p.items.some(x=>String(x.id||'')===id)));
   if(found)break;await delay(500);
  }
  assert.ok(found,'Native playlist edit must reach the real server with '+count+' actual items');
  report.checks.push('Independent server verified native playlist '+(count?'add':'remove'));
 }finally {await fetch('https://api.irgunshiuraitorah.com/logout',{method:'POST',headers:authenticated,signal:AbortSignal.timeout(10000)}).catch(()=>{});}
}
async function cleanupQaComment(){
 if(!qaCommentMarker||!report.commentVideoId)return;
 const origin='https://localhost',h={'Content-Type':'application/json','X-Irgun-App':'1',Origin:origin};
 const login=await fetch('https://api.irgunshiuraitorah.com/login',{method:'POST',headers:h,body:JSON.stringify({email,password}),signal:AbortSignal.timeout(16000)});
 assert.equal(login.status,200,'QA comment cleanup login failed');
 const body=await login.json(),token=body.sessionToken;
 assert.ok(token&&String(body.user?.email||'').toLowerCase()===email.trim().toLowerCase(),'Comment cleanup must authenticate the dedicated QA user only');
 const protectedHeaders={...h,Authorization:'Bearer '+token};
 const list=await fetch('https://api.irgunshiuraitorah.com/comments?videoId='+encodeURIComponent(report.commentVideoId),{headers:protectedHeaders,signal:AbortSignal.timeout(16000)});
 assert.equal(list.status,200,'Comment cleanup cannot list real comments');
 const comments=(await list.json()).comments||[];
 const owned=comments.find(c=>(!qaCommentId||String(c.id)===qaCommentId)&&String(c.user_id)===String(body.user?.id)&&String(c.text||'').startsWith(qaCommentMarker));
 if(owned){
  const del=await fetch('https://api.irgunshiuraitorah.com/comments/delete',{method:'POST',headers:protectedHeaders,body:JSON.stringify({commentId:String(owned.id)}),signal:AbortSignal.timeout(16000)});
  assert.equal(del.status,200,'Temporary owned QA comment deletion failed');
 }
 const check=await fetch('https://api.irgunshiuraitorah.com/comments?videoId='+encodeURIComponent(report.commentVideoId),{headers:protectedHeaders,signal:AbortSignal.timeout(16000)});
 assert.equal(check.status,200);
 assert.ok(!(await check.json()).comments.some(c=>String(c.user_id)===String(body.user?.id)&&String(c.text||'').startsWith(qaCommentMarker)),'Temporary QA comment was not removed');
 report.qaCommentCleanedUp=true;qaCommentId='';
 if(restartPlaylistName) {
   const response=await fetch('https://api.irgunshiuraitorah.com/custom-playlists',{headers:protectedHeaders,signal:AbortSignal.timeout(16000)});
   assert.equal(response.status,200,'Temporary QA playlist cleanup must read actual owned playlists');
   const playlist=(await response.json()).items?.find(p=>p.name===restartPlaylistName);
   if(playlist) {
     const deletion=await fetch('https://api.irgunshiuraitorah.com/custom-playlists/delete',{method:'POST',headers:protectedHeaders,body:JSON.stringify({playlistId:playlist.id}),signal:AbortSignal.timeout(16000)});
     assert.equal(deletion.status,200,'Temporary QA playlist cleanup failed');
   }
   report.qaPlaylistCleanedUp=true;
 }
 await fetch('https://api.irgunshiuraitorah.com/logout',{method:'POST',headers:protectedHeaders}).catch(()=>{});
}
try{
 readSnapshot=await connect();await wait(s=>s.ready,'Library unavailable');
 // Pin one eligible lecture for this entire run, including process restarts
 // and cleanup. Do not mistake the newest Vimeo-only upload for an Audio test.
 const catalogResponse=await fetch('https://api.irgunshiuraitorah.com/video-map?driveLibrary=1',{
   headers:{Origin:'https://localhost','X-Irgun-App':'1'},signal:AbortSignal.timeout(30000)});
 assert.equal(catalogResponse.status,200,'Read the real catalog to choose a native/audio fixture');
 const catalog=await catalogResponse.json();
 catalog.sort((a,b)=>Date.parse(b.lectureDate||b.date||b.created||0)-Date.parse(a.lectureDate||a.date||a.created||0));
 report.playbackFixture=await selectAccountPlaybackFixture(catalog,async id=>{
   const response=await fetch(`https://api.irgunshiuraitorah.com/media/${encodeURIComponent(id)}/source.json`,{
     headers:{Origin:'https://localhost','X-Irgun-App':'1'},signal:AbortSignal.timeout(20000)});
   assert.equal(response.status,200,'Account playback fixture source must be available');
   return response.json();
 });
 playbackFixtureId=report.playbackFixture.id;
 bounds=await readNativeBounds();
 report.androidApi=Number(adb('shell','getprop','ro.build.version.sdk'));
 report.nativeLoginStartedAt=new Date().toISOString();await tap('account');
 await type('email',email);await type('password',password+'-invalid');await tap('login');
 await wait(s=>!s.authBusy&&!s.loggedIn&&s.authError,'Actual Android login UI must reject an incorrect password and show an error');
 report.checks.push('Actual native login UI rejects an incorrect password');
 await type('email',email);await type('password',password);await tap('login');
 const loggedIn=await wait(s=>s.loggedIn&&s.profileVisible,'Native login failed');
 accountDisplayName=String(loggedIn.name||'').trim();
 assert.ok(accountDisplayName,'Account must display the registered name, not a blank label');
 assert.equal(String(loggedIn.profileShownName||'').trim(),accountDisplayName,'Profile screen must display the correct account name');
 report.checks.push('Real Android account name displayed on profile');
 assert.equal((await read()).isAdmin,false,'Use a non-admin dedicated account');assert.ok(String((await read()).accountEmail||'').trim().toLowerCase()===email.trim().toLowerCase(),'Refuse to mutate an account other than the dedicated approved account');report.checks.push('Native email/password login and profile');
 await tap('language');await wait(s=>s.lang==='he'&&s.dir==='rtl','Native account page must switch to Hebrew RTL');
 const hebrewProfile=await read();assert.equal(String(hebrewProfile.name||'').trim(),accountDisplayName,'Account identity must remain unchanged in Hebrew');
 const hebrewLabels=await readSnapshot('JSON.stringify([...document.querySelectorAll("[data-account-section], [data-logout]")].filter(e=>e.getBoundingClientRect().width>0).map(e=>e.textContent.trim()))');
 assert.ok(hebrewLabels.length>=2&&hebrewLabels.every(x=>/[\u0590-\u05ff]/.test(x)),'Native Hebrew account controls must be translated');
 await tap('language');await wait(s=>s.lang==='en'&&s.dir==='ltr','Native account page must restore English LTR');
 report.checks.push('Real Hebrew/English account controls, RTL and unchanged identity');
 await tap('settings');await wait(s=>s.settingsVisible,'Settings missing');report.checks.push('Account settings displayed');
 await tap('shiurim');await tap('open');await wait(s=>!!s.watchId,'Lecture did not open');const id=(await read()).watchId;
 assert.equal(id,playbackFixtureId,'Account UI must open the verified native-video/audio lecture');
 report.accountMutationsStartedAt=new Date().toISOString();const before=await read();await tap('like');await wait(s=>s.likes.includes(id)!==before.likes.includes(id),'Like toggle failed');report.checks.push('Native Like toggle');
 await tap('save');await tap('later');await wait(s=>s.later.includes(id)!==before.later.includes(id),'Save toggle failed');await closeSavePicker();report.checks.push('Native Watch Later toggle and dialog closure');await tap('follow');await wait(s=>JSON.stringify(s.follows)!==JSON.stringify(before.follows),'Follow toggle failed');report.checks.push('Native speaker follow toggle');

 // Previous test waited for history without ever pressing Play. The physical
 // emulator screenshot showed a paused Audio player at 0:00, so explicitly
 // start playback through a real Android touch before asserting progress.
 if((await read()).watchMode!=='audio')await tap('audioMode');
 await wait(s=>s.watchMode==='audio','Audio mode did not open for real playback history');
 const audioStart=await read();
 // A buffering Media3 source may already have accepted Play. Toggling its
 // button as it becomes ready would immediately pause the real playback.
 if(!audioStart.audioPlaying&&!audioStart.audioPlayWhenReady)await tap('audioPlay');
 const playbackObserved=await wait(s=>s.audioPlaying&&s.audioTime>1,'Native Media3 audio must start and advance before history is tested');
 await delay(3500);
 const laterPlayback=await read();
 assert.ok(laterPlayback.audioPlaying&&laterPlayback.audioTime>playbackObserved.audioTime+2,
   'Actual Media3 audio clock must advance while the account is signed in');
 report.checks.push('Real Android playback started with native Play and advanced');
 
 // Check the real API from a separate authenticated QA session. In-memory
 // history is not evidence that a POST reached the server, and the app does
 // not add an unseen row to the local list before the next /history reload.
 const testHeaders={Origin:'https://localhost','X-Irgun-App':'1','Content-Type':'application/json'};
 const auth=await fetch('https://api.irgunshiuraitorah.com/login',{
   method:'POST',headers:testHeaders,body:JSON.stringify({email,password}),signal:AbortSignal.timeout(20000)
 });
 assert.equal(auth.status,200,'Second authenticated QA session needed to verify server history');
 const credentials=await auth.json();
 assert.equal(String(credentials.user?.email||'').trim().toLowerCase(),email.trim().toLowerCase(),'History check authenticated an unexpected user');
 assert.ok(credentials.sessionToken,'History check did not receive a real app session');
 let savedRow=null,historyHttp=0;
 const historyDeadline=Date.now()+45000;
 while(Date.now()<historyDeadline) {
   const historyResponse=await fetch('https://api.irgunshiuraitorah.com/history',{
     headers:{...testHeaders,Authorization:'Bearer '+credentials.sessionToken},
     signal:AbortSignal.timeout(18000)
   });
   historyHttp=historyResponse.status;
   if(historyResponse.ok) {
     const historyData=await historyResponse.json();
     const rows=Array.isArray(historyData.items)?historyData.items:[];
     const actualPosition=(await read()).audioTime;
     savedRow=rows.find(row=>String(row.videoId||row.rawAudioId||row.id||'').replace(/^audio:/,'')===id&&
       Number(row.progressSeconds||row.positionSeconds||0)>=playbackObserved.audioTime&&Number(row.progressSeconds||row.positionSeconds||0)<=actualPosition+3);
     if(savedRow)break;
   }
   await delay(1300);
 }
 assert.ok(savedRow,'Real server playback history not recorded for the playing shiur (last HTTP '+historyHttp+')');
 report.actualServerHistory={id,positionSeconds:Number(savedRow.progressSeconds||savedRow.positionSeconds||0),
   mediaType:String(savedRow.mediaType||''),httpStatus:historyHttp};
 report.checks.push('Signed-in native playback created a real server history row with advancing position');
 await fetch('https://api.irgunshiuraitorah.com/logout',{
   method:'POST',headers:{...testHeaders,Authorization:'Bearer '+credentials.sessionToken}
 }).catch(()=>{});
 qaCommentMarker='IRGUN-QA-'+Date.now();report.commentVideoId=id;
 await type('commentText',qaCommentMarker);await tap('postComment');
 const withComment=await wait(s=>s.comments.some(c=>c.text===qaCommentMarker&&c.mine),'Native posted QA comment not visible');
 qaCommentId=String(withComment.comments.find(c=>c.text===qaCommentMarker&&c.mine).id);
 assert.ok(qaCommentId,'QA comment needs real server ID');
 report.checks.push('Native UI posted a comment, stored with correct author');
 await tap('editQaComment');
 await wait(s=>s.qaEditor?.value===qaCommentMarker,'Edit form did not display the existing QA comment');
 // Android 11 keyboard/window resizing can invalidate the original tap.
 // Use genuine ADB taps at freshly measured textarea points; never set focus
 // or textarea text through the read-only CDP observation channel.
 if (!(await read()).qaEditor?.focused) await tap('editedQaText');
 report.commentFocusTapAttempts=[];
 for (let attempt=0;attempt<4 && !(await read()).qaEditor?.focused;attempt++) {
   const snapshot=await read(),rect=snapshot.qaEditor?.rect;
   assert.ok(rect && rect.width>40 && rect.height>30,'Real comment edit textarea disappeared during focus retry');
   const point={x:rect.x+rect.width*(0.20+0.17*attempt),
                y:rect.y+rect.height*(0.18+0.14*attempt)};
   const xy=native(point,snapshot);
   adb('shell','input','tap',...xy.map(String));
   await delay(450);
   report.commentFocusTapAttempts.push({point:xy,focused:(await read()).qaEditor?.focused===true});
 }
 await wait(s=>s.qaEditor?.focused===true,'Native Android touch did not focus the actual comment textarea');
 adb('shell','input','keyevent','KEYCODE_MOVE_END');
 adb('shell','input','text','-EDITED');
 const editedInput=await wait(s=>s.qaEditor?.value===qaCommentMarker+'-EDITED',
   'Android keyboard did not append the QA edit to the comment textarea');
 assert.equal(editedInput.qaEditor.value,qaCommentMarker+'-EDITED','Edit textarea must preserve the original comment');
 await dismissKeyboardBeforeSave();
 assert.equal((await read()).qaEditor?.value,qaCommentMarker+'-EDITED','Closing the keyboard must preserve the edited comment');
 await tap('saveQaComment');
 await wait(s=>s.comments.some(c=>c.id===qaCommentId&&c.text===qaCommentMarker+'-EDITED'),'Edited comment was not saved');
 report.checks.push('Native UI edit comment persisted');
 await tap('deleteQaComment');await acceptDeleteConfirmation();
 await wait(s=>!s.comments.some(c=>c.id===qaCommentId),'Native QA comment deletion failed');
 report.checks.push('Native UI deleted its own QA comment');deletedQaCommentId=qaCommentId;qaCommentId='';
 await tap('closeWatch');await tap('library');await tap('playlists');const name=`Irgun-QA-${Date.now()}`;restartPlaylistName=name;await type('playlistName',name);await tap('createPlaylist');await wait(s=>s.playlists.some(p=>p.name===name),'Playlist creation failed');
 report.checks.push('Native UI created a dedicated temporary QA playlist');
 await tap('playlistBack');await tap('shiurim');await tap('open');
 assert.equal((await wait(s=>!!s.watchId,'Playlist edit lecture did not open')).watchId,id,'Playlist edit must use the same QA shiur');
 await tap('save');await tap('addQaPlaylist');
 await wait(s=>s.playlists.some(p=>p.name===name&&p.items===1&&p.itemIds.includes(id)),'Native Save must add the actual shiur to the new playlist');
 await verifyServerPlaylist(name,1,id);
 await closeSavePicker();await tap('closeWatch');await tap('library');await tap('playlists');await tap('testPlaylist');
 await tap('removeQaPlaylistItem');
 await wait(s=>s.playlists.some(p=>p.name===name&&p.items===0),'Native playlist edit must remove the selected shiur');
 await verifyServerPlaylist(name,0,id);
 report.checks.push('Actual native playlist editing adds and removes the correct lecture');
 const changed=await read();
 report.beforeRestart = {
  signedIn:changed.loggedIn,
  like:changed.likes.includes(id),
  watchLater:changed.later.includes(id),
  followingCount:changed.follows.length,
  playbackHistoryRecorded:!!report.actualServerHistory,
  qaPlaylistCreated:changed.playlists.some(p=>p.name===name)
 };
 ws.close();adb('shell','am','force-stop','org.irgunshiuraitorah.app');
 adb('shell','am','start','-n','org.irgunshiuraitorah.app/.SplashActivity');
 await delay(5000);readSnapshot=await connect();
 await wait(s=>s.ready&&s.loggedIn&&s.playlists.some(p=>p.name===name),'Session/playlist did not survive relaunch');
 await tap('account');
 const shown=await wait(s=>s.profileVisible,'Profile missing after process restart');
 assert.equal(String(shown.name||'').trim(),accountDisplayName,'Account name changed after restart');
 assert.equal(String(shown.profileShownName||'').trim(),accountDisplayName,'Visible profile name changed after restart');
 report.checks.push('Registered account name displayed identically after process restart');
 const restored=await read();
 const expectedFollows=changed.follows.slice().sort(),actualFollows=restored.follows.slice().sort();
 report.restartComparison={
  signedIn:restored.loggedIn,
  qaPlaylistFound:restored.playlists.some(p=>p.name===name),
  like:{expected:changed.likes.includes(id),actual:restored.likes.includes(id)},
  watchLater:{expected:changed.later.includes(id),actual:restored.later.includes(id)},
  follows:{expectedCount:expectedFollows.length,actualCount:actualFollows.length,match:JSON.stringify(expectedFollows)===JSON.stringify(actualFollows)},
  playbackHistory:{expected:true,actual:restored.history.includes(id)}
 };
 report.stage='Verify restored Like, Watch Later, Following, History and playlist';
 assert.equal(report.restartComparison.like.actual,report.restartComparison.like.expected,'Like did not persist across Android app restart');
 assert.equal(report.restartComparison.watchLater.actual,report.restartComparison.watchLater.expected,'Watch Later did not persist across Android app restart');
 assert.ok(report.restartComparison.follows.match,'Following did not persist across Android app restart');
 if(!report.restartComparison.playbackHistory.actual) {
   // Cached catalog readiness precedes asynchronous account hydration; wait
   // for the independently verified server row, never synthesize it in JS.
   const hydrated=await wait(s=>s.loggedIn&&s.history.includes(id),'Server playback history never hydrated after restart');
   report.restartComparison.playbackHistory.actual=hydrated.history.includes(id);
 }
 assert.ok(report.restartComparison.playbackHistory.actual,'Playback history did not persist across Android app restart');
 report.checks.push('Server-backed likes, Watch Later, follows, history and playlist survive process restart');
 await tap('shiurim');await tap('open');
 assert.equal((await wait(s=>!!s.watchId&&s.commentsLoaded,'Restarted app did not reload lecture comments')).watchId,id);
 assert.ok(!(await read()).comments.some(c=>c.id===deletedQaCommentId||c.text.startsWith(qaCommentMarker)),
   'Deleted QA comment must not return in the actual app after process restart');
 report.checks.push('Deleted comment stays absent after actual Android process restart');
 await tap('closeWatch');await tap('library');await tap('playlists');await tap('testPlaylist');
 await tap('deletePlaylist');await acceptDeleteConfirmation();
 await wait(s=>!s.playlists.some(p=>p.name===name),'Temporary native QA playlist deletion failed');
 report.checks.push('Temporary QA playlist cleaned up through native UI');
 // Restore only the lecture flags changed by this run.
 await tap('shiurim');await tap('open');assert.equal((await wait(s=>!!s.watchId,'Lecture unavailable')).watchId,id,'Cleanup must target the same lecture');await tap('like');await tap('save');await tap('later');await closeSavePicker();await tap('follow');await wait(s=>s.likes.includes(id)===before.likes.includes(id)&&s.later.includes(id)===before.later.includes(id)&&JSON.stringify(s.follows.slice().sort())===JSON.stringify(before.follows.slice().sort()),'Lecture flags were not restored');report.checks.push('Lecture flags restored');await tap('closeWatch');await tap('account');await tap('logout');await wait(s=>!s.loggedIn&&s.likes.length===0&&s.later.length===0&&s.playlists.length===0,'Logout did not clear account data');report.checks.push('Logout clears account state');
 await type('email',email);await type('password',password);await tap('login');
 const again=await wait(s=>s.loggedIn&&s.profileVisible,'Subsequent native login failed');
 assert.equal(String(again.name||'').trim(),accountDisplayName,'Account name changed after logout and re-login');
 assert.equal(String(again.profileShownName||'').trim(),accountDisplayName,'Visible account name wrong after re-login');
 report.checks.push('Subsequent email/password login restores correct profile name');
 await tap('logout');await wait(s=>!s.loggedIn,'Second native logout failed');
 report.checks.push('Subsequent logout successful');
 if(process.env.IRGUN_KEEP_QA_SESSION==='1') {
   await type('email',email);await type('password',password);await tap('login');
   await wait(s=>s.loggedIn&&!s.isAdmin,'A dedicated signed-in session is required for the separate media suite');
   report.checks.push('Dedicated QA session established for separate logged-in playback regression suite');
    // The next independent media test starts with Home search. Navigate with
    // a real Android tap while retaining the same signed-in QA session.
    await tap('home');
    await wait(s=>s.screen==='home'&&s.loggedIn&&s.ready,
      'Account handoff must return to Home before separate native playback tests');
    report.checks.push('Real Home tap preserves logged-in session for the playback suite');
 }
 report.unverified=['Other valid user comment ownership requires a second dedicated QA account','Session expiry and external revocation are unverified; tests do not extract the application session credential'];
 report.accountMutationsFinishedAt=new Date().toISOString();report.status='passed';
}catch(e){
 try{report.appPidAtFailure=adb('shell','pidof','org.irgunshiuraitorah.app')||'';}catch(_){}
 try{report.foregroundAtFailure=adb('shell','dumpsys','activity','activities').split('\n').filter(line=>/mResumedActivity|topResumedActivity|ResumedActivity/.test(line)).slice(0,8);}catch(_){}
 try{const diagnostics=execFileSync('adb',['logcat','-d','-t','3000','-s','AndroidRuntime:E','chromium:E','cr_AwContents:E','IrgunPlayback:D','ActivityTaskManager:W','*:S'],{encoding:'utf8'});
  writeFileSync('emulator-report/account-android-errors.log',diagnostics.replaceAll(email,'[email]').replaceAll(password,'[password]'));}catch(_){}
 try{const s=await read();report.failurePlayback={watchMode:s.watchMode,audioPlaying:s.audioPlaying,audioTime:s.audioTime,currentId:s.currentId,nativeAudio:s.nativeAudio};
  report.startupAtFailure={libraryReady:s.libraryReady,loading:s.loading,bootstrapInFlight:s.bootstrapInFlight,
    authBusy:s.authBusy,authMode:s.authMode,authError:s.authError,authFields:s.authFields,
    loggedIn:s.loggedIn,hasStoredSession:s.hasStoredSession,playlistsCount:s.playlists.length,
    qaPlaylistFound:!!restartPlaylistName&&s.playlists.some(p=>p.name===restartPlaylistName)};}catch(_){}
 // Only capture a signed-in page after the form has disappeared. Pre-login
 // failures still retain the safe booleans and native diagnostics above.
 try{const s=await read();if(s.loggedIn&&!s.controls.email&&!s.controls.password&&!s.authFields.emailPresent&&!s.authFields.passwordPresent){adb('shell','screencap','-p','/sdcard/account-failure.png');adb('pull','/sdcard/account-failure.png','emulator-report/account-failure.png');report.failureScreenshotCredentialsAbsent=true;}}catch{}report.status='failed';report.error=String(e.message).replaceAll(email,'[email]').replaceAll(password,'[password]');process.exitCode=1; }finally{
 try{await cleanupQaComment();}catch(cleanup){report.qaCommentCleanedUp=false;report.cleanupFailure=String(cleanup.message||cleanup).replaceAll(email,'[email]').replaceAll(password,'[password]');report.status='failed';process.exitCode=1;}
 report.finishedAt=new Date().toISOString();ws?.close();
  // The next CI step immediately verifies media while still signed in. Restarting
  // the app here races asynchronous account hydration and makes a valid signed-in
  // session appear logged out to that independent playback verifier.
  const handoffSignedIn=report.status==='passed'&&process.env.IRGUN_KEEP_QA_SESSION==='1';
  if (!handoffSignedIn) {
    try { adb('shell','am','force-stop','org.irgunshiuraitorah.app'); adb('shell','am','start','-n','org.irgunshiuraitorah.app/.SplashActivity'); await delay(1500); report.evidenceCredentialsCleared=true; } catch {}
  } else {
    // The account form was closed by the successful real login; do not log or
    // export session credentials. The following media step owns the live app.
    report.evidenceCredentialsCleared=true;
  }
  writeFileSync('emulator-report/account.json',JSON.stringify(report,null,2));}


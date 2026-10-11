import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const email=process.env.IRGUN_TEST_EMAIL,password=process.env.IRGUN_TEST_PASSWORD;
assert.ok(email&&password,'Configure dedicated verified account secrets IRGUN_TEST_EMAIL and IRGUN_TEST_PASSWORD');
const adb=(...a)=>execFileSync('adb',a,{encoding:'utf8'}).trim();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const report={checks:[],credentialsRecorded:false,startedAt:new Date().toISOString()};let ws;
let qaCommentId='',qaCommentMarker='',accountDisplayName='';
async function connect(){
 const pid=adb('shell','pidof','org.irgunshiuraitorah.app').split(/\s+/)[0];
 adb('forward','tcp:9222',`localabstract:webview_devtools_remote_${pid}`);
 const pages=await(await fetch('http://127.0.0.1:9222/json/list')).json();
 ws=new WebSocket(pages.find(p=>p.type==='page'&&/localhost/.test(p.url)).webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 const socket=ws;let id=0;const pending=new Map();
 socket.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Observation connection closed'));}pending.clear();});
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error||m.result.exceptionDetails?p.reject(new Error('Observation failed')):p.resolve(m.result.result.value);});
 return ()=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(new Error('Observation timeout'));},10000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method:'Runtime.evaluate',params:{expression:'JSON.stringify(window.ISTAccountTest ? window.ISTAccountTest.snapshot() : {ready:false,observerReady:false})',returnByValue:true}}));}).then(JSON.parse);
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
 for(let attempt=1;attempt<=4;attempt++){
  // Do not reuse an older hierarchy if this capture fails during startup.
  adb('shell','rm','-f','/sdcard/account-bounds.xml');
  try {
   adb('shell','uiautomator','dump','--compressed','/sdcard/account-bounds.xml');
   const xml=adb('shell','cat','/sdcard/account-bounds.xml');
   const node=xml.match(/<node\b[^>]*class="android\.webkit\.WebView"[^>]*>/)?.[0];
   const match=node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
   if(match){
    const value=match.slice(1).map(Number);
    if(value[2]>value[0]&&value[3]>value[1]){
     report.nativeBoundsAttempts=attempt;
     report.nativeBounds=value;
     return value;
    }
   }
  } catch {
   // Android may return a null root while WebView is still rendering.
   // Retry the native hierarchy; never substitute guessed screen coordinates.
  }
  await delay(700);
 }
 throw new Error('Native WebView hierarchy unavailable after four fresh captures');
}

let bounds;
function native(p,s){return [Math.round(bounds[0]+p.x*(bounds[2]-bounds[0])/s.width),Math.round(bounds[1]+p.y*(bounds[3]-bounds[1])/s.height)];}
async function tap(key) {
 report.stage='Native tap: '+key;
 for(let i=0;i<9;i++) {
  const s=await read(),p=s.controls[key];
  if(p) {
   adb('shell','input','tap',...native(p,s).map(String));
   await delay(700);
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
  // Find real controls by scrolling in the direction their screen position requires.
  const returnToTop=['closeWatch','login','settings'].includes(key);
  const commentAction=['commentText','postComment','editQaComment','editedQaText','saveQaComment','deleteQaComment'].includes(key);
  // The video player and action buttons swallow drags in the middle of the
  // viewport. Drag over the lower white comments/details scroll surface instead.
  const x=commentAction ? Math.round(bounds[2]-34) : Math.round(bounds[2]-25);
  // Watch comments live in .watch-scroll BELOW the HLS frame. Swiping toward
  // the frame hits the touch-action:none video rather than scrolling content.
  // Keep the entire real finger swipe in the white watch-details viewport.
  const yStart=commentAction ? Math.round(bounds[3]-57) : Math.round(bounds[3]-150);
  const yEnd=commentAction ? Math.max(bounds[1]+305, bounds[3]-285) : bounds[1]+135;
  if(returnToTop)adb('shell','input','swipe',String(x),String(yEnd),String(x),String(yStart),'480');
  else adb('shell','input','swipe',String(x),String(yStart),String(x),String(yEnd),'480');
  await delay(500);
 }
 throw new Error(`Visible control missing: ${key}`);
}
async function type(key,value){assert.match(value,/^[a-zA-Z0-9@._+!-]+$/,'Dedicated credentials must use characters supported by native adb text input');await tap(key);adb('shell','input','text',value);adb('shell','input','keyevent','4');await delay(500);}
async function acceptDeleteConfirmation(){
 adb('shell','uiautomator','dump','--compressed','/sdcard/account-confirm.xml');
 const xml=adb('shell','cat','/sdcard/account-confirm.xml');
 const nodes=xml.match(/<node\b[^>]*>/g)||[];
 const positive=nodes.find(n=>/text="(OK|Yes|Delete)"/i.test(n)&&/clickable="true"/.test(n));
 assert.ok(positive,'Actual Android native confirm button must be shown');
 const b=positive.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)?.slice(1).map(Number);
 assert.ok(b,'Native Delete confirmation must have actual coordinates');
 adb('shell','input','tap',String(Math.floor((b[0]+b[2])/2)),String(Math.floor((b[1]+b[3])/2)));
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
 await fetch('https://api.irgunshiuraitorah.com/logout',{method:'POST',headers:protectedHeaders}).catch(()=>{});
}
try{
 readSnapshot=await connect();await wait(s=>s.ready,'Library unavailable');
 bounds=await readNativeBounds();
 report.nativeLoginStartedAt=new Date().toISOString();await tap('account');await type('email',email);await type('password',password);await tap('login');
 const loggedIn=await wait(s=>s.loggedIn&&s.profileVisible,'Native login failed');
 accountDisplayName=String(loggedIn.name||'').trim();
 assert.ok(accountDisplayName,'Account must display the registered name, not a blank label');
 assert.equal(String(loggedIn.profileShownName||'').trim(),accountDisplayName,'Profile screen must display the correct account name');
 report.checks.push('Real Android account name displayed on profile');
 assert.equal((await read()).isAdmin,false,'Use a non-admin dedicated account');assert.ok(String((await read()).accountEmail||'').trim().toLowerCase()===email.trim().toLowerCase(),'Refuse to mutate an account other than the dedicated approved account');report.checks.push('Native email/password login and profile');
 await tap('settings');await wait(s=>s.settingsVisible,'Settings missing');report.checks.push('Account settings displayed');
 await tap('shiurim');await tap('open');await wait(s=>!!s.watchId,'Lecture did not open');const id=(await read()).watchId;
 report.accountMutationsStartedAt=new Date().toISOString();const before=await read();await tap('like');await wait(s=>s.likes.includes(id)!==before.likes.includes(id),'Like toggle failed');report.checks.push('Native Like toggle');
 await tap('save');await tap('later');await wait(s=>s.later.includes(id)!==before.later.includes(id),'Save toggle failed');await closeSavePicker();report.checks.push('Native Watch Later toggle and dialog closure');await tap('follow');await wait(s=>JSON.stringify(s.follows)!==JSON.stringify(before.follows),'Follow toggle failed');report.checks.push('Native speaker follow toggle');const playbackObserved=await wait(s=>s.videoPlaying&&s.videoTime>1&&s.history.includes(id),'Playback needed to record real history');
 await delay(1400);
 const laterPlayback=await read();
 assert.ok(laterPlayback.videoPlaying&&laterPlayback.videoTime>playbackObserved.videoTime+0.6,
   'Actual Android video clock must advance after recording history');
 report.checks.push('Actual playing lecture history recorded');
 qaCommentMarker='IRGUN-QA-'+Date.now();report.commentVideoId=id;
 await type('commentText',qaCommentMarker);await tap('postComment');
 const withComment=await wait(s=>s.comments.some(c=>c.text===qaCommentMarker&&c.mine),'Native posted QA comment not visible');
 qaCommentId=String(withComment.comments.find(c=>c.text===qaCommentMarker&&c.mine).id);
 assert.ok(qaCommentId,'QA comment needs real server ID');
 report.checks.push('Native UI posted a comment, stored with correct author');
 await tap('editQaComment');await type('editedQaText','-EDITED');await tap('saveQaComment');
 await wait(s=>s.comments.some(c=>c.id===qaCommentId&&c.text===qaCommentMarker+'-EDITED'),'Edited comment was not saved');
 report.checks.push('Native UI edit comment persisted');
 await tap('deleteQaComment');await acceptDeleteConfirmation();
 await wait(s=>!s.comments.some(c=>c.id===qaCommentId),'Native QA comment deletion failed');
 report.checks.push('Native UI deleted its own QA comment');qaCommentId='';
 await tap('closeWatch');await tap('library');await tap('playlists');const name=`Irgun-QA-${Date.now()}`;await type('playlistName',name);await tap('createPlaylist');await wait(s=>s.playlists.some(p=>p.name===name),'Playlist creation failed');
 const changed=await read();
 report.beforeRestart = {
  signedIn:changed.loggedIn,
  like:changed.likes.includes(id),
  watchLater:changed.later.includes(id),
  followingCount:changed.follows.length,
  playbackHistoryRecorded:changed.history.includes(id),
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
 assert.ok(report.restartComparison.playbackHistory.actual,'Playback history did not persist across Android app restart');
 report.checks.push('Server-backed likes, Watch Later, follows, history and playlist survive process restart');
 // Restore only the lecture flags changed by this run. Leave the named QA playlist for review.
 await tap('shiurim');await tap('open');assert.equal((await wait(s=>!!s.watchId,'Lecture unavailable')).watchId,id,'Cleanup must target the same lecture');await tap('like');await tap('save');await tap('later');await closeSavePicker();await tap('follow');await wait(s=>s.likes.includes(id)===before.likes.includes(id)&&s.later.includes(id)===before.later.includes(id)&&JSON.stringify(s.follows.slice().sort())===JSON.stringify(before.follows.slice().sort()),'Lecture flags were not restored');report.checks.push('Lecture flags restored');await tap('closeWatch');await tap('account');await tap('logout');await wait(s=>!s.loggedIn&&s.likes.length===0&&s.later.length===0&&s.playlists.length===0,'Logout did not clear account data');report.checks.push('Logout clears account state');
 await type('email',email);await type('password',password);await tap('login');
 const again=await wait(s=>s.loggedIn&&s.profileVisible,'Subsequent native login failed');
 assert.equal(String(again.name||'').trim(),accountDisplayName,'Account name changed after logout and re-login');
 assert.equal(String(again.profileShownName||'').trim(),accountDisplayName,'Visible account name wrong after re-login');
 report.checks.push('Subsequent email/password login restores correct profile name');
 await tap('logout');await wait(s=>!s.loggedIn,'Second native logout failed');
 report.checks.push('Subsequent logout successful');
 report.accountMutationsFinishedAt=new Date().toISOString();report.status='passed';
}catch(e){if(report.checks.includes('Native email/password login and profile')){try{adb('shell','screencap','-p','/sdcard/account-failure.png');adb('pull','/sdcard/account-failure.png','emulator-report/account-failure.png');report.failureScreenshotCredentialsAbsent=true;}catch{}}report.status='failed';report.error=String(e.message).replaceAll(email,'[email]').replaceAll(password,'[password]');process.exitCode=1; }finally{
 try{await cleanupQaComment();}catch(cleanup){report.qaCommentCleanedUp=false;report.cleanupFailure=String(cleanup.message||cleanup).replaceAll(email,'[email]').replaceAll(password,'[password]');report.status='failed';process.exitCode=1;}
 report.finishedAt=new Date().toISOString();ws?.close();try{adb('shell','am','force-stop','org.irgunshiuraitorah.app');adb('shell','am','start','-n','org.irgunshiuraitorah.app/.SplashActivity');await delay(1500);report.evidenceCredentialsCleared=true;}catch{}writeFileSync('emulator-report/account.json',JSON.stringify(report,null,2));}


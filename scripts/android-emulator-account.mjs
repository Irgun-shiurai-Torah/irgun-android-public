import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const email=process.env.IRGUN_TEST_EMAIL,password=process.env.IRGUN_TEST_PASSWORD;
assert.ok(email&&password,'Configure dedicated verified account secrets IRGUN_TEST_EMAIL and IRGUN_TEST_PASSWORD');
const adb=(...a)=>execFileSync('adb',a,{encoding:'utf8'}).trim();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const report={checks:[],credentialsRecorded:false,startedAt:new Date().toISOString()};let ws;
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
async function tap(key){report.stage='Native tap: '+key;for(let i=0;i<6;i++){const s=await read(),p=s.controls[key];if(p){adb('shell','input','tap',...native(p,s).map(String));await delay(700);return;}adb('shell','input','swipe',String((bounds[0]+bounds[2])/2),String(bounds[3]-170),String((bounds[0]+bounds[2])/2),String(bounds[1]+170),'400');await delay(500);}throw new Error(`Visible control missing: ${key}`);}
async function type(key,value){assert.match(value,/^[a-zA-Z0-9@._+!-]+$/,'Dedicated credentials must use characters supported by native adb text input');await tap(key);adb('shell','input','text',value);adb('shell','input','keyevent','4');await delay(500);}
try{
 readSnapshot=await connect();await wait(s=>s.ready,'Library unavailable');
 bounds=await readNativeBounds();
 report.nativeLoginStartedAt=new Date().toISOString();await tap('account');await type('email',email);await type('password',password);await tap('login');
 await wait(s=>s.loggedIn&&s.profileVisible,'Native login failed');assert.equal((await read()).isAdmin,false,'Use a non-admin dedicated account');assert.ok(String((await read()).accountEmail||'').trim().toLowerCase()===email.trim().toLowerCase(),'Refuse to mutate an account other than the dedicated approved account');report.checks.push('Native email/password login and profile');
 await tap('settings');await wait(s=>s.settingsVisible,'Settings missing');report.checks.push('Account settings displayed');
 await tap('shiurim');await tap('open');await wait(s=>!!s.watchId,'Lecture did not open');const id=(await read()).watchId;
 report.accountMutationsStartedAt=new Date().toISOString();const before=await read();await tap('like');await wait(s=>s.likes.includes(id)!==before.likes.includes(id),'Like toggle failed');report.checks.push('Native Like toggle');
 await tap('save');await tap('later');await wait(s=>s.later.includes(id)!==before.later.includes(id),'Save toggle failed');await closeSavePicker();report.checks.push('Native Watch Later toggle and dialog closure');await tap('follow');await wait(s=>JSON.stringify(s.follows)!==JSON.stringify(before.follows),'Follow toggle failed');report.checks.push('Native speaker follow toggle');await wait(s=>s.videoPlaying&&s.videoTime>1&&s.history.includes(id),'Playback needed to record real history');report.checks.push('Actual playing lecture history recorded');
 await tap('closeWatch');await tap('library');await tap('playlists');const name=`Irgun-QA-${Date.now()}`;await type('playlistName',name);await tap('createPlaylist');await wait(s=>s.playlists.some(p=>p.name===name),'Playlist creation failed');
 const changed=await read();ws.close();adb('shell','am','force-stop','org.irgunshiuraitorah.app');adb('shell','am','start','-n','org.irgunshiuraitorah.app/.SplashActivity');await delay(5000);readSnapshot=await connect();
 await wait(s=>s.ready&&s.loggedIn&&s.playlists.some(p=>p.name===name),'Session/playlist did not survive relaunch');const restored=await read();assert.equal(restored.likes.includes(id),changed.likes.includes(id));assert.equal(restored.later.includes(id),changed.later.includes(id));assert.deepEqual(restored.follows.slice().sort(),changed.follows.slice().sort());assert.ok(restored.history.includes(id),'Playback history must survive relaunch');report.checks.push('Server-backed likes, Watch Later, follows, history and playlist survive process restart');
 // Restore only the lecture flags changed by this run. Leave the named QA playlist for review.
 await tap('shiurim');await tap('open');assert.equal((await wait(s=>!!s.watchId,'Lecture unavailable')).watchId,id,'Cleanup must target the same lecture');await tap('like');await tap('save');await tap('later');await closeSavePicker();await tap('follow');await wait(s=>s.likes.includes(id)===before.likes.includes(id)&&s.later.includes(id)===before.later.includes(id)&&JSON.stringify(s.follows.slice().sort())===JSON.stringify(before.follows.slice().sort()),'Lecture flags were not restored');report.checks.push('Lecture flags restored');await tap('closeWatch');await tap('account');await tap('logout');await wait(s=>!s.loggedIn&&s.likes.length===0&&s.later.length===0&&s.playlists.length===0,'Logout did not clear account data');report.checks.push('Logout clears account state');report.accountMutationsFinishedAt=new Date().toISOString();report.status='passed';
}catch(e){if(report.checks.includes('Native email/password login and profile')){try{adb('shell','screencap','-p','/sdcard/account-failure.png');adb('pull','/sdcard/account-failure.png','emulator-report/account-failure.png');report.failureScreenshotCredentialsAbsent=true;}catch{}}report.status='failed';report.error=String(e.message).replaceAll(email,'[email]').replaceAll(password,'[password]');process.exitCode=1;}finally{report.finishedAt=new Date().toISOString();ws?.close();try{adb('shell','am','force-stop','org.irgunshiuraitorah.app');adb('shell','am','start','-n','org.irgunshiuraitorah.app/.SplashActivity');await delay(1500);report.evidenceCredentialsCleared=true;}catch{}writeFileSync('emulator-report/account.json',JSON.stringify(report,null,2));}


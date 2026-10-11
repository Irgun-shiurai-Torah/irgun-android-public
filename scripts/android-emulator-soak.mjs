import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const pkg='org.irgunshiuraitorah.app';
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:20000}).trim();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const report={startedAt:new Date().toISOString(),device:'Android 11',durationMinutes:15,samples:[],checks:[],status:'running'};
const startMs=Date.now(),soakMs=15*60*1000;
let ws,evalId=0,pending=new Map();
function pid(){return adb('shell','pidof',pkg).split(/\s+/)[0];}
async function connect(){
  if(ws?.readyState===WebSocket.OPEN)return;
  const currentPid=pid();
  assert.ok(currentPid,'Android app process is not running');
  adb('forward','tcp:9227','localabstract:webview_devtools_remote_'+currentPid);
  const pages=await(await fetch('http://127.0.0.1:9227/json/list',{signal:AbortSignal.timeout(5000)})).json();
  const page=pages.find(x=>x.type==='page'&&/localhost/.test(x.url));
  assert.ok(page,'Android WebView must be available');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('WebView connection timed out')),9000);ws.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});ws.addEventListener('error',reject,{once:true})});
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);if(m.error||m.result?.exceptionDetails)p.reject(new Error('Read-only CDP observation error'));else p.resolve(m.result.result.value);});
  ws.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP connection closed'));}pending.clear();ws=undefined;});
}
async function state(){
  await connect();
  const id=++evalId,expression="window.Capacitor.nativePromise('IrgunPlayback','qaPlaybackSnapshot',{})";
  return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Native Media3 state observation timed out'));},9000);
    pending.set(id,{resolve,reject,timer});
    ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));
  });
}
function assertAudio(s){
  assert.equal(s.mode,'AUDIO','Expected native AUDIO authority');
  assert.equal(s.audioIsPlaying,true,'15-minute test lost native audio playback');
  assert.ok(Number(s.audioPositionMs)>0,'Native timer stuck at 0:00');
  assert.ok(Number(s.audioDurationMs)>1000000,'Lecture duration must load');
}
function memory(){
  const raw=adb('shell','dumpsys','meminfo',pkg);
  const pss=raw.match(/TOTAL PSS:\s*(\d+)/)?.[1]||raw.match(/^\s*TOTAL\s+(\d+)\s/m)?.[1];
  assert.ok(pss,'Android must expose process memory statistics');
  return Number(pss);
}
function snap(elapsed,s) {
  report.samples.push({elapsedMs:elapsed,positionMs:Number(s.audioPositionMs),speed:Number(s.playbackSpeed),pssKb:memory(),pid:pid()});
}
try{
  await connect();
  const base=await state();assertAudio(base);
  const initialPid=pid();
  snap(0,base);
  report.checks.push('Native audible speech and nonzero duration at start');
  // Real elapsed wall clock is used. We do not jump the media clock, fake time,
  // or mark the test complete before 15 full minutes of playback.
  for(let m=1;m<=15;m++) {
    const next=startMs+m*60000;
    await delay(Math.max(0,next-Date.now()));
    if(m===4||m===9||m===13){
      adb('shell','input','keyevent','KEYCODE_POWER');
      await delay(3300);
      // Do not touch the Capacitor bridge while Android is backgrounded.
      // Confirm MediaSession is registered at the OS level.
      const session=adb('shell','dumpsys','media_session');
      assert.ok(session.includes(pkg),'Media session vanished during locked playback');
      adb('shell','input','keyevent','KEYCODE_POWER');
      adb('shell','input','keyevent','KEYCODE_MENU');
      await delay(1400);
      report.checks.push('Actual Android screen lock/unlock preserved session at minute '+m);
    }
    if(m===6||m===12){
      adb('shell','input','keyevent','KEYCODE_HOME');
      await delay(3200);
      const notification=adb('shell','dumpsys','notification','--noredact');
      assert.ok(notification.includes(pkg),'Media notification vanished while app in background');
      adb('shell','am','start','-W','-n',pkg+'/.MainActivity');
      await delay(1700);
      report.checks.push('Home/background/notification/reopen preserved app at minute '+m);
    }
    assert.equal(pid(),initialPid,'Irgun Android process restarted during 15-minute soak');
    const current=await state();assertAudio(current);
    const last=report.samples.at(-1);
    assert.ok(Number(current.audioPositionMs)>last.positionMs+22000,'Media time froze or reset during long playback');
    snap(Date.now()-startMs,current);
    console.log('MINUTE '+m+' OK, media seconds '+(current.audioPositionMs/1000).toFixed(1));
  }
  assert.ok(Date.now()-startMs>=soakMs,'A true 15-minute test interval is required');
  report.checks.push('Actual 15-minute session completed without process restart, stalled timer or vanished controls');
  report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;}
finally{
  try{ws?.close();}catch{}
  report.actualElapsedMs=Date.now()-startMs;report.finishedAt=new Date().toISOString();
  mkdirSync('emulator-report',{recursive:true});
  writeFileSync('emulator-report/soak-15-min.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,elapsed:report.actualElapsedMs,samples:report.samples.length,checks:report.checks,error:report.error},null,2));
}
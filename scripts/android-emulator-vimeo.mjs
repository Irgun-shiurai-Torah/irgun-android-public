import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {settledNativeTapPoint} from './android-native-tap-point.mjs';
import {typeObservedNativeText} from './android-native-text-entry.mjs';

const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:30000});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={checks:[],startedAt:new Date().toISOString()};let ws;
try{
 const response=await fetch('https://api.irgunshiuraitorah.com/video-map?driveLibrary=1',{
  headers:{Origin:'https://localhost','X-Irgun-App':'1'},signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,200);
 const catalog=await response.json();
 const target=catalog.find(v=>v.hasDriveVideo===false&&/^\d+(?::[a-z0-9]+)?$/i.test(String(v.vimeoId||v.id))&&v.shiurCode);
 if(!target){
  report.status='not_applicable';report.reason='No Vimeo-only lecture remains in the live catalog; native-ready lectures must stay native.';
 }else{
  report.fixture={id:target.id,code:target.shiurCode,hasDriveVideo:target.hasDriveVideo};
  const pid=adb('shell','pidof','org.irgunshiuraitorah.app').trim().split(/\s+/)[0];
  // The preceding native suite deliberately exercises Home/background Audio.
  // Launch the existing task before attempting a foreground UI touch; never
  // restart the process or pretend an unfocused WebView can receive a tap.
  adb('shell','am','start','-W','-n','org.irgunshiuraitorah.app/.SplashActivity');
  assert.equal(adb('shell','pidof','org.irgunshiuraitorah.app').trim().split(/\s+/)[0],pid,
   'Foregrounding for Vimeo must keep the existing app process');
  adb('forward','tcp:9222',`localabstract:webview_devtools_remote_${pid}`);
  const pages=await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page=pages.find(p=>p.type==='page'&&/localhost/.test(p.url));assert.ok(page);
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let sequence=0;
  // The preceding native test intentionally blocks Vimeo requests. Restore
  // normal transport for this separate real Vimeo playback test.
  ws.send(JSON.stringify({id:++sequence,method:'Network.enable'}));
  ws.send(JSON.stringify({id:++sequence,method:'Network.setBlockedURLs',params:{urls:[]}}));
  const evaluate=expression=>new Promise((resolve,reject)=>{
   const id=++sequence,timer=setTimeout(()=>{ws.removeEventListener('message',receive);reject(Error('Read-only CDP observation timed out'));},15000);
   const receive=event=>{const value=JSON.parse(event.data);if(value.id!==id)return;
    clearTimeout(timer);ws.removeEventListener('message',receive);
    if(value.error||value.result.exceptionDetails)reject(Error('CDP observation failed'));
    else resolve(value.result.result.value);};
   ws.addEventListener('message',receive);ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
  });
  const tap=async selector=>{
   const measured=await settledNativeTapPoint({delay,
    readBounds:()=>evaluate("window.Capacitor.nativePromise('IrgunPlayback','qaWindowBounds',{})"),
    readPoint:()=>evaluate(`(()=>{for(const e of document.querySelectorAll(${JSON.stringify(selector)})){
     const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);
     if(r.width>0&&r.height>0&&x>0&&y>0&&x<innerWidth&&y<innerHeight&&(h===e||e.contains(h)))
      return {x,y,width:innerWidth,height:innerHeight};}return null;})()`)});
   adb('shell','input','tap',...measured.point.map(String));
  };
  let focused=false;
  for(let i=0;i<30;i++){
   focused=(await evaluate("window.Capacitor.nativePromise('IrgunPlayback','qaWindowBounds',{})")).focused;
   if(focused)break;await delay(200);
  }
  assert.equal(focused,true,'The actual Irgun window must regain foreground focus before Vimeo navigation');
  await tap('[data-close-watch]');await delay(500);
  await tap('.bottom-nav [data-nav="home"]');await delay(600);
  for(let i=0;i<6;i++){
   const visible=await evaluate("!!document.querySelector('#homeLibrarySearch')&&document.querySelector('#homeLibrarySearch').getBoundingClientRect().bottom<innerHeight-80");
   if(visible)break;
   adb('shell','input','swipe','160','200','160','500','400');await delay(500);
  }
  await tap('#homeLibrarySearch');
  const length=await evaluate("document.querySelector('#homeLibrarySearch').value.length");
  if(length){adb('shell','input','keyevent','KEYCODE_MOVE_END');adb('shell','input','keyevent',...Array(length).fill('KEYCODE_DEL'));}
  await typeObservedNativeText({value:String(target.shiurCode),
   readValue:()=>evaluate("document.querySelector('#homeLibrarySearch').value"),
   typeCharacter:character=>adb('shell','input','text',character)});
  adb('shell','input','keyevent','KEYCODE_ENTER');await delay(1200);
  const ime=adb('shell','dumpsys','input_method');if(/(?:mInputShown|isInputViewShown)=true/.test(ime))adb('shell','input','keyevent','KEYCODE_BACK');
  await delay(600);
  await tap('[data-watch="'+target.id+'"]');
  let playing;
  for(let i=0;i<90;i++){
   playing=await evaluate('window.ISTReleaseQA.vimeoStatus()');
   if(playing.active&&!playing.paused&&playing.seconds>1)break;await delay(500);
  }
  assert.ok(playing.active&&!playing.paused&&playing.seconds>1,'Real Vimeo SDK clock must start through the actual Android UI');
  assert.equal(playing.watchId,target.id);
  assert.equal(playing.iframeSources.filter(url=>url.includes('player.vimeo.com/video/')).length,1);
  assert.equal(playing.htmlAudioSilent,true);
  const native=await evaluate("window.Capacitor.nativePromise('IrgunNativeVideo','snapshot',{})");
  const audio=await evaluate("window.Capacitor.nativePromise('IrgunPlayback','qaPlaybackSnapshot',{})");
  assert.equal(native.active,false,'Vimeo must not leave an active native video engine behind');
  assert.equal(audio.audioIsPlaying,false,'Native Audio must be silent while Vimeo plays');
  await delay(2200);const advanced=await evaluate('window.ISTReleaseQA.vimeoStatus()');
  assert.ok(advanced.seconds>playing.seconds+1,'Actual Vimeo playback must continue advancing');
  assert.equal(adb('shell','pidof','org.irgunshiuraitorah.app').trim().split(/\s+/)[0],pid);
  writeFileSync('emulator-report/vimeo-only-playing.png',execFileSync('adb',['exec-out','screencap','-p']));
  report.checks.push('Vimeo-only lecture remains visible and starts one actual Vimeo player with silent native Audio');
  report.before=playing;report.after=advanced;report.native=native;report.audio=audio;report.status='passed';
 }
}catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;
 try{writeFileSync('emulator-report/vimeo-only-failure.png',execFileSync('adb',['exec-out','screencap','-p']));}catch(_){}
}finally{ws?.close();report.finishedAt=new Date().toISOString();writeFileSync('emulator-report/vimeo-only.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}

// Signed-in Android purchase regression. Runs AFTER the existing dedicated
// non-admin account QA flow, with the SAME already-authenticated emulator.
// Actions are real ADB taps/swipes. CDP is strictly read-only; never reads
// cookies, auth tokens, payment data, signed URLs, or login input values.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const productId='pap-whats-halacha-vol1-belsky';
const packageName='org.irgunshiuraitorah.app';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:10000}).trim();
const report={productId,checks:[],startedAt:new Date().toISOString(),status:'running'};
mkdirSync('emulator-report',{recursive:true});
let ws=null;
async function connect(){
  for(let i=0;i<10;i++){
    const pid=adb('shell','pidof',packageName).split(/\s+/)[0];
    assert.match(pid,/^\d+$/,'The QA app must remain running after account login');
    try{
      adb('forward','tcp:9222',`localabstract:webview_devtools_remote_${pid}`);
      const resp=await fetch('http://127.0.0.1:9222/json/list',{signal:AbortSignal.timeout(2500)});
      const pages=await resp.json();
      const page=pages.find(p=>p.type==='page'&&/localhost/.test(p.url)&&p.webSocketDebuggerUrl);
      if(page){ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((ok,no)=>{
        ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',no,{once:true});
      });return;}
    }catch(_){}
    await delay(650);
  }
  throw new Error('No authenticated Irgun WebView found for purchased playback QA');
}
const pending=new Map();let seq=0;
function startSocket(){
  ws.addEventListener('message',e=>{
    const message=JSON.parse(e.data),item=pending.get(message.id);
    if(!item)return;
    pending.delete(message.id);clearTimeout(item.timeout);
    if(message.error||message.result?.exceptionDetails)
      item.reject(new Error('Read-only Android observation failed'));
    else item.resolve(message.result?.result?.value);
  });
  ws.addEventListener('close',()=>{for(const x of pending.values()){clearTimeout(x.timeout);x.reject(new Error('CDP disconnected'));}pending.clear();});
}
async function observe(expression){
  const id=++seq;
  const value=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Read-only observation timed out'));},9500);
    pending.set(id,{resolve,reject,timeout});
    ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));
  });
  return typeof value==='string'?JSON.parse(value):value;
}
const snapshot=()=>observe('JSON.stringify(window.ISTAccountTest.snapshot())');
const bounds=()=>observe("window.Capacitor.nativePromise('IrgunPlayback','qaWindowBounds',{}).then(JSON.stringify)");
const placement=selector=>observe(`JSON.stringify((()=>{
  const el=document.querySelector(${JSON.stringify(selector)});
  if(!el)return {found:false};
  const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,
    hit=document.elementFromPoint(x,y),visible=r.width>0&&r.height>0&&
      x>0&&y>0&&x<innerWidth&&y<innerHeight&&
      !el.closest('[hidden]')&&(hit===el||el.contains(hit));
  return {found:true,visible,x,y,height:r.height,width:r.width,
    widthScreen:innerWidth,heightScreen:innerHeight};
})())`);
async function toPixels(p) {
  const b=await bounds();
  assert.equal(b.focused,true,'Irgun lost Android foreground while testing purchase');
  return [Math.round(b.left+p.x*(b.right-b.left)/p.widthScreen),
    Math.round(b.top+p.y*(b.bottom-b.top)/p.heightScreen)];
}
async function tap(selector,{tries=18}={}){
  for(let i=0;i<tries;i++){
    const point=await placement(selector);
    if(point.visible){
      adb('shell','input','tap',...(await toPixels(point)).map(String));
      await delay(500);
      return true;
    }
    const b=await bounds(),height=Math.max(200,b.bottom-b.top),width=b.right-b.left;
    const down=point.found && point.y < 100;
    const x=Math.round(b.left+width*.65);
    const fromY=Math.round(b.top+height*(down ? 0.25 : 0.78));
    const toY=Math.round(b.top+height*(down ? 0.77 : 0.30));
    adb('shell','input','swipe',String(x),String(fromY),String(x),String(toY),'450');
    await delay(450);
  }
  return false;
}
const paidView=()=>observe(`JSON.stringify((()=>{
  const item=document.querySelector('[data-paid-collection-id="${productId}"]');
  const locked=[...document.querySelectorAll('.paid-card:not(.owned)')].find(el=>el.querySelector('.paid-folder-overview'));
  const panel=locked?.querySelector('[data-paid-description-panel]');
  const preview=locked?.querySelector('.paid-folder-overview');
  return {screen:window.ISTAccountTest.snapshot().screen,
    productVisible:!!item,owned:!!item?.classList.contains('owned'),
    listen:!!item?.querySelector('[data-paid-expand]'),
    lockedPreviewExists:!!preview,lockedPreviewHidden:!preview || (!!panel?.hidden&&panel.contains(preview)),
    lockedPanelId:panel?.dataset.paidDescriptionPanel||'',
    tracks:item?.querySelectorAll('[data-paid-track]').length||0};
})())`);
const nextUnopened=()=>observe(`JSON.stringify((()=>{
 const item=document.querySelector('[data-paid-collection-id="${productId}"]');
 for(const details of item?.querySelectorAll('.paid-folder-node:not([open])')||[]){
   if(!details.parentElement.closest('details:not([open])')) {
     return '[data-paid-folder-key='+JSON.stringify(details.dataset.paidFolderKey)+'] > summary';
   }
 }
 return null;
})())`);
const firstVisibleTrack=()=>observe(`JSON.stringify((()=>{
 const item=document.querySelector('[data-paid-collection-id="${productId}"]');
 for(const e of item?.querySelectorAll('[data-paid-track]')||[]){
   if(!e.closest('details:not([open])'))
     return {selector:'[data-paid-track='+JSON.stringify(e.dataset.paidTrack)+']',id:e.dataset.paidTrack};
 }
 return null;
})())`);
try{
  await connect();startSocket();
  const initial=await snapshot();
  assert.equal(initial.loggedIn,true,'The paid QA requires the verified signed-in emulator session');
  report.checks.push('Reused real signed-in non-admin test account');
  if(initial.screen!=='paid'){
    assert.ok(await tap('[data-nav="paid"]'),'Cannot reach Android Purchases via a physical tap');
    for(let n=0;n<32;n++){if((await paidView()).screen==='paid')break;await delay(350);}
  }
  // Fetching the paid catalog is asynchronous; absence while loading isn't
  // evidence of a missing product or entitlement.
  let page=await paidView();
  for(let i=0;i<36&&!page.productVisible;i++){await delay(500);page=await paidView();}
  if(!page.productVisible){report.status='skipped';report.reason='Paid fixture absent from this dedicated QA catalog';}
  else {
    assert.equal(page.lockedPreviewHidden,true,
      'An unpurchased folder preview must only appear inside the closed Description panel');
    report.checks.push('Unpurchased folders appear exclusively inside closed Description');
    if(!page.owned){
      report.status='skipped';
      report.reason='Dedicated GitHub QA account does not own the Belsky test product; assign the test purchase to IRGUN_TEST_EMAIL';
    }else{
      assert.equal(page.listen,true,'Entitled Whats the Halacha collection must have Listen');
      assert.ok(await tap('[data-paid-collection-id="${productId}"] [data-paid-expand]'),
        'The real owned Listen button is not accessible');
      let track=null;
      for(let i=0;i<10;i++){
        track=await firstVisibleTrack();
        if(track)break;
        const summary=await nextUnopened();
        if(!summary)break;
        assert.ok(await tap('[data-paid-collection-id="${productId}"] '+summary),
          'The real nested paid folder could not be expanded');
      }
      assert.ok(track?.id,'No playable Belsky track reachable through native folder taps');
      report.trackId=String(track.id);
      assert.ok(await tap('[data-paid-collection-id="${productId}"] '+track.selector),
        'Cannot physically tap the purchased Belsky track');
      let observedPlaying=false,advancing=false,startedAt=0,lastAt=0;
      const samples=[];
      const wanted=`${productId}:${track.id}`;
      for(let n=0;n<25;n++){
        await delay(650);
        const s=await snapshot();
        const sample={elapsedMs:(n+1)*650,id:s.currentId,
          nativeId:s.nativeAudio?.lectureId||'',ready:s.nativeAudio?.audioReady,
          playing:s.nativeAudio?.audioIsPlaying,ms:s.nativeAudio?.audioPositionMs||0};
        samples.push(sample);
        if(sample.id&&sample.id!==wanted)throw new Error('Purchased playback skipped selected track before it finished');
        if(sample.nativeId&&sample.nativeId!==wanted&&sample.elapsedMs>2500)
          throw new Error('Media3 switched away from the selected purchased track');
        if(sample.playing&&sample.nativeId===wanted){
          observedPlaying=true;
          if(!startedAt)startedAt=sample.ms;
          if(sample.ms>startedAt+1800)advancing=true;
          lastAt=sample.ms;
        }
        if(advancing&&sample.elapsedMs>=5500)break;
      }
      report.playbackSamples=samples;
      assert.ok(observedPlaying,'Purchased Belsky track never entered native Media3 Playing');
      assert.ok(advancing,'Purchased Belsky track did not advance its native Media3 clock');
      report.checks.push('Actual purchased Belsky track played with advancing native audio clock, no auto-skip');
      report.status='passed';
    }
  }
}catch(e){report.status='failed';report.error=String(e.message||e).slice(0,400);process.exitCode=1;
}finally{
  // Leave the same signed-in session at Home for the existing independent
  // HLS/notification test. Do not start a second audio player or clear tokens.
  try{adb('shell','input','keyevent','KEYCODE_MEDIA_PAUSE');}catch(_){}
  try{
    const s=ws ? await snapshot() : null;
    if(s?.screen!=='home') await tap('.bottom-nav [data-nav="home"]',{tries:5});
  }catch(_){}
  report.finishedAt=new Date().toISOString();
  if(ws)ws.close();
  writeFileSync('emulator-report/paid-playback-qa.json',JSON.stringify(report,null,2));
  console.log('Paid Android QA: '+report.status+(report.reason?' - '+report.reason:'')+
    (report.error?' - '+report.error:''));
}

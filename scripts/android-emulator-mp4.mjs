import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Read the real WebView through CDP, but perform every navigation gesture with
// Android input events. No DOM clicks or synthetic touch events stand in for UI.
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' }).trim();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { gestures: [], checks: [] };
let ws;
try {
  const pid = adb('shell', 'pidof', 'org.irgunshiuraitorah.app').split(/\s+/)[0];
  adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);
  const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = pages.find(p => p.type === 'page' && /localhost/.test(p.url));
  assert.ok(page?.webSocketDebuggerUrl, 'App WebView must be inspectable');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP connection timeout')), 10000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data), request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error || message.result?.exceptionDetails) request.reject(new Error(JSON.stringify(message)));
    else request.resolve(message.result.result.value);
  });
  const evaluate = expression => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP read timeout')); }, 10000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
  const catalog = await (await fetch('https://api.irgunshiuraitorah.com/video-map?driveLibrary=1', {
    headers:{Origin:'https://localhost','X-Irgun-App':'1'}, signal:AbortSignal.timeout(30000)
  })).json();
  const candidates = catalog.filter(v => /פריזנט/.test(v.title||'') && /עצות להצלחה/.test(v.title||''));
  const target = candidates.find(v => Number(v.duration) === 3663 &&
    [v.lectureDate,v.created].some(d=>String(d||'').startsWith('2026-10-06')));
  report.candidates = candidates.map(v=>({id:v.id,title:v.title,duration:v.duration,created:v.created,lectureDate:v.lectureDate}));
  assert.ok(target,'Must identify the exact Oct 6 Prizant shiur, duration 1:01:03');
  report.shiur = {id:target.id,title:target.title,duration:target.duration};
  const response = await fetch(`https://api.irgunshiuraitorah.com/media/${encodeURIComponent(target.id)}/source.json`, {
    headers:{Origin:'https://localhost'},signal:AbortSignal.timeout(30000)
  });
  assert.equal(response.status,200,'Source descriptor must be available');
  const source = await response.json();
  report.sources = source.video;
  assert.ok(source.video?.mp4,'Reported shiur must have its direct MP4');

  // Open the actual app via its existing notification intent, then use native
  // taps only. CDP observes the DOM/media; it does not create or play a player.
  adb('shell','input','keyevent','KEYCODE_HOME');
  adb('shell','am','start','-n','org.irgunshiuraitorah.app/.MainActivity',
    '-a','IRGUN_NOTIFICATION_CLICK','--es','url',`https://irgunshiuraitorah.com/watch.html?v=${target.id}`);
  const read = async () => JSON.parse(await evaluate(`JSON.stringify((()=>{
    const v=document.querySelector('#watchDirectHlsVideo');
    return {title:document.querySelector('.watch-overlay')?.innerText?.slice(0,900),
      video:v?{src:v.currentSrc||v.src,time:v.currentTime,paused:v.paused,ready:v.readyState,width:v.videoWidth,
        frames:v.getVideoPlaybackQuality?.().totalVideoFrames??v.webkitDecodedFrameCount,error:v.error?.code}:null,
      diagnostic:!!document.querySelector('.watch-hls-fallback-note'),
      text:document.querySelector('#app')?.innerText?.slice(0,300)};
  })())`));
  const wait = async predicate => {
    let state;
    for(let i=0;i<120;i++) {state=await read();if(predicate(state))return state;await delay(500);}
    throw new Error(`Video did not settle: ${JSON.stringify(state)}`);
  };
  await wait(s=>s.video?.ready>=2 && s.video.width>0);
  adb('shell','uiautomator','dump','/sdcard/irgun-mp4.xml');
  const xml=adb('shell','cat','/sdcard/irgun-mp4.xml');
  const bounds=xml.match(/<node\b[^>]*class="android\.webkit\.WebView"[^>]*>/)?.[0]
    .match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  assert.ok(bounds,'Native WebView bounds required');
  const [left,top,right,bottom]=bounds.slice(1).map(Number);
  const tapPlayPause=async()=>{
    const p=JSON.parse(await evaluate(`JSON.stringify((()=>{
      const b=document.querySelector('[data-hls-play]'),r=b?.getBoundingClientRect();
      if(!r)return null;const x=r.left+r.width/2,y=r.top+r.height/2;
      return document.elementFromPoint(x,y)?.closest('[data-hls-play]')?{x,y,width:innerWidth,height:innerHeight}:null;
    })())`));
    assert.ok(p,'Visible, hit-tested play control required');
    adb('shell','input','tap',String(Math.round(left+p.x*(right-left)/p.width)),String(Math.round(top+p.y*(bottom-top)/p.height)));
  };
  if((await read()).video.paused)await tapPlayPause();
  await wait(s=>s.video&&!s.video.paused&&s.video.time>0);
  const moving=async label=>{
    const before=await read();await delay(3500);const after=await read();
    assert.ok(after.video.time>before.video.time+1,`${label}: media clock must advance`);
    assert.ok(after.video.width>0 && after.video.frames>=before.video.frames+2,`${label}: decoded video frames must advance`);
    assert.equal(after.video.error,undefined);assert.equal(after.diagnostic,false,'Internal fallback banner must be absent');
    report.checks.push({label,before:before.video,after:after.video});
  };
  await moving('Reported shiur starts with moving direct video');
  const actual=(await read()).video.src;
  assert.equal(actual,source.video.hls||source.video.mp4,'Must use its direct source instead of Vimeo');
  if(!source.video.hls)assert.equal(actual,source.video.mp4,'MP4-only shiur must play MP4');
  await tapPlayPause();await wait(s=>s.video?.paused);
  const paused=await read();await delay(1500);const still=await read();
  assert.equal(still.video.paused,true);assert.ok(Math.abs(still.video.time-paused.video.time)<0.3,'Pause clock must stay stationary');
  report.checks.push({label:'Native Pause preserves position',before:paused.video,after:still.video});
  await tapPlayPause();await wait(s=>s.video&&!s.video.paused);await moving('Native Play resumes moving frames');
  writeFileSync('emulator-report/reported-shiur.png',execFileSync('adb',['exec-out','screencap','-p']));
  report.result='passed';
} catch (error) {
  report.result = 'failed'; report.error = String(error.stack || error);
  process.exitCode = 1;
} finally {
  ws?.close();
  writeFileSync('emulator-report/reported-shiur.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

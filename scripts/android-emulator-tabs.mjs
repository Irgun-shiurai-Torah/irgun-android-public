import { execFileSync, spawn } from 'node:child_process';
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
  const read = async () => JSON.parse(await evaluate(`JSON.stringify({
    tab:document.querySelector('.bottom-nav .active')?.dataset.nav,
    tabs:Array.from(document.querySelectorAll('.bottom-nav [data-nav]')).map(b=>({tab:b.dataset.nav,x:b.getBoundingClientRect().left})).sort((a,b)=>a.x-b.x).map(b=>b.tab),
    lang:document.documentElement.lang,
    text:document.querySelector('.content')?.innerText||'',
    counter:document.querySelector('.pro-counter span')?.textContent,
    eyebrow:!!document.querySelector('.hero-eyebrow'),
    loading:!!document.querySelector('#app .loading'),
    error:!!document.querySelector('.offline-error-card')
  })`));
  const wait = async predicate => {
    let state;
    for (let i = 0; i < 80; i++) {
      state = await read();
      if (predicate(state)) return state;
      await delay(250);
    }
    throw new Error(`UI did not settle: ${JSON.stringify(state)}`);
  };
  await wait(s => !s.loading && !s.error && s.counter === 'Shiurim played');
  assert.equal((await read()).eyebrow, false, 'Home eyebrow must be removed');
  report.checks.push('English Home wording and removed eyebrow');

  // Obtain the native WebView bounds, including status/navigation bar insets.
  adb('shell', 'uiautomator', 'dump', '/sdcard/irgun-tabs.xml');
  const xml = adb('shell', 'cat', '/sdcard/irgun-tabs.xml');
  const node = xml.match(/<node\b[^>]*class="android\.webkit\.WebView"[^>]*>/)?.[0];
  const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  assert.ok(bounds, 'Native WebView bounds must be available');
  const [left, top, right, bottom] = bounds.slice(1).map(Number);
  report.bounds = { left, top, right, bottom };
  const nativePoint = p => [Math.round(left + p.x * (right - left) / p.width), Math.round(top + p.y * (bottom - top) / p.height)];
  let sampledFingerTrackedSlide = false;
  const swipe = async dx => {
    const from = await read();
    const point = JSON.parse(await evaluate(`JSON.stringify((()=>{
      const content=document.querySelector('.content'), rect=content.getBoundingClientRect();
      const a=innerWidth*.28,b=innerWidth*.72;
      const excluded='input,textarea,select,[contenteditable],video,iframe,.watch-overlay,.mini-player,.bottom-nav';
      for(let y=Math.max(rect.top+30,100);y<Math.min(rect.bottom-20,innerHeight-150);y+=20){
        const targets=[a,b].map(x=>document.elementFromPoint(x,y));
        if(targets.every(t=>t?.closest('.content')&&!t.closest(excluded)))
          return {x:${dx < 0 ? 'b' : 'a'},endX:${dx < 0 ? 'a' : 'b'},y,width:innerWidth,height:innerHeight};
      }
      return null;
    })())`));
    assert.ok(point, `Hit-tested swipe area required for ${from.tab}`);
    const start = nativePoint(point), end = nativePoint({ ...point, x: point.endX });
    const index = from.tabs.indexOf(from.tab);
    const expected = from.tabs[index + (dx < 0 ? 1 : -1)] || from.tab;
    // Observe the intermediate PHYSICAL finger drag; verifying the tab
    // changed at the end would miss the original jump-without-motion bug.
    if (!sampledFingerTrackedSlide && expected !== from.tab) {
      const command=['shell','input','swipe',...start.map(String),...end.map(String),'1100'];
      const child=spawn('adb',command,{stdio:'ignore'});
      const finished=new Promise((resolve,reject)=>{
        child.on('error',reject);
        child.on('close',code=>code===0?resolve():reject(Error('ADB horizontal swipe exit '+code)));
      });
      let seen=null;
      for(let i=0;i<15;i++){
        await delay(55);
        try {
          const sample=JSON.parse(await evaluate(`JSON.stringify((()=>{
            const old=document.querySelector('#app .app-shell > .content');
            const next=document.querySelector('.android-tab-slide-preview');
            const px=el=>Number(el?.style.transform.match(/translate3d\\((-?\\d+)px/)?.[1]||0);
            return {previousX:px(old),incomingX:px(next),hasPreview:!!next,
              previewInert:next?.inert===true,
              navStillVisible:!!document.querySelector('#androidBottomNavigationMount .bottom-nav')};
          })())`));
          if(sample.hasPreview&&sample.previewInert&&sample.navStillVisible&&
              Math.abs(sample.previousX)>12&&Math.abs(sample.incomingX)<point.width) {
            seen=sample;break;
          }
        } catch (_) {
          // A WebView reflow can temporarily make a CDP sample unavailable.
          // The actual navigation assertion below still checks final state.
        }
      }
      await finished;
      assert.ok(seen,'The real Android page must visibly follow the finger and reveal an inert neighboring page BEFORE touch release');
      sampledFingerTrackedSlide=true;
      report.checks.push({label:'Physical finger-following Android tab slide before release, native navigation stays fixed',sample:seen});
    } else {
      adb('shell', 'input', 'swipe', ...start.map(String), ...end.map(String), '400');
    }
    const after = await wait(s => s.tab === expected);
    await delay(650); // also observe the no-wrapping boundary and compatibility click
    assert.equal((await read()).tab, expected);
    report.gestures.push({ lang: from.lang, from: from.tab, expected, actual: after.tab, start, end });
  };
  const traverse = async () => {
    const order = (await read()).tabs;
    const homeIndex = order.indexOf('home');
    assert.ok(homeIndex === 0 || homeIndex === order.length - 1);
    const forward = homeIndex === 0 ? -1 : 1;
    await swipe(-forward); // Home end must not wrap
    for (let i = 0; i < order.length; i++) await swipe(forward);
    for (let i = 0; i < order.length; i++) await swipe(-forward);
    assert.equal((await read()).tab, 'home');
  };
  await traverse();
  report.checks.push('English physical tab order, both directions, no wrapping');
  const languagePoint = JSON.parse(await evaluate(`JSON.stringify((()=>{
    const b=document.querySelector('[data-language-toggle]'),r=b.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2,width:innerWidth,height:innerHeight};
  })())`));
  adb('shell', 'input', 'tap', ...nativePoint(languagePoint).map(String));
  await wait(s => s.counter === 'שיעורים שהושמעו');
  assert.equal((await read()).eyebrow, false);
  await traverse();
  report.checks.push('Hebrew Home wording and physical tab order, both directions, no wrapping');
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.error = String(error.stack || error);
  process.exitCode = 1;
} finally {
  ws?.close();
  writeFileSync('emulator-report/tab-swipes.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

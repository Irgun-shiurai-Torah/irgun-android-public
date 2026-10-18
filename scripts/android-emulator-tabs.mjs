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
  const witnessed = {left:false,right:false};
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
    // Tabs are measured in visual left-to-right order. Physical finger
    // direction follows the reading direction: RTL reverses the adjacent index.
    const step = from.lang.startsWith('he') ? (dx < 0 ? -1 : 1) : (dx < 0 ? 1 : -1);
    const expected = from.tabs[index + step] || from.tab;
    // Observe the physical page midway through actual Android input. A test
    // that only checks the destination would miss the prior jump-only behavior.
    const direction = dx < 0 ? 'left' : 'right';
    if(expected !== from.tab && !witnessed[direction]){
      const child = spawn('adb',['shell','input','swipe',
        ...start.map(String),...end.map(String),'1800'],{stdio:'ignore'});
      const finished=new Promise((resolve,reject)=>{
        child.on('error',reject);
        child.on('close',code=>code===0?resolve():reject(Error('adb swipe failed: '+code)));
      });
      let seen=null;
      const observations=[];
      for(let count=0;count<42;count++){
        await delay(35);
        try{
          const sample=JSON.parse(await evaluate(`JSON.stringify((()=>{
            const old=document.querySelector('#app .app-shell > .content');
            const peek=document.querySelector('.android-swipe-peek');
            const readX=el=>Number(el?.style.transform.match(/translate3d\\((-?\\d+)px/)?.[1]||0);
            return {x:readX(old),nextX:readX(peek),peek:!!peek,
              inert:peek?.inert===true,previewMedia:peek?.querySelectorAll('video, audio, iframe').length||0,
              from:document.querySelector('.bottom-nav .active')?.dataset.nav,
              nav:!!document.querySelector('#androidBottomNavigationMount .bottom-nav')};
          })())`));
          observations.push(sample);
          if(sample.peek && sample.inert && sample.previewMedia===0 &&
              sample.nav && sample.from===from.tab && Math.abs(sample.x)>20 &&
              Math.abs(sample.nextX)<point.width){seen=sample;break;}
        }catch(_){/* CDP can be temporarily busy during a native touch */ }
      }
      await finished;
      assert.ok(seen,'Page must move with the real Android finger BEFORE touchend: '+direction+'; samples='+JSON.stringify(observations));
      witnessed[direction]=true;
      report.checks.push({label:'Finger-following physical '+direction+' drag, stable native nav and zero duplicate media',sample:seen});
    }else{
      adb('shell', 'input', 'swipe', ...start.map(String), ...end.map(String), '400');
    }
    assert.ok(adb('shell','pidof','org.irgunshiuraitorah.app'),
      'A horizontal swipe must NEVER destroy the Android application process');
    const after = await wait(s => s.tab === expected);
    await delay(650); // also observe the no-wrapping boundary and compatibility click
    assert.equal((await read()).tab, expected);
    report.gestures.push({ lang: from.lang, from: from.tab, expected, actual: after.tab, start, end });
  };
  const traverse = async () => {
    const order = (await read()).tabs;
    const homeIndex = order.indexOf('home');
    assert.ok(homeIndex === 0 || homeIndex === order.length - 1);
    // The Home boundary is the physical OUTSIDE edge: right in LTR,
    // left in RTL. Traverse inward across every visible neighbor, then back.
    // The swipe handler already reverses physical direction for RTL.
    // A rightward finger drag is therefore the outside Home boundary in BOTH
    // languages; derive the traversal from the gesture mapping, not tab index.
    const outward = 1;
    await swipe(outward); // Home end must not wrap
    for (let i = 0; i < order.length; i++) await swipe(-outward);
    for (let i = 0; i < order.length; i++) await swipe(outward);
    assert.equal((await read()).tab, 'home');
  };
  await traverse();
  report.checks.push('English physical tab order, both directions, no wrapping');

  // The Account page previously failed to change tabs from its lower half:
  // the form's inputs were globally excluded and short content left empty
  // space outside .content. Exercise a REAL native touch in the lower area,
  // not just the header/title region.
  const tabPoint = tab => `JSON.stringify((()=>{
    const b=document.querySelector('#androidBottomNavigationMount .bottom-nav [data-nav="${tab}"]');
    if(!b)return null;
    const r=b.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2,width:innerWidth,height:innerHeight};
  })())`;
  const accountButton=JSON.parse(await evaluate(tabPoint('account')));
  assert.ok(accountButton,'Native Account tab button must exist');
  adb('shell','input','tap',...nativePoint(accountButton).map(String));
  await wait(s => s.tab === 'account');
  const lowerAccountPoint = JSON.parse(await evaluate(`JSON.stringify((()=>{
    const account=document.querySelector('#app .app-shell > .content');
    const x=innerWidth*.30,endX=innerWidth*.70;
    const nav=document.querySelector('#androidBottomNavigationMount .bottom-nav');
    const navTop=nav?.getBoundingClientRect().top||innerHeight-92;
    const lo=Math.round(innerHeight*.57);
    const hi=Math.min(Math.round(innerHeight*.79),Math.round(navTop-18));
    for(let y=lo;y<=hi;y+=12){
      const target=document.elementFromPoint(x,y);
      if(target?.closest('.content')===account && !target.closest('select,video,iframe,[role="dialog"]'))
        return {x,endX,y,width:innerWidth,height:innerHeight,tag:target.tagName,
          accountSurface:account.classList.contains('android-account-swipe-surface')};
    }
    return null;
  })())`));
  assert.ok(lowerAccountPoint?.accountSurface,'Account lower viewport must be inside swipeable content');
  const startAccount=nativePoint(lowerAccountPoint);
  const endAccount=nativePoint({...lowerAccountPoint,x:lowerAccountPoint.endX});
  adb('shell','input','swipe',...startAccount.map(String),...endAccount.map(String),'600');
  assert.ok(adb('shell','pidof','org.irgunshiuraitorah.app'),
    'Lower Account swipe must not kill the Android app');
  await wait(s => s.tab === 'library');
  report.checks.push({label:'Native swipe starting in the lower Account form goes to Library',at:lowerAccountPoint});
  const homeButton=JSON.parse(await evaluate(tabPoint('home')));
  assert.ok(homeButton,'Native Home tab button must exist');
  adb('shell','input','tap',...nativePoint(homeButton).map(String));
  await wait(s => s.tab === 'home');

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

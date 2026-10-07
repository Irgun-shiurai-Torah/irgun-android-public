import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const email = String(process.env.IST_TEST_EMAIL || '').trim();
const password = String(process.env.IST_TEST_PASSWORD || '');
const report = { checks: [] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!email || !password) {
  report.result = 'skipped';
  report.reason = 'Configure IST_TEST_EMAIL and IST_TEST_PASSWORD repository secrets to run authenticated account tests.';
  writeFileSync('emulator-report/authenticated-session.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

let ws;
try {
  const pid = execFileSync('adb', ['shell', 'pidof', 'org.irgunshiuraitorah.app'], { encoding:'utf8' }).trim().split(/\s+/)[0];
  assert.ok(pid, 'App process must be running');
  execFileSync('adb', ['forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`]);
  const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = pages.find(p => p.type === 'page' && /localhost/.test(p.url));
  assert.ok(page?.webSocketDebuggerUrl, 'App WebView must be inspectable');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP connection timeout')), 10000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once:true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once:true });
  });

  let sequence = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error || message.result?.exceptionDetails) request.reject(new Error(JSON.stringify(message)));
    else request.resolve(message.result.result.value);
  });

  const evaluate = expression => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP evaluation timeout')); }, 30000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method:'Runtime.evaluate', params:{ expression, returnByValue:true, awaitPromise:true } }));
  });

  const waitFor = async predicateExpression => {
    let value;
    for (let i = 0; i < 100; i++) {
      value = await evaluate(predicateExpression);
      if (value) return value;
      await delay(300);
    }
    throw new Error('Authenticated state did not settle');
  };

  // Exercise the production login() implementation. Credentials never enter the repository
  // or report file and GitHub masks repository-secret values in job output.
  const loginResult = await evaluate(`(async()=>{await login(${JSON.stringify(email)},${JSON.stringify(password)});return JSON.stringify({
    signedIn:Boolean(state.user&&state.token),
    authMessage:String(state.authMessage||''),
    userEmail:String(state.user?.email||'')
  })})()`);
  const loginState = JSON.parse(loginResult);
  assert.equal(loginState.signedIn, true, `Real app login failed: ${loginState.authMessage}`);
  report.checks.push('Real email/password login returned an app session');

  const protectedReads = JSON.parse(await evaluate(`(async()=>JSON.stringify(await (async()=>{
    const [me,likes,later,follows,history,notifications,playlists,paid]=await Promise.all([
      apiJson('/me'),apiJson('/my-like-ids'),apiJson('/watch-later'),apiJson('/follows'),
      apiJson('/history'),apiJson('/notification-settings'),apiJson('/custom-playlists'),
      apiJson('/paid-audio?v='+Date.now())
    ]);
    return {
      me:Boolean(me?.loggedIn&&me?.user),
      likes:Array.isArray(likes?.ids),
      later:Array.isArray(later?.items),
      follows:Array.isArray(follows?.items),
      history:Array.isArray(history?.items),
      notifications:Boolean(notifications&&typeof notifications==='object'),
      playlists:Array.isArray(playlists?.items),
      purchases:Array.isArray(paid?.items)
    };
  })()))()`));
  for (const [key, ok] of Object.entries(protectedReads)) assert.equal(ok, true, `Authenticated endpoint failed: ${key}`);
  report.checks.push('Protected account collections and purchase visibility load read-only');

  // A real app restart must restore the bearer token through /me.
  execFileSync('adb', ['shell','am','force-stop','org.irgunshiuraitorah.app']);
  execFileSync('adb', ['shell','am','start','-n','org.irgunshiuraitorah.app/.SplashActivity']);
  await delay(3000);
  ws.close(); ws = null;

  const pid2 = execFileSync('adb', ['shell','pidof','org.irgunshiuraitorah.app'], { encoding:'utf8' }).trim().split(/\s+/)[0];
  execFileSync('adb', ['forward','tcp:9222',`localabstract:webview_devtools_remote_${pid2}`]);
  let page2;
  for (let i=0;i<30;i++) {
    const pages2=await (await fetch('http://127.0.0.1:9222/json/list')).json();
    page2=pages2.find(p=>p.type==='page'&&/localhost/.test(p.url));
    if(page2?.webSocketDebuggerUrl) break;
    await delay(500);
  }
  assert.ok(page2?.webSocketDebuggerUrl,'Relaunched app WebView must be inspectable');
  ws=new WebSocket(page2.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('CDP reconnect timeout')),10000);
    ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP reconnect failed'));},{once:true});
  });
  sequence=0; pending.clear();
  ws.addEventListener('message', event => {
    const message=JSON.parse(event.data), request=pending.get(message.id);
    if(!request)return;
    pending.delete(message.id);clearTimeout(request.timer);
    if(message.error||message.result?.exceptionDetails)request.reject(new Error(JSON.stringify(message)));
    else request.resolve(message.result.result.value);
  });
  const evaluate2 = expression => new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP read timeout'));},30000);
    pending.set(id,{resolve,reject,timer});
    ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));
  });
  let restored=false;
  for(let i=0;i<120;i++){
    restored=Boolean(await evaluate2('Boolean(state?.libraryReady && state?.user && state?.token)'));
    if(restored)break;
    await delay(500);
  }
  assert.equal(restored,true,'Authenticated session must restore after app relaunch');
  report.checks.push('Session token survives Android app relaunch and /me restores the account');

  await evaluate2(`(async()=>{try{await apiFetch('/logout',{method:'POST'})}catch(_){};setToken('');resetUserState();render();return true})()`);
  const cleared=Boolean(await evaluate2('Boolean(!state.user && !state.token)'));
  assert.equal(cleared,true,'Authenticated test must leave the app signed out');
  report.checks.push('Test leaves the emulator signed out');
  report.result='passed';
} catch (error) {
  report.result='failed';
  report.error=String(error.stack||error);
  process.exitCode=1;
} finally {
  try { ws?.close(); } catch {}
  writeFileSync('emulator-report/authenticated-session.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

import { execFileSync } from 'node:child_process';

const packageName = 'org.irgunshiuraitorah.app';
const report = { packageName, attempts: [] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function inspectPage(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebView inspector connection timed out')), 5000);
    ws.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('WebView inspector connection failed')); }, { once: true });
  });
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebView evaluation timed out')), 5000);
      ws.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.id !== 1) return;
        clearTimeout(timeout);
        const value = message.result?.result?.value;
        if (!value) return reject(new Error(message.result?.exceptionDetails?.text || 'WebView returned no document data'));
        resolve(JSON.parse(value));
      });
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
        expression: `JSON.stringify({url:location.href,readyState:document.readyState,title:document.title,
          appText:document.querySelector('#app')?.innerText?.slice(0,700)||'',
          hasShell:!!document.querySelector('#app .app-shell'),
          hasPlayer:!!document.querySelector('#persistentVideoMount .watch-overlay'),
          loading:!!document.querySelector('#app .loading')})`,
        returnByValue: true
      }}));
    });
  } finally { ws.close(); }
}

for (let attempt = 0; attempt < 24; attempt++) {
  try {
    const pid = execFileSync('adb', ['shell', 'pidof', packageName], { encoding: 'utf8' }).trim().split(/\s+/)[0];
    if (!pid) throw new Error('App process is not running');
    execFileSync('adb', ['forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`]);
    const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
    const page = pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl && /localhost/.test(item.url));
    if (!page) throw new Error('App WebView is not available');
    const state = await inspectPage(page.webSocketDebuggerUrl);
    report.attempts.push(state);
    if (state.hasShell && state.appText.length > 60 && !state.loading) {
      report.result = 'started';
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    }
  } catch (error) {
    report.attempts.push({ error: String(error.message || error) });
  }
  await delay(2000);
}
report.result = 'startup_failed_or_stalled';
console.log(JSON.stringify(report, null, 2));
process.exit(1);

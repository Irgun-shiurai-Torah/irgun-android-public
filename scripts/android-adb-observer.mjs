import {execFileSync} from 'node:child_process';

// Recover only a failed observation. Never repeat a tap, text entry, media key,
// seek or other mutation, and never restart the emulator or application.
export function observedAdb(report, run=execFileSync) {
  const pkg='org.irgunshiuraitorah.app';
  let expectedPid='';
  const execute=args=>run('adb',args,{encoding:'utf8',timeout:20000}).trim();
  return (...args)=>{
    try {
      const result=execute(args);
      if(args[0]==='shell'&&args[1]==='pidof'&&args[2]===pkg)expectedPid=result;
      return result;
    } catch(error) {
      const readOnly=args[0]==='shell'&&['dumpsys','pidof','getprop','cat'].includes(args[1]);
      const detail=String(error.stderr||error.message||'');
      if(!readOnly||!expectedPid||!/device offline|device.*not found|no devices\/emulators found/i.test(detail))throw error;
      execute(['wait-for-device']);
      const pid=execute(['shell','pidof',pkg]);
      if(pid!==expectedPid)throw new Error('Irgun process changed during ADB recovery: expected '+expectedPid+', got '+pid);
      (report.adbRecoveries||=[]).push({command:args[1],reason:'ADB device offline',pid});
      // One retry of the original actual read. A persistent disconnect fails.
      return execute(args);
    }
  };
}

// The account suite deliberately relaunches the app to clear credential-bearing
// screens. Wait for that real process's WebView socket, without restarting it.
export async function discoverAppWebView({adb, report, fetchImpl=fetch,
  delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)), attempts=20}) {
  const pkg='org.irgunshiuraitorah.app';
  const pid=adb('shell','pidof',pkg).split(/\s+/)[0];
  if (!/^\d+$/.test(pid)) throw new Error('Actual Irgun process must exist before WebView discovery');
  for (let attempt=1; attempt<=attempts; attempt++) {
    if (adb('shell','pidof',pkg).split(/\s+/)[0]!==pid)
      throw new Error('Irgun process changed during WebView discovery');
    adb('forward','tcp:9222',`localabstract:webview_devtools_remote_${pid}`);
    try {
      const response=await fetchImpl('http://127.0.0.1:9222/json/list',{signal:AbortSignal.timeout(2000)});
      if (!response.ok) throw new Error('WebView discovery returned HTTP '+response.status);
      const pages=await response.json();
      const page=pages.find(p=>p.type==='page'&&/localhost/.test(p.url));
      if (page?.webSocketDebuggerUrl) return page;
      (report.webViewDiscovery||=[]).push({attempt,pid,reason:'App page not ready'});
    } catch (error) {
      const transport=(error instanceof TypeError&&error.message==='fetch failed')||error.name==='TimeoutError';
      if (!transport) throw error;
      (report.webViewDiscovery||=[]).push({attempt,pid,reason:String(error.message),causeCode:String(error.cause?.code||'')});
    }
    if (attempt<attempts) await delay(500);
  }
  throw new Error('Actual app WebView did not become inspectable after bounded discovery');
}

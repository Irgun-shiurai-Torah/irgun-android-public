import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';

// This observer targets its own APK. It reads SystemUI/dialog accessibility
// nodes and never launches or instruments the app under test.
export function nativeHierarchy(evidencePath,{allWindows=false,run=execFileSync}={}) {
  const pkg='org.irgunshiuraitorah.app';
  const adb=(...args)=>run('adb',args,{encoding:'utf8',timeout:20000}).trim();
  const before=adb('shell','pidof',pkg);
  assert.match(before,/^\d+$/,'A running Irgun process is required for native screen observation');
  const observe=['shell','am','instrument','-w','-r',
    ...(allWindows?['-e','allWindows','true']:[]),
    'org.irgunshiuraitorah.qa/.WindowObserver'];
  let result;
  // ADB can briefly disconnect more than once on software-rendered emulators
  // while Media3 changes fullscreen/PiP surfaces. Retry ONLY this read-only
  // accessibility observation up to three times, and require the exact same
  // Irgun PID after each reconnect. Never replay a physical tap or media action.
  for (let attempt=0;attempt<3;attempt++) {
    try {
      result=adb(...observe);
      break;
    } catch(error) {
      const detail=String(error.stderr||error.message||'');
      const transient=/device offline|device.*not found|no devices\/emulators found|waiting for device/i.test(detail);
      if(!transient || attempt===2) throw error;
      adb('wait-for-device');
      assert.equal(adb('shell','pidof',pkg),before,
        'Irgun process changed during native hierarchy observation recovery');
    }
  }
  assert.equal(adb('shell','pidof',pkg),before,
    'Native screen observation must not restart the Irgun app');
  const xml=result.match(/^INSTRUMENTATION_RESULT: hierarchy=(.+)$/m)?.[1];
  assert.ok(xml?.startsWith('<hierarchy>')&&xml.includes('<node'),
    'Actual Android accessibility hierarchy unavailable: '+result.slice(0,500));
  if(evidencePath)writeFileSync(evidencePath,xml);
  return xml;
}

import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';

// This observer targets its own APK. It reads SystemUI/dialog accessibility
// nodes and never launches or instruments the app under test.
export function nativeHierarchy(evidencePath) {
  const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:20000}).trim();
  const before=adb('shell','pidof','org.irgunshiuraitorah.app');
  const result=adb('shell','am','instrument','-w','-r',
    'org.irgunshiuraitorah.qa/.WindowObserver');
  assert.equal(adb('shell','pidof','org.irgunshiuraitorah.app'),before,
    'Native screen observation must not restart the Irgun app');
  const xml=result.match(/^INSTRUMENTATION_RESULT: hierarchy=(.+)$/m)?.[1];
  assert.ok(xml?.startsWith('<hierarchy>')&&xml.includes('<node'),
    'Actual Android accessibility hierarchy unavailable: '+result.slice(0,500));
  if(evidencePath)writeFileSync(evidencePath,xml);
  return xml;
}

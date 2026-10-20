import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeHierarchy} from './android-native-hierarchy.mjs';

const expected='INSTRUMENTATION_RESULT: hierarchy=<hierarchy><node text="Video" /></hierarchy>\n';
const offline=()=>Object.assign(new Error('adb: device offline'),{stderr:'adb: device offline'});
const fakeAdb=({changedPid=false,permanent=false}={})=>{
  const calls=[];let observeCount=0,pidCount=0;
  const run=(_binary,args)=>{
    calls.push(args.join(' '));
    if(args[0]==='wait-for-device')return '';
    if(args[1]==='pidof')return (++pidCount>1&&changedPid?'9876':'1234')+'\n';
    if(args[1]==='am'&&args[2]==='instrument') {
      observeCount++;
      if(observeCount===1||permanent)throw offline();
      return expected;
    }
    throw new Error('Unexpected read-only ADB command '+args.join(' '));
  };
  return {run,calls,get count(){return observeCount}};
};
test('retry offline read-only hierarchy observations only when Irgun PID is unchanged',()=>{
  const a=fakeAdb();
  assert.match(nativeHierarchy(null,{run:a.run,allWindows:true}),/<node/);
  assert.equal(a.count,2);
  assert.ok(a.calls.includes('wait-for-device'));
  assert.ok(a.calls.every(s=>!s.includes('input tap')&&!s.includes('am start')&&!s.includes('force-stop')));
});
test('native observer never hides a changed app PID',()=>{
  const a=fakeAdb({changedPid:true});
  assert.throws(()=>nativeHierarchy(null,{run:a.run}),/Irgun process changed/);
  assert.equal(a.count,1);
});
test('permanently offline observer fails after three bounded attempts',()=>{
  const a=fakeAdb({permanent:true});
  assert.throws(()=>nativeHierarchy(null,{run:a.run}),/device offline/);
  assert.equal(a.count,3);
});
test('non-transport observation failures must not retry',()=>{
  let count=0;const run=(_binary,args)=>{
    if(args[1]==='pidof')return '1234\n';
    count++;throw new Error('Observer failed to return valid hierarchy');
  };
  assert.throws(()=>nativeHierarchy(null,{run}),/Observer failed/);
  assert.equal(count,1);
});

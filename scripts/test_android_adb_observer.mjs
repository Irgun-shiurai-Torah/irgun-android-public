import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observedAdb} from './android-adb-observer.mjs';

const offline=()=>Object.assign(new Error('adb: device offline'),{stderr:'adb: device offline'});
test('a transient keyboard-state read resumes only after the same Irgun process returns',()=>{
  let reads=0;const calls=[],report={};
  const adb=observedAdb(report,(_,args)=>{calls.push(args.join(' '));
    if(args[1]==='pidof')return '2396\n';
    if(args[1]==='dumpsys'&&++reads===1)throw offline();
    return args[0]==='wait-for-device'?'':'mInputShown=false\n';});
  assert.equal(adb('shell','pidof','org.irgunshiuraitorah.app'),'2396');
  assert.equal(adb('shell','dumpsys','input_method'),'mInputShown=false');
  assert.equal(reads,2);assert.equal(report.adbRecoveries.length,1);
  assert.ok(calls.includes('wait-for-device'));assert.ok(calls.every(c=>!c.includes('am start')));
});
test('an application crash/restart is a failure even if ADB reconnects',()=>{
  let pids=0;const adb=observedAdb({},(_,args)=>{
    if(args[1]==='pidof')return String(++pids===1?2396:4000);
    if(args[0]==='wait-for-device')return '';
    throw offline();});
  adb('shell','pidof','org.irgunshiuraitorah.app');
  assert.throws(()=>adb('shell','dumpsys','input_method'),/Irgun process changed/);
});
test('a permanent ADB disconnect remains failed and no input command is repeated',()=>{
  const report={},calls=[];const adb=observedAdb(report,(_,args)=>{
    calls.push(args.join(' '));if(args[1]==='pidof')return '2396';
    if(args[0]==='wait-for-device')return '';
    throw offline();});
  adb('shell','pidof','org.irgunshiuraitorah.app');
  assert.throws(()=>adb('shell','dumpsys','input_method'),/offline/);
  const before=calls.length;assert.throws(()=>adb('shell','input','tap','20','30'),/offline/);
  assert.equal(calls.length,before+1,'A failed gesture must never be repeated');
});

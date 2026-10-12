import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observedAdb, discoverAppWebView} from './android-adb-observer.mjs';

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

test('post-account WebView discovery waits for the same actual socket and never restarts the app',async()=>{
 const calls=[],report={};let reads=0;
 const adb=(...args)=>{calls.push(args.join(' '));return args[1]==='pidof'?'2396':'';};
 const page={type:'page',url:'https://localhost',webSocketDebuggerUrl:'ws://actual'};
 const result=await discoverAppWebView({adb,report,delay:async()=>{},fetchImpl:async()=>{
  if (++reads===1) throw Object.assign(new TypeError('fetch failed'),{cause:{code:'ECONNRESET'}});
  return {ok:true,json:async()=>reads===2?[]:[page]};
 }});
 assert.equal(result,page);assert.equal(reads,3);assert.equal(report.webViewDiscovery.length,2);
 assert.ok(calls.every(x=>!x.includes('am start')&&!x.includes('force-stop')&&!x.includes('input')));
});
test('permanent socket failure, process change and HTTP errors remain failures',async()=>{
 const adb=(...args)=>args[1]==='pidof'?'2396':'';
 await assert.rejects(discoverAppWebView({adb,report:{},attempts:2,delay:async()=>{},fetchImpl:async()=>{throw new TypeError('fetch failed');}}),/bounded discovery/);
 let n=0;await assert.rejects(discoverAppWebView({adb:(...args)=>args[1]==='pidof'?String(++n===1?2396:4000):'',report:{}}),/process changed/);
 await assert.rejects(discoverAppWebView({adb,report:{},fetchImpl:async()=>({ok:false,status:500})}),/HTTP 500/);
});

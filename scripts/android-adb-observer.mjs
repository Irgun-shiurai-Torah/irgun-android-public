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

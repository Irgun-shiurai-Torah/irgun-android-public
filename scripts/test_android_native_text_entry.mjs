import {test} from 'node:test';
import assert from 'node:assert/strict';
import {typeObservedNativeText} from './android-native-text-entry.mjs';

test('native input confirms each real character before delivering the next',async()=>{
  let field='',keys=[];
  await typeObservedNativeText({value:'IST-DL6067',readValue:async()=>field,
    typeCharacter:async character=>{keys.push(character);field+=character;},delay:async()=>{}});
  assert.equal(field,'IST-DL6067');assert.equal(keys.join(''),'IST-DL6067');
});
test('a dropped native key remains a failure and is never retried',async()=>{
  let field='',keys=[];
  await assert.rejects(typeObservedNativeText({value:'IST-DL6067',readValue:async()=>field,
    typeCharacter:async character=>{keys.push(character);if(character!=='S')field+=character;},delay:async()=>{}}),/retain each typed character/);
  assert.deepEqual(keys,['I','S']);assert.equal(field,'I');
});
test('pre-existing text cannot be silently cleared or treated as successful entry',async()=>{
  let inputs=0;
  await assert.rejects(typeObservedNativeText({value:'QA',readValue:async()=>'old',typeCharacter:async()=>inputs++,delay:async()=>{}}),/empty focused field/);
  assert.equal(inputs,0);
});

test('native keyboard injector queues DOWN and UP without holding a slow key, and rejects injection errors',async()=>{
  const {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync}=await import('node:fs');
  const {execFileSync}=await import('node:child_process');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const dir=mkdtempSync(join(tmpdir(),'irgun-native-keyboard-'));
  try {
    const files={
      'android/os/Bundle.java':`package android.os; import java.util.*; public class Bundle {
        Map<String,String> m=new HashMap<>(); public String getString(String k){return m.get(k);}
        public void putString(String k,String v){m.put(k,v);} }`,
      'android/view/KeyEvent.java':`package android.view; public class KeyEvent { public int action;
        public KeyEvent(int action){this.action=action;} }`,
      'android/view/KeyCharacterMap.java':`package android.view; public class KeyCharacterMap {
        public static int VIRTUAL_KEYBOARD=-1; public static KeyCharacterMap load(int id){return new KeyCharacterMap();}
        public KeyEvent[] getEvents(char[] text){return new KeyEvent[]{new KeyEvent(0),new KeyEvent(1)};} }`,
      'android/app/UiAutomation.java':`package android.app; import android.view.KeyEvent;
        public class UiAutomation {public static int FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES=1;
        public static String events=""; public static boolean reject;
        public boolean injectInputEvent(KeyEvent event,boolean sync){
          if(sync)throw new AssertionError("A synchronous DOWN holds the key during slow UI work");
          events+=event.action; return !reject;} }`,
      'android/app/Instrumentation.java':`package android.app; import android.os.Bundle;
        public class Instrumentation {public static int result; public void onCreate(Bundle args){} public void onStart(){}
        public void start(){onStart();} public UiAutomation getUiAutomation(int flags){return new UiAutomation();}
        public void finish(int code,Bundle b){result=code;} }`,
      'org/irgunshiuraitorah/qa/NativeText.java':readFileSync('.github/android-native-observer/src/main/java/org/irgunshiuraitorah/qa/NativeText.java','utf8'),
      'KeyboardCheck.java':`import android.app.*; import android.os.Bundle; import org.irgunshiuraitorah.qa.NativeText;
        public class KeyboardCheck { public static void main(String[] args){
          Bundle b=new Bundle(); b.putString("text","C");new NativeText().onCreate(b);
          if(Instrumentation.result!=-1||!UiAutomation.events.equals("01"))throw new AssertionError("Actual native pair required");
          UiAutomation.reject=true;new NativeText().onCreate(b);
          if(Instrumentation.result!=0)throw new AssertionError("Rejected events must fail");
          UiAutomation.reject=false;UiAutomation.events="";b.putString("text","CC");new NativeText().onCreate(b);
          if(Instrumentation.result!=0||!UiAutomation.events.isEmpty())throw new AssertionError("Single character only");
        } }`
    };
    for(const [path,source] of Object.entries(files)){
      const full=join(dir,path);mkdirSync(full.slice(0,full.lastIndexOf('/')),{recursive:true});writeFileSync(full,source);
    }
    execFileSync('javac',['-d',dir,...Object.keys(files).map(path=>join(dir,path))]);
    execFileSync('java',['-cp',dir,'KeyboardCheck']);
  }finally {rmSync(dir,{recursive:true,force:true});}
});

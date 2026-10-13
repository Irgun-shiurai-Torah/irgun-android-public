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

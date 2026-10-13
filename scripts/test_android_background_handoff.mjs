import test from 'node:test';
import assert from 'node:assert/strict';
import {safeNativeBackgroundHandoff} from './android-background-handoff-check.mjs';

const audio={mode:'AUDIO',audioIsPlaying:true,audioOutputVolume:1};
test('Home does not pass until native audio and silent video are both observed',()=>{
  assert.equal(safeNativeBackgroundHandoff({native:audio,video:{paused:false,muted:false,volume:1}}),false);
  assert.equal(safeNativeBackgroundHandoff({native:audio,video:{paused:true,muted:true,volume:1}}),true);
  assert.equal(safeNativeBackgroundHandoff({native:audio,video:{paused:false,muted:true,volume:1}}),true);
  assert.equal(safeNativeBackgroundHandoff({native:audio,video:null}),true);
  assert.equal(safeNativeBackgroundHandoff({native:{...audio,mode:'VIDEO'},video:{paused:true,muted:true}}),false);
  assert.equal(safeNativeBackgroundHandoff({native:{...audio,audioOutputVolume:0},video:{paused:true,muted:true}}),false);
});

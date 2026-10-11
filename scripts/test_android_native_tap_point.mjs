import {test} from 'node:test';
import assert from 'node:assert/strict';
import {settledNativeTapPoint} from './android-native-tap-point.mjs';

const geometry = height => ({left:0,top:24,right:320,bottom:24+height,focused:true});
const immediate = async () => {};

test('a keyboard resize requires fresh stable native and DOM bounds before mapping a tap',async()=>{
  const heights=[350,592,592,592,592,592];let boundsReads=0;
  const result=await settledNativeTapPoint({readBounds:async()=>geometry(heights[boundsReads++]),
    readPoint:async()=>({x:80,y:291,width:320,height:592}),delay:immediate});
  assert.deepEqual(result.point,[80,315]);assert.equal(result.samples,3);
  assert.equal(boundsReads,6,'Both sides of each DOM observation must read the actual native viewport');
});
test('a card moving while the keyboard closes cannot reuse its earlier hit-tested center',async()=>{
  const positions=[170,291,291];let reads=0;
  const result=await settledNativeTapPoint({readBounds:async()=>geometry(592),
    readPoint:async()=>({x:80,y:positions[reads++],width:320,height:592}),delay:immediate});
  assert.deepEqual(result.point,[80,315]);assert.equal(result.samples,3);
});
test('an obscured target needs two visible observations before any point is returned',async()=>{
  let reads=0;
  const result=await settledNativeTapPoint({readBounds:async()=>geometry(592),
    readPoint:async()=>++reads===1?null:{x:80,y:291,width:320,height:592},delay:immediate});
  assert.equal(result.samples,3);assert.deepEqual(result.point,[80,315]);
});
test('a foreground dialog or missing focus fails without supplying a tap coordinate',async()=>{
  let pointReads=0;
  await assert.rejects(settledNativeTapPoint({readBounds:async()=>({...geometry(592),focused:false}),
    readPoint:async()=>{pointReads++;},delay:immediate}),/foreground window/);
  assert.equal(pointReads,0);
});
test('a permanently moving viewport remains a failure with a bounded observation count',async()=>{
  let reads=0;
  await assert.rejects(settledNativeTapPoint({samples:4,readBounds:async()=>geometry(++reads%2?350:592),
    readPoint:async()=>({x:80,y:291,width:320,height:592}),delay:immediate}),/no tap was performed/);
  assert.equal(reads,8);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {settledNativeTapPoint,waitForNativeWindowFocus,waitForRestoredAndroidViewport} from './android-native-tap-point.mjs';
import {accountSwipeDirection, watchPlayerReturnGesture, watchCommentsGesture, watchFollowTargetGesture} from './android-account-native-scroll.mjs';
import {selectAccountPlaybackFixture,hasWebsiteFollowTarget} from './android-account-playback-fixture.mjs';

const geometry = height => ({left:0,top:24,right:320,bottom:24+height,focused:true});
const immediate = async () => {};

test('Android 16 wm size reset waits for both native and DOM viewports to return to normal',async()=>{
  const initial={left:0,top:24,right:320,bottom:616,focused:true};
  const expected={native:initial,dom:{width:320,height:592}};
  const samples=[
    {native:{...initial,right:240,bottom:296},dom:{width:240,height:272}},
    {native:{...initial},dom:{width:240,height:272}},
    {native:{...initial},dom:{width:320,height:592}},
    {native:{...initial},dom:{width:320,height:592}},
    {native:{...initial},dom:{width:320,height:592}}
  ];
  let index=0,delays=0;
  const current=()=>samples[Math.min(index,samples.length-1)];
  const result=await waitForRestoredAndroidViewport({
    expected,readNative:async()=>current().native,readDom:async()=>current().dom,
    delay:async()=>{delays++;index++;}
  });
  assert.equal(result.observations,5);
  assert.equal(delays,4);
  assert.equal(result.dom.width,320);
  assert.equal(result.native.right,320);
});

test('native focus by itself cannot falsely pass a stale restored WebView viewport',async()=>{
  const native={left:0,top:24,right:320,bottom:616,focused:true};
  await assert.rejects(()=>waitForRestoredAndroidViewport({
    expected:{native,dom:{width:320,height:592}},
    readNative:async()=>native,
    readDom:async()=>({width:240,height:272}),
    delay:async()=>{},attempts:5
  }),/failed to restore together/);
});

test('restoration requires consecutive observations; focus loss restarts the stability count',async()=>{
  const native={left:0,top:24,right:320,bottom:616,focused:true};
  let i=0;const seq=[true,true,false,true,true,true];
  const result=await waitForRestoredAndroidViewport({
    expected:{native,dom:{width:320,height:592}},
    readNative:async()=>({...native,focused:seq[i]}),
    readDom:async()=>({width:320,height:592}),
    delay:async()=>{i++;},attempts:7
  });
  assert.equal(result.observations,6);
});

test('notification activation waits for actual app window focus and refuses a shade that never closes',async()=>{
 const observations=[{...geometry(592),focused:false},{...geometry(592),focused:false},geometry(592)];
 const observed=await waitForNativeWindowFocus({readBounds:async()=>observations.shift(),delay:immediate});
 assert.equal(observed.focused,true);assert.equal(observations.length,0);
 await assert.rejects(waitForNativeWindowFocus({readBounds:async()=>({...geometry(592),focused:false}),delay:immediate,samples:3}),/actual native foreground/);
});

test('account playback skips a new Vimeo-only upload with no Audio and pins an actually ready native/audio lecture',async()=>{
  const reads=[];
  const fixture=await selectAccountPlaybackFixture([
    {id:'new-vimeo',hasDriveVideo:false,hasAudio:false},
    {id:'pending',hasDriveVideo:true,hasAudio:true},
    {id:'ready',hasDriveVideo:true,hasAudio:true}
  ],async id=>{reads.push(id);return id==='ready'?{video:{hls:'real.m3u8'},audio:{mp3:'real.mp3'}}:{video:{mp4:'real.mp4'},audio:{mp3:null}};});
  assert.deepEqual(reads,['pending','ready']);
  assert.deepEqual(fixture,{id:'ready',hasDriveVideo:true,hasAudio:true});
});
test('an absent native/audio fixture fails explicitly instead of treating Vimeo-only playback as a broken Audio button',async()=>{
  await assert.rejects(selectAccountPlaybackFixture([{id:'new',hasDriveVideo:false,hasAudio:false}],()=>{throw Error('Must not request native media for Vimeo-only');}),/native video AND separate audio/);
});

test('logged-in Follow QA chooses ONLY a website-followable native video/audio lecture',async()=>{
  const metadata={lectures:{reviewed:{speakerIds:['shmuel-brisk']}},speakers:[{id:'shmuel-brisk'}]};
  const videos=[
    {id:'no-speaker',title:'Daily Lecture',hasDriveVideo:true,hasAudio:true},
    {id:'vimeo-only',title:'הרב משה לוי - הלכה',hasDriveVideo:false,hasAudio:false},
    {id:'reviewed',title:'Talk',hasDriveVideo:true,hasAudio:true},
    {id:'with-name',title:'הרב משה לוי - הלכה',hasDriveVideo:true,hasAudio:true}
  ];
  assert.equal(hasWebsiteFollowTarget(videos[0],metadata),false);
  assert.equal(hasWebsiteFollowTarget(videos[2],metadata),true);
  assert.equal(hasWebsiteFollowTarget(videos[3],metadata),true);
  const reads=[];
  const selected=await selectAccountPlaybackFixture(videos,async id=>{
    reads.push(id);return {video:{hls:'real.m3u8'},audio:{mp3:'real.mp3'}};
  },{requireFollow:true,metadata});
  assert.equal(selected.id,'reviewed','No Follow metadata must not masquerade as a failing Follow button');
  assert.deepEqual(reads,['reviewed'],'Never fetch an unsuitable or Vimeo-only playback fixture');
  await assert.rejects(
    selectAccountPlaybackFixture([videos[0]],async()=>{throw Error('Must not fetch unsuitable fixture')},
      {requireFollow:true,metadata}),
    /website-recognized speaker/);
});

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

test('IME-obscured Password and Login scroll into view rather than back to Email',()=>{
  for(const key of ['password','login','saveQaComment'])assert.equal(accountSwipeDirection(key),'up');
  for(const key of ['email','closeWatch','settings','audioMode','videoMode','audioPlay'])assert.equal(accountSwipeDirection(key),'down');
});

test('playlist name, create and Back are reached by scrolling toward the TOP of the real Library page',()=>{
  for(const key of ['playlistName','createPlaylist','playlistBack'])
    assert.equal(accountSwipeDirection(key),'down',key+' must not swipe farther down the playlist list');
  for(const key of ['playlists','testPlaylist','deletePlaylist'])
    assert.equal(accountSwipeDirection(key),'up',key+' retains its existing list navigation');
});

test('Watch player recovery uses a real downward swipe within the measured scroll viewport',()=>{
  const scroll={x:0,y:44,width:320,height:550,top:742};
  const gesture=watchPlayerReturnGesture(scroll);
  assert.ok(gesture.from.y<gesture.to.y,'A return gesture must physically swipe down to scroll upwards');
  assert.ok(gesture.from.y>scroll.y&&gesture.to.y<scroll.y+scroll.height,'Keep physical swipes within actual Watch bounds');
  assert.equal(gesture.from.x,gesture.to.x);
  assert.throws(()=>watchPlayerReturnGesture({x:0,y:0,width:10,height:20}),/Watch scroll bounds/);
});

test('comment and player gestures stay above the floating navigation instead of starting on a tab',()=>{
  const scroll={x:0,y:56,width:320,height:560,visibleBottom:518};
  const comment=watchCommentsGesture(scroll),player=watchPlayerReturnGesture(scroll);
  assert.ok(comment.from.y<518&&comment.to.y<comment.from.y);
  assert.ok(comment.from.y>scroll.y&&comment.to.y>scroll.y);
  assert.ok(player.to.y<518&&player.from.y<player.to.y);
  assert.throws(()=>watchCommentsGesture({...scroll,visibleBottom:100}),/obscured/);
});

test('real Follow target directs native swipes both ways without hiding failures',()=>{
  const scroll={x:4,y:50,width:315,height:590,visibleBottom:545,top:470};
  const above=watchFollowTargetGesture(scroll,19);
  assert.equal(above.direction,'down','Overshot Follow above the viewport: scroll back UP the page');
  assert.ok(above.from.y<above.to.y);
  assert.ok(above.to.y<scroll.visibleBottom,'Do not touch floating bottom navigation');
  const below=watchFollowTargetGesture(scroll,720);
  assert.equal(below.direction,'up','Follow below viewport: scroll down to find it');
  assert.ok(below.from.y>below.to.y);
  assert.ok(below.from.y>scroll.y);
  assert.throws(()=>watchFollowTargetGesture(scroll,NaN),/Follow DOM target/);
  assert.throws(()=>watchFollowTargetGesture({...scroll,visibleBottom:105},170),/obscured/);
});

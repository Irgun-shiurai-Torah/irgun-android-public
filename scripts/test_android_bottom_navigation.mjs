import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {androidNavigationRoot,prepareAndroidTabNavigation} from '../src/android-bottom-navigation.js';
const main=readFileSync('src/main.js','utf8');

test('primary tabs and nested pages retain one meaningful active navigation root',()=>{
 for(const root of ['home','shiurim','live','library','account'])assert.equal(androidNavigationRoot(root),root);
 assert.equal(androidNavigationRoot('live-boro'),'live');
 assert.equal(androidNavigationRoot('live-flatbush'),'live');
 assert.equal(androidNavigationRoot('search'),'shiurim');
 assert.equal(androidNavigationRoot('schedule'),'home');
 assert.equal(androidNavigationRoot('paid'),'library');
 assert.equal(androidNavigationRoot('donate','library'),'library');
 assert.equal(androidNavigationRoot('contact','account'),'account');
 assert.equal(androidNavigationRoot('privacy','missing'),'home');
});
test('real navigation HTML exposes one selected accessible tab in English and Hebrew while iOS keeps its existing navigation',()=>{
 const source=main.slice(main.indexOf('function bottomNavHtml()'),main.indexOf('function shell(',main.indexOf('function bottomNavHtml()')));
 for(const platform of ['android','ios'])for(const language of ['en','he'])for(const screen of ['home','shiurim','live-boro','library','account']){
  const context={state:{screen},Capacitor:{getPlatform:()=>platform},currentLanguage:()=>language,
   androidNavigationRoot,tr:x=>language==='he'?'עברית':x,svgIcon:x=>'<svg data-icon="'+x+'"></svg>'};
  const html=runInNewContext(source+'\nbottomNavHtml();',context);
  assert.equal((html.match(/class="nav-btn active"/g)||[]).length,1);
  assert.equal((html.match(/aria-current="page"/g)||[]).length,platform==='android'?1:0);
  assert.equal(html.includes('nav-active-indicator'),platform==='android');
  assert.equal((html.match(/data-nav=/g)||[]).length,5);
 }
});
test('navigating from expanded Video changes presentation without replacing the player, position, or Pause choice',async()=>{
 const player={position:733.5,paused:true},state={playerOpen:true,watchVideo:{id:'lecture'},watchVimeo:player,watchMode:'video',watchMinimized:false};
 const calls=[];
 await prepareAndroidTabNavigation({state,exitFullscreen:async()=>calls.push('exit'),minimizeVideo:async()=>{calls.push('mini');state.watchMinimized=true;},closeAudioWatch:()=>assert.fail('Video must stay open')});
 assert.deepEqual(calls,['exit','mini']);assert.equal(state.playerOpen,false);
 assert.equal(state.watchVimeo,player);assert.equal(player.position,733.5);assert.equal(player.paused,true);
});
test('already minimized Video needs no repeated transition and Audio navigation uses the existing continuous-audio close path',async()=>{
 const state={watchVideo:{},watchMode:'video',watchMinimized:true};let closes=0;
 const input={state,exitFullscreen:()=>assert.fail('Do not repeat fullscreen exit'),minimizeVideo:()=>assert.fail('Do not repeat Mini'),closeAudioWatch:async()=>closes++};
 await prepareAndroidTabNavigation(input);assert.equal(closes,0);
 state.watchMode='audio';await prepareAndroidTabNavigation(input);assert.equal(closes,1);
});
test('late completion of a previous player-minimize operation cannot overwrite a newer tab tap',async()=>{
 const start=main.indexOf('let androidNavigationSequence=0;'),end=main.indexOf('\nfunction bind()',start);
 let finish;const pending=new Promise(resolve=>finish=resolve),renders=[];
 const state={screen:'home',playerOpen:false,watchVideo:{},watchMode:'video',watchMinimized:false};
 const context={state,Capacitor:{getPlatform:()=> 'android'},syncAndroidBottomNavigation(){},
  prepareAndroidTabNavigation,window:{__irgunExitNativeVideoFullscreen:async()=>{},scrollTo(){}},
  minimizeWatchToPersistent:async()=>{state.watchMinimized=true;await pending;},closeWatch:()=>assert.fail('Do not close the video'),render:()=>renders.push(state.screen)};
 runInNewContext(main.slice(start,end)+'\nthis.navigate=navigateToScreen;',context);
 const button=nav=>({dataset:{nav},closest:()=>true});
 const first=context.navigate(button('library'));await Promise.resolve();await Promise.resolve();
 await context.navigate(button('account'));finish();await first;
 assert.equal(state.screen,'account');assert.deepEqual(renders,['account']);
});

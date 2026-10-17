import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {bindTabSwipes,createSwipeRenderGate} from '../src/tabSwipe.js';
import {createAndroidSwipeMotion} from '../src/android-swipe-motion.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const touch=(x,y,id=1)=>({clientX:x,clientY:y,identifier:id});
function rig({rtl=false,contentScrollable=false,excluded=false}={}){
  const calls=new Map(),inserted=[],classes=new Set(),states=[],navigations=[];
  let current='home',allowed=true,peekRead=false;
  const body={
    appendChild(el){inserted.push(el);},
    classList:{add:s=>classes.add(s),remove:s=>classes.delete(s)}
  };
  const header={getBoundingClientRect:()=>({bottom:76})};
  const content={
    style:{transform:'',transition:'',willChange:''},
    parentElement:null,scrollWidth:contentScrollable?920:360,clientWidth:360,
    overflow:contentScrollable?'auto':'visible'
  };
  const view={
    innerWidth:360,
    matchMedia:()=>({matches:true}), // deterministic and no timers for animation
    getComputedStyle:node=>({overflowX:node.overflow||'visible'})
  };
  const doc={
    defaultView:view,body,documentElement:{dir:rtl?'rtl':'ltr'},visibilityState:'visible',
    createElement:tag=>({tagName:tag,style:{},attributes:{},offsetWidth:360,removed:false,
      setAttribute(k,v){this.attributes[k]=v;},remove(){this.removed=true;}}),
    querySelector:sel=>sel==='#app .app-shell > .content'?content:
      sel==='#app .app-shell > .topbar'?header:null
  };
  const root={ownerDocument:doc,addEventListener:(name,fn)=>calls.set(name,fn)};
  content.parentElement=root;
  const target={parentElement:content,
    closest:selector=>selector==='.content'?content:excluded?target:null};
  const slider=createAndroidSwipeMotion({document:doc,view,
    previewHtml:tab=>{peekRead=true;return '<main>'+tab+'</main>';},duration:0});
  const getTabs=()=>rtl?['account','library','live','shiurim','home']:
    ['home','shiurim','live','library','account'];
  bindTabSwipes(root,{getActiveTab:()=>current,getTabs,canNavigate:()=>allowed,
    onGestureState:x=>states.push(x),
    onDrag:d=>slider.drag(d),onRelease:d=>slider.release(d),
    onComplete:()=>slider.cleanup(),
    navigate:async tab=>{navigations.push(tab);current=tab;}});
  const emit=(name,touches=[],changedTouches=touches,extras={})=>{
    const event={target,touches,changedTouches,cancelable:true,detail:1,prevented:false,
      preventedCount:0,stopped:false,
      preventDefault(){this.prevented=true;this.preventedCount++;},
      stopImmediatePropagation(){this.stopped=true;},...extras};
    const listener=calls.get(name);assert.ok(listener,'Missing '+name);
    listener(event);return event;
  };
  const start=(x=220,y=205)=>emit('touchstart',[touch(x,y)]);
  const move=(x,y=205)=>emit('touchmove',[touch(x,y)]);
  const end=(x,y=205)=>emit('touchend',[],[touch(x,y)]);
  return {start,move,end,emit,touch,content,inserted,classes,states,navigations,slider,
    get current(){return current;},
    setCurrent:s=>{current=s;},
    allow:val=>{allowed=val;},
    get peekRead(){return peekRead;}
  };
}

test('during a left drag the REAL page follows finger and lightweight right neighbor slides in',async()=>{
  const a=rig();a.start(260);
  assert.equal(a.move(202).prevented,true);
  assert.equal(a.content.style.transform,'translate3d(-58px, 0, 0)');
  assert.equal(a.inserted.length,1);
  assert.equal(a.inserted[0].style.transform,'translate3d(302px, 0, 0)');
  assert.equal(a.inserted[0].innerHTML,'<main>shiurim</main>');
  assert.equal(a.inserted[0].attributes['aria-hidden'],'true');
  assert.equal(a.inserted[0].inert,true);
  assert.deepEqual(a.navigations,[],'never swap the page while the finger is down');
  a.move(130);
  assert.equal(a.content.style.transform,'translate3d(-130px, 0, 0)');
  assert.deepEqual(a.navigations,[]);
  a.end(130);await flush();await flush();
  assert.equal(a.current,'shiurim');
  assert.equal(a.content.style.transform,'');
  assert.equal(a.inserted[0].removed,true);
  assert.equal(a.classes.has('android-swipe-motion'),false);
  assert.deepEqual(a.states,[true,false]);
});

test('immediate reverse drag returns to previous page instead of leaving the app',async()=>{
  const a=rig();
  a.start(255);a.move(120);a.end(120);await flush();await flush();
  assert.equal(a.current,'shiurim');
  a.start(80);a.move(195);
  assert.equal(a.content.style.transform,'translate3d(115px, 0, 0)');
  assert.equal(a.inserted[1].style.transform,'translate3d(-245px, 0, 0)');
  a.end(195);await flush();await flush();
  assert.equal(a.current,'home');
  assert.deepEqual(a.navigations,['shiurim','home']);
  assert.equal(a.content.style.transform,'');
});

test('a short swipe shows motion then snaps back and does not navigate',async()=>{
  const a=rig();a.start(245);a.move(191);
  assert.equal(a.content.style.transform,'translate3d(-54px, 0, 0)');
  a.end(191);await flush();await flush();
  assert.equal(a.current,'home');assert.deepEqual(a.navigations,[]);
  assert.equal(a.content.style.transform,'');
  assert.equal(a.inserted[0].removed,true);
});

test('Android touchcancel cannot commit even when drag exceeded the threshold',async()=>{
  const a=rig();a.start(250);a.move(110);
  a.emit('touchcancel',[],[]);
  await flush();await flush();
  assert.equal(a.current,'home');
  assert.deepEqual(a.navigations,[]);
  assert.equal(a.content.style.transform,'');
  assert.equal(a.inserted[0].removed,true);
});

test('system edge Back gesture is never claimed by the WebView tab animator',async()=>{
  for(const x of [4,355]) {
    const a=rig();a.start(x);const move=a.move(x===4?170:180);a.end(x===4?170:180);
    await flush();await flush();
    assert.equal(move.prevented,false);
    assert.equal(a.current,'home');
    assert.equal(a.peekRead,false);
    assert.deepEqual(a.navigations,[]);
  }
});

test('vertical drags, editable controls, horizontal scrollbars and multiple touches remain their own gestures',async()=>{
  for(const options of [{},{contentScrollable:true},{excluded:true}]) {
    const a=rig(options);a.start(240);
    if(!options.contentScrollable && !options.excluded) {
      assert.equal(a.move(225,285).prevented,false);
      a.move(85,284);
    }else a.move(85);
    a.end(85);
    await flush();await flush();
    assert.equal(a.current,'home');
    assert.equal(a.inserted.length,0);
  }
  const b=rig();b.start(235);
  b.emit('touchmove',[touch(100,205),touch(110,205,2)]);
  b.emit('touchend',[],[touch(100,205)]);
  await flush();await flush();assert.deepEqual(b.navigations,[]);
});

test('Hebrew RTL follows physical tab order and reverses without closing',async()=>{
  const a=rig({rtl:true});a.start(72);a.move(198);a.end(198);
  await flush();await flush();assert.equal(a.current,'shiurim');
  a.start(260);a.move(125);a.end(125);
  await flush();await flush();assert.equal(a.current,'home');
  assert.deepEqual(a.navigations,['shiurim','home']);
  assert.equal(a.inserted[0].attributes.dir,'rtl');
});

test('gesture buffering defers reactive render until completion, without keeping the app frozen',async()=>{
  let count=0;
  const gate=createSwipeRenderGate(()=>count++);
  const a=rig();a.start(250);
  gate.setActive(true);gate.shouldDefer();gate.shouldDefer();
  assert.equal(count,0);
  a.move(130);a.end(130);await flush();await flush();
  gate.setActive(false);await flush();
  assert.equal(count,1);
  assert.equal(a.content.style.transform,'');
});

test('feature is Android only, lightweight and does not change native player/Back callbacks',()=>{
  const js=readFileSync('src/main.js','utf8');
  const native=readFileSync('android/app/src/main/java/org/irgunshiuraitorah/app/MainActivity.java','utf8');
  assert.match(js,/Capacitor\.getPlatform\(\) === 'android' && Capacitor\.isNativePlatform\(\)\) \{\s*bindTabSwipes/);
  const preview=js.slice(js.indexOf('function androidSwipePeekHtml('),js.indexOf('function shell(content)'));
  assert.doesNotMatch(preview,/watchHtml\(|liveHtml\(|homeHtml\(|shiurimHtml\(|libraryHtml\(|accountHtml\(|iframe|<video|<audio|new Audio/);
  assert.match(native,/fullscreenBackCallback = new OnBackPressedCallback\(false\)/);
  assert.doesNotMatch(native,/primaryTabBackCallback|__irgunHandleAndroidSystemBack/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const binder = import('../src/tabSwipe.js');

async function fixture({ rtl = false, blocked = false, scrollable = false, excluded = false, interactive = false, settlePromise = null, onGestureState, onNavigate = () => {} } = {}) {
  const handlers = new Map(), visits = [], progress = [], finishes = [];
  let active = 'home', allowed = !blocked;
  const root = {
    ownerDocument: { defaultView: { getComputedStyle: node => ({ overflowX: node.overflow || 'visible' }) } },
    addEventListener: (name, callback) => handlers.set(name, callback)
  };
  const content = { parentElement: root, scrollWidth: scrollable ? 800 : 400, clientWidth: 400, overflow: scrollable ? 'auto' : 'visible' };
  const target = {
    parentElement: content,
    closest: selector => selector === '.content' ? content : excluded ? target : null
  };
  const touch = (x, y, identifier = 1) => ({ clientX: x, clientY: y, identifier });
  function emit(name, touches, changedTouches = touches, extras = {}) {
    const event = { target, touches, changedTouches, cancelable: true, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extras };
    handlers.get(name)(event);
    return event;
  }
  const tabs = ['home','shiurim','live','library','account'];
  (await binder).bindTabSwipes(root, {
    getActiveTab: () => active, getTabs: () => rtl ? [...tabs].reverse() : tabs,
    canNavigate: () => allowed, onGestureState, navigate: tab => { active = tab; visits.push(tab); onNavigate(tab); },
    ...(interactive ? {
      onDrag: details => progress.push(details),
      onRelease: details => { finishes.push(details); return settlePromise || Promise.resolve(); }
    } : {})
  });
  function swipe(dx, dy = 0) {
    emit('touchstart', [touch(220, 200)]);
    emit('touchmove', [touch(220 + dx, 200 + dy)]);
    emit('touchend', [], [touch(220 + dx, 200 + dy)]);
  }
  return { swipe, emit, touch, visits, progress, finishes, setActive: value => { active = value; }, block: () => { allowed = false; } };
}

test('swipe traverses all tabs in both directions without wrapping', async () => {
  const f = await fixture();
  for (let i = 0; i < 5; i++) f.swipe(-130);
  for (let i = 0; i < 5; i++) f.swipe(130);
  assert.deepEqual(f.visits, ['shiurim','live','library','account','library','live','shiurim','home']);
});
test('Hebrew follows the reversed physical tab order', async () => {
  const f = await fixture({ rtl: true });
  f.swipe(-130); f.swipe(130); f.swipe(130); f.swipe(-130);
  assert.deepEqual(f.visits, ['shiurim','live','shiurim']);
});
for (const [name, options] of [['open modal', { blocked: true }], ['horizontal carousel', { scrollable: true }], ['input or player control', { excluded: true }]]) {
  test(`${name} keeps its gestures`, async () => {
    const f = await fixture(options); f.swipe(-130); assert.deepEqual(f.visits, []);
  });
}
test('short, diagonal and vertical gestures do not change tabs', async () => {
  const f = await fixture(); f.swipe(-40); f.swipe(-130, 100); f.swipe(5, 150);
  assert.deepEqual(f.visits, []);
});
test('a vertical scroll cannot turn into a tab swipe', async () => {
  const f = await fixture();
  f.emit('touchstart', [f.touch(220, 200)]);
  assert.equal(f.emit('touchmove', [f.touch(225, 240)]).prevented, false);
  f.emit('touchmove', [f.touch(80, 242)]); f.emit('touchend', [], [f.touch(80, 242)]);
  assert.deepEqual(f.visits, []);
});
test('cancelled and multi-touch gestures do not navigate', async () => {
  const f = await fixture();
  f.emit('touchstart', [f.touch(220, 200)]); f.emit('touchcancel', []);
  f.emit('touchend', [], [f.touch(80, 200)]);
  f.emit('touchstart', [f.touch(220, 200)]);
  f.emit('touchmove', [f.touch(80, 200), f.touch(100, 200, 2)]);
  f.emit('touchend', [], [f.touch(80, 200)]);
  assert.deepEqual(f.visits, []);
});
test('navigation or an opened modal during a gesture cancels it', async () => {
  const f = await fixture(); f.emit('touchstart', [f.touch(220, 200)]); f.setActive('live');
  f.emit('touchend', [], [f.touch(80, 200)]);
  f.emit('touchstart', [f.touch(220, 200)]); f.block(); f.emit('touchend', [], [f.touch(80, 200)]);
  assert.deepEqual(f.visits, []);
});
test('committed swipe suppresses its compatibility click, preserving keyboard activation', async () => {
  const f = await fixture(); f.emit('touchstart', [f.touch(220, 200)]);
  assert.equal(f.emit('touchmove', [f.touch(80, 200)]).prevented, true);
  f.emit('touchend', [], [f.touch(80, 200)]);
  const click = f.emit('click', [], [], { detail: 1 });
  assert.equal(click.prevented, true); assert.equal(click.stopped, true);
  assert.equal(f.emit('click', [], [], { detail: 0 }).prevented, false);
  assert.deepEqual(f.visits, ['shiurim']);
});

for (const left of [true,false]) test(`tab swipe commits once before a cancelled release, left=${left}`,async()=>{
  const f=await fixture();f.setActive('live');
  f.emit('touchstart',[f.touch(220,200)]);
  f.emit('touchmove',[f.touch(left?100:340,201)]);
  assert.deepEqual(f.visits,[left?'library':'shiurim']);
  f.emit('touchcancel',[]);
  f.emit('touchend',[],[f.touch(left?80:360,201)]);
  assert.equal(f.visits.length,1);
});

async function renderFixture() {
  const scheduled = [], rendered = [];
  let screen = 'live', gate;
  function render() { if (!gate.shouldDefer()) rendered.push(screen); }
  gate = (await binder).createSwipeRenderGate(render, callback => scheduled.push(callback));
  const f = await fixture({ onGestureState: active => gate.setActive(active), onNavigate: tab => { screen = tab; render(); } });
  f.setActive(screen);
  return { ...f, render, rendered, flush: () => { while (scheduled.length) scheduled.shift()(); } };
}

test('Live updates wait for the reverse swipe and coalesce into the destination render', async () => {
  const f = await renderFixture();
  f.emit('touchstart', [f.touch(88, 180)]);
  f.render(); f.render();
  assert.deepEqual(f.rendered, []);
  f.emit('touchmove', [f.touch(352, 180)]);
  f.flush();
  assert.deepEqual(f.visits, ['shiurim']);
  assert.deepEqual(f.rendered, ['shiurim']);
});

for (const vertical of [false, true]) test(`queued Live updates resume after ${vertical ? 'vertical scroll' : 'touch cancellation'}`, async () => {
  const f = await renderFixture();
  f.emit('touchstart', [f.touch(220, 200)]);
  f.render(); f.render();
  if (vertical) f.emit('touchmove', [f.touch(225, 240)]);
  else f.emit('touchcancel', []);
  f.flush();
  assert.deepEqual(f.visits, []);
  assert.deepEqual(f.rendered, ['live']);
  f.render();
  assert.deepEqual(f.rendered, ['live', 'live']);
});

const flushAsync = () => new Promise(resolve => setImmediate(resolve));

test('TorahAnytime-style swipe tracks the finger, previews a real neighbor and navigates only after release',async()=>{
  const f=await fixture({interactive:true});
  f.emit('touchstart',[f.touch(245,220)]);
  f.emit('touchmove',[f.touch(195,222)]);
  assert.equal(f.visits.length,0,'the old tab must remain alive under the finger');
  assert.equal(f.progress.at(-1).dx,-50);
  assert.equal(f.progress.at(-1).to,'shiurim');
  f.emit('touchmove',[f.touch(132,221)]);
  assert.equal(f.visits.length,0,'do not replace the page in mid-drag');
  assert.equal(f.progress.at(-1).dx,-113);
  f.emit('touchend',[],[f.touch(132,221)]);
  assert.equal(f.finishes.length,1);
  assert.equal(f.finishes[0].committed,true);
  assert.equal(f.finishes[0].to,'shiurim');
  await flushAsync();
  assert.deepEqual(f.visits,['shiurim']);
});

test('short drag visibly tracks but snaps back without navigating',async()=>{
  const f=await fixture({interactive:true});
  f.emit('touchstart',[f.touch(245,220)]);
  f.emit('touchmove',[f.touch(202,223)]);
  f.emit('touchend',[],[f.touch(202,223)]);
  await flushAsync();
  assert.equal(f.progress.length,1);
  assert.equal(f.finishes[0].committed,false);
  assert.deepEqual(f.visits,[]);
});

test('strong Android touchcancel still commits a finger-tracked swipe once',async()=>{
  const f=await fixture({interactive:true});
  f.emit('touchstart',[f.touch(245,220)]);
  f.emit('touchmove',[f.touch(131,221)]);
  f.emit('touchcancel',[]);
  f.emit('touchend',[],[f.touch(110,221)]);
  await flushAsync();
  assert.deepEqual(f.visits,['shiurim']);
  assert.equal(f.finishes.length,1);
});

test('RTL interactive swipe previews the physical left neighbor correctly',async()=>{
  const f=await fixture({interactive:true,rtl:true});
  f.emit('touchstart',[f.touch(90,210)]);
  f.emit('touchmove',[f.touch(203,211)]);
  assert.equal(f.progress.at(-1).to,'shiurim');
  f.emit('touchend',[],[f.touch(203,211)]);
  await flushAsync();
  assert.deepEqual(f.visits,['shiurim']);
});

test('interactive preview never steals a vertical scroll or a horizontal carousel gesture',async()=>{
  for(const props of [{},{scrollable:true},{excluded:true}]){
    const f=await fixture({interactive:true,...props});
    f.emit('touchstart',[f.touch(230,200)]);
    if(!props.scrollable&&!props.excluded)f.emit('touchmove',[f.touch(225,260)]);
    else f.emit('touchmove',[f.touch(90,201)]);
    f.emit('touchend',[],[f.touch(90,260)]);
    await flushAsync();
    assert.deepEqual(f.progress,[]);
    assert.deepEqual(f.visits,[]);
  }
});

test('finger-tracked animated navigation waits until the preview has settled',async()=>{
  let finish;
  const deferred = new Promise(resolve=>{ finish=resolve; });
  const f=await fixture({interactive:true,settlePromise:deferred});
  f.emit('touchstart',[f.touch(245,220)]);
  f.emit('touchmove',[f.touch(132,221)]);
  f.emit('touchend',[],[f.touch(132,221)]);
  await flushAsync();
  assert.deepEqual(f.visits,[]);
  finish();await flushAsync();
  assert.deepEqual(f.visits,['shiurim']);
});

test('Android tab slider translates actual page and adjacent inert preview in the same direction',async()=>{
  const {createAndroidTabSlider}=await import('../src/android-tab-slide.js');
  const bodyClasses=new Set();
  const content={style:{transition:'',transform:'',willChange:''}};
  const nodes=[];
  const document={
    body:{classList:{add:n=>bodyClasses.add(n),remove:n=>bodyClasses.delete(n)},
      appendChild:n=>nodes.push(n)},
    querySelector:selector=>selector==='#app .app-shell > .content'?content:
      selector==='#app .topbar'?{getBoundingClientRect:()=>({bottom:68})}:null,
    createElement:tag=>{
      const node={tag,style:{},children:[],removed:false,attributes:{},
        setAttribute(k,v){this.attributes[k]=v;},
        appendChild(n){this.children.push(n);},
        remove(){this.removed=true;},
        querySelectorAll(){return[];},
        offsetWidth:320
      };return node;
    }
  };
  const slider=createAndroidTabSlider({document,view:{innerWidth:320,
    matchMedia:()=>({matches:true})},previewHtml:tab=>'<h1>'+tab+'</h1>'});
  slider.drag({from:'home',to:'shiurim',dx:-92});
  assert.equal(content.style.transform,'translate3d(-92px, 0, 0)');
  assert.equal(nodes[0].style.transform,'translate3d(228px, 0, 0)');
  assert.equal(nodes[0].style.top,'68px');
  assert.equal(nodes[0].attributes['aria-hidden'],'true');
  assert.equal(nodes[0].children[0].innerHTML,'<h1>shiurim</h1>');
  assert.equal(nodes[0].inert,true);
  assert.ok(bodyClasses.has('android-tab-sliding'));
  await slider.settle({committed:true});
  assert.equal(content.style.transform,'translate3d(-320px, 0, 0)');
  assert.equal(nodes[0].style.transform,'translate3d(0px, 0, 0)');
  slider.cleanup();
  assert.equal(content.style.transform,'');
  assert.equal(content.style.willChange,'');
  assert.ok(nodes[0].removed);
  assert.equal(bodyClasses.has('android-tab-sliding'),false);
});

test('cancelled preview settles back without changing the active page',async()=>{
  const {createAndroidTabSlider}=await import('../src/android-tab-slide.js');
  const content={style:{transition:'',transform:'',willChange:''}};
  let preview;
  const document={
    body:{classList:{add(){},remove(){}},appendChild:n=>{preview=n;}},
    querySelector:selector=>selector==='#app .app-shell > .content'?content:null,
    createElement:()=>({style:{},setAttribute(){},appendChild(){},querySelectorAll(){return[];},
      remove(){this.removed=true;},offsetWidth:320})
  };
  const slider=createAndroidTabSlider({document,view:{innerWidth:320,
    matchMedia:()=>({matches:true})},previewHtml:()=>'<div>Next</div>'});
  slider.drag({from:'shiurim',to:'home',dx:47});
  assert.equal(content.style.transform,'translate3d(47px, 0, 0)');
  await slider.settle({committed:false});
  assert.equal(content.style.transform,'translate3d(0px, 0, 0)');
  assert.equal(preview.style.transform,'translate3d(-320px, 0, 0)');
  slider.cleanup();
});

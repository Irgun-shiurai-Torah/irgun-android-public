const { test } = require('node:test');
const assert = require('node:assert/strict');
const binder = import('../src/tabSwipe.js');

async function fixture({ rtl = false, blocked = false, scrollable = false, excluded = false, onGestureState, onNavigate = () => {} } = {}) {
  const handlers = new Map(), visits = [];
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
    canNavigate: () => allowed, onGestureState, navigate: tab => { active = tab; visits.push(tab); onNavigate(tab); }
  });
  function swipe(dx, dy = 0) {
    emit('touchstart', [touch(220, 200)]);
    emit('touchmove', [touch(220 + dx, 200 + dy)]);
    emit('touchend', [], [touch(220 + dx, 200 + dy)]);
  }
  return { swipe, emit, touch, visits, setActive: value => { active = value; }, block: () => { allowed = false; } };
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

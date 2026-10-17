// Touch events keep tab navigation independent of WebView pointer cancellation.
export function createSwipeRenderGate(render, schedule = queueMicrotask) {
  let active = false, queued = false;
  return {
    shouldDefer() {
      if (active) { queued = true; return true; }
      queued = false; return false;
    },
    setActive(value) {
      active = value;
      if (!active && queued) schedule(() => { if (!active && queued) render(); });
    }
  };
}

export function bindTabSwipes(root, { getActiveTab, getTabs, canNavigate, navigate, onGestureState = () => {} }) {
  let gesture = null;
  let suppressClickUntil = 0;
  const view = root.ownerDocument.defaultView;
  const excluded = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), video, iframe, .direct-media-player, .watch-overlay, .mini-player, .sheet-backdrop, .bottom-nav, [role="dialog"]';
  const reset = () => {
    if (!gesture) return;
    gesture = null;
    onGestureState(false);
  };
  const commit = (event, touch) => {
    const start = gesture;
    if (!start || !canNavigate() || getActiveTab() !== start.tab) return reset();
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    // Commit during movement: native scrolling or a reactive render can cancel
    // touchend after the user's horizontal intent is already unambiguous.
    reset();
    const tabs = getTabs(), index = tabs.indexOf(start.tab);
    const next = index < 0 ? null : tabs[index + (dx < 0 ? 1 : -1)];
    if (!next) return;
    suppressClickUntil = Date.now() + 600;
    if (event.cancelable) event.preventDefault();
    navigate(next);
  };
  const allowedTarget = target => {
    if (!target?.closest?.('.content') || target.closest(excluded)) return false;
    for (let node = target; node && node !== root; node = node.parentElement) {
      const css = view.getComputedStyle(node);
      if (/(auto|scroll)/.test(css.overflowX) && node.scrollWidth > node.clientWidth + 2) return false;
    }
    return true;
  };
  root.addEventListener('touchstart', event => {
    reset();
    if (event.touches.length !== 1 || !canNavigate() || !allowedTarget(event.target)) return;
    const touch = event.touches[0];
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, tab: getActiveTab(), horizontal: false };
    onGestureState(true);
  }, { passive: true });
  root.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (event.touches.length !== 1 || !canNavigate() || getActiveTab() !== gesture.tab) return reset();
    const touch = event.touches[0];
    if (touch.identifier !== gesture.id) return reset();
    const dx = Math.abs(touch.clientX - gesture.x), dy = Math.abs(touch.clientY - gesture.y);
    // Once vertical scrolling wins, this gesture cannot become navigation.
    if (!gesture.horizontal && dy > 12 && dy >= dx) return reset();
    if (dx > 16 && dx > dy * 1.5) gesture.horizontal = true;
    if (gesture.horizontal && event.cancelable) event.preventDefault();
    if (gesture.horizontal) commit(event, touch);
  }, { passive: false });
  root.addEventListener('touchend', event => {
    if (!gesture || event.touches.length) return reset();
    const touch = Array.from(event.changedTouches).find(item => item.identifier === gesture.id);
    if (touch) commit(event, touch);
    reset();
  }, { passive: false });
  root.addEventListener('touchcancel', reset, { passive: true });
  root.addEventListener('click', event => {
    if (event.detail !== 0 && Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

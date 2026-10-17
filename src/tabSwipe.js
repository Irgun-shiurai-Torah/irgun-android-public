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

export function bindTabSwipes(root, { getActiveTab, getTabs, canNavigate, navigate,
  onGestureState = () => {}, onDrag = null, onRelease = null }) {
  let gesture = null;
  let settling = false;
  let suppressClickUntil = 0;
  const view = root.ownerDocument.defaultView;
  const interactive = typeof onDrag === 'function' && typeof onRelease === 'function';
  const excluded = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), video, iframe, .direct-media-player, .watch-overlay, .mini-player, .sheet-backdrop, .bottom-nav, [role="dialog"]';
  const reset = () => {
    if (!gesture) return;
    gesture = null;
    onGestureState(false);
  };
  const nextTab = (tab, dx) => {
    const tabs = getTabs(), index = tabs.indexOf(tab);
    return index < 0 || !dx ? null : tabs[index + (dx < 0 ? 1 : -1)] || null;
  };
  // Retain the original early-commit behavior for consumers that don't supply
  // a finger-following animation. Their swipe still survives touchcancel.
  const commit = (event, touch) => {
    const start = gesture;
    if (!start || !canNavigate() || getActiveTab() !== start.tab) return reset();
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    reset();
    const next = nextTab(start.tab, dx);
    if (!next) return;
    suppressClickUntil = Date.now() + 700;
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
  const releaseInteractive = (event, touch) => {
    const start = gesture;
    if (!start) return;
    gesture = null;
    settling = true;
    const dx = touch ? touch.clientX - start.x : start.dx;
    const dy = touch ? touch.clientY - start.y : start.dy;
    const width = Math.max(280, Number(view.innerWidth) || 360);
    const threshold = Math.max(70, Math.min(132, width * .20));
    const valid = canNavigate() && getActiveTab() === start.tab && start.horizontal
      && Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.5;
    const next = valid ? nextTab(start.tab, dx) : null;
    const committed = Boolean(next);
    if (committed) {
      suppressClickUntil = Date.now() + 700;
      if (event.cancelable) event.preventDefault();
    }
    // Hold the render gate through the settling animation and the navigation
    // work. The real destination DOM is rendered before the preview is removed.
    let animation;
    try { animation = onRelease({ from:start.tab, to:next, dx, committed }); }
    catch (error) { animation = Promise.reject(error); }
    void Promise.resolve(animation).catch(() => {}).then(() =>
      committed ? navigate(next, { fromSwipe:true }) : null
    ).catch(() => {}).finally(() => {
      settling = false;
      onGestureState(false);
    });
  };
  root.addEventListener('touchstart', event => {
    reset();
    // A second finger must not interrupt the previous page's snap animation.
    if (settling || event.touches.length !== 1 || !canNavigate() || !allowedTarget(event.target)) return;
    const touch = event.touches[0];
    gesture = { id:touch.identifier, x:touch.clientX, y:touch.clientY, dx:0, dy:0,
      tab:getActiveTab(), horizontal:false };
    onGestureState(true);
  }, { passive:true });
  root.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (event.touches.length !== 1 || !canNavigate() || getActiveTab() !== gesture.tab) return reset();
    const touch = event.touches[0];
    if (touch.identifier !== gesture.id) return reset();
    const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
    gesture.dx = dx;gesture.dy = dy;
    // Once vertical scrolling wins, it owns the entire gesture.
    if (!gesture.horizontal && Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) return reset();
    if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.5) gesture.horizontal = true;
    if (!gesture.horizontal) return;
    if (event.cancelable) event.preventDefault();
    if (interactive) {
      onDrag({ from:gesture.tab, to:nextTab(gesture.tab, dx), dx,
        width:Math.max(280, Number(view.innerWidth) || 360) });
    } else commit(event, touch);
  }, { passive:false });
  root.addEventListener('touchend', event => {
    if (!gesture) return;
    if (event.touches.length) return reset();
    const touch = Array.from(event.changedTouches).find(item => item.identifier === gesture.id);
    if (interactive) releaseInteractive(event, touch);
    else { if (touch) commit(event, touch); reset(); }
  }, { passive:false });
  root.addEventListener('touchcancel', event => {
    if (interactive) releaseInteractive(event, null);
    else reset();
  }, { passive:true });
  root.addEventListener('click', event => {
    if (event.detail !== 0 && Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

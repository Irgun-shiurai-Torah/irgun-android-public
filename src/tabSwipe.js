// The original Android tab-swipe handler remains the fallback.
// Interactive mode is opt-in so web/iOS and ordinary Android navigation are unchanged.
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

export function bindTabSwipes(root, {
  getActiveTab, getTabs, canNavigate, navigate, onGestureState = () => {},
  onDrag, onRelease, onComplete = () => {}
}) {
  let gesture = null;
  let settling = false;
  let suppressClickUntil = 0;
  const view = root.ownerDocument.defaultView;
  const interactive = typeof onDrag === 'function' && typeof onRelease === 'function';
  // A horizontal tab swipe should also start over an unfocused Account
  // input or notification checkbox. The earlier blanket input/textarea
  // exclusion left much of the lower Account form unresponsive. Taps remain
  // normal because we preventDefault only after clear horizontal movement.
  const excluded = 'select, [contenteditable]:not([contenteditable="false"]), video, iframe, .direct-media-player, .watch-overlay, .mini-player, .sheet-backdrop, .bottom-nav, [role="dialog"]';

  const nextTab = (tab, dx) => {
    const tabs = getTabs(), i = tabs.indexOf(tab);
    if (i < 0 || !dx) return null;
    // getTabs is in physical left-to-right order. RTL reverses which adjacent
    // visual tab a finger moving left or right should reveal.
    const direction = root.ownerDocument?.documentElement?.dir
      || view.getComputedStyle(root.ownerDocument?.documentElement || root).direction || 'ltr';
    const rtl = direction.toLowerCase() === 'rtl';
    const step = dx < 0 ? (rtl ? -1 : 1) : (rtl ? 1 : -1);
    return tabs[i + step] || null;
  };
  const allowedTarget = target => {
    if (!target?.closest?.('.content') || target.closest(excluded)) return false;
    // Avoid stealing cursor, selection or typed text from a focused field,
    // but allow normal horizontal swipes beginning on UNFOCUSED inputs.
    // Keep range/file/color controls native; a tap/toggle on a checkbox
    // continues working because horizontal intent has not been established.
    const editor=target.closest?.('input, textarea');
    const type=String(editor?.type||'').toLowerCase();
    if (editor && ['range','file','color','date','time','datetime-local'].includes(type)) return false;
    const active=root.ownerDocument?.activeElement;
    const focusedText=active && ['input','textarea'].includes(String(active.tagName||'').toLowerCase()) &&
      !['checkbox','radio'].includes(String(active.type||'').toLowerCase());
    if (focusedText && (editor===active || target.closest?.('label')?.contains?.(active))) return false;
    for (let node = target; node && node !== root; node = node.parentElement) {
      const css = view.getComputedStyle(node);
      // True horizontally scrollable strips keep their own gesture. Ignore
      // incidental 2-10px form/card overflow from font and border rounding.
      if (/(auto|scroll)/.test(css.overflowX) && node.scrollWidth > node.clientWidth + 12) return false;
    }
    return true;
  };

  // Preserve the 1.0.179 navigation timing for clients not opting in.
  // A normal swipe commits on touchmove because WebView may cancel touchend.
  const reset = () => {
    if (!gesture) return;
    gesture = null;
    onGestureState(false);
  };
  const legacyCommit = (event, touch) => {
    const start = gesture;
    if (!start || !canNavigate() || getActiveTab() !== start.tab) return reset();
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    reset();
    const next = nextTab(start.tab, dx);
    if (!next) return;
    suppressCompatibilityClick(null); // Legacy fallback cannot observe the final touchend point.
    if (event.cancelable) event.preventDefault();
    navigate(next);
  };

  // Interactive navigation commits ONLY on a completed touchend. In particular,
  // touchcancel from Android system Back, an interrupted scroll or the player
  // must always restore the old screen and NEVER navigate.
  const finish = (event, touch, cancelled = false) => {
    const start = gesture;
    if (!start || settling) return;
    gesture = null;
    if (!start.horizontal) {
      onGestureState(false);
      try { onComplete(); } catch (_) {}
      return;
    }
    settling = true;
    const dx = touch ? touch.clientX - start.x : start.dx;
    const dy = touch ? touch.clientY - start.y : start.dy;
    const width = Math.max(1, view.innerWidth || 360);
    const target = nextTab(start.tab, dx);
    const valid = !cancelled && canNavigate() && getActiveTab() === start.tab &&
      target && Math.abs(dx) >= Math.max(70, Math.min(124, width * 0.18)) &&
      Math.abs(dx) > Math.abs(dy) * 1.5;
    if (valid) {
      suppressCompatibilityClick(touch);
      if (event.cancelable) event.preventDefault();
    }
    let animation;
    try { animation = onRelease({ from:start.tab, to:valid ? target : null,
      committed:Boolean(valid), dx }); }
    catch (_) { animation = null; }
    void Promise.resolve(animation).catch(() => {}).then(async () => {
      // Release the render gate before invoking the SAME existing bottom tab
      // navigation. The preview remains above it until the render is finished.
      onGestureState(false);
      if (valid) await navigate(target);
    }).catch(() => {}).finally(() => {
      try { onComplete(); } catch (_) {}
      settling = false;
    });
  };

  root.addEventListener('touchstart', event => {
    if (interactive && settling) return;
    if (interactive && gesture) finish(event, null, true);
    else reset();
    if (event.touches.length !== 1 || !canNavigate() || !allowedTarget(event.target)) return;
    const touch = event.touches[0];
    // Let Android own its 24dp screen-edge Back gesture. Never try to compete
    // with the OS Back animation from either side of the screen.
    const screenWidth = Number(view.innerWidth) || 360;
    const edgeInset = Math.min(28, screenWidth * 0.07);
    if (interactive && (touch.clientX < edgeInset || touch.clientX > screenWidth - edgeInset)) return;
    gesture = { id:touch.identifier, x:touch.clientX, y:touch.clientY,
      dx:0,dy:0,tab:getActiveTab(),horizontal:false };
    onGestureState(true);
  }, { passive:true });

  root.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (event.touches.length !== 1 || !canNavigate() || getActiveTab() !== gesture.tab) {
      if (interactive) finish(event, null, true);
      else reset();
      return;
    }
    const touch = event.touches[0];
    if (touch.identifier !== gesture.id) {
      if (interactive) finish(event, null, true);
      else reset();
      return;
    }
    const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
    gesture.dx=dx; gesture.dy=dy;
    // A vertical scroll can never become a tab switch later in the gesture.
    if (!gesture.horizontal && Math.abs(dy)>12 && Math.abs(dy)>=Math.abs(dx)) {
      if (interactive) finish(event, touch, true);
      else reset();
      return;
    }
    if (Math.abs(dx)>16 && Math.abs(dx)>Math.abs(dy)*1.5)gesture.horizontal=true;
    if (!gesture.horizontal) return;
    if (event.cancelable)event.preventDefault();
    if (interactive) {
      try { onDrag({from:gesture.tab,to:nextTab(gesture.tab,dx),dx,
        width:Math.max(1,view.innerWidth||360)}); }
      catch (_) { finish(event,touch,true); }
    } else legacyCommit(event,touch);
  }, { passive:false });

  root.addEventListener('touchend', event => {
    if (!gesture) return;
    if (event.touches.length) {
      if (interactive) finish(event,null,true);
      else reset();
      return;
    }
    const touch=Array.from(event.changedTouches).find(item=>item.identifier===gesture.id);
    if (interactive)finish(event,touch,!touch);
    else {if(touch)legacyCommit(event,touch);reset();}
  }, { passive:false });
  root.addEventListener('touchcancel', event => {
    if (interactive)finish(event,null,true);
    else reset();
  }, { passive:true });
  root.addEventListener('click', event => {
    if(event.detail===0 || Date.now()>=suppressClickUntil) return;
    if (interactive && suppressClickPoint &&
        Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      const dx=event.clientX-suppressClickPoint.x;
      const dy=event.clientY-suppressClickPoint.y;
      // The synthetic click generated by the completed swipe lands at its
      // endpoint. A tap elsewhere is a new user action and must remain usable.
      if (dx*dx+dy*dy > 32*32) return;
    }
    event.preventDefault();event.stopImmediatePropagation();
  }, true);
}

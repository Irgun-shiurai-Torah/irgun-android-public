// Android swipe animation: a single real page plus a read-only preview of
// the ACTUAL next tab. Never mount a second app/player or wire its listeners.
// Only first-screen cards and media thumbnails survive the sanitization, so
// Android 11 devices do not need to decode two whole pages at once.
export function createAndroidSwipeMotion({
  document, view = document.defaultView, previewHtml,
  previewKey = () => '',
  schedule = (cb, delay) => setTimeout(cb, delay),
  duration = 160
}) {
  let active = null, identity = null;
  const recent = new Map();
  const translate = x => `translate3d(${Math.round(x)}px, 0, 0)`;
  const screenWidth = () => Math.max(1, Number(view.innerWidth) || 360);
  const noMotion = () => view.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    || document.visibilityState === 'hidden';
  const mainTabs = new Set(['home','shiurim','live','library','account']);
  const ensureIdentity = () => {
    const next = String(previewKey());
    if (next !== identity) { recent.clear(); identity = next; }
  };

  // The incoming tab must look like the original app, not the simplified pale
  // placeholders. Retain the authentic markup/classes, safely dropping only
  // unneeded below-fold lists, duplicated IDs, scripts and playback elements.
  const safeVisual = raw => {
    const html = String(raw || '');
    const page = document.createElement('main');
    page.className = 'content android-swipe-snapshot';
    page.innerHTML = html;
    if (typeof page.querySelectorAll === 'function') {
      const removeMedia = 'script, iframe, video, audio, source, object, embed, canvas';
      page.querySelectorAll(removeMedia).forEach(el => el.remove());
      const rows = '.card-grid, .list, .live-now-grid, .live-grid, .paid-grid, .upcoming-home-list, .home-shortcuts, .video-grid, .library-results, .history-list';
      page.querySelectorAll(rows).forEach(container => {
        // Real first cards are visible. Trimming below-fold results prevents
        // the old crash-prone duplicate 48-card library or live player page.
        Array.from(container.children || []).slice(2).forEach(el => el.remove());
      });
      let imageCount = 0;
      page.querySelectorAll('*').forEach(el => {
        if (!el.isConnected && !page.contains(el)) return;
        if (el.hasAttribute?.('id') && el.closest?.('svg') == null) el.removeAttribute('id');
        if (el.getAttributeNames) for (const name of el.getAttributeNames()) {
          if (name.startsWith('on')) el.removeAttribute(name);
        }
        if (el.matches?.('input, textarea')) {
          // Static preview cannot become another editable form or expose a
          // password typed into an account form.
          el.removeAttribute('value');
          if (el.matches('textarea')) el.textContent = '';
          el.setAttribute('disabled', '');
        }
        if (el.matches?.('img')) {
          imageCount++;
          if (imageCount > 4) {
            // Keep the original size/background layout but load at most four
            // thumbnails into the GPU during a low-memory Android swipe.
            el.removeAttribute('src');el.removeAttribute('srcset');
          } else {
            el.setAttribute('loading', 'lazy');
            el.setAttribute('decoding', 'async');
          }
        }
      });
      let total = 0;
      const trim = parent => {
        for (const el of Array.from(parent.children || [])) {
          total++;
          if (total > 220) el.remove();
          else trim(el);
        }
      };
      trim(page);
    }
    // Real browser DOM returns outerHTML. A tiny test fixture may not provide
    // it, but the same markup remains testable without a full browser runtime.
    return typeof page.outerHTML === 'string' ? page.outerHTML
      : `<main class="content android-swipe-snapshot">${html}</main>`;
  };

  const rememberPage = tab => {
    ensureIdentity();
    if (!mainTabs.has(tab)) return;
    const content = document.querySelector('#app .app-shell > .content');
    if (!content || typeof content.innerHTML !== 'string') return;
    recent.set(tab, safeVisual(content.innerHTML));
  };
  const visualFor = tab => {
    ensureIdentity();
    if (recent.has(tab)) return recent.get(tab);
    // A never-opened tab uses its real existing renderer ONCE. Repeated
    // gestures reuse the bounded, sanitized snapshot; no player is created.
    const html = safeVisual(previewHtml(tab));
    recent.set(tab, html);
    return html;
  };

  const cleanup = () => {
    if (!active) return;
    const {content,peek,original} = active;
    content.style.transform = original.transform;
    content.style.transition = original.transition;
    content.style.willChange = original.willChange;
    peek?.remove();
    document.body.classList.remove('android-swipe-motion');
    active = null;
  };

  const prepare = ({from,to,dx}) => {
    const side = dx < 0 ? 1 : -1;
    if (active && active.from===from && active.to===to && active.side===side) return true;
    cleanup();
    const content = document.querySelector('#app .app-shell > .content');
    const header = document.querySelector('#app .app-shell > .topbar');
    if (!content || !header || !to || to===from || !document.body) return false;
    const peek = document.createElement('div');
    peek.className='android-swipe-peek';
    peek.setAttribute('aria-hidden','true');
    peek.setAttribute('dir',document.documentElement?.dir||'ltr');
    peek.inert = true;
    peek.style.top = `${Math.round(header.getBoundingClientRect().bottom)}px`;
    peek.innerHTML = visualFor(to);
    const original = {
      transform:content.style.transform,
      transition:content.style.transition,
      willChange:content.style.willChange
    };
    // Staying inside #app applies the exact same existing card, button and
    // typography CSS as the actual page, while pointer-events:none and inert
    // prevent duplicate interactive controls or focus.
    (document.querySelector('#app') || document.body).appendChild(peek);
    document.body.classList.add('android-swipe-motion');
    active = {from,to,side,content,peek,original,width:screenWidth()};
    content.style.willChange='transform';
    content.style.transition='none';
    peek.style.transition='none';
    return true;
  };

  const position = dx => {
    if (!active) return;
    const {content,peek,side,width}=active;
    const x=Math.min(width,Math.max(-width,Number(dx)||0));
    content.style.transform=translate(x);
    peek.style.transform=translate(side*width+x);
  };
  const drag = ({from,to,dx}) => {
    if (!to || !dx){ cleanup();return; }
    if (prepare({from,to,dx})) position(dx);
  };
  const release = ({committed=false}) => {
    if(!active)return Promise.resolve();
    const {content,peek,side,width}=active;
    const time=noMotion()?0:duration;
    if(time){
      const easing=`transform ${time}ms cubic-bezier(.22,.72,.24,1)`;
      content.style.transition=easing;
      peek.style.transition=easing;
      void peek.offsetWidth;
    }
    position(committed?-side*width:0);
    return time ? new Promise(resolve=>schedule(resolve,time+28)) : Promise.resolve();
  };
  return {drag,release,cleanup,rememberPage,get active(){return Boolean(active);}};
}

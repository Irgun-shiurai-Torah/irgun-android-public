// Android-only visual companion to tabSwipe.js.
// The real page follows the finger; an inert snapshot of the adjacent tab
// enters beside it. Nothing here replaces the native Media3 player or
// installs another navigation/player DOM tree.
export function createAndroidTabSlider({
  document, view = document.defaultView, previewHtml,
  durationMs = 190, schedule = (fn, ms) => setTimeout(fn, ms)
}) {
  let active = null;
  const width = () => Math.max(280, Number(view?.innerWidth) || 360);
  const reduceMotion = () => Boolean(view?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const setInline = (el, name, value) => { el.style[name] = value; };
  const translate = value => `translate3d(${Math.round(value)}px, 0, 0)`;
  const isPrepared = (from, to) => Boolean(active && active.from === from && active.to === to);
  function cleanup() {
    if (!active) return;
    const { content, preview, original } = active;
    for (const [name, value] of Object.entries(original)) setInline(content, name, value);
    preview.remove();
    document.body.classList.remove('android-tab-sliding');
    active = null;
  }
  function prepare({ from, to, side }) {
    if (!from || !to || to === from || !side) return false;
    if (isPrepared(from, to)) return true;
    cleanup();
    const content = document.querySelector('#app .app-shell > .content');
    if (!content || !document.body) return false;
    const snapshot = document.createElement('div');
    snapshot.className = 'android-tab-slide-preview';
    snapshot.setAttribute('aria-hidden', 'true');
    snapshot.inert = true;
    const nextPage = document.createElement('main');
    nextPage.className = 'content';
    nextPage.innerHTML = previewHtml(to);
    // The preview is strictly visual. Never start a second Video, Audio or
    // live iframe decoder, nor duplicate executable page code.
    nextPage.querySelectorAll('iframe, video, audio, script').forEach(element => element.remove());
    snapshot.appendChild(nextPage);
    const header = document.querySelector('#app .topbar');
    snapshot.style.top = `${Math.max(0, Math.round(header?.getBoundingClientRect().bottom || 0))}px`;
    const original = {
      transition:content.style.transition,
      transform:content.style.transform,
      willChange:content.style.willChange
    };
    document.body.appendChild(snapshot);
    document.body.classList.add('android-tab-sliding');
    active = { from, to, side, content, preview:snapshot, original, width:width() };
    content.style.willChange = 'transform';
    content.style.transition = 'none';
    snapshot.style.transition = 'none';
    update(0);
    return true;
  }
  function update(delta) {
    if (!active) return;
    const { content, preview, side } = active;
    const dx = Math.max(-active.width, Math.min(active.width, Number(delta)||0));
    content.style.transform = translate(dx);
    preview.style.transform = translate(side * active.width + dx);
  }
  function drag({ from, to, dx }) {
    if (!to) {
      // At the first/last tab the page resists an outward drag.
      if (active) cleanup();
      return;
    }
    const side = dx < 0 ? 1 : -1;
    if (prepare({ from, to, side })) update(dx);
  }
  function settle({ committed = false } = {}) {
    if (!active) return Promise.resolve(false);
    const { content, preview, side, width:pageWidth } = active;
    const target = committed ? -side * pageWidth : 0;
    const ms = reduceMotion() ? 0 : durationMs;
    if (ms) {
      const easing = `transform ${ms}ms cubic-bezier(.22,.72,.24,1)`;
      content.style.transition = easing;
      preview.style.transition = easing;
      // Commit the starting position before the transition to the destination.
      void preview.offsetWidth;
    }
    update(target);
    return ms ? new Promise(resolve => schedule(() => resolve(true), ms + 24)) : Promise.resolve(true);
  }
  async function animateTap({ from, to, side }) {
    if (!prepare({ from, to, side })) return false;
    await settle({ committed:true });
    return true;
  }
  return { drag, settle, animateTap, cleanup,
    get active() { return Boolean(active); },
    get destination() { return active?.to || null; }
  };
}

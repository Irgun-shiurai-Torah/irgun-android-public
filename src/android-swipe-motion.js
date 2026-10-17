// Small, text-only tab preview for Android WebView.
// Do NOT render another copy of Home, Library or Account here: their full
// renderers create large DOM trees and media and can exhaust older devices.
// Native Media3, PiP and the persistent mini-player stay outside both panels.
export function createAndroidSwipeMotion({
  document, view = document.defaultView, previewHtml,
  schedule = (cb, delay) => setTimeout(cb, delay),
  duration = 160
}) {
  let active = null;
  const translate = x => `translate3d(${Math.round(x)}px, 0, 0)`;
  const screenWidth = () => Math.max(1, Number(view.innerWidth) || 360);
  const noMotion = () => view.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    || document.visibilityState === 'hidden';

  const cleanup = () => {
    if (!active) return;
    const { content, peek, original } = active;
    content.style.transform=original.transform;
    content.style.transition=original.transition;
    content.style.willChange=original.willChange;
    peek?.remove();
    document.body.classList.remove('android-swipe-motion');
    active=null;
  };

  const prepare = ({from,to,dx}) => {
    const side = dx < 0 ? 1 : -1;
    if(active && active.from===from && active.to===to && active.side===side)return true;
    cleanup();
    const content=document.querySelector('#app .app-shell > .content');
    const header=document.querySelector('#app .app-shell > .topbar');
    if(!content || !header || !to || to===from || !document.body)return false;
    // A bounded visual teaser, not another live page or player instance.
    const peek=document.createElement('div');
    peek.className='android-swipe-peek';
    peek.setAttribute('aria-hidden','true');
    peek.setAttribute('dir',document.documentElement?.dir||'ltr');
    peek.inert=true;
    peek.style.top=`${Math.round(header.getBoundingClientRect().bottom)}px`;
    peek.innerHTML=previewHtml(to);
    const original={
      transform:content.style.transform,
      transition:content.style.transition,
      willChange:content.style.willChange
    };
    document.body.appendChild(peek);
    document.body.classList.add('android-swipe-motion');
    active={from,to,side,content,peek,original,width:screenWidth()};
    content.style.willChange='transform';
    content.style.transition='none';
    peek.style.transition='none';
    return true;
  };

  const position = dx => {
    if(!active)return;
    const {content,peek,side,width}=active;
    const x=Math.min(width,Math.max(-width,Number(dx)||0));
    content.style.transform=translate(x);
    peek.style.transform=translate(side*width + x);
  };

  const drag = ({from,to,dx}) => {
    if(!to || !dx) {cleanup();return;}
    if(prepare({from,to,dx}))position(dx);
  };

  const release = ({committed=false}) => {
    if(!active)return Promise.resolve();
    const {content,peek,side,width}=active;
    const time = noMotion() ? 0 : duration;
    if(time){
      const easing=`transform ${time}ms cubic-bezier(.22,.72,.24,1)`;
      content.style.transition=easing;
      peek.style.transition=easing;
      // Commit the drag pose before asking the browser to animate it.
      void peek.offsetWidth;
    }
    position(committed?-side*width:0);
    // Keep the full-width teaser in place until real navigation has rendered.
    // The touch binder calls cleanup after the navigate() promise settles.
    return time ? new Promise(resolve=>schedule(resolve,time+28)) : Promise.resolve();
  };
  return { drag, release, cleanup, get active(){return Boolean(active);} };
}

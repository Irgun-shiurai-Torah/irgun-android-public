import {createSwipeRenderGate} from './tabSwipe.js';

export function bindAndroidPlayerSheetInteractions({document,view,isAndroid,render,
  schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}) {
  const gate=createSwipeRenderGate(render);
  if(!isAndroid())return gate;
  let pointer=null,releaseTimer=null;
  const release=()=>{
    if(pointer==null)return;
    cancel(releaseTimer);
    // Keep the original button through the click following pointerup.
    releaseTimer=schedule(()=>{pointer=null;releaseTimer=null;gate.setActive(false);},100);
  };
  document.addEventListener('pointerdown',event=>{
    if(!event.target?.closest?.('[data-player-sheet]'))return;
    cancel(releaseTimer);releaseTimer=null;
    pointer=event.pointerId;gate.setActive(true);
  },true);
  for(const name of ['pointerup','pointercancel'])document.addEventListener(name,event=>{
    if(event.pointerId===pointer)release();
  },true);
  view.addEventListener('blur',release);
  return gate;
}

export function preserveAndroidPlayerSheetScroll({document,isAndroid,playerKey}) {
  if(!isAndroid())return ()=>{};
  const sheet=document.querySelector('[data-player-sheet]');
  if(!sheet||sheet.dataset.irgunPlayerKey!==playerKey)return ()=>{};
  const top=sheet.scrollTop,left=sheet.scrollLeft;
  return ()=>{
    const current=document.querySelector('[data-player-sheet]');
    if(current?.dataset.irgunPlayerKey===playerKey){current.scrollTop=top;current.scrollLeft=left;}
  };
}

/**
 * Keep the scrolled Audio settings in view after a real Android speed tap.
 * A native playback callback or a late WebView render can otherwise return
 * the sheet to its top after the tap has already fired. Restore only the same
 * lecture sheet, for a short bounded window, and yield to any new user touch.
 * No playback operation or iOS behavior is changed here.
 */
export function preserveAndroidSpeedTapScroll({document,isAndroid,
  schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}) {
  if (!isAndroid()) return ()=>{};
  const sheet=document.querySelector('[data-player-sheet]');
  const key=sheet?.dataset.irgunPlayerKey;
  const top=Number(sheet?.scrollTop)||0, left=Number(sheet?.scrollLeft)||0;
  if (!key || top<=0) return ()=>{};
  let interrupted=false;
  const restore=()=>{
    if (interrupted) return;
    const current=document.querySelector('[data-player-sheet]');
    if (!current || current.dataset.irgunPlayerKey!==key) return;
    if (current.scrollTop<top-2) current.scrollTop=top;
    if (current.scrollLeft!==left) current.scrollLeft=left;
  };
  const interrupt=()=>{interrupted=true;};
  // No further touch should be overridden by an old speed selection.
  for(const name of ['touchstart','pointerdown','wheel'])
    document.addEventListener?.(name,interrupt,{passive:true});
  const tasks=[0,120,300,520].map(ms=>schedule(restore,ms));
  schedule(()=>{
    for(const name of ['touchstart','pointerdown','wheel'])
      document.removeEventListener?.(name,interrupt);
    for(const id of tasks) cancel(id);
  },600);
  return restore;
}

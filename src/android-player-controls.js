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

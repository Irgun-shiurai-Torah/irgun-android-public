// Android-only native Media3 video adapter. No WebView video fallback.
// No WebView <video>, HLS.js, or second audio output is created by this module.
// Native Audio/Video are two track presentations of ONE ExoPlayer MediaItem.
import {registerPlugin} from '@capacitor/core';
import {getAndroidHlsSource} from './android-media-source.js';

const native = registerPlugin('IrgunNativeVideo');
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
export async function createNativeMedia3VideoPlayer({apiBase,videoId,iframe,
  resumeSeconds=0,title='Shiur',speaker='',image='',audioUrl='',speed=1,
  onError=()=>{}}={}) {
  if (!iframe || !videoId) throw new Error('Native Media3 Video requires a real lecture and host');
  const source = await getAndroidHlsSource(String(apiBase).replace(/\/$/,''),String(videoId));
  if (!source?.hls && !source?.mp4) throw new Error('Media3 source lookup returned no video URL');
  const callbacks = new Map();
  const on = (name,cb)=>{
    if(!callbacks.has(name))callbacks.set(name,new Set());
    callbacks.get(name).add(cb);return adapter;
  };
  const emit=(name,data)=>{for(const cb of callbacks.get(name)||[])try{cb(data);}catch(error){console.warn('[Media3] observer callback failed',error);}};
  const placeholder=iframe;
  // Remove the Vimeo network player entirely while the native surface is used.
  // Keep the physical iframe rectangle so Android can position PlayerView.
  placeholder.src='about:blank';
  placeholder.style.visibility='hidden';
  let destroyed=false,mode='video',last=null,lastPlaying=false;
  let ticking=false,layoutRequested=false,observedFrame=null;
  let framePlacedOnScreen=false;
  const viewportFrame=()=>{
    // Query ALL matching nodes: during Audio -> Video the old persistent
    // iframe can still be connected while transformed 12,000px off-screen.
    // document.getElementById() or placeholder.isConnected alone is unsafe.
    return [...document.querySelectorAll('#watchVimeoFrame')].find(element=>{
      const r=element.getBoundingClientRect();
      return r.width>40&&r.height>40&&r.right>0&&r.bottom>0&&
        r.left<innerWidth&&r.top<innerHeight;
    })||null;
  };
  const cleanups=[];
  const positionFrame=async()=>{
    if(destroyed || mode!=='video')return;
    const nativeBounds={viewportWidth:innerWidth,viewportHeight:innerHeight,
      mini:document.body.classList.contains('irgun-watch-mini-hosted')};
    if(nativeBounds.mini){
      const button=document.querySelector('#persistentVideoMount [data-mini-video-play-toggle]');
      const r=button?.getBoundingClientRect();
      if(r&&r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight)
        nativeBounds.miniPlay={x:r.x,y:r.y,width:r.width,height:r.height};
    }
    if(document.querySelector('.playlist-picker-backdrop')||document.querySelector('[data-native-video-error]')){
      // Hide the native view without stopping the SAME Media3 playback clock.
      framePlacedOnScreen=false;
      await native.frame({width:0,height:0,...nativeBounds});
      return;
    }
    const host=document.getElementById('persistentVideoMount');
    if(host?.classList.contains('watch-audio-parked') &&
       document.querySelector('.media-switch [data-watch-mode="video"].active')){
      // Previous iframe parking is for Vimeo/WebView, not native PlayerView.
      // The emulator showed frames increasing with frame.x=-12000 after a
      // real Audio -> Video tap. Restore the visible host BEFORE measuring it.
      host.classList.remove('watch-audio-parked');
      host.classList.add('watch-full-host');
      document.body.classList.remove('irgun-watch-mini-hosted');
    }
    const current=viewportFrame();
    if(!current){
      // Never place a native surface beyond the actual Android viewport:
      // a playing ExoPlayer with an offscreen PlayerView is BLACK video.
      framePlacedOnScreen=false;
      await native.frame({width:0,height:0,...nativeBounds});
      return;
    }
    const rect=current.getBoundingClientRect();
    const scroll=current.closest?.('.watch-scroll')?.getBoundingClientRect();
    const left=Math.max(0,rect.left,scroll?.left??0),top=Math.max(0,rect.top,scroll?.top??0);
    const right=Math.min(innerWidth,rect.right,scroll?.right??innerWidth);
    const bottom=Math.min(innerHeight,rect.bottom,scroll?.bottom??innerHeight);
    if(right<=left||bottom<=top){
      framePlacedOnScreen=false;
      await native.frame({width:0,height:0,...nativeBounds});return;
    }
    // Keep the original video size; clip only the part covered by the scroll
    // viewport. Resizing the decoder view would change the picture's framing.
    nativeBounds.clip={left:left-rect.left,top:top-rect.top,
      right:right-rect.left,bottom:bottom-rect.top};
    try{
      await native.frame({x:rect.x,y:rect.y,width:rect.width,height:rect.height,
        ...nativeBounds});
      framePlacedOnScreen=true;
    }catch(error){
      framePlacedOnScreen=false;
      if(!destroyed)console.warn('[Media3] unable to position visible native frame',error);
    }
  };
  const scheduleFrame=()=>{
    if(layoutRequested||destroyed)return;
    layoutRequested=true;
    requestAnimationFrame(()=>{layoutRequested=false;void positionFrame();});
  };
  const trackFrame=()=>{
    const current=viewportFrame()||document.getElementById('watchVimeoFrame');
    if(current!==observedFrame){
      observer.disconnect();observedFrame=current;
      if(current)observer.observe(current);
    }
    scheduleFrame();
  };
  const observer=new ResizeObserver(scheduleFrame);
  for(const event of ['resize','scroll']){
    window.addEventListener(event,trackFrame,true);
    cleanups.push(()=>window.removeEventListener(event,trackFrame,true));
  }
  const refresh=async()=>{last=await native.snapshot();return last;};
  const tick=async()=>{
    if(destroyed||ticking)return;
    ticking=true;
    try{
      const s=await refresh();
      if(!s.active)return;
      // A native root can resize/rotate after the WebView has laid out. The
      // DOM placeholder may look visible while Android's REAL PlayerView is
      // still offscreen. Keep remeasuring until native visibility recovers.
      if(mode==='video'&&s.videoSelected&&
          (!framePlacedOnScreen||!s.surfaceVisibleOnScreen))scheduleFrame();
      const playing=s.videoSelected && s.playing;
      if(playing!==lastPlaying){lastPlaying=playing;emit(playing?'play':'pause',{seconds:s.positionMs/1000,duration:s.durationMs/1000});}
      emit('timeupdate',{seconds:s.positionMs/1000,duration:s.durationMs/1000,frames:s.frames});
      if(s.error)onError(new Error('Native Media3 '+s.error),s.positionMs/1000,s.playWhenReady,adapter);
      if(mode==='video'&&!s.videoSelected){
        // Android Home was pressed; its media service switched to audio-only
        // using this same HLS MediaItem, so remove the picture surface.
        native.frame({width:0,height:0,viewportWidth:innerWidth,viewportHeight:innerHeight}).catch(()=>{});
      }
    }catch(error){if(!destroyed)console.warn('[Media3] state observation failed',error);}
    finally{ticking=false;}
  };
  const timer=setInterval(()=>{void tick();},500);
  const adapter={
    isIrgunNativeVideoPlayer:true,
    on,
    getCurrentTime:async()=>((await refresh()).positionMs||0)/1000,
    getDuration:async()=>((await refresh()).durationMs||0)/1000,
    getPaused:async()=>!(await refresh()).playing,
    getSourceType:()=>last?.sourceType||'hls',
    getVideoElement:()=>null,
    setCurrentTime:async seconds=>{
      await native.playback({operation:'seek',positionMs:Math.max(0,Math.round(Number(seconds||0)*1000))});
      return seconds;
    },
    setPlaybackRate:async rate=>{
      await native.playback({operation:'speed',speed:rate});return rate;
    },
    setMuted:async()=>false, // Do not silence this same native Audio engine during a handoff.
    setVolume:async volume=>{await native.playback({operation:'volume',volume});return volume;},
    play:async()=>native.playback({operation:'play'}),
    pause:async()=>native.playback({operation:'pause'}),
    setMode:async (next, options={})=>{
      if(!['audio','video'].includes(next))throw new Error('Invalid Media3 mode');
      // The downloaded local MP3 may replace HLS only in AUDIO, using the same
      // native ExoPlayer and validated private file path. VIDEO reopens its
      // original HLS/MP4 source at the shared live clock.
      await native.mode({mode:next,offlineUri:next==='audio'?String(options.offlineUri||''):''});
      mode=next;
      if(next==='video'){framePlacedOnScreen=false;trackFrame();await positionFrame();}
      else framePlacedOnScreen=false;
      return next;
    },
    updateFrame:trackFrame,
    refresh,
    ready:async()=>{
      for(let i=0;i<90&&!destroyed;i++){
        const s=await refresh();
        // A moving decoder is mandatory. Media3 READY alone is not enough.
        if(s.active&&s.videoSelected&&s.firstFrame&&s.frames>=2&&s.width>0)return true;
        if(s.error)throw new Error('Native Media3 video error: '+s.error);
        await delay(300);
      }
      throw new Error('Native Media3 did not render actual frames');
    },
    destroy:async()=>{
      if(destroyed)return;
      destroyed=true;clearInterval(timer);observer.disconnect();
      cleanups.forEach(fn=>fn());
      // Closing Audio view retains the same native playback session.
      await native.close({keepAudio:mode==='audio'});
      if(placeholder.isConnected)placeholder.style.visibility='';
    }
  };
  await native.start({lectureId:String(videoId),title,speaker,image,audioUrl,
    hlsUrl:String(source.hls||''),mp4Url:String(source.mp4||''),
    positionMs:Math.max(0,Math.round(Number(resumeSeconds||0)*1000)),
    speed:Number(speed)||1,playing:true});
  trackFrame();
  await positionFrame();
  void tick();
  return adapter;
}

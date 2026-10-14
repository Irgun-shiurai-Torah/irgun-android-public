import {vimeoEmbedSource} from './vimeoEmbed.js';

// Only an explicit catalog declaration may choose Vimeo on Android. An HLS
// connection/decoder error must never silently replace the native player.
export function isAndroidVimeoOnlyVideo(video) {
  return video?.hasDriveVideo===false && video?.sourceType!=='drive-library'
    && /^\d+(?::[a-z0-9]+)?$/i.test(String(video?.vimeoId||video?.id||''));
}

export async function createAndroidVimeoPlayer({video,iframe,resumeSeconds=0,
  nativeVideo,playback,loadSdk,isCurrent=()=>true,
  wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  if(!isAndroidVimeoOnlyVideo(video))throw new Error('Vimeo requires an explicitly Vimeo-only lecture');
  if(!iframe||!isCurrent())return null;
  await nativeVideo.close({keepAudio:false});
  if(!isCurrent())return null;
  await playback.stopAudio({clearLecture:true});
  // Native bridge commands are queued. Wait for actual silence before the
  // Vimeo iframe can autoplay, rather than assuming command acceptance stops it.
  let silent=false;
  for(let i=0;i<20&&isCurrent();i++){
    const state=await playback.getState();
    if(state?.isPlaying===false&&state.audioIsPlaying===false&&state.audioPlayWhenReady===false){
      silent=true;break;
    }
    await wait(100);
  }
  if(!isCurrent())return null;
  if(!silent)throw new Error('Previous playback did not stop before opening Vimeo');
  const sdk=await loadSdk();
  if(!isCurrent())return null;
  if(!sdk?.Player)throw new Error('Vimeo player could not load');
  iframe.style.visibility='';iframe.style.display='';
  iframe.src=vimeoEmbedSource(video.vimeoId||video.id,{resumeSeconds});
  const player=new sdk.Player(iframe);
  player.isAndroidVimeoFallback=true;
  return player;
}

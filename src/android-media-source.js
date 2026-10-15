// Network source descriptor lookup shared by native Android Media3 only.
// This file has no WebView video decoder or hls.js dependency.
export async function getAndroidHlsSource(apiBase, videoId, {
  wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  isOnline=()=>typeof navigator==='undefined'||navigator.onLine!==false,
  now=Date.now
}={}) {
  const lookup = async retry => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const suffix = retry ? `?retry=${Date.now()}` : '';
      const response = await fetch(`${apiBase}/media/${encodeURIComponent(videoId)}/source.json${suffix}`, {cache:'no-store', signal:controller.signal});
      if (!response.ok) throw new Error(`Video sources unavailable (${response.status})`);
      const data = await response.json();
      if (!data?.video?.hls && !data?.video?.mp4) {
        const error=new Error('No HLS or MP4 source is ready');
        error.code='VIDEO_NOT_READY';
        throw error;
      }
      return {hls:data.video.hls || null, mp4:data.video.mp4 || null};
    } finally {
      clearTimeout(timer);
    }
  };
  // New shiurim may have an MP4 before their HLS backup is ready. Either
  // source is playable. An emulator's first source.json request sometimes
  // times out even when the Worker/HLS media is healthy; falling back directly
  // to Vimeo turns a temporary connection failure into a black player.
  // Wi-Fi's enable command and WebView connectivity can arrive at different
  // times after an offline restart. Keep existing Audio playing while only
  // the descriptor read waits/retries; no player has been prepared yet.
  for(let attempt=0;attempt<3;attempt++) try {
    return await lookup(attempt>0);
  } catch (error) {
    const message = String(error?.message || '');
    const retryable = error?.name === 'AbortError' ||
      error?.name === 'TimeoutError' ||
      error instanceof TypeError ||
      /Video sources unavailable \((?:429|5\d\d)\)/.test(message);
    if (!retryable || attempt===2) throw error;
    const onlineDeadline=now()+8000;
    while(!isOnline()&&now()<onlineDeadline)await wait(200);
    if(!isOnline())throw error;
    console.warn('[Playback] Retrying temporary video source lookup failure',message);
    // Wi-Fi often needs longer than 350ms to recover after offline Audio.
    // Retry only the source descriptor; never build a second player here.
    await wait((attempt+1)*1100);
  }
}


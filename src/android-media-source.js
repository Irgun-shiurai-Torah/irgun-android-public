// Network source descriptor lookup shared by native Android Media3 only.
// This file has no WebView video decoder or hls.js dependency.
export async function getAndroidHlsSource(apiBase, videoId) {
  const lookup = async retry => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const suffix = retry ? `?retry=${Date.now()}` : '';
      const response = await fetch(`${apiBase}/media/${encodeURIComponent(videoId)}/source.json${suffix}`, {cache:'no-store', signal:controller.signal});
      if (!response.ok) throw new Error(`Video sources unavailable (${response.status})`);
      const data = await response.json();
      if (!data?.video?.hls && !data?.video?.mp4) throw new Error('No HLS or MP4 source is ready');
      return {hls:data.video.hls || null, mp4:data.video.mp4 || null};
    } finally {
      clearTimeout(timer);
    }
  };
  // New shiurim may have an MP4 before their HLS backup is ready. Either
  // source is playable. An emulator's first source.json request sometimes
  // times out even when the Worker/HLS media is healthy; falling back directly
  // to Vimeo turns a temporary connection failure into a black player.
  // Retry the descriptor once, before creating a media element, so users see
  // one prepared video instead of several repeated playback starts.
  try {
    return await lookup(false);
  } catch (error) {
    const message = String(error?.message || '');
    const retryable = error?.name === 'AbortError' ||
      error?.name === 'TimeoutError' ||
      error instanceof TypeError ||
      /Video sources unavailable \((?:429|5\d\d)\)/.test(message);
    if (!retryable || (typeof navigator !== 'undefined' && navigator.onLine === false)) throw error;
    console.warn('[Playback] Retrying temporary video source lookup failure',message);
    // Wi-Fi often needs longer than 350ms to recover after offline Audio.
    // Retry only the source descriptor; never build a second player here.
    await new Promise(resolve => setTimeout(resolve,1100));
    return lookup(true);
  }
}


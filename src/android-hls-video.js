const hlsLibraryPromises = new Map();

function loadHls(apiBase) {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsLibraryPromises.has(apiBase)) return hlsLibraryPromises.get(apiBase);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${apiBase}/media-player/hls.js`;
    script.async = true;
    const timer = setTimeout(() => {
      script.remove();
      hlsLibraryPromises.delete(apiBase);
      reject(new Error('HLS player library timed out'));
    }, 12000);
    script.onload = () => {
      clearTimeout(timer);
      window.Hls ? resolve(window.Hls) : reject(new Error('HLS player library unavailable'));
    };
    script.onerror = () => {
      clearTimeout(timer);
      hlsLibraryPromises.delete(apiBase);
      reject(new Error('HLS player library failed to load'));
    };
    document.head.appendChild(script);
  });
  hlsLibraryPromises.set(apiBase, promise);
  return promise;
}

function makePlayerAdapter(video, getHls, readyPromise) {
  const listeners = new Map();
  const emit = (name, data) => {
    for (const callback of listeners.get(name) || []) {
      try { callback(data); } catch (error) { console.warn('HLS player listener failed', error); }
    }
  };
  const data = () => ({ seconds:Math.max(0, Number(video.currentTime) || 0), duration:Number(video.duration) || 0 });
  video.addEventListener('timeupdate', () => emit('timeupdate', data()));
  video.addEventListener('play', () => emit('play', data()));
  video.addEventListener('pause', () => { if (!video.ended) emit('pause', data()); });
  video.addEventListener('ended', () => emit('ended', data()));
  video.addEventListener('webkitbeginfullscreen', () => emit('fullscreenchange', {fullscreen:true}));
  video.addEventListener('webkitendfullscreen', () => emit('fullscreenchange', {fullscreen:false}));
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === video) emit('fullscreenchange', {fullscreen:true});
    else emit('fullscreenchange', {fullscreen:false});
  });
  const adapter = {
    isIrgunHlsPlayer:true,
    on(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
      return adapter;
    },
    ready:() => readyPromise,
    getCurrentTime:() => Promise.resolve(Math.max(0, Number(video.currentTime) || 0)),
    getDuration:() => Promise.resolve(Number(video.duration) || 0),
    getPaused:() => Promise.resolve(video.paused),
    setCurrentTime:seconds => {
      const duration = Number(video.duration) || 0;
      const target = Math.max(0, Number(seconds) || 0);
      video.currentTime = duration ? Math.min(target, Math.max(0, duration - .25)) : target;
      return Promise.resolve(video.currentTime);
    },
    setPlaybackRate:rate => { video.playbackRate = Number(rate) || 1; return Promise.resolve(video.playbackRate); },
    setMuted:muted => { video.muted = Boolean(muted); return Promise.resolve(video.muted); },
    setVolume:volume => { video.volume = Math.max(0, Math.min(1, Number(volume) || 0)); return Promise.resolve(video.volume); },
    play:() => video.play(),
    pause:() => { video.pause(); return Promise.resolve(); },
    destroy:() => {
      try { getHls()?.destroy(); } catch (_) {}
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
      return Promise.resolve();
    }
  };
  adapter.reportError = (error, position, autoplay) => emit('error', {error, position, autoplay});
  return adapter;
}

async function getAndroidHlsSource(apiBase, videoId) {
  const routingResponse = await fetch(`${apiBase}/playback-routing`, {cache:'no-store', credentials:'omit'});
  if (!routingResponse.ok) throw new Error(`Playback routing returned ${routingResponse.status}`);
  const routing = await routingResponse.json();
  if (String(routing?.videoMode || '').toLowerCase() === 'vimeo') return null;

  const sourceResponse = await fetch(`${apiBase}/media/${encodeURIComponent(videoId)}/source.json`, {cache:'no-store', credentials:'omit'});
  if (!sourceResponse.ok) return null;
  const source = await sourceResponse.json();
  const video = source?.video || {};
  if (!video.hls && !video.mp4) return null;
  return video;
}

export async function createAndroidHlsPlayer({ apiBase, platform, videoId, iframe, resumeSeconds = 0, onError } = {}) {
  if (!apiBase || !videoId || !iframe || platform !== 'android') return null;
  const sources = await getAndroidHlsSource(String(apiBase).replace(/\/$/, ''), videoId);
  if (!sources) return null;

  const container = iframe.parentElement;
  if (!container) return null;
  const video = document.createElement('video');
  video.id = 'watchDirectHlsVideo';
  video.className = 'watch-frame watch-direct-hls-video';
  video.controls = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('aria-label', 'Shiur video');
  container.insertBefore(video, iframe.nextSibling);
  iframe.style.display = 'none';

  let hls = null;
  let activeSource = '';
  let failed = false;
  const initialPosition = Math.max(0, Number(resumeSeconds) || 0);
  const attachSource = async (url, useHls) => {
    if (!url) throw new Error('No direct video source');
    if (hls) { try { hls.destroy(); } catch (_) {} hls = null; }
    video.pause();
    video.removeAttribute('src');
    video.load();
    activeSource = url;
    if (!useHls) {
      video.src = url;
      video.load();
    } else {
      const Hls = await loadHls(String(apiBase).replace(/\/$/, ''));
      if (!Hls.isSupported?.()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
          video.load();
        } else throw new Error('HLS playback is unsupported on this device');
      } else {
        hls = new Hls({
          enableWorker:true,
          lowLatencyMode:false,
          backBufferLength:60,
          maxBufferLength:30,
          maxMaxBufferLength:60,
          startPosition:initialPosition,
          capLevelToPlayerSize:true
        });
        hls.attachMedia(video);
        hls.loadSource(url);
        await new Promise((resolve, reject) => {
          let finished = false;
          const timer = setTimeout(() => finish(new Error('HLS playlist timed out')), 15000);
          const finish = error => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            error ? reject(error) : resolve();
          };
          hls.on(Hls.Events.MANIFEST_PARSED, () => finish());
          hls.on(Hls.Events.ERROR, (_event, info) => {
            if (!info?.fatal) return;
            if (!finished) finish(new Error(`HLS playback failed: ${info.details || 'fatal error'}`));
            else if (activeSource === url) {
              void recoverFromHlsFailure(info, Hls);
            }
          });
        });
      }
    }
    await new Promise((resolve, reject) => {
      if (video.readyState >= 1) return resolve();
      const timer = setTimeout(() => { cleanup(); reject(new Error('Video metadata timed out')); }, 12000);
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', ready);
        video.removeEventListener('error', error);
      };
      const ready = () => { cleanup(); resolve(); };
      const error = () => { cleanup(); reject(new Error('Video metadata failed to load')); };
      video.addEventListener('loadedmetadata', ready, {once:true});
      video.addEventListener('error', error, {once:true});
    });
    const duration = Number(video.duration) || 0;
    if (initialPosition > 0) video.currentTime = duration ? Math.min(initialPosition, Math.max(0, duration - .25)) : initialPosition;
  };

  const recoverFromHlsFailure = async (info, Hls) => {
    if (failed || activeSource !== sources.hls) return;
    failed = true;
    const position = Math.max(0, Number(video.currentTime) || initialPosition);
    const shouldPlay = !video.paused;
    if (sources.mp4) {
      try {
        if (hls) { hls.destroy(); hls = null; }
        video.removeAttribute('src');
        video.load();
        video.src = sources.mp4;
        activeSource = sources.mp4;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => { cleanup(); reject(new Error('MP4 fallback timed out')); }, 12000);
          const cleanup = () => { clearTimeout(timer); video.removeEventListener('loadedmetadata', ready); video.removeEventListener('error', error); };
          const ready = () => { cleanup(); resolve(); };
          const error = () => { cleanup(); reject(new Error('MP4 fallback failed')); };
          video.addEventListener('loadedmetadata', ready, {once:true});
          video.addEventListener('error', error, {once:true});
          video.load();
        });
        if (Number(video.duration) > 0) video.currentTime = Math.min(position, Math.max(0, Number(video.duration) - .25));
        if (shouldPlay) await video.play().catch(() => {});
        return;
      } catch (error) {
        adapter.reportError(error, position, shouldPlay);
      }
    } else {
      adapter.reportError(new Error(`HLS playback failed: ${info?.details || 'fatal error'}`), position, shouldPlay);
    }
  };

  const readyPromise = (async () => {
    try {
      if (sources.hls) {
        try { await attachSource(sources.hls, true); }
        catch (hlsError) {
          if (!sources.mp4) throw hlsError;
          await attachSource(sources.mp4, false);
        }
      } else await attachSource(sources.mp4, false);
      return true;
    } catch (error) {
      video.remove();
      iframe.style.display = '';
      throw error;
    }
  })();
  const adapter = makePlayerAdapter(video, () => hls, readyPromise);
  // Keep the adapter's reference to the HLS instance current after attachment and recovery.
  adapter.destroy = () => { try { hls?.destroy(); } catch (_) {} video.pause(); video.removeAttribute('src'); video.load(); video.remove(); return Promise.resolve(); };
  adapter.on('error', detail => onError?.(detail?.error, detail?.position, detail?.autoplay));
  adapter.getSourceType = () => activeSource === sources.hls ? 'hls' : 'mp4';
  adapter.getVideoElement = () => video;
  return adapter;
}

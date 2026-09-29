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

function makePlayerAdapter(video, stage, getHls, readyPromise) {
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
    if (document.fullscreenElement === stage) emit('fullscreenchange', {fullscreen:true});
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
    setPlaybackRate:rate => { video.playbackRate = Number(rate) || 1; const select = stage.querySelector('[data-hls-speed]'); if (select) select.value = String(video.playbackRate); return Promise.resolve(video.playbackRate); },
    setMuted:muted => { video.muted = Boolean(muted); return Promise.resolve(video.muted); },
    setVolume:volume => { video.volume = Math.max(0, Math.min(1, Number(volume) || 0)); return Promise.resolve(video.volume); },
    play:() => readyPromise.then(() => video.play()),
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
  // This is the Worker’s public HLS endpoint. There is no /source.json route.
  return {
    hls: `${apiBase}/media/${encodeURIComponent(videoId)}/master.m3u8`,
    mp4: null
  };
}

export async function createAndroidHlsPlayer({ apiBase, platform, videoId, iframe, resumeSeconds = 0, onError } = {}) {
  if (!apiBase || !videoId || !iframe || platform !== 'android') return null;
  const sources = await getAndroidHlsSource(String(apiBase).replace(/\/$/, ''), videoId);
  if (!sources) return null;

  const container = iframe.parentElement;
  if (!container) return null;
  const stage = document.createElement('div');
  stage.className = 'watch-hls-stage';
  container.insertBefore(stage, iframe.nextSibling);
  const video = document.createElement('video');
  video.id = 'watchDirectHlsVideo';
  video.className = 'watch-frame watch-direct-hls-video';
  video.controls = false;
  video.playsInline = true;
  video.preload = 'metadata';
  video.defaultPlaybackRate = 1;
  video.playbackRate = 1;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('aria-label', 'Shiur video');
  stage.appendChild(video);
  iframe.style.display = 'none';

  const controls = document.createElement('div');
  controls.className = 'watch-hls-controls';
  controls.innerHTML = '<button class="watch-hls-icon-button" data-hls-play type="button" aria-label="Play">▶</button><span class="watch-hls-time" data-hls-current>0:00</span><input class="watch-hls-seek" data-hls-seek type="range" min="0" max="1000" value="0" aria-label="Seek"><span class="watch-hls-time" data-hls-duration>0:00</span><button class="watch-hls-icon-button" data-hls-mute type="button" aria-label="Mute">🔊</button><input class="watch-hls-volume" data-hls-volume type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"><select class="watch-hls-select" data-hls-speed aria-label="Playback speed"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2×</option></select><select class="watch-hls-select" data-hls-quality aria-label="Video quality" hidden><option value="-1">Auto</option></select><button class="watch-hls-icon-button" data-hls-pip type="button" aria-label="Picture in Picture" title="Picture in Picture">PiP</button><button class="watch-hls-icon-button" data-hls-fullscreen type="button" aria-label="Fullscreen" title="Fullscreen">⛶</button>';
  stage.appendChild(controls);
  const playButton = controls.querySelector('[data-hls-play]');
  const currentLabel = controls.querySelector('[data-hls-current]');
  const durationLabel = controls.querySelector('[data-hls-duration]');
  const seekControl = controls.querySelector('[data-hls-seek]');
  const muteButton = controls.querySelector('[data-hls-mute]');
  const volumeControl = controls.querySelector('[data-hls-volume]');
  const speedSelect = controls.querySelector('[data-hls-speed]');
  const qualitySelect = controls.querySelector('[data-hls-quality]');
  const pipButton = controls.querySelector('[data-hls-pip]');
  const fullscreenButton = controls.querySelector('[data-hls-fullscreen]');
  const loading = document.createElement('div');
  loading.className = 'watch-hls-loading';
  loading.innerHTML = '<span class="watch-hls-spinner"></span><span>Loading video…</span>';
  stage.appendChild(loading);
  const formatTime = value => {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const remainder = seconds % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
  };
  const updateTimeline = () => {
    const duration = Number(video.duration) || 0;
    const current = Number(video.currentTime) || 0;
    currentLabel.textContent = formatTime(current);
    durationLabel.textContent = formatTime(duration);
    seekControl.value = duration ? String(Math.round(current / duration * 1000)) : '0';
  };
  const updatePlayIcon = () => {
    const playing = !video.paused && !video.ended;
    playButton.textContent = playing ? 'Ⅱ' : '▶';
    playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  };
  const updateVolumeIcon = () => {
    const muted = video.muted || video.volume === 0;
    muteButton.textContent = muted ? '×' : '🔊';
    muteButton.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    volumeControl.value = String(video.volume);
  };
  video.addEventListener('timeupdate', updateTimeline);
  video.addEventListener('durationchange', updateTimeline);
  video.addEventListener('play', () => { updatePlayIcon(); loading.hidden = true; });
  video.addEventListener('pause', updatePlayIcon);
  video.addEventListener('waiting', () => { if (!video.paused) loading.hidden = false; });
  video.addEventListener('playing', () => { loading.hidden = true; });
  video.addEventListener('canplay', () => { loading.hidden = true; });
  video.addEventListener('volumechange', updateVolumeIcon);
  playButton.addEventListener('click', () => video.paused ? video.play().catch(() => {}) : video.pause());
  video.addEventListener('click', () => video.paused ? video.play().catch(() => {}) : video.pause());
  seekControl.addEventListener('input', () => {
    const duration = Number(video.duration) || 0;
    currentLabel.textContent = formatTime(duration * Number(seekControl.value) / 1000);
  });
  seekControl.addEventListener('change', () => {
    const duration = Number(video.duration) || 0;
    if (duration) video.currentTime = duration * Number(seekControl.value) / 1000;
  });
  muteButton.addEventListener('click', () => { video.muted = !video.muted; });
  volumeControl.addEventListener('input', () => {
    video.volume = Number(volumeControl.value);
    if (video.volume > 0) video.muted = false;
  });
  speedSelect.addEventListener('change', () => { video.playbackRate = Number(speedSelect.value) || 1; });
  pipButton.hidden = !(document.pictureInPictureEnabled && video.requestPictureInPicture);
  pipButton.addEventListener('click', () => video.requestPictureInPicture?.().catch(() => {}));
  fullscreenButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement === stage) await document.exitFullscreen();
      else await stage.requestFullscreen();
    } catch (_) {
      try { video.webkitEnterFullscreen?.(); } catch (_) {}
    }
  });

  qualitySelect.addEventListener('change', () => {
    if (hls) hls.currentLevel = Number(qualitySelect.value);
  });
  const updateQualityOptions = () => {
    if (!hls) return;
    qualitySelect.replaceChildren(new Option('Auto', '-1'));
    for (const [index, level] of hls.levels.entries()) {
      qualitySelect.add(new Option(level.height ? `${level.height}p` : `Quality ${index + 1}`, String(index)));
    }
    qualitySelect.hidden = hls.levels.length <= 1;
    qualitySelect.value = '-1';
  };

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
          hls.on(Hls.Events.MANIFEST_PARSED, () => { updateQualityOptions(); finish(); });
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
      stage.remove();
      iframe.style.display = '';
      throw error;
    }
  })();
  const adapter = makePlayerAdapter(video, stage, () => hls, readyPromise);
  // Keep the adapter's reference to the HLS instance current after attachment and recovery.
  adapter.destroy = () => { try { hls?.destroy(); } catch (_) {} video.pause(); video.removeAttribute('src'); video.load(); stage.remove(); iframe.style.display = ''; return Promise.resolve(); };
  adapter.on('error', detail => onError?.(detail?.error, detail?.position, detail?.autoplay));
  adapter.getSourceType = () => activeSource === sources.hls ? 'hls' : 'mp4';
  adapter.getVideoElement = () => video;
  return adapter;
}

import {bufferedVideoSecondsAhead, waitForInitialVideoBuffer, firstBufferedStartupFrame} from './android-video-startup-buffer.js';
const hlsLibraryPromises = new Map();

function loadHls(apiBase) {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsLibraryPromises.has(apiBase)) return hlsLibraryPromises.get(apiBase);
  // Ship the decoder SDK (including its inline worker) with the APK. Starting
  // a supported HLS lecture must not depend on another remote script request.
  const promise = import('hls.js/dist/hls.min.js').then(module => {
    const Hls = module.default || window.Hls;
    if (typeof Hls?.isSupported !== 'function') throw new Error('Bundled HLS player library unavailable');
    return Hls;
  }).catch(error => {
    hlsLibraryPromises.delete(apiBase);
    throw error;
  });
  hlsLibraryPromises.set(apiBase, promise);
  return promise;
}

function makePlayerAdapter(video, stage, getHls, readyPromise) {
  const listeners = new Map();
  let stalledHandoffRetargets = 0;
  const emit = (name, data) => {
    if (video.dataset.startupBufferPhase === 'priming' && ['play','pause','timeupdate','ended'].includes(name)) return;
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
    // HLS.js can remain pinned to a decoded keyframe after a high-speed
    // Audio -> Video catch-up. Retarget the missing fragment ONCE; do not
    // replace the media element, replay from 0:00, or turn off native Audio.
    retargetStalledHandoff:seconds => {
      const hls = getHls();
      const target = Number(seconds);
      if (!hls || stalledHandoffRetargets >= 1 || video.paused ||
          !Number.isFinite(target) || target <= 0 ||
          Math.abs(target - (Number(video.currentTime) || 0)) < 0.6 ||
          typeof hls.stopLoad !== 'function' || typeof hls.startLoad !== 'function') return Promise.resolve(false);
      try {
        video.currentTime = Math.min(target, Number.isFinite(video.duration) && video.duration > 0
          ? Math.max(0, video.duration - .25) : target);
        hls.stopLoad();
        hls.startLoad(video.currentTime);
        stalledHandoffRetargets++;
        video.dataset.hlsHandoffRetargetAt = String(video.currentTime);
        console.warn('[Playback] Retargeting stalled HLS handoff without restarting native Audio',video.currentTime);
        return Promise.resolve(true);
      } catch (error) {
        console.warn('[Playback] Unable to retarget stalled HLS handoff',error);
        return Promise.resolve(false);
      }
    },
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
      stage.remove();
      container.classList.remove('watch-hls-active');
      iframe.style.removeProperty('display');
      return Promise.resolve();
    }
  };
  adapter.reportError = (error, position, autoplay) => emit('error', {error, position, autoplay});
  return adapter;
}

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

export async function createAndroidHlsPlayer({ apiBase, platform, videoId, iframe, poster = '', resumeSeconds = 0, onError, onMinimize, onSpeedChange, isPictureInPicture = () => false } = {}) {
  if (!apiBase || !videoId || !iframe || platform !== 'android') return null;
  const sources = await getAndroidHlsSource(String(apiBase).replace(/\/$/, ''), videoId);
  if (!sources) return null;

  const container = iframe.parentElement;
  if (!container) return null;
  const stage = document.createElement('div');
  stage.className = 'watch-hls-stage';
  // Keep the iframe available for Vimeo fallback and watch-host queries, but put
  // it inside the HLS stage. It can no longer reserve a second 16:9 row even if
  // Android WebView reapplies a display:block rule during a layout reset.
  container.insertBefore(stage, iframe);
  stage.appendChild(iframe);
  container.classList.add('watch-hls-active');
  iframe.style.setProperty('visibility', 'hidden', 'important');
  const restoreIframe = () => {
    if (stage.parentElement) stage.replaceWith(iframe);
    container.classList.remove('watch-hls-active');
    iframe.style.removeProperty('display');
    iframe.style.removeProperty('visibility');
  };
  const video = document.createElement('video');
  video.id = 'watchDirectHlsVideo';
  video.className = 'watch-frame watch-direct-hls-video';
  video.controls = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.defaultPlaybackRate = 1;
  video.playbackRate = 1;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('aria-label', 'Shiur video');
  video.poster = String(poster || '/logo.png');
  stage.appendChild(video);
  iframe.style.setProperty('display', 'none', 'important');

  const controls = document.createElement('div');
  controls.className = 'watch-hls-controls';
  controls.innerHTML = '<button class="watch-hls-icon-button" data-hls-play type="button" aria-label="Play">▶</button><span class="watch-hls-time" data-hls-current>0:00</span><input class="watch-hls-seek" data-hls-seek type="range" min="0" max="1000" value="0" aria-label="Seek"><span class="watch-hls-time" data-hls-duration>0:00</span><button class="watch-hls-icon-button" data-hls-mute type="button" aria-label="Mute"></button><input class="watch-hls-volume" data-hls-volume type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"><select class="watch-hls-select" data-hls-speed aria-label="Playback speed"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2×</option></select><select class="watch-hls-select" data-hls-quality aria-label="Video quality" hidden><option value="-1">Auto</option></select><button class="watch-hls-icon-button" data-hls-pip type="button" aria-label="Picture in Picture" title="Picture in Picture">PiP</button><button class="watch-hls-icon-button" data-hls-fullscreen type="button" aria-label="Fullscreen" title="Fullscreen">⛶</button>';
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
  loading.innerHTML = '<span class="watch-hls-loading-caption"><span class="watch-hls-spinner"></span><span>Preparing video…</span></span>';
  stage.appendChild(loading);
  const seekHint = document.createElement('div');
  seekHint.className = 'watch-hls-seek-hint';
  seekHint.setAttribute('aria-live', 'polite');
  stage.appendChild(seekHint);
  let seekHintTimer = 0;
  let singleTapTimer = 0;
  let lastSideTap = null;
  let pointerStart = null;
  let seekGestureActive = false;
  let ignoreClickUntil = 0;
  let visualCheck = 0;
  let playbackIntent = 0;
  let stalledHandoffResumes = 0;
  let playbackWanted = false;
  let initialPlaybackStarted = false;
  let startupPlayTask = null;
  let startupPlayIntent = null;
  let desiredMuted = Boolean(video.muted);
  let startupPrime = null;
  let initialPlayingAt = 0;
  video.dataset.startupWaitingCount = '0';
  video.dataset.startupVisibleRebufferCount = '0';
  video.addEventListener('waiting', () => {
    if (initialPlayingAt && Date.now() - initialPlayingAt < 15000)
      video.dataset.startupWaitingCount = String(Number(video.dataset.startupWaitingCount || 0) + 1);
  });
  let qualityMotionTimer = 0;
  let cancelQualityRecovery = () => {};
  const playVideo = () => { playbackWanted = true; return video.play(); };
  const pausePlayback = () => {
    playbackWanted = false;
    ++playbackIntent;
    // Audio mode parks this video. A future deliberate Audio -> Video switch
    // receives its own one permitted HLS decoder resume.
    stalledHandoffResumes = 0;
    ++visualCheck;
    clearTimeout(qualityMotionTimer);
    cancelQualityRecovery();
    video.pause();
    if (startupPrime) { startupPrime = null; video.muted = desiredMuted; }
    return Promise.resolve();
  };
  let hasVisibleFrame = false;
  let destroyed = false;
  let recoveryInProgress = false;
  // A playing flag is not proof of moving video. Old Android WebViews can
  // exhaust buffered media after an Audio -> Video seek without emitting error.
  let lastMotionAt = Date.now();
  let previousClock = -1;
  let previousFrames = null;
  let lastStallRecoveryAt = 0;
  let stallRecoveryCount = 0;
  let stalledPlaybackWatchdog = 0;
  let fatalHlsRecoveries = 0;
  let lastHlsFailure = '';
  const decodedFrames = () => {
    const quality = video.getVideoPlaybackQuality?.();
    const count = Number(quality?.totalVideoFrames ?? video.webkitDecodedFrameCount);
    return Number.isFinite(count) ? count : null;
  };
  const waitForVideoFrame = (timeout = 12000) => new Promise(resolve => {
    const initialFrames = decodedFrames();
    if (typeof video.requestVideoFrameCallback !== 'function') {
      let finished = false;
      const finish = visible => { if (finished) return; finished = true; clearInterval(poll); clearTimeout(timer); resolve(visible); };
      const poll = setInterval(() => {
        const now = decodedFrames();
        // Audio time can advance with a frozen picture. Require two decoded
        // frames instead of accepting metadata or the first still image.
        if (video.videoWidth > 0 && initialFrames !== null && now !== null && now >= initialFrames + 2) finish(true);
      }, 180);
      const timer = setTimeout(() => finish(false), timeout);
      return;
    }
    let finished = false;
    const finish = visible => { if (finished) return; finished = true; clearTimeout(timer); resolve(visible); };
    const timer = setTimeout(() => {
      const finalFrames = decodedFrames();
      finish(video.videoWidth > 0 && initialFrames !== null && finalFrames !== null && finalFrames >= initialFrames + 2);
    }, timeout);
    let firstFrame = null;
    const onFrame = (_now, metadata) => {
      if (finished) return;
      const frameTime = Number(metadata?.mediaTime);
      if (firstFrame !== null && Number.isFinite(frameTime) && frameTime > firstFrame + .03) {
        finish(video.videoWidth > 0);
        return;
      }
      if (firstFrame === null && Number.isFinite(frameTime)) firstFrame = frameTime;
      try { video.requestVideoFrameCallback(onFrame); } catch (_) { finish(false); }
    };
    try { video.requestVideoFrameCallback(onFrame); }
    catch (_) { finish(false); }
  });
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
    // Updating the slider on every media timeupdate used to overwrite a real
    // Android drag/tap before the browser dispatched its final change event.
    if (!seekGestureActive)
      seekControl.value = duration ? String(Math.round(current / duration * 1000)) : '0';
  };
  const updatePlayIcon = () => {
    const playing = (!video.paused && !video.ended) || (playbackWanted && !initialPlaybackStarted);
    playButton.textContent = playing ? 'Ⅱ' : '▶';
    playButton.setAttribute('aria-label', window.IST_I18N?.t?.(playing ? 'Pause' : 'Play') || (playing ? 'Pause' : 'Play'));
  };
  const volumeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 4 6 8H3v8h3l5 4V4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M15 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12"/></svg>';
  const mutedIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 4 6 8H3v8h3l5 4V4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="m16 9 5 6m0-6-5 6"/></svg>';
  const updateVolumeIcon = () => {
    const muted = video.muted || video.volume === 0;
    muteButton.innerHTML = muted ? mutedIcon : volumeIcon;
    muteButton.setAttribute('aria-label', window.IST_I18N?.t?.(muted ? 'Unmute' : 'Mute') || (muted ? 'Unmute' : 'Mute'));
    volumeControl.value = String(video.volume);
  };
  // Chromium may issue a brief internal 'waiting' as it switches decoded
  // segments even with ~18s already buffered and frames continuing to advance.
  // Do not flicker the user's loading overlay for that harmless event. A real
  // frozen decoder still shows loading after 500ms, and its visible stalls
  // remain explicitly counted for the strict real-emulator regression.
  let rebufferTimer = 0;
  let waitClock = 0;
  const clearRebufferTimer = () => {
    clearTimeout(rebufferTimer);
    rebufferTimer = 0;
  };
  video.addEventListener('timeupdate', () => {
    if (rebufferTimer && video.currentTime > waitClock + .15) clearRebufferTimer();
    updateTimeline();
  });
  video.addEventListener('durationchange', updateTimeline);
  video.addEventListener('play', () => { updatePlayIcon(); if (!hasVisibleFrame) loading.hidden = false; });
  video.addEventListener('pause', () => { clearRebufferTimer(); updatePlayIcon(); });
  video.addEventListener('waiting', () => {
    if (video.paused) return;
    if (!initialPlaybackStarted || !hasVisibleFrame) { loading.hidden = false; return; }
    clearRebufferTimer();
    waitClock = Number(video.currentTime) || 0;
    rebufferTimer = setTimeout(() => {
      rebufferTimer = 0;
      if (destroyed || video.paused || video.ended) return;
      if (video.currentTime > waitClock + .15 && video.readyState >= 2) return;
      loading.hidden = false;
      if (initialPlayingAt && Date.now() - initialPlayingAt < 15000)
        video.dataset.startupVisibleRebufferCount = String(Number(video.dataset.startupVisibleRebufferCount || 0) + 1);
    },500);
  });
  video.addEventListener('playing', () => { clearRebufferTimer(); if (hasVisibleFrame) loading.hidden = true; });
  video.addEventListener('canplay', () => { clearRebufferTimer(); if (hasVisibleFrame) loading.hidden = true; });
  video.addEventListener('volumechange', updateVolumeIcon);
  updateVolumeIcon();
  const togglePlayback = () => video.paused && (initialPlaybackStarted || !playbackWanted)
    ? adapter.play().catch(() => {}) : pausePlayback();
  playButton.addEventListener('click', togglePlayback);
  video.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    pointerStart = { id:event.pointerId, x:event.clientX, y:event.clientY };
  });
  video.addEventListener('pointercancel', () => { pointerStart = null; });
  video.addEventListener('pointerup', event => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const { x, y } = pointerStart;
    pointerStart = null;
    const dx = event.clientX - x;
    const dy = event.clientY - y;
    const now = Date.now();
    ignoreClickUntil = now + 450; // The browser also emits a click after touch.
    if (dy > 75 && dy > Math.abs(dx) * 1.4 && !document.fullscreenElement && !document.body.classList.contains('irgun-system-pip')) {
      clearTimeout(singleTapTimer);
      lastSideTap = null;
      onMinimize?.();
      return;
    }
    if (Math.abs(dx) > 24 || Math.abs(dy) > 24) return;
    const bounds = video.getBoundingClientRect();
    const fraction = (x - bounds.left) / Math.max(1, bounds.width);
    const side = fraction < .38 ? 'left' : fraction > .62 ? 'right' : '';
    if (!side) { clearTimeout(singleTapTimer); lastSideTap = null; togglePlayback(); return; }
    if (lastSideTap?.side === side && now - lastSideTap.time < 330 && Math.abs(x - lastSideTap.x) < 80) {
      clearTimeout(singleTapTimer);
      lastSideTap = null;
      const change = side === 'left' ? -15 : 15;
      const duration = Number(video.duration) || 0;
      const target = Math.max(0, (Number(video.currentTime) || 0) + change);
      try { video.currentTime = duration ? Math.min(target, Math.max(0, duration - .25)) : target; } catch (_) {}
      seekHint.textContent = change < 0 ? '↶ 15 seconds' : '15 seconds ↷';
      seekHint.classList.toggle('right', side === 'right');
      seekHint.classList.add('visible');
      clearTimeout(seekHintTimer);
      seekHintTimer = setTimeout(() => seekHint.classList.remove('visible'), 700);
      return;
    }
    clearTimeout(singleTapTimer);
    lastSideTap = { side, x, time:now };
    singleTapTimer = setTimeout(() => { lastSideTap = null; if (!destroyed) togglePlayback(); }, 330);
  });
  video.addEventListener('click', event => {
    if (Date.now() < ignoreClickUntil) { event.preventDefault(); return; }
    togglePlayback();
  });
  const commitSeek = (position, origin) => {
    const duration = Number(video.duration) || 0;
    if (!duration || !Number.isFinite(position)) return;
    const target = Math.max(0, Math.min(position, Math.max(0, duration - .25)));
    // One actual seek per completed physical gesture. Pointer delivery is
    // reliable on WebView versions which emit input but not change on a tap.
    if (Math.abs((Number(video.currentTime) || 0) - target) > 0.25)
      video.currentTime = target;
    seekControl.value = String(Math.round(target / duration * 1000));
    currentLabel.textContent = formatTime(target);
    video.dataset.hlsSeekRequestedSeconds = String(target);
    video.dataset.hlsSeekOrigin = origin;
  };
  seekControl.addEventListener('pointerdown', () => { seekGestureActive = true; });
  seekControl.addEventListener('pointercancel', () => {
    seekGestureActive = false;
    updateTimeline();
  });
  seekControl.addEventListener('pointerup', event => {
    if (!seekGestureActive) return;
    seekGestureActive = false;
    const box = seekControl.getBoundingClientRect();
    if (!(box.width > 16) || !Number.isFinite(event.clientX)) return;
    const x = Math.max(0, Math.min(1, (event.clientX - box.left - 8) / (box.width - 16)));
    const rtl = typeof getComputedStyle === 'function' && getComputedStyle(seekControl).direction === 'rtl';
    const fraction = rtl ? 1 - x : x;
    commitSeek((Number(video.duration) || 0) * fraction, 'pointer');
  });
  seekControl.addEventListener('input', () => {
    const duration = Number(video.duration) || 0;
    currentLabel.textContent = formatTime(duration * Number(seekControl.value) / 1000);
  });
  // Keyboard/assistive range changes continue to use the native control.
  seekControl.addEventListener('change', () => {
    seekGestureActive = false;
    commitSeek((Number(video.duration) || 0) * Number(seekControl.value) / 1000, 'change');
  });
  muteButton.addEventListener('click', () => { desiredMuted = !desiredMuted; video.muted = startupPrime ? true : desiredMuted; });
  volumeControl.addEventListener('input', () => {
    video.volume = Number(volumeControl.value);
    if (video.volume > 0) { desiredMuted = false; video.muted = Boolean(startupPrime); }
  });
  speedSelect.addEventListener('change', () => {
    const rate = Number(speedSelect.value) || 1;
    video.playbackRate = rate;
    // Only a user's speed selection updates the shared preference. Temporary
    // handoff/decoder catch-up rates must not overwrite it.
    onSpeedChange?.(rate);
  });
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
    if (hls) {
      const level=Number(qualitySelect.value);
      // Unlike currentLevel, loadLevel does not flush the buffered video.
      // Request the selected quality on upcoming fragments without pausing.
      if(Number.isInteger(level)&&level>=-1&&level<hls.levels.length) {
        hls.loadLevel=level;
        checkQualityMotion();
      }
    }
  });
  const updateQualityOptions = () => {
    if (!hls) return;
    qualitySelect.textContent = '';
    qualitySelect.add(new Option('Auto', '-1'));
    for (const [index, level] of hls.levels.entries()) {
      qualitySelect.add(new Option(level.height ? `${level.height}p` : `Quality ${index + 1}`, String(index)));
    }
    qualitySelect.hidden = hls.levels.length <= 1;
    qualitySelect.value = '-1';
  };

  let hls = null;
  let activeSource = '';
  let failed = false;
  let sourceReady = false;
  const initialPosition = Math.max(0, Number(resumeSeconds) || 0);
  const hasVimeoFallback = !String(videoId).startsWith('drivev-');
  const checkQualityMotion = () => {
    clearTimeout(qualityMotionTimer);
    const intent = playbackIntent;
    const clock = Number(video.currentTime) || 0;
    const frames = decodedFrames();
    qualityMotionTimer = setTimeout(() => {
      if (destroyed || document.hidden || intent !== playbackIntent || !playbackWanted ||
          video.paused || video.seeking || recoveryInProgress || !hls || activeSource !== sources.hls) return;
      const position = Number(video.currentTime) || 0;
      const currentFrames = decodedFrames();
      if (frames === null || currentFrames === null || currentFrames > frames || position > clock + .1) return;
      let bufferedAhead = 0;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= position && video.buffered.end(i) > position)
          bufferedAhead = video.buffered.end(i) - position;
      }
      // A network underrun needs more data. A stationary decoder with seconds
      // of buffered media needs its MediaSource reattached at this position.
      if (video.videoWidth <= 0 || video.readyState < 2 || bufferedAhead < 2 ||
          typeof hls.recoverMediaError !== 'function') return;
      recoveryInProgress = true;
      ++visualCheck;
      hasVisibleFrame = false;
      loading.hidden = false;
      video.dataset.hlsQualityRecovery = 'buffered decoder stall';
      console.warn('[Playback] Recovering buffered HLS decoder after quality selection', {position, frames:currentFrames, bufferedAhead});
      let metadataTimer;
      const cleanup = () => {
        clearTimeout(metadataTimer);
        video.removeEventListener('loadedmetadata', restored);
        recoveryInProgress = false;
        cancelQualityRecovery = () => {};
      };
      const restored = () => {
        cleanup();
        if (destroyed || intent !== playbackIntent || !playbackWanted || document.hidden) return;
        try { video.currentTime = position; } catch (_) {}
        void video.play().catch(() => {});
      };
      cancelQualityRecovery = cleanup;
      video.addEventListener('loadedmetadata', restored, {once:true});
      metadataTimer = setTimeout(cleanup, 12000);
      try {
        hls.recoverMediaError();
        hls.startLoad(position);
      } catch (error) {
        cleanup();
        console.warn('[Playback] Buffered HLS decoder recovery failed', error);
      }
    }, 2000);
  };
  const checkVisualPlayback = async () => {
    let check = ++visualCheck;
    const intent = playbackIntent;
    const cancelled = () => destroyed || intent !== playbackIntent || document.hidden;
    hasVisibleFrame = false;
    loading.hidden = false;
    let visible = await waitForVideoFrame();
    if (cancelled() || check !== visualCheck || video.paused) return;
    if (!visible && video.videoWidth > 0 &&
        typeof video.requestVideoFrameCallback !== 'function' && decodedFrames() === null && video.readyState >= 2) {
      // Older WebViews expose neither frame callback nor decoded-frame count.
      // They cannot prove that a picture advanced; avoid falsely rejecting HLS.
      visible = true;
    }
    if (!visible && activeSource === sources.hls && hls && !recoveryInProgress) {
      // Some WebViews parse the manifest before decoding the first segment.
      // Make two bounded attempts to recover HLS frames before using MP4.
      // Neither retry counts as success without actual decoded picture motion.
      recoveryInProgress = true;
      try {
        for (let attempt = 1; attempt <= 2 && !visible && !destroyed; attempt++) {
          if (cancelled() || check !== visualCheck || video.paused) return;
          const position = Math.max(0, Number(video.currentTime) || initialPosition);
          video.dataset.hlsRecoveryAttempts = String(attempt);
          hls.stopLoad();
          if (attempt === 2 && typeof hls.recoverMediaError === 'function') hls.recoverMediaError();
          hls.startLoad(position);
          console.warn('[Playback] Retrying HLS video decoding', {attempt, position, reason:lastHlsFailure});
          visible = await waitForVideoFrame(attempt === 1 ? 8500 : 10000);
          if (cancelled() || check !== visualCheck || video.paused) return;
        }
      } catch (error) {
        console.warn('[Playback] HLS visual recovery failed', error);
      } finally { recoveryInProgress = false; }
    }
    if (cancelled() || check !== visualCheck || video.paused) return;
    if (!visible && activeSource === sources.hls && sources.mp4) {
      const position = Math.max(0, Number(video.currentTime) || initialPosition);
      video.dataset.hlsFallbackReason = lastHlsFailure || 'No moving decoded frames after HLS retry';
      console.warn('[Playback] HLS did not recover moving frames; trying MP4');
      recoveryInProgress = true;
      try {
        await attachSource(sources.mp4, false);
        // Source attachment pauses internally. Only the original play intent
        // may restart it; Audio handoff or a user pause cancels this recovery.
        if (cancelled()) return;
        check = visualCheck;
        if (position > 0) {
          const duration = Number(video.duration) || 0;
          video.currentTime = duration ? Math.min(position, Math.max(0, duration - .25)) : position;
        }
        await video.play();
        visible = await waitForVideoFrame();
      } catch (error) {
        console.warn('[Playback] MP4 visual recovery failed', error);
        if (!cancelled()) adapter.reportError(error, position, true);
        return;
      }
      finally { recoveryInProgress = false; }
    }
    if (cancelled() || check !== visualCheck || video.paused) return;
    if (visible) {
      hasVisibleFrame = true;
      loading.hidden = true;
    } else {
      adapter.reportError(new Error('Audio is playing but video frames are unavailable'),
        Math.max(0, Number(video.currentTime) || initialPosition), true);
    }
  };
  // A play event can fire before a remote HLS segment has arrived. Start the
  // visual deadline only once the browser reports actual playback.
  video.addEventListener('playing', () => {
    if (video.dataset.startupBufferPhase === 'priming') return;
    if (!initialPlaybackStarted) {
      initialPlaybackStarted = true;
      initialPlayingAt = Date.now();
      video.dataset.startupBufferAtStart = String(bufferedVideoSecondsAhead(video));
    }
    if (!hasVisibleFrame && !recoveryInProgress) void checkVisualPlayback();
  });
  const onVisibilityChange = () => {
    if (document.hidden && !isPictureInPicture() && !destroyed) {
      // Android may pause the element without cancelling a queued play or HLS
      // recovery. Cancel that intent before Home suspends JS, so revealing this
      // WebView cannot steal audio focus back from the native Audio owner.
      desiredMuted = true;
      video.muted = true;
      void pausePlayback();
      return;
    }
    if (!document.hidden && !video.paused && !hasVisibleFrame && !recoveryInProgress && !destroyed) void checkVisualPlayback();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  stalledPlaybackWatchdog = setInterval(() => {
    if (destroyed || recoveryInProgress || video.dataset.startupBufferPhase === 'priming' || document.hidden || video.paused || video.ended ||
        !activeSource || video.seeking || video.readyState < 2) {
      lastMotionAt = Date.now();
      previousClock = Number(video.currentTime) || 0;
      previousFrames = decodedFrames();
      return;
    }
    const now = Date.now();
    const clock = Number(video.currentTime) || 0;
    const frames = decodedFrames();
    const clockMoved = previousClock >= 0 && clock > previousClock + 0.14;
    const framesMoved = frames !== null && previousFrames !== null && frames > previousFrames;
    // An advancing audio clock with frozen frames is NOT healthy video.
    // Both must advance when the WebView exposes a decoded-frame count.
    if (clockMoved && (frames === null || previousFrames === null || framesMoved)) {
      lastMotionAt = now;
      stallRecoveryCount = 0;
    }
    previousClock = clock;
    previousFrames = frames;
    // Limit retries. No silent "pass" is possible: exhausted recovery goes
    // through the existing explicit error/Vimeo-fallback path.
    if (now - lastMotionAt < 9000 || now - lastStallRecoveryAt < 25000) return;
    lastStallRecoveryAt = now;
    stallRecoveryCount += 1;
    console.warn('[Playback] Video stalled with playing=true', {
      source: activeSource === sources.hls ? 'hls' : 'mp4',
      seconds: clock, frames, buffered: video.buffered?.length || 0,
      attempt: stallRecoveryCount
    });
    if (stallRecoveryCount > 2) {
      adapter.reportError(new Error('Video playback remains stalled after recovery'),
        clock, true);
      clearInterval(stalledPlaybackWatchdog);
      return;
    }
    // This requires actual new decoded frames. If HLS remains frozen,
    // checkVisualPlayback switches to the MP4 or reports a hard failure.
    void checkVisualPlayback();
  }, 2500);
  const attachSource = async (url, useHls) => {
    if (!url) throw new Error('No direct video source');
    if (hls) { try { hls.destroy(); } catch (_) {} hls = null; }
    ++visualCheck;
    hasVisibleFrame = false;
    loading.hidden = false;
    video.pause();
    video.removeAttribute('src');
    video.load();
    activeSource = url;
    if (!useHls) {
      video.src = url;
      video.load();
    } else {
      const nativeHls = Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
      let Hls = null;
      try { Hls = await loadHls(String(apiBase).replace(/\/$/, '')); }
      catch (libraryError) {
        if (!nativeHls) throw libraryError;
        console.warn('[Playback] HLS.js unavailable; using native HLS', libraryError);
      }
      if (!Hls?.isSupported?.()) {
        if (nativeHls) {
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
          // Decode the lowest HLS variant first on older hardware/WebViews.
          startLevel:0,
          capLevelToPlayerSize:true
        });
        // Install every listener BEFORE requesting the HLS playlist. A fast
        // WebView may finish parsing while a slow JS observer is still being
        // installed; missing MANIFEST_PARSED incorrectly triggers MP4 fallback.
        hls.on(Hls.Events.FRAG_CHANGED, (_event, info) => {
          if (info?.frag?.type === 'main') video.dataset.hlsCurrentLevel = String(info.frag.level);
        });
        hls.on(Hls.Events.FRAG_BUFFERED, (_event, info) => {
          if (info?.frag?.type === 'main') video.dataset.hlsBufferedLevel = String(info.frag.level);
        });
        const manifestReady = new Promise((resolve, reject) => {
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
            if (!info?.fatal || destroyed || activeSource !== url) return;
            lastHlsFailure = String(info.details || info.type || 'fatal HLS error');
            video.dataset.hlsLastError = lastHlsFailure;
            if (fatalHlsRecoveries < 2) {
              try {
                if (info.type === Hls.ErrorTypes.MEDIA_ERROR) {
                  fatalHlsRecoveries++; hls.recoverMediaError(); return;
                }
                if (info.type === Hls.ErrorTypes.NETWORK_ERROR) {
                  fatalHlsRecoveries++; hls.startLoad(Math.max(0, Number(video.currentTime) || 0)); return;
                }
              } catch (error) {
                console.warn('[Playback] HLS recovery failed', error);
              }
            }
            if (!finished) finish(new Error(`HLS playback failed: ${lastHlsFailure}`));
            else void recoverFromHlsFailure(info, Hls);
          });
        });
        hls.attachMedia(video);
        hls.loadSource(url);
        await manifestReady;
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
    ++visualCheck;
    const position = Math.max(0, Number(video.currentTime) || initialPosition);
    // A decoder failure can set paused=true without a user Pause. Preserve the
    // accepted play intent; explicit Pause/Audio handoff still cancels recovery.
    const shouldPlay = playbackWanted;
    const intent = playbackIntent;
    const cancelled = () => destroyed || intent !== playbackIntent || document.hidden;
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
        if (cancelled()) return;
        if (Number(video.duration) > 0) video.currentTime = Math.min(position, Math.max(0, Number(video.duration) - .25));
        if (shouldPlay) await video.play().catch(() => {});
        return;
      } catch (error) {
        if (!cancelled()) adapter.reportError(error, position, shouldPlay);
      }
    } else {
      adapter.reportError(new Error(`HLS playback failed: ${info?.details || 'fatal error'}`), position, shouldPlay);
    }
  };

  video.addEventListener('error', () => {
    if (!sourceReady || destroyed || !video.error || activeSource !== sources.hls) return;
    // Some WebViews expose MEDIA_ERR_DECODE without a fatal HLS.js event and
    // pause the element, bypassing the playing-only stall watchdog entirely.
    lastHlsFailure = `HTML video decoder error ${video.error.code}`;
    video.dataset.hlsLastError = lastHlsFailure;
    void recoverFromHlsFailure({details:lastHlsFailure});
  });

  const readyPromise = (async () => {
    try {
      if (sources.hls) {
        try { await attachSource(sources.hls, true); }
        catch (hlsError) {
          video.dataset.hlsFallbackReason = String(hlsError?.message || hlsError);
          console.warn('[Playback] HLS attachment failed', hlsError);
          if (!sources.mp4) throw hlsError;
          await attachSource(sources.mp4, false);
        }
      } else await attachSource(sources.mp4, false);
      sourceReady = true;
      return true;
    } catch (error) {
      restoreIframe();
      throw error;
    }
  })();
  const adapter = makePlayerAdapter(video, stage, () => hls, readyPromise);
  adapter.resumeStalledHandoff = async () => {
    // Older Android HLS and MP4 decoders can pause after the first real frame,
    // despite the user's uninterrupted Play request. Resume once, silently,
    // while Media3 Audio remains authoritative. Never wake startup priming,
    // turn a user Pause into Play, or restart after Home/background.
    const hlsReady = activeSource === sources.hls && Boolean(hls);
    const mp4Ready = activeSource === sources.mp4 && video.readyState >= 2;
    if (destroyed || (!hlsReady && !mp4Ready) ||
        !playbackWanted || !initialPlaybackStarted || !video.paused ||
        !video.muted || video.ended || startupPrime ||
        stalledHandoffResumes >= 1 ||
        (document.hidden && !isPictureInPicture())) return false;
    if (mp4Ready) {
      // A remote MP4 seek still fetching its first byte range is not a
      // decoder-generated pause. Do not attempt Play or steal audio focus
      // until a real media runway is present at the current position.
      const at = Number(video.currentTime) || 0;
      let ahead = 0;
      for (let i = 0; i < (video.buffered?.length || 0); i++) {
        if (video.buffered.start(i) <= at && video.buffered.end(i) > at)
          ahead = Math.max(ahead, video.buffered.end(i) - at);
      }
      if (ahead < 1.5) return false;
    }
    const expectedIntent = playbackIntent;
    stalledHandoffResumes += 1;
    try {
      await video.play();
      if (destroyed || !playbackWanted || expectedIntent !== playbackIntent) {
        video.pause();
        return false;
      }
      video.dataset.hlsHandoffResumeCount = String(stalledHandoffResumes);
      return !video.paused;
    } catch (error) {
      console.warn('[Playback] Stalled HLS Video could not resume',error);
      return false;
    }
  };
  // The decoder may be paused while we silently prime an MP4 buffer. That
  // does not mean the listener pressed Pause. Native Video -> Audio handoff
  // must preserve the user's requested playback intent.
  adapter.getPlaybackIntent = () => Boolean(playbackWanted);
  adapter.pause = pausePlayback;
  adapter.setMuted = muted => {
    desiredMuted = Boolean(muted);
    video.muted = startupPrime ? true : desiredMuted;
    return Promise.resolve(desiredMuted);
  };
  adapter.play = () => {
    const intent = playbackIntent;
    if (startupPlayTask && startupPlayIntent === intent) return startupPlayTask;
    playbackWanted = true;
    updatePlayIcon();
    startupPlayIntent = intent;
    const cancelled = () => destroyed || intent !== playbackIntent || (document.hidden && !isPictureInPicture());
    const task = readyPromise.then(async () => {
      if (cancelled()) return;
      if (!initialPlaybackStarted) {
        loading.hidden = false;
        video.dataset.startupBufferPhase = 'loading';
        const startupStartedAt = Date.now();
        const startPosition = Number(video.currentTime) || 0;
        // API 35 occasionally exhausts its 12s startup runway at second 13.
        // Buffer three real HLS segments (~18s) before the first visible Play,
        // so it does not start/loading/start again. MP4 keeps its 6s threshold.
        // At higher requested rates, the gate multiplies seconds by rate.
        const startupBufferSeconds = activeSource === sources.hls ? 16 : 6;
        const prime = {intent};
        let priming = false, primingError;
        let buffered;
        try {
          try {
            buffered = await waitForInitialVideoBuffer(video, {
              isCancelled:cancelled,
              seconds:startupBufferSeconds,
              timeoutMs:activeSource === sources.hls ? 45000 : 25000,
            // During silent MP4 prime the hidden playhead moves with incoming
            // data and maintains a ~2s live runway. It would never satisfy
            // a 6s *ahead* check. Measure the real downloaded six seconds
            // from the intended start, then rewind before audible playback.
            bufferFromSeconds:() => priming ? startPosition : Number(video.currentTime) || 0,
            onSample:sample => {
              if (primingError) throw primingError;
              video.dataset.startupBufferRequired = String(sample.required);
              video.dataset.startupBufferAhead = String(sample.ahead);
              // Some WebViews preload only ~2 seconds of MP4 while paused,
              // despite preload=auto. Prime that real decoder silently under the
              // loading cover, then restore the exact requested start position.
              if (!priming && activeSource !== sources.hls && sample.elapsedMs >= 1500) {
                priming = true;
                startupPrime = prime;
                video.dataset.startupBufferPhase = 'priming';
                video.muted = true;
                void video.play().catch(error => { primingError = error; });
              }
            }
            });
          } catch (error) {
            // A valid HLS playlist may be ready even if the first video bytes
            // arrive unusually late on an overcommitted Android emulator.
            // Give that SAME source one final, bounded chance to fill the real
            // decoder, rather than tearing it down or requiring another Play tap.
            // No fake buffer, MP4 fallback, seek reset or fresh decoder.
            const delayedHls = activeSource === sources.hls && hls &&
              video.readyState >= 1 && !video.error && !cancelled() &&
              error?.message === 'Video did not buffer enough to start smoothly';
            if (!delayedHls) throw error;
            video.dataset.startupBufferPhase = 'late-hls-recovery';
            console.warn('[Playback] Waiting for late HLS media bytes without recreating player');
            buffered = await waitForInitialVideoBuffer(video, {
              seconds:startupBufferSeconds, timeoutMs:15000,
              isCancelled:cancelled,
              onSample:sample=>{
                video.dataset.startupBufferRequired = String(sample.required);
                video.dataset.startupBufferAhead = String(sample.ahead);
              }
            });
          }
          if (priming && startupPrime === prime) {
            video.pause();
            if (!cancelled()) {
              video.currentTime = startPosition;
              await new Promise(resolve => setTimeout(resolve, 0));
              buffered = await waitForInitialVideoBuffer(video, {timeoutMs:6000,isCancelled:cancelled});
            }
          }
        } finally {
          if (priming && startupPrime === prime) {
            video.pause();
            startupPrime = null;
            video.muted = desiredMuted;
          }
        }
        if (!buffered || cancelled()) return;
        if (activeSource === sources.hls) {
          const firstFrame = firstBufferedStartupFrame(video,startupBufferSeconds);
          if (firstFrame != null) {
            // Only align a <=100ms real first-frame gap, and only after
            // confirmed contiguous media bytes are already buffered. Finish
            // the seek while the loading cover is still visible, before Play.
            video.currentTime = firstFrame;
            buffered = await waitForInitialVideoBuffer(video, {
              timeoutMs:5000, seconds:startupBufferSeconds, isCancelled:cancelled,
              onSample:sample => {
                video.dataset.startupBufferRequired = String(sample.required);
                video.dataset.startupBufferAhead = String(sample.ahead);
              }
            });
            if (!buffered || cancelled()) return;
            video.dataset.hlsInitialFrameAligned = String(firstFrame);
          }
        }
        video.dataset.startupBufferPhase = 'ready';
        video.dataset.startupBufferWaitMs = String(Date.now() - startupStartedAt);
      }
      if (!cancelled()) return playVideo();
    }).catch(error => {
      if (!cancelled()) {
        playbackWanted = false;
        updatePlayIcon();
        video.dataset.startupBufferPhase = 'failed';
        video.dataset.startupFailureReason = String(error?.name || 'Error') + ': ' + String(error?.message || error).slice(0,240);
        video.dataset.startupBufferAhead = String(bufferedVideoSecondsAhead(video));
        console.warn('[Playback] Video start failed after real buffer inspection', error, video.dataset.startupFailureReason);
        loading.hidden = false;
        const label = error?.name === 'NotAllowedError' ?
          'Playback needs another tap to start.' : 'Connection is slow. Tap Play to retry.';
        loading.textContent = window.IST_I18N?.t?.(label) || label;
      }
      throw error;
    }).finally(() => { if (startupPlayTask === task) startupPlayTask = null; });
    startupPlayTask = task;
    return task;
  };
  // Keep the adapter's reference to the HLS instance current after attachment and recovery.
  adapter.destroy = () => { destroyed = true; clearRebufferTimer(); clearInterval(stalledPlaybackWatchdog); ++visualCheck; clearTimeout(qualityMotionTimer); cancelQualityRecovery(); clearTimeout(singleTapTimer); clearTimeout(seekHintTimer); document.removeEventListener('visibilitychange', onVisibilityChange); try { hls?.destroy(); } catch (_) {} video.pause(); video.removeAttribute('src'); video.load(); restoreIframe(); return Promise.resolve(); };
  adapter.on('error', detail => {
    // A Drive video has no Vimeo source to fall back to. Stop its soundtrack
    // rather than leave the user listening to a black, unresponsive player.
    if (String(videoId).startsWith('drivev-')) {
      video.pause();
      loading.innerHTML = '<img class="watch-hls-loading-logo" src="/logo.png" alt="Irgun Shiurai Torah"><span>Video picture is unavailable. Please try again later.</span>';
      loading.hidden = false;
    }
    onError?.(detail?.error, detail?.position, detail?.autoplay, adapter);
  });
  adapter.getSourceType = () => activeSource === sources.hls ? 'hls' : 'mp4';
  adapter.getVideoElement = () => video;
  return adapter;
}

// Disposable emulator-only observations. Never included in Play Store builds.
// This object only reads app state and DOM; it cannot mutate playback or accounts.
window.ISTReleaseQA = { snapshot() {
  const element = document.querySelector('#watchDirectHlsVideo');
  const host = document.querySelector('#persistentVideoMount');
  return {
    screen: String(state.screen || ''),
    ready: !!state.libraryReady && !state.loading,
    lang: document.documentElement.lang,
    watchId: state.watchVideo ? String(videoId(state.watchVideo)) : '',
    watchMode: String(state.watchMode || ''),
    minimized: !!state.watchMinimized,
    pipActive: !!state.systemPipActive,
    playerOpen: !!state.playerOpen,
    speed: Number(state.playbackSpeed),
    hostClass: String(host?.className || ''),
    overlays: document.querySelectorAll('#persistentVideoMount .watch-overlay, #app .watch-overlay').length,
    videos: document.querySelectorAll('#watchDirectHlsVideo').length,
    iframes: document.querySelectorAll('#watchVimeoFrame').length,
    video: element ? {
      src: String(element.currentSrc || element.src || ''),
      time: Number(element.currentTime || 0),
      ready: Number(element.readyState),
      frames: Number(element.getVideoPlaybackQuality?.().totalVideoFrames ?? element.webkitDecodedFrameCount ?? 0),
      paused: !!element.paused,
      muted: !!element.muted,
      volume: Number(element.volume),
      rate: Number(element.playbackRate),
      width: Number(element.videoWidth),
      error: element.error ? Number(element.error.code) : null
    } : null,
    offline: [...state.offlineDownloads.values()].map(row => ({
      key: String(row.key || ''), id: String(row.id || ''),
      kind: String(row.kind || ''), bytes: Number(row.bytes || 0),
      uri: String(row.uri || '')
    })),
    offlineJobs: [...state.offlineJobs.entries()].map(([key, job]) => ({
      key: String(key), percent: Number(job.percent || 0)
    })),
    isLoggedIn: !!state.user
  };
}};
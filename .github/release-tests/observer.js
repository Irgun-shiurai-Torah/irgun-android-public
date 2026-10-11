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
    sourceType: String(state.watchVimeo?.getSourceType?.() || ''),
    handoff: {
      audioToVideo: !!state.watchAudioToVideoHandoff,
      commitBusy: !!state.watchAudioToVideoCommitBusy,
      targetSeconds: Number(state.watchAudioToVideoTargetSeconds || 0),
      videoPlaying: !!state.watchVideoPlaying,
      authorityFence: state.playbackAuthorityFence ? { ...state.playbackAuthorityFence } : null
    },
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
      downloadAttempts: Number(row.downloadAttempts || 1),
      uri: String(row.uri || '')
    })),
    offlineSaveError: String(state.offlineSaveLastError || '').slice(0,350),
    offlineJobs: [...state.offlineJobs.entries()].map(([key, job]) => ({
      key: String(key), percent: Number(job.percent || 0),
      attempt: Number(job.attempt || 1), bytes: Number(job.bytes || 0), total: Number(job.total || 0)
    })),
    currentOffline: !!state.current?.offline,
    currentId: String(state.current?.id || ''),
    isLoggedIn: !!state.user
  };
}};

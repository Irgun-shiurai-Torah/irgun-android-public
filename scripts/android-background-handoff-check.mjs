// The CDP WebView sample and the Media3 bridge snapshot are two asynchronous
// observations. During Home the native snapshot may arrive immediately after
// AUDIO commits, while the JS video snapshot still describes the preceding
// decoded frame. The handoff is ready only when BOTH observations are safe.
export function webVideoCannotDuplicateNativeAudio(snapshot) {
  const video = snapshot?.video;
  return !video || video.paused === true || video.muted === true || Number(video.volume) === 0;
}

export function safeNativeBackgroundHandoff(snapshot) {
  return snapshot?.native?.mode === 'AUDIO' &&
    snapshot.native.audioIsPlaying === true &&
    Number(snapshot.native.audioOutputVolume) > 0 &&
    webVideoCannotDuplicateNativeAudio(snapshot);
}

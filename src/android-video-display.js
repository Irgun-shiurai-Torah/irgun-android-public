// Send presentation changes only. Native Android observes the actual Media3
// play intent as well, so buffering keeps the display awake without a new player.
export function createAndroidVideoDisplaySync({isAndroid,read,send}) {
  let last = '';
  return () => {
    if (!isAndroid()) return;
    const state = read(), active = Boolean(state.watchVideo && state.watchMode === 'video');
    const value = {active,playing:active && Boolean(state.watchVideoPlaying),
      expanded:active && !state.watchMinimized,nativeEngine:Boolean(state.watchVimeo?.isIrgunNativeVideoPlayer)};
    const key = JSON.stringify(value);
    if (key === last) return;
    last = key;
    Promise.resolve(send(value)).catch(() => { if (last === key) last = ''; });
  };
}

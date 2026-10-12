export function bufferedVideoSecondsAhead(video) {
  const position = Number(video.currentTime) || 0;
  for (let index = 0; index < video.buffered.length; index++) {
    if (video.buffered.start(index) <= position + .05 && video.buffered.end(index) > position)
      return video.buffered.end(index) - position;
  }
  return 0;
}

// Wait for real media bytes before the first Play. Never advance/fake the clock.
export async function waitForInitialVideoBuffer(video, {seconds = 6, timeoutMs = 25000,
  isCancelled = () => false, onSample = () => {}, now = () => Date.now(),
  delay = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
  const started = now();
  while (now() - started < timeoutMs) {
    if (isCancelled()) return null;
    if (video.error) throw new Error('Video failed while preparing its initial buffer');
    const rate = Math.max(.25, Number(video.playbackRate) || 1);
    const duration = Number(video.duration);
    const remaining = Number.isFinite(duration) && duration > 0
      ? Math.max(0, duration - (Number(video.currentTime) || 0)) : Infinity;
    const required = Math.min(seconds * rate, remaining);
    const ahead = bufferedVideoSecondsAhead(video);
    const sample = {ahead, required, elapsedMs:now() - started};
    onSample(sample);
    if (!video.seeking && video.readyState >= 2 && required > 0 && ahead + .02 >= required) return sample;
    await delay(150);
  }
  throw new Error('Video did not buffer enough to start smoothly');
}

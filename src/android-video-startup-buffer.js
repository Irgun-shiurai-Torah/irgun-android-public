export function bufferedVideoSecondsAhead(video, fromSeconds = Number(video.currentTime) || 0) {
  // MP4 silent priming advances its hidden decoder while downloading the
  // beginning of the lecture. Measure actual buffered bytes at the original
  // intended start, not just the shrinking runway ahead of the hidden decoder.
  const position = Math.max(0, Number(fromSeconds) || 0);
  for (let index = 0; index < video.buffered.length; index++) {
    const start = video.buffered.start(index), end = video.buffered.end(index);
    // HLS can begin two encoded frames after the requested time (0.066666s
    // in the failed real runs). That small priming gap is not missing media.
    // Count only the real buffered span; never include the unbuffered gap.
    if (start <= position + .1 && end > position)
      return end - Math.max(position, start);
  }
  return 0;
}

// Wait for real media bytes before the first Play. Never advance/fake the clock.
export async function waitForInitialVideoBuffer(video, {seconds = 6, timeoutMs = 25000,
  isCancelled = () => false, onSample = () => {},
  bufferFromSeconds = () => Number(video.currentTime) || 0,
  now = () => Date.now(),
  delay = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
  const started = now();
  while (now() - started < timeoutMs) {
    if (isCancelled()) return null;
    if (video.error) throw new Error('Video failed while preparing its initial buffer');
    const rate = Math.max(.25, Number(video.playbackRate) || 1);
    const fromSeconds = Math.max(0, Number(bufferFromSeconds()) || 0);
    const duration = Number(video.duration);
    const remaining = Number.isFinite(duration) && duration > 0
      ? Math.max(0, duration - fromSeconds) : Infinity;
    const required = Math.min(seconds * rate, remaining);
    const ahead = bufferedVideoSecondsAhead(video, fromSeconds);
    const sample = {ahead, required, elapsedMs:now() - started};
    onSample(sample);
    if (!video.seeking && video.readyState >= 2 && required > 0 && ahead + .02 >= required) return sample;
    await delay(150);
  }
  throw new Error('Video did not buffer enough to start smoothly');
}

// Some HLS manifests start at 0.066666s, not exactly at 0. A WebView may
// accept six seconds of real buffered data while paused, but its first Play
// then seeks to the first decoded frame and emits another Waiting event.
// Align this tiny gap *before* Play, without inventing buffered bytes.
export function firstBufferedStartupFrame(video, seconds = 6) {
  const position = Number(video?.currentTime) || 0;
  const rate = Math.max(.25, Number(video?.playbackRate) || 1);
  const required = Math.max(0, seconds * rate);
  const ranges = video?.buffered;
  for (let index = 0; index < (ranges?.length || 0); index++) {
    const start = Number(ranges.start(index)), end = Number(ranges.end(index));
    const gap = start - position;
    if (Number.isFinite(start) && Number.isFinite(end) && gap > .002 &&
        gap <= .10 && end - start >= required) return start;
  }
  return null;
}

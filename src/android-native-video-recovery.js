// Pure guard for Android's resumed native Media3 video. An old lecture may
// retain its bookmark and MediaSession while its HLS load/decoder is stale.
// A user's explicit Pause, background Audio, missing surface, or healthy frames
// must never trigger a source replacement.
export const MAX_NATIVE_RESUME_REFRESHES = 2;
export const NATIVE_RESUME_REFRESH_COOLDOWN_MS = 18000;
export const NATIVE_RESUME_STALE_GAP_MS = 15 * 60 * 1000;

export function shouldRefreshNativeVideoSource({
  snapshot, foreground, surfaceVisible, nowMs,
  lastFrameAtMs, stalledSinceMs, lastRefreshAtMs = 0, refreshAttempts = 0
}) {
  if (!foreground || !surfaceVisible || !snapshot?.active ||
      !snapshot.videoSelected || snapshot.playWhenReady !== true ||
      refreshAttempts >= MAX_NATIVE_RESUME_REFRESHES) return false;
  // Only resume a previously decoded lecture. Cold-start failures are handled
  // by the existing native error path and explicit Try-video-again action.
  if (!(lastFrameAtMs > 0) || !(stalledSinceMs > 0)) return false;
  if (refreshAttempts > 0 &&
      nowMs - lastRefreshAtMs < NATIVE_RESUME_REFRESH_COOLDOWN_MS) return false;
  const longPause = nowMs - lastFrameAtMs >= NATIVE_RESUME_STALE_GAP_MS;
  // The ordinary Media3 stall watchdog already retries BUFFERING streams in
  // place. Wait for it on short interruptions; favor a fresh source after
  // a genuinely long pause, or when Media3 has reported a terminal error.
  const thresholdMs = snapshot.error ? 1000 : longPause ? 7000 : 32000;
  return nowMs - stalledSinceMs >= thresholdMs;
}

// Android purchased-audio playback guards. Pure logic; no player, credentials,
// paid URLs, WebView audio element or separate ExoPlayer is created.
const seconds = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

/** A stored progress tick at the end must not resume Media3 at EOF, emit
 * STATE_ENDED immediately, then skip every paid track in a folder. */
export function paidResumePositionSeconds(progress, trackDurationSeconds = 0) {
  const position = seconds(progress?.positionSeconds);
  const duration = seconds(progress?.durationSeconds) || seconds(trackDurationSeconds);
  if (!duration || !position) return position;
  const tailSeconds = Math.max(2, Math.min(10, duration * 0.02));
  return position >= Math.max(0, duration - tailSeconds) ? 0 : position;
}

export function createPaidPlaybackEvidence(lectureId, requestedAt = Date.now()) {
  return {
    lectureId: String(lectureId || ''),
    requestedAt: Number(requestedAt) || Date.now(),
    ready: false,
    firstPlayingAt: 0,
    lastPlayingAt: 0,
    lastPlayingPositionMs: null,
    playedForwardMs: 0,
    durationMs: 0,
    endedHandled: false
  };
}

/** Only the real native Media3 snapshots count as playback evidence.
 * Optimistic WebView "Play" UI state never counts. */
export function observePaidPlayback(evidence, snapshot, now = Date.now()) {
  if (!evidence || evidence.endedHandled || !snapshot ||
      String(snapshot.lectureId || '') !== evidence.lectureId ||
      (snapshot.mode && String(snapshot.mode).toUpperCase() !== 'AUDIO')) return evidence;
  const duration = seconds(snapshot.durationMs) || seconds(snapshot.audioDurationMs);
  if (duration > evidence.durationMs) evidence.durationMs = duration;
  const position = Math.max(0, Number(
    snapshot.positionMs ?? snapshot.currentPositionMs ?? snapshot.audioPositionMs ?? 0
  ) || 0);
  const playing = snapshot.isPlaying === true || snapshot.audioIsPlaying === true;
  if (snapshot.audioReady === true || playing) evidence.ready = true;
  if (playing) {
    if (!evidence.firstPlayingAt) evidence.firstPlayingAt = now;
    if (evidence.lastPlayingPositionMs !== null) {
      const delta = position - evidence.lastPlayingPositionMs;
      // Don't treat a seek or a late stale clock as listening to the track.
      if (delta >= 50 && delta < 2500) evidence.playedForwardMs += delta;
    }
    evidence.lastPlayingPositionMs = position;
    evidence.lastPlayingAt = now;
  }
  return evidence;
}

/** A real end requires a prepared, actually progressing audio track that has
 * reached its known duration. An instant EOF, buffering, failed URL, or old
 * Media3 callback must NOT select the next signed track. */
export function verifiedPaidTrackEnd(evidence, ended, now = Date.now()) {
  if (!evidence || !ended || evidence.endedHandled ||
      String(ended.lectureId || '') !== evidence.lectureId) return false;
  const duration = Math.max(seconds(ended.durationMs), seconds(ended.audioDurationMs), evidence.durationMs);
  const position = Math.max(0, Number(ended.currentPositionMs ?? ended.positionMs ?? ended.audioPositionMs ?? 0) || 0);
  if (!evidence.ready || !evidence.firstPlayingAt || !duration || !position) return false;
  const endToleranceMs=Math.max(1500, Math.min(4500, duration * 0.015));
  if (duration - position > endToleranceMs) return false;
  // An old STATE_ENDED event can carry the full duration even though the NEW
  // selected track has played only its first seconds. Require the native
  // position observed WHILE actually playing to be near this item's end too.
  const lastPlayedMs=Number(evidence.lastPlayingPositionMs);
  if (!Number.isFinite(lastPlayedMs) || duration - lastPlayedMs > Math.max(4500,endToleranceMs)) return false;
  if (evidence.playedForwardMs < Math.min(650, duration * 0.35)) return false;
  if (evidence.lastPlayingAt - evidence.firstPlayingAt < 650) return false;
  // Stale end events from a previous item or an unloaded URL are not proof of
  // completion even if they retain an old duration/position.
  if (now - evidence.requestedAt < 650) return false;
  return true;
}

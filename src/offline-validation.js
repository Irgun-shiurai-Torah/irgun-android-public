// Reject tiny/error-page/partial downloads before an offline audio file is
// marked ready. A 2,407-byte HTML response was previously saved as a 1-hour MP3.
// 512 B/s is just 4 kbps, well below normal lecture-audio compression.
export function minimumOfflineAudioBytes(durationSeconds=0) {
  const duration=Number(durationSeconds);
  return Math.max(65536, Number.isFinite(duration)&&duration>0 ? Math.floor(duration*512) : 0);
}
export function isPlausibleOfflineAudio(bytes,durationSeconds=0) {
  const count=Number(bytes);
  return Number.isFinite(count)&&count>=minimumOfflineAudioBytes(durationSeconds);
}

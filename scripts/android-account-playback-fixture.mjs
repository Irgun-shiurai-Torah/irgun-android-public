// Select from the real app catalog, then verify real source availability.
// A newly published Vimeo-only lecture legitimately has no Audio control.
export async function selectAccountPlaybackFixture(videos, readSource) {
  for (const video of videos) {
    if (video.hasDriveVideo !== true || video.hasAudio !== true) continue;
    const source = await readSource(String(video.id));
    if ((source?.video?.hls || source?.video?.mp4) && source?.audio?.mp3)
      return {id:String(video.id),hasDriveVideo:true,hasAudio:true};
  }
  throw new Error('Account playback test requires a real lecture with native video AND separate audio; Vimeo-only lectures are tested separately');
}

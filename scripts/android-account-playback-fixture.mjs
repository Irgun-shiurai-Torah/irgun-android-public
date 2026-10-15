// Select from the real app catalog, then verify real source availability.
// A newly published Vimeo-only lecture legitimately has no Audio control.
// The website Follow bar is deliberately conditional: either a reviewed
// speaker ID in library-metadata.json OR a name embedded in the raw title.
// Testing "Follow" on a lecture without either condition was a false failure.
// Prefer a real qualifying fixture; never synthesize a Follow button in QA.
export function hasWebsiteFollowTarget(video, metadata={}) {
  const id=String(video?.id||video?.vimeoId||'').trim();
  const reviewed=metadata?.lectures?.[id]?.speakerIds;
  if (Array.isArray(reviewed) && reviewed.some(key=>
    (metadata?.speakers||[]).some(item=>String(item.id)===String(key))))return true;
  return /(?:^|[-–—]\s*)(?:Rabbi|Rav|הרב|רבי|ר[׳'])\s+(.+?)(?=\s+[-–—#|]|$)/i
    .test(String(video?.title||''));
}

export async function selectAccountPlaybackFixture(videos, readSource, options={}) {
  for (const video of videos) {
    if (video.hasDriveVideo !== true || video.hasAudio !== true) continue;
    if (options.requireFollow && !hasWebsiteFollowTarget(video,options.metadata)) continue;
    const source = await readSource(String(video.id));
    if ((source?.video?.hls || source?.video?.mp4) && source?.audio?.mp3)
      return {id:String(video.id),hasDriveVideo:true,hasAudio:true};
  }
  throw new Error(options.requireFollow
    ? 'Account Follow test requires a real Drive-backed video/audio lecture with a reviewed or website-recognized speaker; none found'
    : 'Account playback test requires a real lecture with native video AND separate audio; Vimeo-only lectures are tested separately');
}

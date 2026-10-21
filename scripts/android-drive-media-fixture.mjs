import assert from 'node:assert/strict';

// Native Media3 may stream Vimeo-only recordings, but Drive proxy HLS and
// downloadable MP3 regression tests MUST use a catalog item that has been
// copied to Drive. Testing /audio on a Vimeo-only item is a false failure.
export function requireDriveBackedLecture(catalog, id, {requireAudio=false}={}) {
  assert.ok(Array.isArray(catalog),'Live /video-map?driveLibrary=1 must return an array');
  const key=String(id||'').trim();
  assert.ok(key,'A real lecture ID is required for live Drive media QA');
  const lecture=catalog.find(v=>v && String(v.id)===key);
  assert.ok(lecture,
    'QA lecture '+key+' is no longer in the current catalog; select a real ID, not an obsolete alias');
  assert.equal(lecture.hasDriveVideo,true,
    'Drive media QA needs a Drive-backed lecture; '+key+' is Vimeo-only or not ingested');
  if(requireAudio)assert.equal(lecture.hasAudio,true,
    'Offline MP3 QA needs a real Drive-backed audio copy; '+key+' has no audio');
  return lecture;
}

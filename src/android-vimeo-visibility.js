import {isAndroidVimeoOnlyVideo} from './android-vimeo-playback.js';

// Apply the APP setting only; the WEBSITE switch is intentionally independent.
// Filtering does not delete or modify catalog data on Vimeo or Google Drive.
export function visibleAndroidVideoCatalog(items, showVimeoOnlyApp=true) {
  if (!Array.isArray(items)) return [];
  return showVimeoOnlyApp ? items : items.filter(item=>!isAndroidVimeoOnlyVideo(item));
}

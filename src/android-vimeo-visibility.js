// The app's listing rules intentionally use the catalog's Drive-availability
// flag, not the native Vimeo PLAYER's numeric-ID validation. A Vimeo-only
// record with an unlisted/malformed Vimeo ID must still disappear when OFF.
// This switch is independent of the WEBSITE switch and never removes content.
export function isVimeoOnlyCatalogItem(item) {
  return item?.hasDriveVideo === false && !item?.directVideo &&
    item?.sourceType !== 'city-drive' && item?.sourceType !== 'drive-library';
}

export function visibleAndroidVideoCatalog(items, showVimeoOnlyApp=true) {
  if (!Array.isArray(items)) return [];
  return showVimeoOnlyApp ? items : items.filter(item=>!isVimeoOnlyCatalogItem(item));
}

// Pure visibility check used by the physical Android screenshot test.
// A partly scrolled video may be mostly black *letterbox* while its upper
// visible strip contains moving real video. Require significant actual image
// pixels in the native surface, not merely a progressing ExoPlayer clock.
export function nativeVideoPictureVisible(mean,brightFraction) {
  return Number.isFinite(mean) && Number.isFinite(brightFraction) &&
    (mean>0.075 || brightFraction>0.08);
}

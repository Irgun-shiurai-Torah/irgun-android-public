// Resolve the currently displayed textarea after asynchronous posting.
// Players can re-render their watch overlay while a request is in flight,
// replacing the original textarea. Comparing element identity misses that case.
export function clearCommentComposerAfterPost({ document, currentVideoId, postedVideoId, postedText }) {
  if (!postedVideoId || String(currentVideoId || '') !== String(postedVideoId)) return false;
  const field = document?.getElementById?.('commentText');
  if (!field || String(field.value || '').trim() !== String(postedText || '').trim()) return false;
  // Finish any mobile keyboard composition before resetting the visible value.
  if (typeof field.blur === 'function') field.blur();
  // Blurring can itself re-render the player on some mobile WebViews.
  const visible = document.getElementById('commentText');
  if (!visible || String(visible.value || '').trim() !== String(postedText || '').trim()) return false;
  visible.value = '';
  return true;
}

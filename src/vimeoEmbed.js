// Vimeo returns unlisted catalog IDs as videoNumber:privacyHash. The hash is a
// separate embed parameter, never part of the numeric video ID.
export function vimeoEmbedSource(identifier, {resumeSeconds = 0, muted = false} = {}) {
  const match = String(identifier || '').trim().match(/^(\d+)(?::([a-z0-9]+))?$/i);
  if (!match) return 'about:blank';
  const privacy = match[2] ? `h=${encodeURIComponent(match[2])}&` : '';
  const seconds = Math.max(0, Math.floor(Number(resumeSeconds) || 0));
  const position = seconds > 1 ? `#t=${seconds}s` : '';
  return `https://player.vimeo.com/video/${match[1]}?${privacy}playsinline=1&autoplay=1&title=0&byline=0&portrait=0${muted ? '&muted=1' : ''}${position}`;
}

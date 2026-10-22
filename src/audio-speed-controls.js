// The same native audio engine and speed choices are used in both audio views.
// Speed selection must only update playback rate; never re-create the player.
export const AUDIO_PLAYBACK_SPEEDS = Object.freeze([0.75, 1, 1.25, 1.5, 1.75, 2]);

export function audioSpeedControlsHtml(rate = 1, language = 'en') {
  const selected = Number(rate) || 1;
  const title = language === 'he' ? 'מהירות נגינה' : 'Playback speed';
  const normal = language === 'he' ? 'רגיל' : 'Normal';
  return `<div class="audio-speed-control" role="group" aria-label="${title}" dir="ltr">
    <button type="button" class="audio-speed-trigger" data-audio-speed-trigger aria-expanded="false" title="${title}">
      <span data-audio-speed-current>${selected}×</span><span class="audio-speed-chevron" aria-hidden="true"></span>
    </button>
    <div class="audio-speed-menu" data-audio-speed-menu role="group" aria-label="${title}" hidden>
      ${AUDIO_PLAYBACK_SPEEDS.map(value => `<button type="button" data-speed-choice="${value}" aria-pressed="${selected === value}" aria-label="${value}×${value === 1 ? ` — ${normal}` : ''}" class="${selected === value ? 'active' : ''}"><span>${value}×</span><span class="audio-speed-check" aria-hidden="true">✓</span></button>`).join('')}
    </div>
  </div>`;
}

// Menu visibility is intentionally independent of the audio engine and render()
// so a speed tap cannot reset playback, scroll position or the video/audio handoff.
export function closeAudioSpeedPopupMenus(root) {
  root.querySelectorAll('[data-audio-speed-menu]').forEach(menu => { menu.hidden = true; });
  root.querySelectorAll('[data-audio-speed-trigger]').forEach(button =>
    button.setAttribute('aria-expanded', 'false'));
}
const boundPopupRoots = new WeakSet();
export function bindAudioSpeedPopupMenus(root) {
  root.querySelectorAll('[data-audio-speed-trigger]').forEach(trigger => {
    if (trigger.dataset.speedPopupBound) return;
    trigger.dataset.speedPopupBound = '1';
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      const menu = trigger.closest('.audio-speed-control')?.querySelector('[data-audio-speed-menu]');
      if (!menu) return;
      const opening = menu.hidden;
      closeAudioSpeedPopupMenus(root);
      if (opening) {
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });
  if (boundPopupRoots.has(root)) return;
  boundPopupRoots.add(root);
  root.addEventListener('click', event => {
    if (event.target?.closest?.('[data-speed-choice]') ||
        !event.target?.closest?.('.audio-speed-control'))
      closeAudioSpeedPopupMenus(root);
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeAudioSpeedPopupMenus(root);
  });
}

// Update selected rate in place: don't re-render the controls while playing.
export function refreshAudioSpeedControls(root, rate) {
  const selected = Number(rate) || 1;
  root.querySelectorAll('[data-speed-choice]').forEach(button => {
    const active = Number(button.dataset.speedChoice) === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  root.querySelectorAll('[data-audio-speed-current]').forEach(label => {
    const text = `${selected}×`;
    if (label.textContent !== text) label.textContent = text;
  });
}

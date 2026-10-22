// Keep audio choices aligned with the native video player's speed menu.
export const AUDIO_PLAYBACK_SPEEDS = Object.freeze([0.75, 1, 1.25, 1.5, 1.75, 2]);

export function audioSpeedControlsHtml(rate = 1, language = 'en') {
  const selected = Number(rate) || 1;
  const title = language === 'he' ? 'מהירות נגינה' : 'Playback speed';
  const normal = language === 'he' ? 'רגיל' : 'Normal';
  return `<div class="audio-speed-control" role="group" aria-label="${title}">
    <div class="audio-speed-heading"><span>${title}</span><strong data-audio-speed-current dir="ltr">${selected}×</strong></div>
    <div class="audio-speed-options" dir="ltr">${AUDIO_PLAYBACK_SPEEDS.map(value => `<button type="button" data-speed-choice="${value}" aria-pressed="${selected === value}" aria-label="${value}×${value === 1 ? ` — ${normal}` : ''}" class="${selected === value ? 'active' : ''}"><span>${value}×</span>${value === 1 ? `<small>${normal}</small>` : ''}</button>`).join('')}</div>
  </div>`;
}

// Update in place: selecting a rate must not recreate the player or scroll it.
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

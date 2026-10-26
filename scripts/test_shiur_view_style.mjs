import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

function between(source, from, to) {
  const first = source.indexOf(from);
  assert.ok(first >= 0, `Missing source section: ${from}`);
  const last = source.indexOf(to, first + from.length);
  assert.ok(last > first, `Missing closing section: ${to}`);
  return source.slice(first, last);
}

test('view counter still hides below 300 for public, including audio, and displays an eye at 300', () => {
  const functionSource = between(main, 'function shiurViewsHtml(', '\nfunction itemCard(');
  const state = { trends: { all: new Map() }, isAdmin: false, adminMode: false };
  let language = 'en';
  const renderViews = new Function(
    'state', 'videoId', 'rawAudioId', 'currentLanguage', 'svgIcon',
    `${functionSource}\nreturn shiurViewsHtml;`
  )(
    state,
    item => String(item.id),
    item => String(item.id),
    () => language,
    name => `<svg data-icon="${name}"></svg>`
  );

  const video = { id: 'video-1' };
  assert.equal(renderViews(video), '', 'public should not see a missing/zero view count');
  state.trends.all.set(video.id, 299);
  assert.equal(renderViews(video), '', '299 should stay hidden');
  state.trends.all.set(video.id, 300);
  assert.match(renderViews(video), /300 views/);
  assert.match(renderViews(video), /data-icon="eye"/);
  assert.match(renderViews(video), /class="shiur-views-stat"/);
  state.trends.all.set(video.id, 1506);
  assert.match(renderViews(video), /1,506 views/);

  state.trends.all.set(video.id, 299);
  state.isAdmin = true;
  assert.equal(renderViews(video), '', 'admin privileges without Admin Mode do not expose counts');
  state.adminMode = true;
  assert.match(renderViews(video), /299 views/, 'verified Admin Mode retains exact counts');

  language = 'he';
  assert.match(renderViews(video), /299 צפיות/);
  state.isAdmin = false;
  assert.equal(renderViews(video), '', 'public hiding applies in Hebrew too');

  language = 'en';
  state.trends.all.set('audio:audio-1', 301);
  assert.match(renderViews({ id: 'audio-1' }, true), /301 listens/);
  language = 'he';
  assert.match(renderViews({ id: 'audio-1' }, true), /301 האזנות/);
  state.trends.all.set('audio:audio-1', 299);
  assert.equal(renderViews({ id: 'audio-1' }, true), '', 'audio shares the 300 threshold');
});

test('Option A places views inline beside date/duration, not in a separate card row', () => {
  const card = between(main, 'function itemCard(', '\nfunction compactItem(');
  assert.match(card, /<div class="media-meta media-meta-row"><span class="media-date-duration">[^\n]*\$\{shiurViewsHtml\(item, isAudio\)\}<\/div>/);
  assert.equal((card.match(/shiurViewsHtml\(item, isAudio\)/g) || []).length, 1);
  assert.ok(card.indexOf('media-meta-row') < card.indexOf('card-catalog-code'));
  assert.match(main, /eye: `<svg \$\{common\}>/);

  const watch = between(main, 'function watchHtml()', '\nfunction fullPlayerHtml()');
  assert.match(watch, /<div class="watch-meta">[^\n]*\$\{watchViews \?/);
  assert.equal((watch.match(/shiurViewsHtml\(v\)/g) || []).length, 1);

  const player = main.slice(main.indexOf('function fullPlayerHtml()'));
  assert.match(player, /<div class="player-heading">[^\n]*\$\{playerViews \?/);
  assert.equal((player.match(/shiurViewsHtml\(sourceItem, c.kind === 'library-audio'\)/g) || []).length, 1);

  assert.match(css, /\.media-meta-row\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s);
  assert.match(css, /\.shiur-views-stat\s*\{[^}]*display:\s*inline-flex;/s);
  assert.match(css, /\.shiur-views-stat \.ui-icon\s*\{[^}]*width:\s*13px;/s);
});

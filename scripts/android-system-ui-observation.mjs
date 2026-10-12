import assert from 'node:assert/strict';

const nodes = xml => xml.match(/<node\b[^>]*>/g) || [];
const attribute = (node, name) => node.match(new RegExp(name + '="([^"]*)"'))?.[1] || '';
const systemNode = node => /package="(?:com\.android\.systemui|android)"/.test(node);

export function fullscreenEducationTapPoint(xml) {
  const visible = nodes(xml).filter(node => systemNode(node) && /visible="true"/.test(node));
  if (!visible.some(node => /Viewing full screen/.test(attribute(node, 'text')))) return null;
  const button = visible.find(node => attribute(node, 'text') === 'Got it' && /clickable="true"/.test(node));
  const rect = button?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)?.slice(1).map(Number);
  assert.ok(rect && rect[2] > rect[0] && rect[3] > rect[1], 'Actual fullscreen education dialog must expose its Got it button');
  return [Math.round((rect[0] + rect[2]) / 2), Math.round((rect[1] + rect[3]) / 2)];
}

function durationSeconds(value) {
  const elapsed = value.split(/\s+of\s+/i)[0].trim();
  if (/^\d{1,3}:\d{2}(?::\d{2})?$/.test(elapsed)) {
    return elapsed.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  }
  // SystemUI accessibility describes the visible seek bar in spoken units on
  // recent Android versions, e.g. "12 minutes, 29 seconds of 1 hour, ...".
  const parts = [...elapsed.matchAll(/(\d+)\s+(hours?|minutes?|seconds?)/gi)];
  const remainder = elapsed.replace(/\d+\s+(?:hours?|minutes?|seconds?)/gi, '').replace(/[\s,]/g, '');
  if (!parts.length || remainder) return null;
  return parts.reduce((total, [, count, unit]) => total + Number(count) * (/^hour/i.test(unit) ? 3600 : /^minute/i.test(unit) ? 60 : 1), 0);
}

export function mediaNotificationClock(xml) {
  const visible = nodes(xml).filter(node => systemNode(node) && /visible="true"/.test(node));
  const bar = visible.find(node => /media_progress_bar|android.widget.SeekBar/.test(node));
  const elapsedNode = visible.find(node => /elapsedTime|elapsed_time/.test(attribute(node, 'resource-id')));
  const value = bar ? attribute(bar, 'content-desc') : elapsedNode ? attribute(elapsedNode, 'text') : '';
  const seconds = durationSeconds(value);
  assert.ok(seconds != null, 'Actual Android notification must expose its elapsed media timer');
  return seconds;
}

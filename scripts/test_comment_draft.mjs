import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clearCommentComposerAfterPost } from '../src/comment-draft.js';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const start = source.indexOf('let commentPostPending = false;');
const end = source.indexOf('\nasync function editComment(', start);
assert.ok(start !== -1 && end > start, 'Locate the actual posting handler');
assert.match(source, /import \{ clearCommentComposerAfterPost \} from '\.\/comment-draft\.js';/);
const handler = source.slice(start, end);
assert.match(handler, /clearCommentComposerAfterPost\(/);
const makePostComment = new Function(
  'state', 'document', 'preserveWatchTime', 'apiJson', 'videoId',
  'loadComments', 'alert', 'requireLogin', 'clearCommentComposerAfterPost',
  handler + '\nreturn postComment;'
);

function harness({ onPost, onPreserve } = {}) {
  const button = { disabled: false };
  const makeField = (value = '  Test comment  ') => ({
    value, blurred: false,
    blur() { this.blurred = true; },
    closest() { return { querySelector() { return button; } }; }
  });
  let current = makeField();
  const state = { watchVideo: { id: 'lecture-a' }, user: { id: 12 } };
  const document = { getElementById(id) { return id === 'commentText' ? current : null; } };
  const events = { posts: [], loads: 0, errors: [] };
  const context = {
    state,
    get field() { return current; },
    replace(value = '  Test comment  ') { current = makeField(value); return current; },
    button
  };
  const postComment = makePostComment(
    state, document,
    async () => { if (onPreserve) await onPreserve(context); },
    async (url, options) => {
      events.posts.push({ url, options });
      if (onPost) await onPost(context);
    },
    item => item.id,
    async () => { events.loads++; },
    message => { events.errors.push(message); },
    () => { throw Error('Unexpected login prompt'); },
    clearCommentComposerAfterPost
  );
  return { ...context, get field() { return current; }, postComment, events };
}

test('posting successfully clears the active textarea and reloads comments', async () => {
  const h = harness();
  await h.postComment();
  assert.equal(h.field.value, '');
  assert.equal(h.field.blurred, true);
  assert.equal(h.button.disabled, false);
  assert.equal(h.events.posts.length, 1);
  assert.equal(JSON.parse(h.events.posts[0].options.body).text, 'Test comment');
  assert.equal(h.events.loads, 1);
});

test('posting clears the new textarea if watch view remounts during request', async () => {
  const h = harness({ onPost: c => c.replace('Test comment') });
  await h.postComment();
  assert.equal(h.field.value, '');
  assert.equal(h.events.loads, 1);
});

test('blur that re-mounts the textarea still clears the current field', async () => {
  const first = { value: 'Test comment', blur() { visible = { value: 'Test comment' }; } };
  let visible = first;
  const document = { getElementById() { return visible; } };
  assert.equal(clearCommentComposerAfterPost({
    document, currentVideoId: 'a', postedVideoId: 'a', postedText: 'Test comment'
  }), true);
  assert.equal(visible.value, '');
});

test('failed posting retains the draft and re-enables the button', async () => {
  const h = harness({ onPost: async () => { throw Error('Server error'); } });
  await h.postComment();
  assert.equal(h.field.value, '  Test comment  ');
  assert.equal(h.button.disabled, false);
  assert.deepEqual(h.events.errors, ['Server error']);
  assert.equal(h.events.loads, 0);
});

test('a new draft typed while posting is not cleared', async () => {
  const h = harness({ onPost: c => { c.field.value = 'Next comment'; } });
  await h.postComment();
  assert.equal(h.field.value, 'Next comment');
});

test('moving to another shiur while posting does not clear that shiur draft', async () => {
  const h = harness({ onPost: c => { c.state.watchVideo = { id: 'lecture-b' }; c.replace(); } });
  await h.postComment();
  assert.equal(h.field.value, '  Test comment  ');
});

test('duplicate taps submit only once while a request is in flight', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness({ onPost: async () => pending });
  const first = h.postComment();
  const second = h.postComment();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.events.posts.length, 1);
  assert.equal(h.button.disabled, true);
  release();
  await Promise.all([first, second]);
  assert.equal(h.field.value, '');
  assert.equal(h.button.disabled, false);
});

test('empty and whitespace-only drafts are never posted', async () => {
  const h = harness();
  h.field.value = ' \n ';
  await h.postComment();
  assert.equal(h.events.posts.length, 0);
});

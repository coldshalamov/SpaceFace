import test from 'node:test';
import assert from 'node:assert/strict';
import { createArmoryPreviewMedia } from '../src/ui/orrery/armoryPreviewMedia.js';

function video() {
  const calls = [];
  return { calls, autoplay: true,
    play() { calls.push('play'); return Promise.resolve(); },
    pause() { calls.push('pause'); },
    removeAttribute(name) { calls.push(`remove:${name}`); },
    load() { calls.push('load'); },
  };
}

for (const active of [true, false]) test(`only a ready, active inspection plays (active=${active})`, () => {
  const preview = createArmoryPreviewMedia();
  preview.setActive(active);
  const token = preview.begin();
  const clip = video();
  assert.equal(preview.attach(token, clip), true);
  assert.equal(clip.autoplay, false);
  assert.deepEqual(clip.calls, []);
  assert.equal(preview.ready(token, clip), true);
  assert.deepEqual(clip.calls, active ? ['play'] : ['pause']);
});

test('hiding pauses and showing resumes the current ready clip', () => {
  const preview = createArmoryPreviewMedia();
  const token = preview.begin(); const clip = video();
  preview.attach(token, clip); preview.ready(token, clip);
  preview.setActive(false); preview.setActive(true);
  assert.deepEqual(clip.calls, ['play', 'pause', 'play']);
});

test('showing before readiness does not force an unloaded clip to play', () => {
  const preview = createArmoryPreviewMedia();
  const token = preview.begin(); const clip = video();
  preview.attach(token, clip);
  preview.setActive(false); preview.setActive(true);
  assert.deepEqual(clip.calls, ['pause']);
  preview.ready(token, clip);
  assert.deepEqual(clip.calls, ['pause', 'play']);
});

test('reduced motion is checked again when resuming, not only at creation', () => {
  let reduced = false;
  const preview = createArmoryPreviewMedia({ motionReduced: () => reduced });
  const token = preview.begin(); const clip = video();
  preview.attach(token, clip); preview.ready(token, clip);
  reduced = true; preview.setActive(true);
  assert.deepEqual(clip.calls, ['play', 'pause']);
});

test('A -> B -> A gets distinct ownership tokens', () => {
  const preview = createArmoryPreviewMedia();
  const firstA = preview.begin(); const clipA = video();
  preview.attach(firstA, clipA);
  const b = preview.begin(); const clipB = video(); preview.attach(b, clipB);
  const secondA = preview.begin(); const newClipA = video(); preview.attach(secondA, newClipA);
  assert.notEqual(firstA, secondA);
  assert.equal(preview.owns(firstA), false);
  assert.equal(preview.owns(b), false);
  assert.equal(preview.owns(secondA), true);
  assert.equal(preview.ready(firstA, clipA), false);
  assert.equal(preview.attach(firstA, clipA), false);
  assert.deepEqual(clipA.calls, ['pause', 'remove:src', 'load']);
  assert.deepEqual(newClipA.calls, []);
  preview.ready(secondA, newClipA);
  assert.deepEqual(newClipA.calls, ['play']);
});

test('ready must belong to both the current token and its media element', () => {
  const preview = createArmoryPreviewMedia(); const token = preview.begin();
  const owned = video(); const alien = video(); preview.attach(token, owned);
  assert.equal(preview.ready(token, alien), false);
  assert.deepEqual(owned.calls, []);
  assert.deepEqual(alien.calls, []);
});

test('teardown revokes ownership before a synchronous load event can run', () => {
  const preview = createArmoryPreviewMedia(); const token = preview.begin(); const clip = video();
  clip.load = () => assert.equal(preview.owns(token), false);
  preview.attach(token, clip);
  preview.begin();
});

test('clear retires an errored preview without disposing the controller', () => {
  const preview = createArmoryPreviewMedia(); const token = preview.begin(); const clip = video();
  preview.attach(token, clip); preview.clear();
  assert.equal(preview.owns(token), false);
  assert.equal(preview.ready(token, clip), false);
  assert.deepEqual(clip.calls, ['pause', 'remove:src', 'load']);
  assert.equal(preview.owns(preview.begin()), true);
});

test('dispose releases once, rejects late events and refuses new ownership', () => {
  const preview = createArmoryPreviewMedia(); const token = preview.begin(); const clip = video();
  preview.attach(token, clip); preview.dispose(); preview.dispose(); preview.setActive(true);
  assert.deepEqual(clip.calls, ['pause', 'remove:src', 'load']);
  assert.equal(preview.owns(token), false);
  assert.equal(preview.owns(null), false);
  assert.equal(preview.ready(token, clip), false);
  assert.equal(preview.begin(), null);
  assert.equal(preview.attach(null, video()), false);
});

test('a failed pause cannot prevent resource release', () => {
  const preview = createArmoryPreviewMedia(); const token = preview.begin(); const clip = video();
  clip.pause = () => { throw new Error('already detached'); };
  preview.attach(token, clip);
  assert.doesNotThrow(() => preview.dispose());
  assert.deepEqual(clip.calls, ['remove:src', 'load']);
});

test('autoplay rejection and synchronous playback failure leave the inspector usable', async () => {
  for (const play of [() => Promise.reject(new Error('denied')), () => { throw new Error('detached'); }, () => undefined]) {
    const preview = createArmoryPreviewMedia(); const token = preview.begin(); const clip = video();
    clip.play = play; preview.attach(token, clip);
    assert.doesNotThrow(() => preview.ready(token, clip));
    await Promise.resolve();
    assert.equal(preview.owns(token), true);
    preview.dispose();
  }
});

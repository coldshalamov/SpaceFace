import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countShadowReceivers,
  createShadowReceiverTally,
  noteShadowPolicyChanged,
} from '../src/render/shadowReceiverTally.js';

function mesh(receiveShadow, children = []) {
  return {
    receiveShadow,
    children,
    traverse(fn) {
      fn(this);
      for (const child of children) {
        if (typeof child.traverse === 'function') child.traverse(fn);
        else fn(child);
      }
    },
  };
}

test('add/remove keep the receiver count without a full recount', () => {
  const tally = createShadowReceiverTally();
  const ship = mesh(true, [mesh(true), mesh(false)]);
  const rock = mesh(true);
  assert.equal(countShadowReceivers(ship), 2);
  tally.noteAdded(ship);
  tally.noteAdded(rock);
  assert.equal(tally.count, 3);
  tally.noteRemoved(ship);
  assert.equal(tally.count, 1);
  assert.equal(tally.dirty, true);
});

test('dirty fallback recounts the live scene exactly once', () => {
  const tally = createShadowReceiverTally();
  const scene = mesh(false, [mesh(true), mesh(true), mesh(false)]);
  tally.markDirty();
  assert.equal(tally.resolve(scene), 2);
  assert.equal(tally.dirty, false);
  assert.equal(tally.resolve(scene), 2);
});

test('owner dirty forces a recount even when the incremental dirty bit is clear', () => {
  const tally = createShadowReceiverTally();
  const ship = mesh(true);
  tally.noteAdded(ship);
  const scene = mesh(false, [ship]);
  tally.recount(scene);
  assert.equal(tally.dirty, false);
  ship.receiveShadow = false;
  assert.equal(tally.resolve(scene), 1, 'stale incremental count would keep shadows on');
  assert.equal(tally.resolve(scene, { force: true }), 0);
  assert.equal(tally.count, 0);
});

test('live shadow-map gate forces a recount when the owner dirty flag is set', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /force:\s*this\._shadowReceiversDirty === true/);
});

test('LOD receiveShadow churn without a dirty signal can walk the tally to zero', () => {
  const tally = createShadowReceiverTally();
  const farChild = mesh(false);
  const ship = mesh(true, [farChild]);
  const scene = mesh(false, [ship]);
  tally.noteAdded(ship);
  tally.recount(scene);
  assert.equal(tally.count, 1);
  farChild.receiveShadow = true;
  ship.receiveShadow = true;
  tally.noteRemoved(ship);
  assert.equal(tally.count, 0, 'subtracting the later LOD0 count underflows past the live receivers');
});

test('a policy refresh marks the tally dirty so the next resolve recounts live flags', () => {
  const tally = createShadowReceiverTally();
  const farChild = mesh(false);
  const ship = mesh(true, [farChild]);
  const scene = mesh(false, [ship]);
  tally.noteAdded(ship);
  tally.recount(scene);
  farChild.receiveShadow = true;
  assert.equal(noteShadowPolicyChanged(tally, true), true);
  assert.equal(tally.dirty, true);
  assert.equal(tally.resolve(scene), 2);
  tally.noteRemoved(ship);
  assert.equal(tally.resolve(scene), 0);
});

test('live LOD shadow policy refresh dirties the receiver tally', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /syncShadowCasterPolicy\(/);
  assert.match(source, /noteShadowPolicyChanged\(/);
});

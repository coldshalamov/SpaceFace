import assert from 'node:assert/strict';
import test from 'node:test';

import { countShadowReceivers, createShadowReceiverTally } from '../src/render/shadowReceiverTally.js';

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

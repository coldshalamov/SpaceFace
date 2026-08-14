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

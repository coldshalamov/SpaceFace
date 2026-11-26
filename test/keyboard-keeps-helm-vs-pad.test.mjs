// Lane audit C2 (2026-11-21): a gamepad — or any HID device the browser reports as one — must not
// take the helm from a keyboard pilot who is holding movement keys. Before: a pad edge (a stick
// crossing its deadzone, a drifting axis, a button) set the helm to the pad and zeroed the held
// keyboard axes until the keys were lifted and pressed again: "when I hold two keys the game just
// locks up". Ruling: keyboard input wins the helm while any movement key is held; a pad takes it
// only on a deliberate press with no movement key held.
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMovementOwner } from '../src/systems/input.js';

const pad = (over = {}) => ({
  isConnected: () => true,
  axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 },
  actions: {},
  helmGestureEdge: false,
  ...over,
});

test('a pad edge cannot take the helm while a movement key is held', () => {
  const host = {};
  resolveMovementOwner(host, { kbdDrive: true, gp: pad(), tp: null });
  assert.equal(host.movementSource, 'keyboard');
  for (let frame = 0; frame < 30; frame++) {
    // A drifting stick crossing its deadzone and a stray button, every frame, while W+A stay held.
    resolveMovementOwner(host, { kbdDrive: true,
      gp: pad({ helmGestureEdge: frame % 2 === 0, axes: { leftX: 0.3, leftY: -0.2, rightX: 0, rightY: 0 },
        actions: { boost: { pressed: frame % 3 === 0 } } }), tp: null });
    assert.equal(host.movementSource, 'keyboard', `frame ${frame}: the held keyboard keeps the helm`);
  }
});

test('with no movement key held, a deliberate pad press takes the helm', () => {
  const host = {};
  resolveMovementOwner(host, { kbdDrive: true, gp: pad(), tp: null });
  resolveMovementOwner(host, { kbdDrive: false, gp: pad({ helmGestureEdge: true }), tp: null });
  assert.equal(host.movementSource, 'gamepad');
  // ...and the keyboard takes it back on its next press.
  resolveMovementOwner(host, { kbdDrive: true, gp: pad(), tp: null });
  assert.equal(host.movementSource, 'keyboard');
});

test('a quiet connected pad never claims an idle helm', () => {
  const host = {};
  for (let i = 0; i < 10; i++) resolveMovementOwner(host, { kbdDrive: false, gp: pad(), tp: null });
  assert.equal(host.movementSource, null);
});

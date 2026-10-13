// SFQ-I010 — a clean cut must not play the tether snap. A real overload still does.
//
//   node --test test/infer-p08-clean-cut.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { vfx } from '../src/render/vfx.js';

const SEED = 4242;

function snapHarness() {
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 10, z: 0 }, rot: 0, radius: 9,
  };
  const target = {
    id: 'rock', type: 'asteroid', alive: true,
    pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
  };
  const entities = new Map([[player.id, player], [target.id, target]]);
  const cues = [];
  const harness = Object.create(vfx);
  harness._scene = {};
  harness.state = { playerId: player.id, rng: () => 0.5, simTime: 0 };
  harness.helpers = { player: () => player };
  harness._tetherCable = {
    fade: 1,
    snapAge: 999,
    latchAge: 1,
    fadeRate: 0,
    wasActive: true,
    lastSourceId: player.id,
    lastTargetId: target.id,
    lastAttachmentId: 'att-1',
    lastRemote: false,
    endpointScratch: {},
  };
  harness._burst = 1;
  harness._c0 = { set() { return this; } };
  harness._c1 = { set() { return this; } };
  harness._emitJuiceCue = (id) => { cues.push(id); };
  harness._ent = (id) => entities.get(id) || null;
  harness._spawnParticle = () => {};
  harness._spawnSprite = () => {};
  harness._flashLight = () => {};
  return { harness, cues };
}

function present(reason) {
  const { harness, cues } = snapHarness();
  const handled = harness._onTetherSnap({
    targetId: 'rock',
    attachmentId: 'att-1',
    reason,
  });
  return { handled, snapAge: harness._tetherCable.snapAge, cues };
}

test('a clean cut does not play the snap, and an overload does (seed 4242)', () => {
  const clean = present('cut');
  const released = present('release');
  const snap = present('overload');
  assert.equal(clean.handled, false, 'a deliberate cut is not a snap');
  assert.equal(clean.snapAge, 999, 'a clean cut must leave the ribbon out of snap fade');
  assert.equal(clean.cues.includes('presentation.tether.break'), false);
  assert.equal(released.handled, false, 'a plain release is not a snap');
  assert.equal(released.snapAge, 999);
  assert.equal(released.cues.includes('presentation.tether.break'), false);
  assert.equal(snap.handled, true, 'an overload still plays the snap');
  assert.equal(snap.snapAge, 0);
  assert.equal(snap.cues.includes('presentation.tether.break'), true);
  console.log(`SEED=${SEED} cut handled=${clean.handled} snapAge=${clean.snapAge} overload snapAge=${snap.snapAge}`);
});

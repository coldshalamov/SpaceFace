import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shipPitchCandidates,
  updateShipPitchPresentation,
} from '../src/render/shipPitchPresentation.js';

function craft(type = 'ship', overrides = {}) {
  return {
    alive: true,
    type,
    flags: { boosting: false, docked: false },
    vel: { x: 0, z: 0 },
    rot: 0,
    maxSpeed: 100,
    pitch: 0,
    ...overrides,
  };
}

function closeTo(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: expected ${expected}, got ${actual}`);
}

test('ship pitch uses the maintained ship-like domain and preserves exact craft cues', () => {
  const boostingShip = craft('ship', {
    flags: { boosting: true, docked: false },
    vel: { x: 100, z: 0 },
  });
  const cruiseDrone = craft('drone', { vel: { x: 50, z: 0 } });
  const unrelatedIndexedOut = craft('ship', {
    flags: { boosting: true, docked: false },
    vel: { x: 100, z: 0 },
  });
  const state = {
    entityList: [boostingShip, { alive: true, type: 'asteroid', pitch: 0 }, unrelatedIndexedOut, cruiseDrone],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      shipLike: [boostingShip, cruiseDrone],
    },
  };

  assert.equal(shipPitchCandidates(state), state.entityIndex.shipLike);
  assert.equal(updateShipPitchPresentation(state, 1), 2, 'frame dt is clamped while both indexed craft update');

  const easing = 1 - Math.exp(-6 * 0.05);
  closeTo(boostingShip.pitch, -0.13 * easing, 'afterburner pitch cue');
  closeTo(cruiseDrone.pitch, -0.025 * easing, 'cruise pitch cue');
  assert.equal(unrelatedIndexedOut.pitch, 0,
    'unrelated authoritative entities are not visited once the ship-like index is available');
});

test('ship pitch keeps legacy fallback, lifecycle skips, and zero settling', () => {
  const active = craft('ship', { pitch: 0.0004 });
  const docked = craft('ship', {
    flags: { boosting: true, docked: true },
    pitch: 0.2,
  });
  const dead = craft('drone', { alive: false, pitch: -0.2 });
  const asteroid = { alive: true, type: 'asteroid', pitch: 0.3 };
  const state = { entityList: [active, docked, dead, asteroid] };

  assert.equal(shipPitchCandidates(state), state.entityList);
  assert.equal(updateShipPitchPresentation(state, 1 / 60), 1);
  assert.equal(active.pitch, 0, 'idle near-zero pitch still settles exactly to level');
  assert.equal(docked.pitch, 0.2, 'docked craft retain their previous render-only pitch state');
  assert.equal(dead.pitch, -0.2);
  assert.equal(asteroid.pitch, 0.3);
});

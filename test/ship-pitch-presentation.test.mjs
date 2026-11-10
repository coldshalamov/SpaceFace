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

test('ship pitch writes and clears a separate resident thrown-trail plan from live velocity', () => {
  const thrown = craft('ship', {
    id: 2,
    radius: 6,
    vel: { x: 120, z: 0 },
    angVel: 3,
    bank: 0,
  });
  const status = {
    id: 'status_tumbling',
    attackerId: 1,
    data: { cause: 'thrown', startedAt: 1, until: 5, spin: 3 },
  };
  const state = {
    playerId: 1,
    player: { targetId: 2 },
    simTime: 2,
    entityList: [thrown],
    combat: { entities: { 2: { statuses: { status_tumbling: status } } } },
    settings: {
      video: { motionReduce: false, flashReduce: false },
      accessibility: { flashReduce: false },
    },
  };

  assert.equal(updateShipPitchPresentation(state, 1 / 60), 1);
  const tumbleRecord = thrown.presentation.tumble;
  const trailRecord = thrown.presentation.thrownTrail;
  assert.notEqual(trailRecord, tumbleRecord, 'translational trail stays separate from angular cues');
  assert.equal(tumbleRecord.cause, 'thrown');
  assert.equal(tumbleRecord.attackerId, 1);
  assert.equal(tumbleRecord.playerCaused, true,
    'angular presentation retains exact active-status causality without owning the trail');
  assert.equal(trailRecord.active, true);
  assert.equal(trailRecord.axisX, 1);
  assert.equal(trailRecord.axisZ, 0);
  assert.equal(trailRecord.admissionPriority, 0.98);

  thrown.vel.x = 0;
  thrown.vel.z = 120;
  updateShipPitchPresentation(state, 1 / 60);
  assert.equal(thrown.presentation.thrownTrail, trailRecord, 'trail plan remains resident');
  assert.equal(trailRecord.axisX, 0);
  assert.equal(trailRecord.axisZ, 1, 'resident plan follows the current velocity, not prior history');

  delete state.combat.entities[2].statuses.status_tumbling;
  updateShipPitchPresentation(state, 1 / 60);
  assert.equal(trailRecord.active, false, 'status exit clears the record in place');

  state.combat.entities[2].statuses.status_tumbling = status;
  thrown.alive = true;
  thrown.vel.x = 120;
  thrown.vel.z = 0;
  updateShipPitchPresentation(state, 1 / 60);
  assert.equal(trailRecord.active, true);
  thrown.alive = false;
  assert.equal(updateShipPitchPresentation(state, 1 / 60), 0);
  assert.equal(trailRecord.active, false, 'death clears stale trail intent without replacing it');
});

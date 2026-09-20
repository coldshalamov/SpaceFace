import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { beacons } from '../src/systems/beacons.js';

function bootBeacons({ credits = 1000, helpers = {} } = {}) {
  const state = createGameState(47);
  state.mode = 'flight';
  state.playerId = 1;
  state.player.credits = credits;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 12, z: -8 }, vel: { x: 0, z: 0 },
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const charges = [];
  bus.on('economy:chargeCredits', (p) => charges.push(p));
  const system = Object.create(beacons);
  system.init({ state, bus, helpers });
  return { state, bus, system, charges };
}

test('a claim beacon plants a record at the player and charges credits', () => {
  const { state, bus, system, charges } = bootBeacons();
  try {
    bus.emit('beacon:deploy');
    assert.equal(state.beacons.length, 1);
    assert.equal(state.beacons[0].alive, true);
    // The beacon drops AFT of the hull (facing defaults to +x with no rot): the buoy entity is a
    // fixed physics collider, so it must never spawn centered inside the player's capsule.
    assert.equal(state.beacons[0].x, 12 - 30);
    assert.equal(state.beacons[0].z, -8);
    assert.equal(charges.length, 1);
    assert.equal(charges[0].amount, 250);
    assert.equal(charges[0].reason, 'claim_beacon');
  } finally {
    bus.clear();
  }
});

test('deploying a beacon also spawns its world buoy through the entity contract', () => {
  const spawned = [];
  const { state, bus, system } = bootBeacons({
    helpers: {
      spawnEntity: (spec) => { spawned.push(spec); return { id: 777, type: spec.type }; },
      removeEntity: () => {},
    },
  });
  try {
    bus.emit('beacon:deploy');
    assert.equal(state.beacons.length, 1);
    const rec = state.beacons[0];
    assert.equal(rec.entityId, 777);
    assert.equal(spawned.length, 1);
    const spec = spawned[0];
    assert.equal(spec.type, 'beacon');
    assert.equal(spec.pos.x, rec.x);
    assert.equal(spec.pos.z, rec.z);
    assert.equal(spec.data.parentType, 'story_prop');
    assert.equal(spec.data.scanLabel, 'Claim beacon');
    assert.equal(spec.data.storyPropKind, 'claim_beacon');
    assert.equal(spec.data.claimBeaconId, rec.id);
    assert.equal(spec.data.tetherable, true);
    assert.equal(spec.data.masslineTetherable, true);
    assert.equal(spec.mass, 1e6);
  } finally {
    bus.clear();
  }
});

test('an expired beacon despawns its world buoy with it', () => {
  const removed = [];
  const { state, bus, system } = bootBeacons({
    helpers: {
      spawnEntity: () => ({ id: 777, type: 'beacon' }),
      removeEntity: (id) => removed.push(id),
    },
  });
  try {
    bus.emit('beacon:deploy');
    const rec = state.beacons[0];
    assert.equal(rec.entityId, 777);
    state.simTime = rec.expireAt + 0.1;
    system.update(0.016, state);
    assert.equal(state.beacons.length, 0);
    assert.deepEqual(removed, [777]);
  } finally {
    bus.clear();
  }
});

test('a harness without spawn helpers still plants a working record-only beacon', () => {
  const { state, bus, system } = bootBeacons();
  try {
    bus.emit('beacon:deploy');
    const rec = state.beacons[0];
    assert.equal(rec.entityId, null);
    state.simTime = rec.expireAt + 0.1;
    system.update(0.016, state);
    assert.equal(state.beacons.length, 0);
  } finally {
    bus.clear();
  }
});

test('a broke pilot cannot plant a beacon', () => {
  const { state, bus, system } = bootBeacons({ credits: 10 });
  try {
    const ok = system.deploy();
    assert.equal(ok, false);
    assert.equal((state.beacons || []).length, 0);
  } finally {
    bus.clear();
  }
});

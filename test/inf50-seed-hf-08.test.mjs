// SEED-HF-08 — a latch is refused through a live wreck or a station hull, not only through rock.
// Seed 4242. Admission geometry only: the same open segment that a rock blocks, and the same
// sideways step that clears a rock. Ships and drones stay clutter. Dormant-rock drift is untouched.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectMasslineObstructionRocks,
  isMasslineObstructed,
} from '../src/world/asteroidField.js';
import { validateTwinBridlePair } from '../src/systems/tetherGameplay.js';

const SEED = 4242;

function hull(id, type, pos, overrides = {}) {
  return {
    id,
    type,
    alive: true,
    collides: true,
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    mass: 40,
    data: {},
    ...overrides,
    pos: { x: pos.x, z: pos.z, ...(overrides.pos || {}) },
  };
}

function lineState(bodies, extra = {}) {
  const list = bodies.filter(Boolean);
  return {
    simTime: extra.simTime ?? 0,
    meta: { seed: SEED },
    entityList: list,
    entities: new Map(list.filter((body) => body.id != null).map((body) => [body.id, body])),
    world: extra.world || { asteroidField: { rocks: extra.rocks || [] } },
    entityIndex: extra.entityIndex || null,
  };
}

function segment(state, target, sourceWorld, targetWorld, obstacles) {
  return isMasslineObstructed({
    state,
    player: { id: 1, type: 'ship' },
    target,
    sourceWorld,
    targetWorld,
    obstacles,
  });
}

const SOURCE = { x: 0, z: 0 };
const TARGET_WORLD = { x: 120, z: 0 };
const STEP = { x: 0, z: 30 };

test('SEED-HF-08 seed 4242 a wreck or station hull blocks the open line, and a 30 WU sidestep clears it', () => {
  const wasp = hull(2, 'ship', { x: 120, z: 0 }, { radius: 10, mass: 500 });
  const wreck = hull(8, 'wreck', { x: 60, z: 0 }, { radius: 12 });
  const station = hull(9, 'station', { x: 60, z: 0 }, { radius: 12, data: { dockRadius: 400 } });
  const rock = hull(10, 'asteroid', { x: 60, z: 0 }, { radius: 12, physicsBody: { radius: 12 } });

  for (const blocker of [wreck, station, rock]) {
    const state = lineState([wasp, blocker]);
    assert.equal(segment(state, wasp, SOURCE, TARGET_WORLD), true,
      `${blocker.type} on the open segment is refused`);
    assert.equal(segment(state, wasp, STEP, TARGET_WORLD), false,
      `the same 30 WU sidestep that clears a rock clears a ${blocker.type}`);
  }
});

test('SEED-HF-08 admission says blocked for a wreck and a station, and the sidestep opens the pair', () => {
  const source = hull(3, 'ship', { x: 0, z: 0 }, { radius: 8, mass: 16 });
  const target = hull(4, 'ship', { x: 120, z: 0 }, { radius: 8, mass: 16 });
  const player = hull(1, 'ship', { x: -40, z: 0 }, { radius: 8, mass: 16 });
  const def = { maxLength: 480 };

  for (const type of ['wreck', 'station', 'asteroid']) {
    const blocker = hull(20, type, { x: 60, z: 0 }, {
      radius: 14,
      physicsBody: type === 'asteroid' ? { radius: 14 } : undefined,
      data: type === 'station' ? { stationId: 'station_test', dockRadius: 500 } : {},
    });
    const state = lineState([player, source, target, blocker]);
    assert.equal(validateTwinBridlePair({}, state, player, source, target, def), 'blocked',
      `a ${type} between the pair is refused blocked`);
    source.pos = { x: 0, z: 30 };
    target.pos = { x: 120, z: 30 };
    assert.equal(validateTwinBridlePair({}, state, player, source, target, def), null,
      `stepping the pair 30 WU off the ${type} clears it`);
    source.pos = { x: 0, z: 0 };
    target.pos = { x: 120, z: 0 };
  }
});

test('SEED-HF-08 ships and drones do not block, and a station dock bubble is not the hull', () => {
  const wasp = hull(2, 'ship', { x: 120, z: 0 }, { radius: 10 });
  const ship = hull(11, 'ship', { x: 60, z: 0 }, { radius: 40, mass: 900 });
  const drone = hull(12, 'drone', { x: 60, z: 0 }, { radius: 40 });
  const dock = hull(13, 'station', { x: 60, z: 30 }, {
    radius: 8,
    data: { dockRadius: 500, stationId: 'station_pad' },
  });
  const state = lineState([wasp, ship, drone, dock]);
  assert.equal(segment(state, wasp, SOURCE, TARGET_WORLD), false,
    'a ship, a drone, and a dock bubble off the hull do not block');

  const dead = hull(14, 'wreck', { x: 60, z: 0 }, { alive: false, radius: 20 });
  const ghost = hull(15, 'wreck', { x: 60, z: 0 }, { collides: false, radius: 20 });
  const scripted = hull(16, 'station', { x: 60, z: 0 }, { physicsBody: false, radius: 20 });
  const clear = lineState([wasp, dead, ghost, scripted]);
  assert.equal(segment(clear, wasp, SOURCE, TARGET_WORLD), false,
    'a dead, non-colliding, or scripted hull does not block');
});

test('SEED-HF-08 the collector returns live wrecks and stations, not ships, and the endpoint hull is excluded', () => {
  const wasp = hull(2, 'ship', { x: 120, z: 0 }, { radius: 10 });
  // Mid-segment but clear of the endpoint: a hull disc containing the latch target reads
  // as a mounted payload (deliberately latchable), so the wreck must not hold (70,0).
  const wreck = hull(8, 'wreck', { x: 50, z: 0 }, { radius: 12 });
  const station = hull(9, 'station', { x: 70, z: 0 }, { radius: 10, data: { dockRadius: 300 } });
  const ship = hull(11, 'ship', { x: 60, z: 0 }, { radius: 30 });
  const drone = hull(12, 'drone', { x: 55, z: 0 }, { radius: 30 });
  const state = lineState([wasp, wreck, station, ship, drone]);
  const found = collectMasslineObstructionRocks(state, { minX: 0, minZ: -5, maxX: 120, maxZ: 5 });
  assert.deepEqual(found.map((body) => body.id).sort((a, b) => a - b), [8, 9]);

  const indexed = lineState([wasp, ship, drone], {
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      asteroids: [],
      wrecks: [wreck],
      stations: [station],
    },
  });
  const indexedFound = collectMasslineObstructionRocks(indexed, {
    minX: 0, minZ: -5, maxX: 120, maxZ: 5,
  });
  assert.deepEqual(indexedFound.map((body) => body.type).sort(), ['station', 'wreck']);

  assert.equal(segment(state, station, SOURCE, { x: station.pos.x, z: station.pos.z }, [station]), false,
    'the station being latched does not block its own line');
  assert.equal(segment(state, station, SOURCE, { x: station.pos.x, z: station.pos.z }), true,
    'a wreck still blocks a line whose target is the station');
});

test('SEED-HF-08 dormant rocks still drift onto the line, and a wreck hull does not', () => {
  const wasp = hull(2, 'ship', { x: 120, z: 0 }, { radius: 8 });
  const dormant = {
    id: 50,
    type: 'asteroid',
    alive: true,
    fieldResident: true,
    liveEntityId: null,
    pos: { x: 60, z: 30 },
    vel: { x: 0, z: -15 },
    lastExactT: 0,
    radius: 8,
    collides: true,
    physicsBody: { radius: 8 },
    data: { typeId: 'ast_common_rock' },
  };
  const driftingWreck = hull(51, 'wreck', { x: 60, z: 30 }, {
    radius: 8,
    fieldResident: true,
    vel: { x: 0, z: -15 },
    lastExactT: 0,
  });
  const planted = hull(52, 'wreck', { x: 80, z: 0 }, {
    radius: 8,
    fieldResident: true,
    vel: { x: 0, z: 80 },
    lastExactT: 0,
  });
  const before = {
    wreck: { ...driftingWreck.pos },
    planted: { ...planted.pos },
    rock: { ...dormant.pos },
  };
  const state = lineState([wasp], { simTime: 2, rocks: [dormant] });
  assert.equal(segment(state, wasp, SOURCE, TARGET_WORLD), true,
    'the dormant rock still drifts onto the segment and blocks');
  const onlyWrecks = lineState([wasp, driftingWreck, planted], { simTime: 2, rocks: [] });
  assert.equal(segment(onlyWrecks, wasp, SOURCE, TARGET_WORLD), true,
    'a wreck sitting on the line still blocks, and its velocity does not drift it off');
  const offLine = lineState([wasp, driftingWreck], { simTime: 2, rocks: [] });
  assert.equal(segment(offLine, wasp, SOURCE, TARGET_WORLD), false,
    'a wreck stored off the line does not drift onto it');
  assert.deepEqual(driftingWreck.pos, before.wreck);
  assert.deepEqual(planted.pos, before.planted);
  assert.deepEqual(dormant.pos, before.rock, 'asking does not write the dormant pose');
});

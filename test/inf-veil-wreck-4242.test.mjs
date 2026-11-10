import test from 'node:test';
import assert from 'node:assert/strict';

import {
  phaseBlinkBlocked,
  phaseBlinkClearDistance,
  stepPhaseBlink,
} from '../src/systems/phaseBlink.js';

function ship(extra = {}) {
  return {
    id: 'player',
    alive: true,
    type: 'ship',
    radius: 14,
    rot: 0,
    pos: { x: 0, z: 0 },
    prevPos: { x: 0, y: 0, z: 0 },
    boost: { energy: 200, max: 200 },
    ...extra,
  };
}

function world(entities) {
  return {
    simTime: 12,
    tick: 720,
    mode: 'flight',
    meta: { seed: 4242 },
    world: { currentSectorId: 'sector_ceres_belt' },
    playerId: 'player',
    entityList: entities,
    entities: new Map(entities.map((entity) => [entity.id, entity])),
  };
}

function busOf() {
  const log = [];
  return { log, emit(name, payload) { log.push({ name, payload }); } };
}

test('veil step stops short of a solid wreck and still crosses a fighter, seed 4242', () => {
  const player = ship();
  const wreck = {
    id: 'hulk',
    alive: true,
    type: 'wreck',
    radius: 30,
    pos: { x: 70, z: 0 },
    collides: true,
    physicsBody: { shape: 'capsule', material: 'debris', sensor: false },
  };
  const fighter = {
    id: 'fighter',
    alive: true,
    type: 'ship',
    radius: 30,
    pos: { x: 70, z: 40 },
  };
  const state = world([player, wreck, fighter]);
  const bus = busOf();

  assert.equal(phaseBlinkBlocked(state, player, 70, 0), true, 'the hulk owns its own center');
  assert.equal(phaseBlinkBlocked(state, player, 70, 40), false, 'a fighter is phased through');

  const open = phaseBlinkClearDistance(state, player, 0, 240);
  assert.ok(open < 70 - 30, `shadow sits in front of the hulk, got ${open}`);
  assert.ok(open >= 20, 'the step still has room to commit');

  const held = stepPhaseBlink({ entity: player, held: true, dt: 0.5, state, bus, now: 12 });
  assert.equal(held.busy, true);
  const released = stepPhaseBlink({ entity: player, held: false, dt: 1 / 60, state, bus, now: 12.5 });
  assert.equal(released.committed, true);
  assert.ok(player.pos.x < 40, 'the hull is not inside the wreck');
  assert.ok(Math.hypot(70 - player.pos.x, 0 - player.pos.z) > 30);
});

test('a wreck with no collider does not stop the step, and a hulk in the nose refuses it, seed 4242', () => {
  const player = ship();
  const marker = {
    id: 'marker',
    alive: true,
    type: 'wreck',
    radius: 30,
    pos: { x: 70, z: 0 },
    collides: false,
  };
  const openState = world([player, marker]);
  assert.equal(phaseBlinkClearDistance(openState, player, 0, 240), 240);

  const nose = {
    id: 'nose',
    alive: true,
    type: 'wreck',
    radius: 24,
    pos: { x: 20, z: 0 },
    physicsBody: { shape: 'capsule', material: 'debris' },
  };
  const blocked = world([player, nose]);
  const bus = busOf();
  stepPhaseBlink({ entity: player, held: true, dt: 0.5, state: blocked, bus, now: 20 });
  const released = stepPhaseBlink({
    entity: player, held: false, dt: 1 / 60, state: blocked, bus, now: 20.5,
  });
  assert.equal(released.committed, false);
  assert.equal(player.pos.x, 0);
  const toast = bus.log.find((event) => event.name === 'toast');
  assert.equal(toast.payload.text, 'No room to step');
});

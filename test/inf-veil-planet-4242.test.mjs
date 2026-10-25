import test from 'node:test';
import assert from 'node:assert/strict';

import {
  phaseBlinkBlocked,
  phaseBlinkClearDistance,
  stepPhaseBlink,
} from '../src/systems/phaseBlink.js';

// The live sample ring. A world's center sits outside it even when the skin does not.
const SAMPLE_RING = 96;
const EXCLUSION = 470;

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
  const state = {
    simTime: 12,
    tick: 720,
    mode: 'flight',
    meta: { seed: 4242 },
    world: { currentSectorId: 'sector_tethys_junction' },
    playerId: 'player',
    entityList: entities,
    entities: new Map(entities.map((entity) => [entity.id, entity])),
  };
  state.spatialHash = {
    diagnostics: { activeBuckets: 4 },
    queryRadius(x, z, radius, out) {
      out.length = 0;
      for (const ent of state.entityList) {
        if (!ent || !ent.pos) continue;
        const dx = ent.pos.x - x;
        const dz = ent.pos.z - z;
        if (dx * dx + dz * dz <= radius * radius) out.push(ent);
      }
    },
  };
  return state;
}

function busOf() {
  const log = [];
  return { log, emit(name, payload) { log.push({ name, payload }); } };
}

test('veil step stops on the world skin and still crosses a fighter, seed 4242', () => {
  const player = ship();
  const planet = {
    id: 'anvil',
    alive: true,
    type: 'planet',
    radius: EXCLUSION,
    collides: true,
    pos: { x: 600, z: 0 },
    physicsBody: { radius: EXCLUSION, material: 'station', dynamic: false },
  };
  const fighter = {
    id: 'fighter',
    alive: true,
    type: 'ship',
    radius: 18,
    pos: { x: 80, z: 40 },
  };
  const state = world([player, planet, fighter]);
  const skin = planet.pos.x - planet.radius;

  assert.ok(skin < 240, 'a full step would otherwise commit inside the world');
  assert.ok(planet.pos.x - skin > SAMPLE_RING, 'the center is outside the sample ring from the skin');
  assert.equal(phaseBlinkBlocked(state, player, skin - 30, 0), false, 'open space in front of the skin stays clear');
  assert.equal(phaseBlinkBlocked(state, player, skin + 40, 0), true, 'inside the exclusion circle is the world');
  assert.equal(phaseBlinkBlocked(state, player, fighter.pos.x, fighter.pos.z), false, 'a fighter is still crossed');

  const open = phaseBlinkClearDistance(state, player, 0, 240);
  assert.ok(open < skin, `shadow sits in front of the skin, got ${open}`);
  assert.ok(open >= 20, 'the step still has room to commit');

  const bus = busOf();
  const held = stepPhaseBlink({ entity: player, held: true, dt: 0.5, state, bus, now: 12 });
  assert.equal(held.busy, true);
  const released = stepPhaseBlink({ entity: player, held: false, dt: 1 / 60, state, bus, now: 12.5 });
  assert.equal(released.committed, true);
  const landed = Math.hypot(planet.pos.x - player.pos.x, planet.pos.z - player.pos.z);
  assert.ok(landed > planet.radius, `the hull is outside the exclusion circle, landed ${landed}`);
});

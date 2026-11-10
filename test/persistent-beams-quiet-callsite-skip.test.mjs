/**
 * #121 persistent-beams-quiet-callsite-skip — quiet empty activeCount skips
 * camDist+a11y+worldSize prep; dirty-wake when upsert raises activeCount.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';
import { BEAM_COOLING_S } from '../src/render/combat/persistentBeams.js';

const DT = 1 / 60;

function makeHarness() {
  const scene = new THREE.Scene();
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
  };
  const state = {
    playerId: 1,
    player: {},
    mode: 'flight',
    simTime: 1,
    settings: { video: { motionReduce: false, flashReduce: false }, accessibility: {} },
    entities: new Map([[1, player]]),
    entityList: [player],
    render: {
      scene,
      camera: { position: { x: 0, y: 40, z: 80 }, fov: 50 },
      viewport: { height: 1000 },
      interpolationAlpha: 1,
    },
    fields: { active: [] },
    combat: { entities: {}, statusNextPendingSeq: 0 },
  };
  const system = Object.create(vfx);
  system.init({
    state,
    bus: createBus(),
    helpers: {
      player: () => player,
      socketWorldPose: () => ({ x: 0, y: 0.4, z: 0 }),
    },
  });
  if (typeof system._initCombatBeams === 'function') system._initCombatBeams();
  assert.ok(system._combatBeams, 'combat beam pool must exist');
  return { system, state, player };
}

function upsertBeam(pool, beamKey, timeS = 1) {
  return pool.upsert({
    beamKey,
    ownerId: 1,
    from: { x: 0, z: 0 },
    to: { x: 20, z: 0 },
  }, timeS);
}

test('quiet empty callsite skips pool.update while activeCount===0', () => {
  const { system } = makeHarness();
  const pool = system._combatBeams;
  assert.equal(pool.activeCount, 0);
  let updates = 0;
  const orig = pool.update.bind(pool);
  pool.update = (...args) => {
    updates += 1;
    return orig(...args);
  };

  system.update(DT);
  system.update(DT);
  system.update(DT);
  assert.equal(updates, 0, 'empty activeCount must skip call-site pool.update');
  assert.equal(pool.activeCount, 0);
});

test('dirty-wake: upsert raises activeCount and resumes call-site update', () => {
  const { system } = makeHarness();
  const pool = system._combatBeams;
  let updates = 0;
  const orig = pool.update.bind(pool);
  pool.update = (...args) => {
    updates += 1;
    return orig(...args);
  };

  system.update(DT);
  assert.equal(updates, 0);

  assert.equal(upsertBeam(pool, 'beam-a', system._t || 1), true);
  assert.ok(pool.activeCount > 0, 'upsert must raise activeCount');

  updates = 0;
  system.update(DT);
  assert.ok(updates >= 1, 'live activeCount wakes call-site pool.update');

  pool.clear();
  assert.equal(pool.activeCount, 0);
  updates = 0;
  system.update(DT);
  system.update(DT);
  assert.equal(updates, 0, 're-skips after clear');
});

test('dirty-wake: stop last beam returns to quiet skip', () => {
  const { system } = makeHarness();
  const pool = system._combatBeams;
  assert.equal(upsertBeam(pool, 'beam-b', system._t || 1), true);
  assert.ok(pool.activeCount > 0);

  let updates = 0;
  const orig = pool.update.bind(pool);
  pool.update = (...args) => {
    updates += 1;
    return orig(...args);
  };
  system.update(DT);
  assert.ok(updates >= 1);

  assert.equal(pool.stop({ beamKey: 'beam-b' }), true);
  // Master lifecycle keeps a stopping beam active through BEAM_COOLING_S (~0.26 s)
  // before _release drops activeCount. The system clock (_t) is ~0 while the
  // upsert stamped lastSeen=1, so drive the pool clock directly past the cool.
  pool.update(1 + BEAM_COOLING_S + 0.01, (x, z, out) => { out.x = x; out.z = z; return out; });
  assert.equal(pool.activeCount, 0);
  updates = 0;
  system.update(DT);
  system.update(DT);
  assert.equal(updates, 0, 'stop last beam returns to quiet callsite skip');
});

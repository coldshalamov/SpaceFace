/**
 * #125 pending-detonations-quiet-empty-latch — quiet empty 12-slot pending
 * detonation walk skips after first empty observe; dirty-wake on schedule.
 * Soft-GPU fps not claimed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';

const PLAYER_ID = 1;
const DT = 1 / 60;

function makeHarness() {
  const scene = new THREE.Scene();
  const player = {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
    mass: 10,
  };
  const state = {
    playerId: PLAYER_ID,
    mode: 'flight',
    entities: new Map([[PLAYER_ID, player]]),
    entityList: [player],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      version: 1,
      projectiles: [],
      ships: [player],
    },
    simTime: 0,
    tick: 0,
    camera: { focus: { x: 0, z: 0 } },
    world: { frameOrigin: { x: 0, z: 0 } },
    settings: {
      video: { particleQuality: 'low', motionReduce: false, engineTrails: false },
      accessibility: { flashReduce: false },
    },
    render: {
      scene,
      camera: new THREE.PerspectiveCamera(),
      viewport: { height: 720 },
      interpolationAlpha: 1,
    },
    player: {
      heatZone: { active: false, center: { x: 0, z: 0 }, radius: 0, level: 0, untilS: 0, clearAfterS: 0 },
      nav: { autopilot: { active: false, target: null }, waypoint: null },
      tether: { phase: 'idle', targetId: null, active: false },
      masslineTelemetry: { payloadReleaseGhost: null },
    },
    lawSecurity: { customsWeir: null },
    fields: { active: [] },
    combat: { entities: {}, statusNextPendingSeq: 0 },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({
    state,
    bus,
    helpers: { player: () => player },
  });
  return { system, state, bus, player, scene };
}

function activeCount(system) {
  return system._pendingDetonations.filter((r) => r.active).length;
}

test('pending detonations quiet-latches after first empty observe', () => {
  const { system } = makeHarness();
  assert.ok(system._pendingDetonations);
  assert.equal(system._pendingDetonations.length, 12);
  assert.equal(system._pendingDetonationsQuietEmpty, false);
  assert.equal(activeCount(system), 0);

  let walks = 0;
  const orig = system._updatePendingDetonations.bind(system);
  system._updatePendingDetonations = function wrapped() {
    // Count only when the production early-out would still enter the walk.
    // Call orig which itself may early-out after latch.
    const before = this._pendingDetonationsQuietEmpty;
    orig();
    if (!before) walks += 1;
  };

  system.update(DT);
  assert.equal(system._pendingDetonationsQuietEmpty, true, 'must latch after empty observe');
  assert.equal(walks, 1, 'first tick must walk once');

  walks = 0;
  system.update(DT);
  system.update(DT);
  system.update(DT);
  assert.equal(walks, 0, 'latched ticks must skip the 12-slot walk');
  assert.equal(system._pendingDetonationsQuietEmpty, true);
  assert.equal(activeCount(system), 0);
});

test('schedule dirty-wakes the pending-detonations quiet latch', () => {
  const { system, state } = makeHarness();
  system.update(DT);
  assert.equal(system._pendingDetonationsQuietEmpty, true);

  const victim = {
    id: 99,
    type: 'ship',
    alive: false,
    pos: { x: 10, z: 20 },
    vel: { x: 1, z: 0 },
    rot: 0,
    radius: 5,
    classId: 'fighter',
  };
  system._scheduleDetonation(victim, 'fighter', 8, 'gun');
  assert.equal(system._pendingDetonationsQuietEmpty, false, 'schedule must clear latch');
  assert.equal(activeCount(system), 1);

  let walked = false;
  const orig = system._updatePendingDetonations.bind(system);
  system._updatePendingDetonations = function wrapped() {
    const before = this._pendingDetonationsQuietEmpty;
    orig();
    if (!before) walked = true;
  };

  state.simTime = 0.05; // still inside OVERLOAD_FLARE_S window
  system.update(DT);
  assert.equal(walked, true, 'active slot must walk');
  assert.equal(system._pendingDetonationsQuietEmpty, false, 'live pending must not re-latch');
  assert.equal(activeCount(system), 1);
});

test('pending detonations re-latches after drain completes', () => {
  const { system, state } = makeHarness();
  system.update(DT);
  assert.equal(system._pendingDetonationsQuietEmpty, true);

  const victim = {
    id: 77,
    type: 'ship',
    alive: false,
    pos: { x: 3, z: 4 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 4,
    classId: 'drone',
  };
  // Stub explosion queue so drain does not need full explosion plumbing.
  system._queueExplosion = () => {};
  system._scheduleDetonation(victim, 'drone', 6, 'gun');
  assert.equal(activeCount(system), 1);

  // Advance past at (OVERLOAD_FLARE_S ~0.4).
  state.simTime = 1.0;
  system.update(DT);
  assert.equal(activeCount(system), 0, 'drain must clear active');
  assert.equal(system._pendingDetonationsQuietEmpty, true, 'must re-latch after empty drain');

  let walks = 0;
  const orig = system._updatePendingDetonations.bind(system);
  system._updatePendingDetonations = function wrapped() {
    const before = this._pendingDetonationsQuietEmpty;
    orig();
    if (!before) walks += 1;
  };
  system.update(DT);
  system.update(DT);
  assert.equal(walks, 0, 're-latched ticks must skip walk');
});

test('pending detonations reset clears latch for re-observe', () => {
  const { system } = makeHarness();
  system.update(DT);
  assert.equal(system._pendingDetonationsQuietEmpty, true);
  system._resetPendingDetonations();
  assert.equal(system._pendingDetonationsQuietEmpty, false);
  assert.equal(activeCount(system), 0);
  system.update(DT);
  assert.equal(system._pendingDetonationsQuietEmpty, true, 'must re-latch after reset observe');
});

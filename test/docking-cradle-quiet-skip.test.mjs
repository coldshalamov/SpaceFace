import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';

function makeHarness() {
  const scene = new THREE.Scene();
  const state = {
    playerId: 1,
    mode: 'flight',
    entities: new Map([[1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } }]]),
    entityList: [],
    dockingCorridor: { phase: 'none', berth: null, stationId: null, proxyId: null },
    physicsRuntime: { collisionProxies: [] },
    settings: {
      video: { particleQuality: 'high', motionReduce: false, engineTrails: true },
      accessibility: { flashReduce: false },
    },
    render: { scene },
    content: {},
  };
  const system = Object.create(vfx);
  system.init({ state, bus: createBus(), helpers: {} });
  return { state, system };
}

test('docking cradle quiet-latches after idle fade and wakes on corridor berth', () => {
  const { state, system } = makeHarness();
  assert.ok(system._dockingCradle, 'cradle mesh must init');

  // Prime: several idle ticks → latch
  for (let i = 0; i < 8; i++) system._updateDockingCradle(1 / 60);
  assert.equal(system._dockingCradleQuietHidden, true, 'idle cradle must quiet-latch');
  assert.equal(system._dockingCradle.mesh.visible, false);

  // While latched, update is a no-op walk (pulseT frozen)
  const pulseBefore = system._dockingCradle.cradle.pulseT;
  for (let i = 0; i < 30; i++) system._updateDockingCradle(1 / 60);
  assert.equal(system._dockingCradle.cradle.pulseT, pulseBefore, 'latched cradle must not advance pulse');
  assert.equal(system._dockingCradleQuietHidden, true);

  // Dirty wake: approach + berth
  state.dockingCorridor = {
    phase: 'approach',
    berth: { x: 40, z: -12 },
    stationId: 7,
    proxyId: null,
  };
  state.physicsRuntime.collisionProxies = [
    { stationId: 7, proxyId: 1, rot: 0.2, corridorBearingDeg: 0, corridor: { captureHalfWidth: 10 } },
  ];
  assert.equal(system._dockingCradleQuietMaybeAwake(state.dockingCorridor), true);
  system._updateDockingCradle(1 / 60);
  assert.equal(system._dockingCradleQuietHidden, false, 'berth approach must clear quiet latch');
  assert.ok(system._dockingCradle.cradle.visible01 > 0, 'preview envelope must rise after wake');
});

test('docking cradle boundary reset clears quiet latch', () => {
  const { system } = makeHarness();
  for (let i = 0; i < 8; i++) system._updateDockingCradle(1 / 60);
  assert.equal(system._dockingCradleQuietHidden, true);
  system._resetDockingCradle();
  assert.equal(system._dockingCradleQuietHidden, false);
});

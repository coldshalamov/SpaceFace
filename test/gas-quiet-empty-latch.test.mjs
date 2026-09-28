/**
 * #124 gas-quiet-empty-latch — quiet empty gas skips a11y resolve + setAccessibility
 * + empty update; dirty-wake on liveCount (emit). Soft-GPU fps not claimed.
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

test('gas quiet-latches after first empty observe', () => {
  const { system, state } = makeHarness();
  assert.ok(system._gas, 'gas pool must init');
  assert.equal(system._gasQuietEmpty, false);

  // Drive the production call site via update() — opens with empty gas.
  system.update(DT);
  assert.equal(system._gas.liveCount, 0);
  assert.equal(system._gasQuietEmpty, true, 'must latch after empty observe');

  let setCalls = 0;
  let updateCalls = 0;
  const gas = system._gas;
  const origSet = gas.setAccessibility.bind(gas);
  const origUpdate = gas.update.bind(gas);
  gas.setAccessibility = (...args) => { setCalls += 1; return origSet(...args); };
  gas.update = (...args) => { updateCalls += 1; return origUpdate(...args); };

  system.update(DT);
  system.update(DT);
  system.update(DT);
  assert.equal(setCalls, 0, 'latched ticks must skip setAccessibility');
  assert.equal(updateCalls, 0, 'latched ticks must skip update');
  assert.equal(system._gasQuietEmpty, true);
});

test('gas emit (liveCount) dirty-wakes the quiet latch', () => {
  const { system, state } = makeHarness();
  system.update(DT);
  assert.equal(system._gasQuietEmpty, true);

  assert.equal(system._gas.emitCombustion({ x: 1, y: 0, z: 2, scale: 6, severity: 1 }), true);
  assert.ok(system._gas.liveCount > 0);

  let setCalls = 0;
  let updateCalls = 0;
  const gas = system._gas;
  const origSet = gas.setAccessibility.bind(gas);
  const origUpdate = gas.update.bind(gas);
  gas.setAccessibility = (...args) => { setCalls += 1; return origSet(...args); };
  gas.update = (...args) => { updateCalls += 1; return origUpdate(...args); };

  state.simTime = (state.simTime || 0) + DT;
  system.update(DT);
  assert.equal(setCalls, 1, 'emit must wake setAccessibility');
  assert.equal(updateCalls, 1, 'emit must wake update');
  assert.equal(system._gasQuietEmpty, false, 'live gas must not re-latch');
  assert.ok(system._gas.liveCount > 0);
});

test('gas re-latches after bodies retire', () => {
  const { system, state } = makeHarness();
  system.update(DT);
  assert.equal(system._gasQuietEmpty, true);

  system._gas.emitCombustion({ x: 0, y: 0, z: 0, scale: 4, severity: 1, lifeScale: 0.05 });
  state.simTime = 0.02;
  system.update(DT);
  assert.equal(system._gasQuietEmpty, false);

  // Age past life so the body retires.
  for (let i = 0; i < 40; i++) {
    state.simTime += 0.05;
    system.update(DT);
  }
  assert.equal(system._gas.liveCount, 0, 'body must retire');
  assert.equal(system._gasQuietEmpty, true, 'must re-latch once empty again');

  let updateCalls = 0;
  const gas = system._gas;
  const origUpdate = gas.update.bind(gas);
  gas.update = (...args) => { updateCalls += 1; return origUpdate(...args); };
  system.update(DT);
  system.update(DT);
  assert.equal(updateCalls, 0, 're-latched empty must stay quiet');
});

test('sector:enter clears gas quiet latch', () => {
  const { system, bus } = makeHarness();
  system.update(DT);
  assert.equal(system._gasQuietEmpty, true);
  bus.emit('sector:enter', { sectorId: 'ceres' });
  assert.equal(system._gasQuietEmpty, false, 'boundary must clear latch');
});

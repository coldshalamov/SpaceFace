// Quiet latch for idle law/heat telegraph residual under prepareFrame / vfx.
// Soft-GPU fps not claimed. Picture unchanged while no scan/suspicion/WANTED cue is live.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { LAW_HEAT_LIGHT_KEY } from '../src/render/lawHeatTelegraphVfx.js';
import { vfx } from '../src/render/vfx.js';
import { THRESHOLD as WANTED_THRESHOLD } from '../src/systems/heat.js';

const DT = 1 / 60;
const PLAYER_ID = 7;

function makeHarness() {
  const scene = new THREE.Scene();
  const player = {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    pos: { x: 40, z: -12 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
  };
  const state = {
    playerId: PLAYER_ID,
    player: { heat: 0 },
    entities: new Map([[PLAYER_ID, player]]),
    entityList: [player],
    simTime: 0,
    tick: 0,
    settings: {
      video: { particleQuality: 'low', motionReduce: false, engineTrails: false },
      accessibility: { flashReduce: false },
    },
    render: { scene },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: {} });
  return { system, state, bus, player };
}

function sustained(system, key) {
  return system._lights && system._lights.find((slot) => slot.active && slot.sustainedKey === key) || null;
}

test('law-heat quiet-latches after idle empty and wakes on scan accept', () => {
  const { system, bus, state } = makeHarness();

  // Prime: several idle ticks → latch
  for (let i = 0; i < 4; i++) system._updateLawHeatTelegraph(DT);
  assert.equal(system._lawHeatQuietEmpty, true, 'idle law-heat must quiet-latch');
  const wakeBefore = system._lawHeatWakeSeq | 0;
  const quietSeq = system._lawHeatQuietSeq;

  // While latched, update is a no-op (wake seq unchanged, still latched)
  for (let i = 0; i < 30; i++) {
    assert.equal(system._updateLawHeatTelegraph(DT), 0);
  }
  assert.equal(system._lawHeatQuietEmpty, true);
  assert.equal(system._lawHeatQuietSeq, quietSeq);
  assert.equal(system._lawHeatWakeSeq, wakeBefore);

  // Dirty wake: patrol scan
  bus.emit('player:scannedByPatrol', { targetId: PLAYER_ID, hasContraband: false });
  assert.ok((system._lawHeatWakeSeq | 0) > wakeBefore, 'scan must bump wake seq');
  assert.equal(system._lawHeatQuietEmpty, false, 'scan accept must clear quiet latch');
  const live = system._updateLawHeatTelegraph(DT);
  assert.ok(live > 0, 'scan sweep must be live after wake');
  assert.ok(sustained(system, LAW_HEAT_LIGHT_KEY.SCAN_SWEEP), 'scan light must publish after wake');
  assert.equal(system._lawHeatQuietEmpty, false);

  // Drain sweep life → re-latch
  state.simTime += 10;
  for (let i = 0; i < 200; i++) system._updateLawHeatTelegraph(DT);
  assert.equal(system._lawHeatQuietEmpty, true, 'idle after drain must re-latch');
  assert.equal(sustained(system, LAW_HEAT_LIGHT_KEY.SCAN_SWEEP), null);
});

test('law-heat quiet-latches wake on heat:changed suspicion', () => {
  const { system, bus, state } = makeHarness();
  for (let i = 0; i < 4; i++) system._updateLawHeatTelegraph(DT);
  assert.equal(system._lawHeatQuietEmpty, true);

  bus.emit('heat:changed', {
    value: 0.08,
    previousValue: 0,
    wanted: false,
    wantedCrossed: false,
    suspicion: 0.08 / WANTED_THRESHOLD,
    threshold: WANTED_THRESHOLD,
  });
  state.player.heat = 0.08;
  assert.equal(system._lawHeatQuietEmpty, false);
  const live = system._updateLawHeatTelegraph(DT);
  assert.ok(live > 0);
  assert.ok(sustained(system, LAW_HEAT_LIGHT_KEY.SUSPICION));
});

test('law-heat boundary clear resets quiet latch', () => {
  const { system } = makeHarness();
  for (let i = 0; i < 4; i++) system._updateLawHeatTelegraph(DT);
  assert.equal(system._lawHeatQuietEmpty, true);
  system._clearLawHeatTelegraph();
  assert.equal(system._lawHeatQuietEmpty, false);
  assert.equal(system._lawHeatQuietSeq, -1);
});

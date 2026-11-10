// Quiet latch for empty MOMENTUM_SINK bag residual under prepareFrame / vfx.
// Soft-GPU fps not claimed. Picture unchanged while no sink cues are live.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { MOMENTUM_SINK_FRAME_KIND } from '../src/combat/momentumSink.js';
import { createBus } from '../src/core/eventBus.js';
import { MOMENTUM_SINK_STATUS_ID } from '../src/data/combatDefs.js';
import { vfx } from '../src/render/vfx.js';

const PLAYER_ID = 1;

function makeShip(id, overrides = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: id === 1 ? 0 : 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    maxSpeed: 180,
    flags: { docked: false },
    data: {},
    ...overrides,
  };
}

function makeHarness({ runtimes = {}, statusNextPendingSeq = 1 } = {}) {
  const player = makeShip(PLAYER_ID);
  const entities = new Map([[player.id, player]]);
  const entityList = [player];
  for (const id of Object.keys(runtimes)) {
    const numeric = Number(id);
    if (!entities.has(numeric)) {
      const ship = makeShip(numeric, {
        pos: { x: 40 + numeric, z: 10 },
        vel: { x: 50, z: 20 },
      });
      entities.set(numeric, ship);
      entityList.push(ship);
    }
  }
  const state = {
    mode: 'flight',
    tick: 30,
    simTime: 0.5,
    playerId: player.id,
    player: { targetId: null, tether: { active: false } },
    entities,
    entityList,
    entityIndex: { __spacefaceEntityIndexV1: true, shipLike: entityList },
    combat: {
      entities: runtimes,
      attachments: { byId: {} },
      beams: [],
      statusNextPendingSeq,
    },
    settings: {
      video: {
        particleQuality: 'low',
        engineTrails: false,
        energyMaterials: false,
        motionReduce: false,
        flashReduce: false,
      },
      accessibility: { flashReduce: false },
    },
    input: { turnIntent: 0 },
    render: { scene: new THREE.Scene() },
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 1 },
    content: {},
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({ state, bus, helpers: { player: () => player } });
  return { system, state, bus, player, entities };
}

test('momentum-sink quiet-latches on empty combat bag with trustworthy seq', () => {
  const { system } = makeHarness({
    runtimes: {
      2: { statuses: {} },
      3: { statuses: { other: { expiresTick: 999 } } },
    },
    statusNextPendingSeq: 4,
  });
  assert.equal(system._updateMomentumSinkPresentation(), 0);
  assert.equal(system._momentumSinkQuietEmpty, true, 'empty bag must latch');
  assert.equal(system._momentumSinkQuietSeq, 4);

  // Latched cadence ticks skip combat.entities for-in.
  for (let i = 0; i < 40; i++) {
    assert.equal(system._updateMomentumSinkPresentation(), 0);
  }
  assert.equal(system._momentumSinkQuietEmpty, true);
  assert.equal(system._momentumSinkQuietSeq, 4);
});

test('statusNextPendingSeq dirty-wake resumes then re-latches when empty', () => {
  const { system, state, entities } = makeHarness({
    runtimes: {
      2: { statuses: {} },
    },
    statusNextPendingSeq: 1,
  });
  assert.equal(system._updateMomentumSinkPresentation(), 0);
  assert.equal(system._momentumSinkQuietEmpty, true);

  // Dirty wake: seq bump + live MOMENTUM_SINK status with usable frame.
  const target = makeShip(2, {
    pos: { x: 120, z: -40 },
    vel: { x: 70, z: 40 },
  });
  entities.set(2, target);
  state.entityList = [entities.get(PLAYER_ID), target];
  state.combat.statusNextPendingSeq = 2;
  state.combat.entities[2] = {
    statuses: {
      [MOMENTUM_SINK_STATUS_ID]: {
        id: MOMENTUM_SINK_STATUS_ID,
        attackerId: PLAYER_ID,
        appliedTick: 20,
        expiresTick: 200,
        data: {
          frameKind: MOMENTUM_SINK_FRAME_KIND,
          frameReady: true,
          frameVelocity: { x: 10, z: 0 },
        },
      },
    },
  };

  assert.equal(system._updateMomentumSinkPresentation(), 1, 'must wake and emit sink cue');
  assert.equal(system._momentumSinkQuietEmpty, false);

  // Drain status → re-latch.
  state.combat.statusNextPendingSeq = 3;
  state.combat.entities[2] = { statuses: {} };
  assert.equal(system._updateMomentumSinkPresentation(), 0);
  assert.equal(system._momentumSinkQuietEmpty, true);
  assert.equal(system._momentumSinkQuietSeq, 3);

  for (let i = 0; i < 10; i++) assert.equal(system._updateMomentumSinkPresentation(), 0);
  assert.equal(system._momentumSinkQuietEmpty, true);
});

test('damage-path pending→apply window cannot hide the sink telegraph', () => {
  // Real lifecycle: schedule() bumps seq while the status sits in pendingStatuses
  // for ≥1 tick; a cadence pull in that window sees an empty bag and re-latches on
  // the new seq; applyActive then lands the status with NO further seq bump. Only
  // the combat:statusApplied dirty-wake can rescue the telegraph for its 4 s life.
  const { system, state, bus, entities } = makeHarness({
    runtimes: { 2: { statuses: {} } },
    statusNextPendingSeq: 1,
  });
  assert.equal(system._updateMomentumSinkPresentation(), 0);
  assert.equal(system._momentumSinkQuietEmpty, true);

  // Tick T: a sink hit schedules — seq bumps while the status is still pending.
  state.combat.statusNextPendingSeq = 2;
  // The cadence fires inside the pending window: empty collect re-latches on seq 2.
  assert.equal(system._updateMomentumSinkPresentation(), 0);
  assert.equal(system._momentumSinkQuietEmpty, true);
  assert.equal(system._momentumSinkQuietSeq, 2);

  // Tick T+1: applyActive lands the status — seq unchanged — and emits the wake.
  const target = makeShip(2, { pos: { x: 120, z: -40 }, vel: { x: 70, z: 40 } });
  entities.set(2, target);
  state.entityList = [entities.get(PLAYER_ID), target];
  state.combat.entities[2] = {
    statuses: {
      [MOMENTUM_SINK_STATUS_ID]: {
        id: MOMENTUM_SINK_STATUS_ID,
        attackerId: PLAYER_ID,
        appliedTick: state.tick,
        expiresTick: state.tick + 240,
        data: {
          frameKind: MOMENTUM_SINK_FRAME_KIND,
          frameReady: true,
          frameVelocity: { x: 10, z: 0 },
        },
      },
    },
  };
  bus.emit('combat:statusApplied', {
    attackerId: PLAYER_ID,
    targetId: 2,
    statusId: MOMENTUM_SINK_STATUS_ID,
    stacks: 1,
    expiresTick: state.tick + 240,
  });
  assert.equal(system._momentumSinkQuietEmpty, false, 'statusApplied must dirty-wake the latch');
  assert.equal(system._updateMomentumSinkPresentation(), 1, 'telegraph emits for the applied sink');
});

test('missing statusNextPendingSeq refuses latch (fallback stays live)', () => {
  const { system, state } = makeHarness({
    runtimes: { 2: { statuses: {} } },
    statusNextPendingSeq: 1,
  });
  delete state.combat.statusNextPendingSeq;
  assert.equal(system._updateMomentumSinkPresentation(), 0);
  assert.equal(system._momentumSinkQuietEmpty, false, 'must refuse latch without seq');
});

test('boundary resets clear momentum-sink quiet latch', () => {
  const { system, bus } = makeHarness({
    runtimes: { 2: { statuses: {} } },
    statusNextPendingSeq: 1,
  });
  assert.equal(system._updateMomentumSinkPresentation(), 0);
  assert.equal(system._momentumSinkQuietEmpty, true);
  bus.emit('sector:enter', {});
  assert.equal(system._momentumSinkQuietEmpty, false);
  assert.equal(system._momentumSinkQuietSeq, -1);
});

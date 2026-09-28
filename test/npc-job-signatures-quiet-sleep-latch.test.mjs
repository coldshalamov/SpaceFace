// Quiet latch for empty npcJobs bag residual under prepareFrame / vfx.
// Soft-GPU fps not claimed. Picture unchanged while no job signatures are live.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
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

function makeHarness({ byId = {}, revision = 1 } = {}) {
  const player = makeShip(PLAYER_ID);
  const entities = new Map([[player.id, player]]);
  const entityList = [player];
  const state = {
    mode: 'flight',
    tick: 30,
    simTime: 0.5,
    playerId: player.id,
    player: { targetId: null, tether: { active: false } },
    entities,
    entityList,
    entityIndex: { __spacefaceEntityIndexV1: true, shipLike: entityList },
    npcJobs: { byId, siteCouriers: {}, lots: {}, revision },
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

test('npc-job signatures quiet-latch on empty bag with trustworthy revision', () => {
  const { system } = makeHarness({ byId: {}, revision: 3 });
  assert.equal(system._syncNpcJobSignatures(1 / 60), false);
  assert.equal(system._npcJobSignaturesQuietAsleep, true, 'empty bag must latch');
  assert.equal(system._npcJobSignaturesQuietRev, 3);

  for (let i = 0; i < 40; i++) {
    assert.equal(system._syncNpcJobSignatures(1 / 60), false);
  }
  assert.equal(system._npcJobSignaturesQuietAsleep, true);
  assert.equal(system._npcJobSignaturesQuietRev, 3);
});

test('npcJobs.revision dirty-wake resumes then re-latches when empty', () => {
  const { system, state, entities } = makeHarness({ byId: {}, revision: 1 });
  assert.equal(system._syncNpcJobSignatures(1 / 60), false);
  assert.equal(system._npcJobSignaturesQuietAsleep, true);

  const worker = makeShip(7, { pos: { x: 40, z: -20 } });
  entities.set(7, worker);
  state.entityList = [entities.get(PLAYER_ID), worker];
  state.npcJobs.revision = 2;
  state.npcJobs.byId = {
    'job:wake': {
      job: { kind: 'hauler', phase: 'transit', corrupt: false, route: [], progress: 0 },
      kind: 'hauler',
      entityId: 7,
      sectorId: 'ceres',
    },
  };

  system._syncNpcJobSignatures(1 / 60);
  assert.equal(system._npcJobSignaturesQuietAsleep, false, 'must wake on revision bump');
  assert.ok(
    (system._npcJobSignatureActive || 0) >= 1 || system._npcJobSignaturesRelevant(),
    'live job must be seen after wake',
  );

  state.npcJobs.byId = {};
  state.npcJobs.revision = 3;
  assert.equal(system._syncNpcJobSignatures(1 / 60), false);
  assert.equal(system._npcJobSignaturesQuietAsleep, true);
  assert.equal(system._npcJobSignaturesQuietRev, 3);

  for (let i = 0; i < 10; i++) assert.equal(system._syncNpcJobSignatures(1 / 60), false);
  assert.equal(system._npcJobSignaturesQuietAsleep, true);
});

test('missing npcJobs.revision refuses latch (fallback stays live)', () => {
  const { system, state } = makeHarness({ byId: {}, revision: 1 });
  delete state.npcJobs.revision;
  assert.equal(system._syncNpcJobSignatures(1 / 60), false);
  assert.equal(system._npcJobSignaturesQuietAsleep, false, 'must refuse latch without revision');
});

test('boundary resets clear npc-job quiet latch', () => {
  const { system, bus } = makeHarness({ byId: {}, revision: 1 });
  assert.equal(system._syncNpcJobSignatures(1 / 60), false);
  assert.equal(system._npcJobSignaturesQuietAsleep, true);
  bus.emit('sector:enter', {});
  assert.equal(system._npcJobSignaturesQuietAsleep, false);
  assert.equal(system._npcJobSignaturesQuietRev, -1);
});

// Quiet latch for empty pickups+payloads loot-magnet residual under prepareFrame.
// Soft-GPU fps not claimed. Picture unchanged while no magnet trails are live.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';

const PLAYER_ID = 1;

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
      pickups: [],
      payloads: [],
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
    render: { scene, camera: new THREE.PerspectiveCamera(), viewport: { height: 720 } },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({
    state,
    bus,
    helpers: {
      player: () => player,
    },
  });
  return { system, state, bus, player };
}

test('loot-magnet quiet-latches on empty pickups+payloads buckets', () => {
  const { system, state } = makeHarness();
  assert.equal(system._lootMagnetRelevant(), false);
  assert.equal(system._lootMagnetQuietEmpty, true, 'empty buckets must latch');
  assert.equal(system._lootMagnetQuietIndexVersion, 1);

  // Latched ticks skip player + dual scan.
  for (let i = 0; i < 40; i++) {
    assert.equal(system._lootMagnetRelevant(), false);
  }
  assert.equal(system._lootMagnetQuietEmpty, true);
  assert.equal(system._lootMagnetQuietIndexVersion, state.entityIndex.version);
});

test('entityIndexVersion dirty-wake resumes then re-latches when empty', () => {
  const { system, state, player } = makeHarness();
  assert.equal(system._lootMagnetRelevant(), false);
  assert.equal(system._lootMagnetQuietEmpty, true);

  // Dirty wake: membership bump + homing pickup inside table.
  const pickup = {
    id: 99,
    type: 'pickup',
    alive: true,
    pos: { x: 20, z: 0 },
    vel: { x: -40, z: 0 }, // speed 40 >= LOOT_MAGNET_MIN_SPEED 26
    data: { kind: 'ore', commodityId: 'ice' },
  };
  state.entityIndex.version = 2;
  state.entityIndex.pickups = [pickup];
  state.entityList = [player, pickup];

  assert.equal(system._lootMagnetRelevant(), true, 'must wake and see homing pickup');
  assert.equal(system._lootMagnetQuietEmpty, false);

  // Drain buckets → re-latch.
  state.entityIndex.version = 3;
  state.entityIndex.pickups = [];
  state.entityList = [player];
  assert.equal(system._lootMagnetRelevant(), false);
  assert.equal(system._lootMagnetQuietEmpty, true);
  assert.equal(system._lootMagnetQuietIndexVersion, 3);

  for (let i = 0; i < 10; i++) assert.equal(system._lootMagnetRelevant(), false);
  assert.equal(system._lootMagnetQuietEmpty, true);
});

test('no entityIndex version refuses latch (entityList fallback stays live)', () => {
  const { system, state } = makeHarness();
  delete state.entityIndex;
  state.entityList = [state.entities.get(PLAYER_ID)];
  assert.equal(system._lootMagnetRelevant(), false);
  assert.equal(system._lootMagnetQuietEmpty, false, 'must refuse latch without version');
});

test('boundary resets clear loot-magnet quiet latch', () => {
  const { system, bus } = makeHarness();
  assert.equal(system._lootMagnetRelevant(), false);
  assert.equal(system._lootMagnetQuietEmpty, true);
  bus.emit('sector:enter', {});
  assert.equal(system._lootMagnetQuietEmpty, false);
  assert.equal(system._lootMagnetQuietIndexVersion, -1);
});

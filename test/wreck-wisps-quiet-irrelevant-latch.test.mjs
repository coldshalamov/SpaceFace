// Quiet latch for no-wrecks wreck-wisps residual under prepareFrame.
// Soft-GPU fps not claimed. Picture unchanged while no wisps are live.

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
      wrecks: [],
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

test('wreck-wisps quiet-latches when wrecks bucket is empty', () => {
  const { system, state } = makeHarness();
  assert.equal(system._wreckWispsRelevant(), false);
  assert.equal(system._wreckWispsQuietIdle, true, 'empty wrecks must latch');
  assert.equal(system._wreckWispsQuietIndexVersion, 1);

  for (let i = 0; i < 40; i++) {
    assert.equal(system._wreckWispsRelevant(), false);
  }
  assert.equal(system._wreckWispsQuietIdle, true);
  assert.equal(system._wreckWispsQuietIndexVersion, state.entityIndex.version);
});

test('entityIndexVersion dirty-wake resumes then re-latches when empty', () => {
  const { system, state, player } = makeHarness();
  assert.equal(system._wreckWispsRelevant(), false);
  assert.equal(system._wreckWispsQuietIdle, true);

  const wreck = {
    id: 42,
    type: 'wreck',
    alive: true,
    pos: { x: 30, z: 0 },
    radius: 8,
  };
  state.entityIndex.version = 2;
  state.entityIndex.wrecks = [wreck];
  state.entityList = [player, wreck];

  assert.equal(system._wreckWispsRelevant(), true, 'must wake and see wreck');
  assert.equal(system._wreckWispsQuietIdle, false);

  state.entityIndex.version = 3;
  state.entityIndex.wrecks = [];
  state.entityList = [player];
  assert.equal(system._wreckWispsRelevant(), false);
  assert.equal(system._wreckWispsQuietIdle, true);
  assert.equal(system._wreckWispsQuietIndexVersion, 3);

  for (let i = 0; i < 10; i++) assert.equal(system._wreckWispsRelevant(), false);
  assert.equal(system._wreckWispsQuietIdle, true);
});

test('no entityIndex version refuses latch (entityList fallback stays live)', () => {
  const { system, state } = makeHarness();
  delete state.entityIndex;
  state.entityList = [state.entities.get(PLAYER_ID)];
  assert.equal(system._wreckWispsRelevant(), false);
  assert.equal(system._wreckWispsQuietIdle, false, 'must refuse latch without version');
});

test('boundary resets clear wreck-wisps quiet latch', () => {
  const { system, bus } = makeHarness();
  assert.equal(system._wreckWispsRelevant(), false);
  assert.equal(system._wreckWispsQuietIdle, true);
  bus.emit('sector:enter', {});
  assert.equal(system._wreckWispsQuietIdle, false);
  assert.equal(system._wreckWispsQuietIndexVersion, -1);
});

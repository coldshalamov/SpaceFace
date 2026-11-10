import assert from 'node:assert/strict';
import test from 'node:test';

import {
  entityIsOnReadableGlass,
  isHoldExemptMeshBuild,
  makeHoldExemptMeshBuildEvaluator,
} from '../src/render/renderer.js';

// Deterministic PRNG so failures reproduce.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPES = ['ship', 'asteroid', 'station', 'rock', 'debris', 'pickup'];

function randomEntity(rand, id, focusIds) {
  const entity = {
    id,
    type: TYPES[(rand() * TYPES.length) | 0],
    alive: rand() < 0.1 ? false : true,
    pos: rand() < 0.05
      ? null
      : {
          x: (rand() - 0.5) * 12000,
          z: (rand() - 0.5) * 12000,
        },
    vel: rand() < 0.2
      ? null
      : { x: (rand() - 0.5) * 600, z: (rand() - 0.5) * 600 },
    radius: rand() < 0.2 ? undefined : rand() * 120,
    data: {},
  };
  if (rand() < 0.05) entity.pos = { x: Number.NaN, z: 10 };
  const roll = rand();
  if (roll < 0.08) entity.data.rescue = true;
  else if (roll < 0.12) entity.data.onboardingTraining = true;
  if (rand() < 0.2) entity.data.defId = `ship_${['wasp', 'hornet', 'kestrel'][(rand() * 3) | 0]}`;
  if (rand() < 0.5) entity.data.silhouette = rand() < 0.5 ? 'ashline_dart' : '';
  if (rand() < 0.06) entity.flags = { forceRender: true };
  else if (rand() < 0.04) entity.flags = { neverCull: true };
  const ledger = rand();
  if (ledger < 0.1) entity.farResident = true;
  else if (ledger < 0.2) entity.fieldResident = true;
  else if (ledger < 0.3) entity.dressingResident = true;
  if (rand() < 0.3) {
    entity.mesh = rand() < 0.5
      ? { geometry: { boundingSphere: { radius: rand() * 300 } } }
      : { userData: {} };
  }
  if (rand() < 0.05 && focusIds.length) {
    focusIds.push(entity.id);
  }
  return entity;
}

function randomState(rand, entities, focusIds) {
  const usePlayer = rand() < 0.92;
  const playerId = 1;
  const player = usePlayer
    ? {
        id: playerId,
        type: 'ship',
        alive: true,
        isPlayer: true,
        pos: rand() < 0.05 ? null : { x: (rand() - 0.5) * 4000, z: (rand() - 0.5) * 4000 },
        vel: { x: (rand() - 0.5) * 300, z: (rand() - 0.5) * 300 },
        radius: 8,
        data: {},
      }
    : null;
  if (player && rand() < 0.1) player.targetId = focusIds.length ? focusIds[0] : undefined;
  const list = player ? [player, ...entities] : entities.slice();
  const entitiesMap = new Map(list.map((e) => [e.id, e]));
  const state = {
    mode: 'flight',
    playerId,
    simTime: rand() * 600,
    tick: (rand() * 36000) | 0,
    entities: entitiesMap,
    entityList: list,
    camera: {},
    settings: { video: { fov: 40 + rand() * 40 } },
    player: {},
    world: {},
    render: {},
  };
  if (rand() < 0.9) state.camera.zoom = 60 + rand() * 240;
  if (rand() < 0.5) state.camera.liveZoom = 60 + rand() * 240;
  if (rand() < 0.8) state.camera.fov = 35 + rand() * 50;
  if (rand() < 0.9) state.camera.tilt = 20 + rand() * 70;
  if (rand() < 0.8) state.camera.aspect = 0.5 + rand() * 2.5;
  if (rand() < 0.5) state.camera.focus = { x: (rand() - 0.5) * 500, z: (rand() - 0.5) * 500 };
  if (rand() < 0.5) state.world.frameOrigin = { x: (rand() - 0.5) * 2000, z: (rand() - 0.5) * 2000 };
  if (rand() < 0.15 && focusIds.length) state.player.targetId = focusIds[(rand() * focusIds.length) | 0];
  if (rand() < 0.3) {
    const keys = new Set();
    for (const defId of ['ship_wasp', 'ship_hornet', 'ship_kestrel']) {
      if (rand() < 0.5) keys.add(`${defId}|${rand() < 0.5 ? 'ashline_dart' : ''}`);
    }
    state.render.waveHullRunwayKeys = keys;
  }
  if (rand() < 0.4) {
    state.render.activityFrame = { focusX: (rand() - 0.5) * 400, focusZ: (rand() - 0.5) * 400 };
  }
  return state;
}

test('hoisted hold-exempt evaluator matches the per-entity function exactly', () => {
  const rand = mulberry32(0x5eed);
  const CASES = 400;
  for (let c = 0; c < CASES; c++) {
    const focusIds = [];
    const count = 5 + ((rand() * 60) | 0);
    const entities = [];
    for (let i = 0; i < count; i++) entities.push(randomEntity(rand, 100 + i, focusIds));
    const state = randomState(rand, entities, focusIds);
    const glassShape = rand();
    const glassIds = glassShape < 0.3
      ? null
      : (glassShape < 0.65
          ? new Set(entities.filter(() => rand() < 0.2).map((e) => e.id))
          : entities.filter(() => rand() < 0.2).map((e) => e.id));
    const exempt = makeHoldExemptMeshBuildEvaluator(state, glassIds);
    for (const entity of entities) {
      const expected = isHoldExemptMeshBuild(entity, state, glassIds);
      const actual = exempt(entity);
      assert.equal(
        actual,
        expected,
        `case ${c} entity ${entity.id} (${entity.type}): hoisted=${actual} per-entity=${expected}`,
      );
    }
    // The glass-level oracle: entities that survive the early exemptions must still hit the
    // same band classification through the hoisted probe.
    for (const entity of entities) {
      assert.equal(
        typeof entityIsOnReadableGlass(entity, state),
        'boolean',
        `case ${c} entity ${entity.id}: entityIsOnReadableGlass signature`,
      );
    }
  }
});

test('hold-exempt evaluator covers every early-exit branch against the oracle', () => {
  const rand = mulberry32(0xc0ffee);
  let sawFocus = false;
  let sawGlass = false;
  let sawWave = false;
  let sawHorizon = false;
  let sawReject = false;
  const CASES = 200;
  for (let c = 0; c < CASES; c++) {
    const focusIds = [];
    const entities = [];
    for (let i = 0; i < 30; i++) entities.push(randomEntity(rand, 100 + i, focusIds));
    const state = randomState(rand, entities, focusIds);
    const keys = new Set(['ship_wasp|', 'ship_hornet|ashline_dart']);
    state.render.waveHullRunwayKeys = keys;
    const glassIds = new Set(entities.filter(() => rand() < 0.3).map((e) => e.id));
    const exempt = makeHoldExemptMeshBuildEvaluator(state, glassIds);
    for (const entity of entities) {
      const expected = isHoldExemptMeshBuild(entity, state, glassIds);
      assert.equal(exempt(entity), expected, `case ${c} entity ${entity.id}`);
      if (expected) {
        if (entityIsOnReadableGlass(entity, state)) sawGlass = true;
        else if (entity.type === 'ship' && entity.data
          && keys.has(`${entity.data.defId}|${typeof entity.data.silhouette === 'string' ? entity.data.silhouette : ''}`)) {
          sawWave = true;
        } else if (!entityIsProtectedStub(entity) && !inSet(glassIds, entity.id)) {
          sawHorizon = true;
        }
        if (entity.id === state.playerId || (entity.flags && (entity.flags.forceRender || entity.flags.neverCull))
            || entity.id === (state.player && state.player.targetId)
            || entity.id === (state.entities.get(state.playerId) || {}).targetId) sawFocus = true;
      } else {
        sawReject = true;
      }
    }
  }
  assert.ok(sawGlass, 'random coverage never exercised the readable-glass branch');
  assert.ok(sawReject, 'random coverage never exercised a rejection');
});

function entityIsProtectedStub(entity) {
  const data = entity && entity.data;
  return !!(data && (data.rescue === true || data.onboardingTraining === true));
}

function inSet(set, id) {
  return typeof set.has === 'function' ? set.has(id) : set.includes(id);
}

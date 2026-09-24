import assert from 'node:assert/strict';
import test from 'node:test';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { authoredPreloadPlanForEntity } from '../src/render/partsLibrary.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  clearWaveHullRunwayKeys,
  collectWaveHullDecodeKeys,
  entityMatchesWaveHullRunway,
  makeWaveHullDecodeStub,
  noteWaveHullRunwayKeys,
} from '../src/world/presentationSources.js';
import {
  holdFirstFlightStreaming,
  isEntityMeshExpected,
} from '../src/render/renderer.js';

const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((row) => [row.id, row]));

function swarmPlan(wave = 1) {
  return planWave({
    seed: 4242,
    arenaId: 'helios_core',
    wave,
    act: 0,
    difficulty: 1,
    mutators: [],
    buildSummary: null,
    mode: 'swarm',
    ruleset: 'swarm',
  });
}

test('wave-planned hull keys cover schedule enemies with silhouette-aware decode stubs', () => {
  const plan = swarmPlan(1);
  assert.ok(plan && plan.ok !== false && Array.isArray(plan.schedule));
  const keys = collectWaveHullDecodeKeys(plan);
  assert.ok(keys.length >= 1, 'wave 1 names at least one hull key');
  const wasp = keys.find((k) => k.enemyId === 'wasp_swarmer');
  assert.ok(wasp, 'swarm wave 1 schedules wasp_swarmer');
  assert.equal(wasp.defId, 'ship_wasp');
  assert.equal(wasp.silhouette, 'drone_swarm');

  const stub = makeWaveHullDecodeStub(wasp);
  const preload = authoredPreloadPlanForEntity(stub);
  assert.deepEqual(preload.hull, ['wholeships/ashline_dart.glb'],
    'swarmer decode must warm ashline_dart, not wasp_production');

  // Bare ship_wasp without silhouette is a different body — proving silhouette is part of the key.
  const bare = authoredPreloadPlanForEntity({
    id: 'bare', type: 'ship', data: { defId: 'ship_wasp' },
  });
  assert.deepEqual(bare.hull, ['wholeships/wasp_production_v1.glb']);
  assert.notDeepEqual(preload.hull, bare.hull);
});

test('noteWaveHullRunwayKeys stamps planned keys and holds swarm-spawn wasps mesh-expected', () => {
  const plan = swarmPlan(1);
  const keys = collectWaveHullDecodeKeys(plan);
  const state = {
    mode: 'flight',
    simTime: 1,
    playerId: 1,
    player: { targetId: null },
    entities: new Map(),
    entityList: [],
    world: { frameOrigin: { x: 0, z: 0 } },
    camera: { zoom: 144, tilt: 60, fov: 50, aspect: 16 / 9 },
    settings: { video: { fov: 50 } },
    render: {
      firstFlightResidencyHoldUntil: 1e9,
      activityFrame: { complete: true, renderGlassIds: new Set([1]), renderRunwayIds: new Set() },
    },
  };
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, maxSpeed: 160, radius: 8, data: {},
  };
  // SWARM_SPAWN_DISTANCE = 165 sits on the glass lip (~163 halfX).
  const wasp = {
    id: 42, type: 'ship', alive: true,
    pos: { x: 165, z: 0 }, vel: { x: 0, z: 0 }, radius: 12,
    data: { defId: 'ship_wasp', silhouette: 'drone_swarm' },
  };
  state.entities.set(1, player);
  state.entities.set(42, wasp);
  state.entityList = [player, wasp];

  assert.equal(holdFirstFlightStreaming(state), true);
  noteWaveHullRunwayKeys(state, keys);
  assert.equal(entityMatchesWaveHullRunway(wasp, state), true);
  assert.equal(isEntityMeshExpected(wasp, state), true,
    'planned swarm spawn wasp is owed a mesh under the hold');

  clearWaveHullRunwayKeys(state);
  assert.equal(entityMatchesWaveHullRunway(wasp, state), false);
});

test('collectWaveHullDecodeKeys ignores empty/failed plans and dedupes shared shipIds', () => {
  assert.deepEqual(collectWaveHullDecodeKeys(null), []);
  assert.deepEqual(collectWaveHullDecodeKeys({ ok: false }), []);
  const keys = collectWaveHullDecodeKeys({
    schedule: [
      { enemyId: 'wasp_swarmer', count: 5 },
      { enemyId: 'wasp_swarmer', count: 5 },
      { enemyId: 'lancer_sniper', count: 1 },
    ],
  });
  const tokens = keys.map((k) => k.key).sort();
  assert.deepEqual(tokens, ['ship_wasp|drone_swarm', 'ship_wasp|sniper_lance'].sort());
  for (const key of keys) {
    assert.ok(ENEMY_BY_ID.has(key.enemyId));
  }
});

test('renderer wires run:wavePlanned to wave-hull decode runway (source contract)', async () => {
  const fs = await import('node:fs/promises');
  const src = await fs.readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(src, /onBus\('run:wavePlanned'/);
  assert.match(src, /_kickWaveHullDecodeRunway/);
  assert.match(src, /kickWaveHullDecodeAssets/);
  assert.match(src, /collectWaveHullDecodeKeys/);
  assert.doesNotMatch(src, /onBus\('run:wavePlanned'[\s\S]{0,200}_admitSurvivalRosterPrewarm/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { swarmOpeningTerrainStage as stageFor, planSwarmOpeningTerrain as plan } from '../src/data/swarmOpeningTerrain.js';

const layout = { target: 14, inner: 115, outer: 340, safeRadius: 120,
  separation: 34, sizeMinWu: 4.5, sizeMaxWu: 9 };
const stage = wave => stageFor({ arenaId: 'helios_core', wave, lineTier: 0 });
const options = wave => ({ stage: stage(wave), anchor: { x: 0, z: 0 }, layout, want: 14 });

test('first three courts expand without blocking the nose/rear escape lane or tier bounds', () => {
  for (const [wave, count] of [[1, 8], [2, 11], [3, 14]]) {
    const spots = plan(options(wave));
    assert.equal(spots.length, count);
    assert.deepEqual(spots, plan(options(wave)), 'authored replay, no RNG lottery');
    for (const p of spots) {
      assert.ok(Math.abs(p.z) - p.radius >= 48);
      assert.ok(Math.hypot(p.x, p.z) >= layout.safeRadius + p.radius);
      assert.ok(Math.hypot(p.x, p.z) <= layout.outer);
      assert.equal(p.radius, layout.sizeMaxWu, 'line rating owns movable mass class');
    }
  }
  const near = plan(options(1));
  assert.equal(new Set(near.map(p => p.material)).size, 7, 'all shipped surface verbs remain available');
  const flank = plan({ ...options(2), existing: near });
  assert.equal(flank.length, 3, 'surviving first room is not duplicated or relocated');
  const outer = plan({ ...options(3), existing: near.concat(flank) });
  assert.equal(outer.length, 3);
  // Third court expands the rear throwing lane, not the maximum radial envelope.
  assert.ok(Math.min(...outer.map(p => p.z)) < Math.min(...near.map(p => p.z)), 'round three reaches farther rearward');
  assert.ok(Math.max(...flank.map(p => Math.abs(p.x))) > Math.max(...near.map(p => Math.abs(p.x))), 'round two broadens the flanks');
  assert.equal(new Set(near.concat(flank, outer).map(p => p.openingTerrainSlot)).size, 14, 'each expansion occupies distinct authored stations');
  assert.ok(near.concat(flank, outer).every(p => Math.hypot(p.x, p.z) <= 300), 'all stations remain inside actual T0 reach');
});

test('variants, upgraded lines and later rounds retain their established director', () => {
  for (const override of [{ arenaId: 'the_hive' }, { lineTier: 1 }, { altered: true }, { wave: 4 }, { wave: 0 }]) {
    assert.equal(stageFor({ arenaId: 'helios_core', lineTier: 0, wave: 1, ...override }), null);
  }
  assert.deepEqual(plan({ ...options(1), existing: [{ x: NaN, z: 0, radius: 1 }] }), []);
  assert.deepEqual(plan({ ...options(1), existing: [{ x: 0, z: 0, radius: 1000 }] }), []);
  assert.equal(plan({ ...options(1), want: 2 }).length, 2);
});

// Execute the actual arena module and its registered event callback. External physics,
// field and material owners are ports here, not a claim about a rendered browser run.
// Keeping imports as injected ports avoids requiring WebGL/Rapier for this narrow test.
function arenaHarness({ source, clearance = true, pocket = false } = {}) {
  source ||= fs.readFileSync(new URL('../src/systems/swarmArena.js', import.meta.url), 'utf8');
  const bindings = {};
  source = source.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"];?/g, (_, names) => {
    for (const name of names.split(',').map(s => s.trim()).filter(Boolean)) bindings[name] = () => {};
    return '';
  });
  const entities = new Map();
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, radius: 8, rot: 0, data: {} };
  entities.set(1, player);
  const state = { run: { kind: 'survival', phase: 'active', ruleset: 'swarm', arenaId: 'helios_core', seed: 73311, wave: 1 },
    entities, entityList: [player], playerId: 1, simTime: 0, rockCore: { ratingT: 0 } };
  const events = new Map();
  const emitted = [];
  Object.assign(bindings, {
    swarmOpeningTerrainStage: stageFor, planSwarmOpeningTerrain: plan,
    swarmArenaTierForRun: () => ({ ratingTierMin: 0 }), swarmArenaDebrisLayout: () => layout,
    mulberry32: () => () => 0.5, validateRunState: () => ({ ok: true }), isSwarmRuleset: x => x === 'swarm',
    indexedShipLikeScan: () => [], indexedTypeScan: () => [],
    ENVIRONMENT_FAMILIES: ['rock', 'metal', 'crystal', 'volatile', 'debris', 'cryo', 'calcite'],
    environmentMaterialOf: e => e.data?.material,
    environmentSurfaceData: (material, data) => ({ ...data, material }),
    withBankStone: x => x, applyRockSubstance: () => 1, asteroidColliderRadius: (_, r) => r,
    ROCK_PLACE_SUBSTANCES: ['basalt'], swarmPlacementIsClear: () => clearance,
    OPENING_LESSON_RELEASE_TICKS: 180,
    createBroodEngine: () => ({ clear() {}, prepareWave() {}, spawnWave() {} }),
    BROOD_EXPLOSION_EVENTS: [], planOpeningThrowables: () => pocket
      ? [{ x: 72, z: 0, radiusWu: 6.75 }, { x: 66, z: 50, radiusWu: 6.75 }, { x: 66, z: -50, radiusWu: 6.75 }] : [],
  });
  const arena = vm.runInNewContext(source.replace(/export\s+/g, '') + '\n;swarmArena;', bindings);
  arena.init({ state, bus: { on(name, fn) { events.set(name, fn); return () => {}; }, emit(name, payload) { emitted.push({ name, payload }); } },
    registry: { get: () => null }, helpers: { spawnEntity(spec) {
      const e = { ...spec, id: entities.size + 1, alive: true };
      entities.set(e.id, e); state.entityList.push(e); return e;
    } } });
  // Unrelated arena machinery remains with its owning tests; placement, spawn shape,
  // census and lifecycle below are the real production methods.
  for (const name of ['_syncOpticLattice', '_raiseCapacity', '_cullWrecks', '_installSlalomWells', '_installMassGapWall', '_installLawRoom', '_settleRoom']) arena[name] = () => {};
  return { arena, state, events, emitted, planWave(wave, wavePlan = {}) {
    state.run.wave = wave;
    events.get('run:wavePlanned')({ wave, plan: wavePlan });
    return state.entityList.filter(e => e.data?.openingTerrainSlot != null);
  } };
}

test('ordinary wavePlanned event installs visible physical assets, extends the court, never duplicates', () => {
  const h = arenaHarness();
  const first = h.planWave(1);
  assert.equal(first.length, 8);
  assert.equal(h.arena.debrisCount(), 8);
  for (const e of first) {
    assert.ok(e.collides && e.physicsBody.radius > 0 && e.mass > 0);
    assert.ok(e.data.terrainAnchor && e.data.swarmArenaDebris && e.data.despawnAt > 0);
    if (e.type !== 'wreck') assert.ok(e.data.authoredGeologySkin && e.data.placeId.startsWith('place_rock_'));
  }
  assert.equal(h.planWave(1).length, 8);
  assert.equal(h.planWave(2).length, 11);
  assert.equal(h.planWave(3).length, 14);
  assert.equal(h.arena.debrisCount(), 14);
  assert.equal(h.emitted.filter(e => e.name === 'swarmArena:debris').length, 3);
});

test('native clearance denial never receives a random fallback or invisible body', () => {
  const h = arenaHarness({ clearance: false });
  assert.equal(h.planWave(1).length, 0);
  assert.equal(h.state.entities.size, 1);
  assert.equal(h.arena._terrainRetry, true);
});

test('surviving launch pocket does not spend the next room expansion allowance', () => {
  const h = arenaHarness({ pocket: true });
  assert.equal(h.planWave(1).length, 8);
  assert.equal(h.state.entityList.filter(e => e.data?.openingPocket).length, 3);
  assert.equal(h.planWave(2).length, 11);
  assert.equal(h.planWave(3).length, 14);
  assert.equal(h.arena.debrisCount(), 17);
  assert.ok(h.arena.debrisCount() <= 20, 'live room remains below ordinary cap');
});

test('first-run lesson keeps its hold/release seam and its rock does not suppress expansion', () => {
  const h = arenaHarness({ pocket: true });
  h.planWave(1, { openingLesson: { holdTicks: 2700, rock: { x: 78, z: 16, radius: 6 } } });
  h.events.get('run:waveStarted')({ wave: 1 });
  assert.equal(h.arena._broodHeldUntil, 45);
  h.events.get('run:openingLessonReleased')({ wave: 1 });
  assert.equal(h.arena._broodHeldUntil, 3, 'existing release breath, not a new timer');
  assert.equal(h.planWave(2).length, 11);
  assert.equal(h.planWave(3).length, 14);
  assert.equal(h.arena.debrisCount(), 18);
});

test('negative control: removing production planner wiring removes the authored experience', () => {
  const src = fs.readFileSync(new URL('../src/systems/swarmArena.js', import.meta.url), 'utf8');
  const broken = src.replace('const openingStage = swarmOpeningTerrainStage({', 'const openingStage = (() => null)({');
  assert.notEqual(broken, src, 'negative control must mutate the real call site');
  assert.equal(arenaHarness({ source: broken }).planWave(1).length, 0);
});

// ROCK-02 — every rock the Swarm arena fields asks for its authored body.
//
// INV-16 live census found the fight's rocks stuck on the procedural stand-in:
// fracture pieces inherited the parent's placeId and placeTargetRadius, so
// presentationAdmission's targetRadius === radius refused them; and the big
// on-glass monoliths — terrainAnchors' arcade cover, the opening lesson rock,
// wear-fracture remnants, the survival restock — never carried a placeId at all.
// Each lane now mints authoredRockPlaceId(substance, ownRadius) +
// placeTargetRadius = ownRadius + authoredGeologySkin — the same stamp
// _spawnDebrisRock writes. Optic-lattice cells are deliberately excluded: they
// are authored optic machinery (mirrors, wicks, stone), not rocks.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { mulberry32 } from '../src/core/rng.js';
import { environmentMaterials, queueEnvironmentImpact } from '../src/systems/environmentMaterials.js';
import { environmentSurfaceData } from '../src/data/environmentMaterials.js';
import {
  SWARM_DEBRIS_TAG,
  SWARM_OPTIC_TAG,
  swarmArena,
} from '../src/systems/swarmArena.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { applyRockSubstance, authoredRockPlaceId } from '../src/data/rockSubstances.js';
import { hasExplicitAuthoredGeologyPresentation } from '../src/core/presentationAdmission.js';
import { MASSLINE2_FLAGS, restoreFeatureMaps, snapshotFeatureMaps } from '../src/data/featureFlags.js';
import { withBankStone } from '../src/core/surfaceContact.js';

const census = JSON.parse(readFileSync(
  fileURLToPath(new URL('../src/data/modelTruthCensus.json', import.meta.url)), 'utf8'));
const censusText = JSON.stringify(census);

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';

function assertAuthoredGeology(entity, label) {
  const d = entity.data || {};
  assert.equal(d.authoredGeologySkin, true, `${label}: missing authoredGeologySkin`);
  assert.equal(typeof d.placeId, 'string', `${label}: missing placeId`);
  assert.ok(censusText.includes(d.placeId), `${label}: ${d.placeId} does not resolve to a manifest id`);
  assert.equal(d.placeTargetRadius, entity.radius,
    `${label}: placeTargetRadius ${d.placeTargetRadius} must equal the body's own radius ${entity.radius}`);
  assert.equal(d.placeId, authoredRockPlaceId(d.substance, entity.radius),
    `${label}: placeId must name the stamped substance at the real size class`);
  assert.equal(hasExplicitAuthoredGeologyPresentation(entity), true,
    `${label}: admission predicate still refuses it`);
}

test('a fractured stamped rock re-mints the family stamp at each piece\'s own radius', async () => {
  const sim = createSimulation({ seed: 73311, systems: [physics, environmentMaterials], updateOrder: [] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const parentData = environmentSurfaceData('rock', {
      typeId: 'ast_common_rock', size: 9, tier: 1,
      authoredGeologySkin: true, placeId: 'place_rock_silicate_pebble', placeTargetRadius: 9,
      yieldU: 10, yieldRemainingU: 10, asteroidSlotId: 'bank',
    });
    applyRockSubstance(parentData, 'silicate');
    const parent = sim.spawn({
      type: 'asteroid', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
      radius: 9, mass: 500, hull: 480, hullMax: 480, collides: true,
      physicsBody: { radius: 12, mass: 500 }, data: parentData,
    });
    assert.equal(await sim.registry.get('physics').prepareBackend(state, {}), true);
    assert.equal(queueEnvironmentImpact(state, parent, 130), true,
      'a rock-material parent at break speed queues the fracture');
    sim.registry.get('environmentMaterials').update(DT);
    const children = state.entityList.filter((e) => e.data && e.data.materialFragment);
    assert.equal(children.length, 4);
    const childRadius = 9 / Math.cbrt(4);
    for (const child of children) {
      assert.ok(Math.abs(child.radius - childRadius) < 1e-9, `child radius ${child.radius}`);
      assertAuthoredGeology(child, `fracture piece ${child.id}`);
    }
  } finally { sim.dispose(); }
});

test('a fracture of an unstamped rock mints no place id — pieces stay procedural', async () => {
  const sim = createSimulation({ seed: 73311, systems: [physics, environmentMaterials], updateOrder: [] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const parent = sim.spawn({
      type: 'asteroid', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
      radius: 20, mass: 640, hull: 600, hullMax: 600, collides: true,
      physicsBody: { radius: 31, mass: 640 },
      data: environmentSurfaceData('rock', { typeId: 'ast_common_rock', size: 20, yieldU: 12, yieldRemainingU: 12 }),
    });
    assert.equal(await sim.registry.get('physics').prepareBackend(state, {}), true);
    assert.equal(queueEnvironmentImpact(state, parent, 130), true);
    sim.registry.get('environmentMaterials').update(DT);
    const children = state.entityList.filter((e) => e.data && e.data.materialFragment);
    assert.equal(children.length, 4);
    for (const child of children) {
      assert.equal(child.data.placeId, undefined, 'no place id is minted without a built substance');
      assert.equal(child.data.authoredGeologySkin, undefined);
      assert.equal(child.data.placeTargetRadius, undefined);
      assert.equal(hasExplicitAuthoredGeologyPresentation(child), false);
    }
  } finally { sim.dispose(); }
});

function arenaBoot() {
  const state = createGameState(SEED);
  const bus = createBus();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    mulberry32,
    hash32: (a, b) => {
      let h = 2166136261;
      for (const ch of `${a}:${b}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
      return h;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', data: {} };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  terrainAnchors.init(ctx);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA });
  return { state, bus, helpers, spawned, player };
}

/** The cover telegraph survivalArena._installCover emits, verbatim shape. */
function emitArenaCoverTelegraph(h, wave) {
  h.bus.emit('encounter:telegraph', {
    encounterId: `survival-arena-w${wave}`,
    kind: 'survival_arena',
    shape: 'survival_arena',
    arcadeLayout: h.state.run && h.state.run.ruleset === 'swarm',
    arenaSeed: h.state.run && h.state.run.seed,
    pos: { x: h.player.pos.x, z: h.player.pos.z },
    sectorId: null,
  });
}

/** Rocks the arena fields: plain asteroids — not the optic lattice's authored cells. */
function fieldedRocks(h) {
  return h.state.entityList.filter((e) => e && e.alive !== false && e.type === 'asteroid'
    && e.data && !e.data[SWARM_OPTIC_TAG] && !e.data.opticStructureId);
}

test('the arcade cover anchors mint a resolving place id at their own radius', () => {
  const snap = snapshotFeatureMaps();
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.terrainAnchors = true;
  try {
    const h = arenaBoot();
    emitArenaCoverTelegraph(h, 1);
    const anchors = h.state.entityList.filter((e) => e && e.alive !== false && e.type === 'asteroid'
      && e.data && e.data.terrainAnchor === true && !e.data[SWARM_DEBRIS_TAG]);
    assert.ok(anchors.length >= 3, `arcade cover arrived (${anchors.length})`);
    for (const rock of anchors) assertAuthoredGeology(rock, `cover anchor ${rock.id}`);
  } finally { restoreFeatureMaps(snap); }
});

test('every asteroid the swarm arena fields in rounds 1-5 carries a resolving place id', () => {
  const snap = snapshotFeatureMaps();
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.terrainAnchors = true;
  try {
    const h = arenaBoot();
    for (let wave = 1; wave <= 5; wave++) {
      // The cover telegraph lands first (survivalArena's install), then the wave's own terrain.
      emitArenaCoverTelegraph(h, wave);
      const plan = planWave({
        seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET,
        teachOpening: wave === 1,
      });
      h.bus.emit('run:wavePlanned', { wave, plan });
    }
    const rocks = fieldedRocks(h);
    assert.ok(rocks.length >= 10, `the arena fielded a real room (${rocks.length} rocks)`);
    for (const rock of rocks) assertAuthoredGeology(rock, `arena rock ${rock.id} r=${rock.radius}`);
    // Every lane actually ran: debris banks, arcade cover anchors, the taught rock.
    assert.ok(rocks.some((r) => r.data[SWARM_DEBRIS_TAG]), 'debris field spawned');
    assert.ok(rocks.some((r) => r.data.terrainAnchor && !r.data[SWARM_DEBRIS_TAG]),
      'arcade cover anchors spawned');
    assert.ok(rocks.some((r) => r.data.openingLesson === true), 'the opening lesson rock spawned');
  } finally { restoreFeatureMaps(snap); }
});

test('a worn debris rock leaves remnant rocks stamped at their own radii', () => {
  const h = arenaBoot();
  const parentData = withBankStone({
    typeId: 'ast_common_rock', size: 30,
    [SWARM_DEBRIS_TAG]: true, terrainAnchor: true, terrainAnchorEncounterIds: [],
    despawnAt: 900,
  });
  applyRockSubstance(parentData, 'slag');
  const parent = h.helpers.spawnEntity({
    type: 'asteroid', pos: { x: 4000, z: 4000 }, vel: { x: 0, z: 0 },
    radius: 30, mass: 36000, hull: 1, hullMax: 780, collides: true,
    data: parentData,
  });
  assert.equal(swarmArena._fractureDebris(parent), true);
  const remnants = h.state.entityList.filter((e) => e.data && e.data.isChunk && e.data[SWARM_DEBRIS_TAG]);
  assert.equal(remnants.length, 2);
  for (const remnant of remnants) {
    assert.equal(remnant.data.substance, 'slag', 'the remnant keeps the parent substance');
    assertAuthoredGeology(remnant, `debris remnant ${remnant.id}`);
  }
});

test('the survival restock asks for the authored body at the rolled radius', () => {
  const state = createGameState(SEED);
  const bus = createBus();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', data: {} };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.mode = 'flight';
  state.run = { kind: 'survival', phase: 'active', seed: SEED };
  environmentMaterials.init({ state, bus, helpers });
  environmentMaterials._tickRockSubstance(state);
  const restocked = spawned.filter((e) => e.data && e.data.restock === true);
  assert.ok(restocked.length > 0, 'a live survival run restocks the ring');
  for (const rock of restocked) assertAuthoredGeology(rock, `restock rock ${rock.id}`);
});

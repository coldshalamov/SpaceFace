/**
 * VP-220 P1 adversarial tests:
 * multi-ship family fleet, hot-path allocation stability, segmented geometry, live idle.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';
import {
  ContinuousPlumeSystem,
  PlumeSlotPool,
} from '../src/render/thruster/systems/continuousPlume.js';
import {
  FamilyProductionFleet,
  FLEET_MAX_SHIPS,
} from '../src/render/thruster/systems/familyFleet.js';
import {
  resolveSegmentCount,
  segmentedVertexCount,
  createSegmentedPlumeGeometry,
} from '../src/render/thruster/geometry/segmentedPlumeGeometry.js';
import {
  resolveThrusterRecipes,
  listThrusterRecipePacks,
} from '../src/render/thruster/recipes/registry.js';
import {
  resolveEngineProfileId,
  getEngineProfileBase,
  resolveEngineProfile,
  ENGINE_PROFILES,
} from '../src/render/vfxProfiles.js';
import { KESTREL_MAIN_PLUME_RECIPE } from '../src/render/thruster/recipes/kestrelRecipes.js';

const A11Y = {
  reducedMotion: false,
  reducedFlash: false,
  lowQuality: false,
  qualityTier: 'high',
};

function makeVfxHarness(entities) {
  const scene = new THREE.Scene();
  const map = new Map(entities.map((e) => [e.id, e]));
  const state = {
    playerId: entities[0].id,
    player: {},
    entities: map,
    entityList: entities.slice(),
    input: { moveZ: 0, turnIntent: 0 },
    settings: {
      video: {
        particleQuality: 'high',
        engineTrails: true,
        energyMaterials: false,
        motionReduce: false,
        bloom: false,
      },
      accessibility: { flashReduce: false },
    },
    render: { scene },
  };
  const system = Object.create(vfx);
  system.init({ state, bus: createBus(), helpers: {} });
  return { scene, state, system };
}

test('segmented geometry uses recipe/quality counts — not a 4-vertex card', () => {
  const recipe = resolveThrusterRecipes('engine_vector').main;
  const highSeg = resolveSegmentCount(recipe, 'high');
  const lowSeg = resolveSegmentCount(recipe, 'low');
  assert.ok(highSeg >= 3, `high segments must be authored (>=3), got ${highSeg}`);
  assert.ok(lowSeg >= 1 && lowSeg <= highSeg);
  const geo = createSegmentedPlumeGeometry(THREE, highSeg);
  assert.equal(geo.userData.plumeSegments, highSeg);
  assert.equal(geo.attributes.position.count, segmentedVertexCount(highSeg));
  assert.ok(geo.attributes.position.count > 4, 'axial samples require more than a single quad');
  geo.dispose();

  const plume = new ContinuousPlumeSystem(THREE, recipe, { distortionEnabled: false });
  const statsHigh = plume.getActiveGeometryStats();
  assert.equal(statsHigh.segments, highSeg);
  assert.equal(statsHigh.vertexCount, segmentedVertexCount(highSeg));
  assert.ok(statsHigh.vertexCount > 4);

  plume.setQualityTier('low');
  const statsLow = plume.getActiveGeometryStats();
  assert.equal(statsLow.segments, lowSeg);
  assert.equal(statsLow.vertexCount, segmentedVertexCount(lowSeg));
  // Complete mesh — index count matches full plane, not a truncated partial.
  assert.equal(statsLow.indexCount, lowSeg * 6);

  // Switching tiers does not allocate new geometry objects (prebuilt).
  const geoRef = plume.layerBatches[0].tierBuffers.low.geo;
  plume.setQualityTier('high');
  plume.setQualityTier('low');
  assert.equal(plume.layerBatches[0].mesh.geometry, geoRef);
  plume.dispose();
});

test('quality tier switch preserves full mesh for every layer batch', () => {
  const packs = listThrusterRecipePacks();
  for (const pack of packs) {
    const plume = new ContinuousPlumeSystem(THREE, pack.main, { distortionEnabled: false });
    for (const tier of ['high', 'medium', 'low']) {
      plume.setQualityTier(tier);
      const expected = resolveSegmentCount(pack.main, tier);
      for (const batch of plume.layerBatches) {
        assert.equal(batch.mesh.geometry.userData.plumeSegments, expected,
          `${pack.profileId}/${tier}/${batch.role} segments`);
        assert.equal(batch.mesh.geometry.attributes.position.count, segmentedVertexCount(expected));
      }
    }
    plume.dispose();
  }
});

test('resolveEngineProfileId and getEngineProfileBase allocate nothing and stay referentially stable', () => {
  const a = resolveEngineProfileId({ defId: 'ship_wasp' });
  const b = resolveEngineProfileId({ defId: 'ship_wasp' });
  assert.equal(a, 'engine_vector');
  assert.equal(a, b);
  const base1 = getEngineProfileBase(a);
  const base2 = getEngineProfileBase(a);
  assert.equal(base1, base2);
  assert.equal(base1, ENGINE_PROFILES.engine_vector);
  // No-faction resolveEngineProfile must return the frozen base (no spread).
  const resolved = resolveEngineProfile({ defId: 'ship_wasp' }, null);
  assert.equal(resolved, ENGINE_PROFILES.engine_vector);
});

test('dense multi-frame profile id resolution stays allocation-stable', () => {
  const { system } = makeVfxHarness([
    {
      id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      rot: 0, radius: 4, data: { defId: 'ship_kestrel' },
    },
  ]);
  const ids = [];
  for (let f = 0; f < 120; f++) {
    system._trailFrameIndex = f;
    // Alternate defIds across factions without constructing profiles.
    const e = {
      id: (f % 7) + 1,
      type: 'ship',
      data: {
        defId: ['ship_kestrel', 'ship_wasp', 'ship_mule', 'ship_bastion', 'ship_pelican', 'ship_hornet', 'ship_atlas'][f % 7],
        factionId: f % 2 ? 'concord' : 'reaver',
      },
    };
    ids.push(system._engineProfileIdFor(e));
    const prof = system._engineProfile(e);
    assert.equal(prof, getEngineProfileBase(ids[ids.length - 1]));
  }
  assert.ok(ids.includes('engine_vector'));
  assert.ok(ids.includes('engine_industrial'));
  assert.ok(ids.includes('engine_plasma_ring'));
  // Same input twice same frame → same string identity from cache path.
  system._trailFrameIndex = 999;
  const e = { id: 42, type: 'ship', data: { defId: 'ship_wasp' } };
  const p1 = system._engineProfileIdFor(e);
  const p2 = system._engineProfileIdFor(e);
  assert.equal(p1, p2);
  assert.equal(p1, 'engine_vector');
  system._disposeEnergy();
});

test('family fleet batches two distinct live families simultaneously then sleeps', () => {
  const fleet = new FamilyProductionFleet(THREE, { textures: {} });
  const alloc0 = fleet.allocationCount;
  const ionSockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  const vectorSockets = [{ x: 5, y: 0, z: 0, ax: 0, ay: 0, az: 1 }];

  fleet.beginFrame(A11Y);
  fleet.beginAdmitPhase();
  const player = fleet.acquireShip(1, 'engine_ion_small', true);
  const npc = fleet.acquireShip(2, 'engine_vector', false);
  assert.ok(player && npc);
  fleet.setShipSockets(player, ionSockets, 1);
  fleet.setShipSockets(npc, vectorSockets, 1);
  fleet.setShipDrive(player, { drive: 1, boost: 0, cruise: 0, reverse: 0, brake: 0, speedDrive: 0.5 });
  fleet.setShipDrive(npc, { drive: 0.9, boost: 0.2, cruise: 0, reverse: 0, brake: 0, speedDrive: 0.4 });
  const diag = fleet.endFrame(1 / 60);
  assert.equal(fleet.allocationCount, alloc0, 'fleet must not allocate during begin/write/end');
  assert.equal(diag.frameAllocations, 0);
  assert.ok(diag.familiesActive >= 2, `expected ≥2 live families, got ${diag.familiesActive}`);
  assert.equal(diag.shipsActive, 2);

  const ionPlume = fleet.familyPlume('engine_ion_small');
  const vectorPlume = fleet.familyPlume('engine_vector');
  assert.ok(ionPlume.group.visible && vectorPlume.group.visible);
  assert.ok(ionPlume.pool.activeCount > 0 && vectorPlume.pool.activeCount > 0);

  // Structural distinction: vector core longer/narrower than ion at equal drive.
  const ionCore = ionPlume.pool.slots.slice(0, ionPlume.pool.activeCount).find((s) => s.layerRole === 'core');
  const vecCore = vectorPlume.pool.slots.slice(0, vectorPlume.pool.activeCount).find((s) => s.layerRole === 'core');
  assert.ok(vecCore.length > ionCore.length * 0.9);
  assert.ok(vecCore.width < ionCore.width * 1.05 || vecCore.length / vecCore.width > ionCore.length / ionCore.width);

  // Sleep: no ships → groups hidden, no lingering counts.
  fleet.beginFrame(A11Y);
  const sleepDiag = fleet.endFrame(1 / 60);
  assert.equal(sleepDiag.shipsActive, 0);
  assert.equal(ionPlume.group.visible, false);
  assert.equal(vectorPlume.group.visible, false);
  assert.equal(ionPlume.pool.activeCount, 0);

  fleet.dispose();
  assert.equal(fleet._disposed, true);
});

test('fleet saturates at fixed cap without unbounded growth', () => {
  const fleet = new FamilyProductionFleet(THREE, { textures: {} });
  fleet.beginFrame(A11Y);
  fleet.beginAdmitPhase();
  let got = 0;
  for (let i = 0; i < FLEET_MAX_SHIPS + 5; i++) {
    const s = fleet.acquireShip(100 + i, i % 2 ? 'engine_vector' : 'engine_industrial', i === 0);
    if (s) got += 1;
  }
  assert.equal(got, FLEET_MAX_SHIPS);
  assert.ok(fleet.saturated >= 5);
  fleet.endFrame(1 / 60);
  fleet.dispose();
});

test('route-level idle sleeps production energy; thrust wakes it non-allocating', () => {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 4,
    data: { defId: 'ship_kestrel' },
  };
  const { system } = makeVfxHarness([player]);
  // No throttle, no boost, no turn — pure idle.
  player._flightFrame = { throttle: 0 };
  system.state.input = { moveZ: 0, turnIntent: 0 };

  // PQ-023 §4.1: when no ship is thrusting the energy subsystem must do zero work.
  // A merely alive player does not keep production awake.
  assert.equal(system._energyPlumeRelevant(), false, 'idle player must let production sleep');
  for (let f = 0; f < 8; f++) system.update(1 / 60);
  const idleFrame = system.inspect().subsystems.lastFrame;
  assert.equal(idleFrame.energy, 0, 'idle frame must not run energy updates');

  // Thrust wakes the fleet: plume attaches at the nozzle, bounded and non-allocating.
  player._flightFrame = { throttle: 1 };
  assert.equal(system._energyPlumeRelevant(), true, 'thrusting player must wake production');
  for (let f = 0; f < 8; f++) system.update(1 / 60);

  const energy = system._energy;
  assert.ok(energy && energy.fleet, 'fleet must be initialized on wake');
  const plume = energy.fleet.familyPlume('engine_ion_small') || energy.plumeSystem;
  assert.ok(plume.group.visible, 'thrusting plume must be drawn');
  assert.ok(plume.pool.activeCount > 0, 'thrust must write attached layer slots');

  const core = plume.pool.slots.slice(0, plume.pool.activeCount).find((s) => s.layerRole === 'core');
  assert.ok(core, 'core layer required under thrust');
  // Attached at nozzle origin (fallback socket near hull rear is finite and local).
  assert.ok(Number.isFinite(core.offset[0]) && Number.isFinite(core.offset[2]));

  // No unbounded tail growth at steady thrust — activeCount stable across frames.
  const c0 = plume.pool.activeCount;
  for (let f = 0; f < 30; f++) system.update(1 / 60);
  assert.equal(plume.pool.activeCount, c0, 'steady thrust must not accumulate slots/tail over time');
  assert.equal(plume.pool.frameAllocations, 0);

  // Back to idle: production sleeps again instead of pinning the subsystem awake.
  player._flightFrame = { throttle: 0 };
  for (let f = 0; f < 4; f++) system.update(1 / 60);
  const sleepFrame = system.inspect().subsystems.lastFrame;
  assert.equal(sleepFrame.energy, 0, 'returned-to-idle frame must sleep again');
  assert.equal(plume.group.visible, false, 'slept plume must be hidden');

  system._disposeEnergy();
});

test('live route binds player + NPC different families at once via vfx system', () => {
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 20, z: 0 }, rot: 0, radius: 4,
    data: { defId: 'ship_kestrel' },
    _flightFrame: { throttle: 1 },
  };
  const npc = {
    id: 2, type: 'ship', alive: true,
    pos: { x: 40, z: 10 }, vel: { x: 30, z: 0 }, rot: 0, radius: 12,
    data: { defId: 'ship_wasp' },
    _flightFrame: { throttle: 1 },
  };
  const { system } = makeVfxHarness([player, npc]);
  for (let f = 0; f < 10; f++) system.update(1 / 60);

  const fleet = system._energy.fleet;
  assert.ok(fleet.activeShipCount >= 2, `fleet ships=${fleet.activeShipCount}`);
  assert.ok(system._usesProductionThruster(player));
  assert.ok(system._usesProductionThruster(npc), 'NPC in fleet must suppress legacy beads');

  const ion = fleet.familyPlume('engine_ion_small');
  const vector = fleet.familyPlume('engine_vector');
  assert.ok(ion.group.visible, 'player ion family live');
  assert.ok(vector.group.visible, 'NPC vector family live');
  assert.ok(ion.pool.activeCount > 0 && vector.pool.activeCount > 0);

  // Structural distinction under live route.
  const iCore = ion.pool.slots.slice(0, ion.pool.activeCount).find((s) => s.layerRole === 'core');
  const vCore = vector.pool.slots.slice(0, vector.pool.activeCount).find((s) => s.layerRole === 'core');
  assert.ok(Math.abs(iCore.length - vCore.length) > 0.05
    || Math.abs(iCore.width - vCore.width) > 0.05,
  'two live families must not share identical core geometry');

  // Dispose cleans GPU owners.
  system._disposeEnergy();
  assert.equal(system._energy, null);
});

test('multi-entity pool write does not allocate and respects socket budget', () => {
  const recipe = resolveThrusterRecipes('engine_plasma_ring').main;
  const pool = new PlumeSlotPool(recipe, { maxSockets: 8, maxLayers: 5 });
  const before = pool.allocationCount;
  const driveA = { plumeDrive: 0, boostBlend: 0 };
  const driveB = { plumeDrive: 0, boostBlend: 0 };
  pool.beginWrite(A11Y);
  pool.writeEntity(1, [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }], 1 / 60, 0, driveA, null, 2);
  pool.writeEntity(0.8, [{ x: 3, y: 0, z: 0, ax: 0, ay: 0, az: 1 }], 1 / 60, 0.5, driveB, null, 2);
  const result = pool.endWrite();
  assert.equal(pool.allocationCount, before);
  assert.equal(result.frameAllocations, 0);
  assert.equal(result.entityWrites, 2);
  assert.ok(result.activeCount >= 4);
});

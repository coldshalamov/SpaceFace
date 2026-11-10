// Picture-seam rows 31, 32, 39, 45, 75, 139, 140, 141, 259.
// Seed 4242 where a seed applies. Presentation policies only — no sim writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import {
  createAssetResidencyRegistry,
  protectSharedGpuResource,
} from '../src/render/assetResidency.js';
import {
  createAsteroidInstancePool,
  reserveAsteroidInstanceCapacity,
  warmAsteroidInstanceVariants,
} from '../src/render/asteroidInstancePool.js';
import { mulberry32 } from '../src/core/rng.js';
import {
  ARRIVAL_ROSTER_MISS_PRESENTS,
  HITCH_RING_LENGTH,
  LIVING_MACHINE_FLOOR,
  POSE_JUMP_WU,
  VISIBILITY_OFF_GLASS_PRESENTS,
  ambientAdmissionShouldYield,
  attributePoseJump,
  beltTailDecodeConcurrency,
  buildArrivalRoster,
  consumePresentInputEdge,
  createAmbientAdmissionYield,
  createHitchRing,
  cruciblePoleVariants,
  livingMachineScore,
  livingMachineStaysInMotion,
  noteArrivalRosterMiss,
  noteHitchRing,
  openingAdmissionBlocksControl,
  openingAdmissionKeepsVisibleCohort,
  presentPublicationsForFrameDebt,
  publishGeometryPending,
  redundantDirectSpecimen,
  spatialInteractionLimit,
} from '../src/render/pipelineAutoFlushPolicy.js';
import { resolveDecodeTaskBudgetLimit } from '../src/render/decodeTaskBudget.js';
import {
  GOVERNOR_CPU_RESIDENCY_BYTE_CEILING,
  GOVERNOR_RESIDENCY_BYTE_CEILING,
  createResourceGovernor,
} from '../src/render/resourceGovernor.js';

const SEED = 4242;

function gpuResource(label, byteSize) {
  let disposals = 0;
  const resource = {
    label,
    userData: {},
    byteSize,
    dispose() { disposals += 1; },
  };
  protectSharedGpuResource(resource);
  return { resource, disposals: () => disposals };
}

function retain(registry, key, fixture, role) {
  registry.registerAsset(key, [fixture.resource]);
  return registry.retain(key, { tag: key }, { role });
}

test('row 31/75 — a real opaque material skips the direct palette mesh and adds no invented poles', async () => {
  const state = { seed: SEED, simTime: 0, rng: mulberry32(SEED) };
  assert.equal(state.seed, SEED);
  assert.equal(state.rng(), mulberry32(SEED)());
  const plain = new THREE.MeshStandardMaterial();
  const physical = new THREE.MeshPhysicalMaterial();
  assert.equal(typeof plain.onBeforeCompile, 'function');
  assert.equal(Object.hasOwn(plain, 'onBeforeCompile'), false);
  assert.equal(Object.hasOwn(physical, 'onBeforeCompile'), false);
  assert.equal(redundantDirectSpecimen(plain), true);
  assert.equal(redundantDirectSpecimen(physical), true);

  const hooked = new THREE.MeshStandardMaterial();
  hooked.onBeforeCompile = function onBeforeCompile() {};
  const glass = new THREE.MeshPhysicalMaterial({ transparent: true });
  const hashed = new THREE.MeshStandardMaterial();
  hashed.alphaHash = true;
  const transmit = new THREE.MeshPhysicalMaterial();
  transmit.transmission = 0.4;
  const player = new THREE.MeshStandardMaterial();
  player.userData.playerHull = true;
  assert.equal(redundantDirectSpecimen(hooked), false);
  assert.equal(redundantDirectSpecimen(glass), false);
  assert.equal(redundantDirectSpecimen(hashed), false);
  assert.equal(redundantDirectSpecimen(transmit), false);
  assert.equal(redundantDirectSpecimen(player), false);

  const holder = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mountDirect = (material) => {
    if (!redundantDirectSpecimen(material)) {
      const direct = new THREE.Mesh(geometry, material);
      direct.name = 'SF_CrucibleWarm_PaletteMesh';
      holder.add(direct);
    }
  };
  mountDirect(plain);
  mountDirect(physical);
  assert.equal(
    holder.children.filter((child) => child.name === 'SF_CrucibleWarm_PaletteMesh').length,
    0,
    'a plain opaque material must not mount the direct palette mesh',
  );
  mountDirect(hooked);
  mountDirect(glass);
  mountDirect(hashed);
  mountDirect(transmit);
  mountDirect(player);
  assert.equal(holder.children.length, 5);

  assert.deepEqual(cruciblePoleVariants(plain), []);
  assert.deepEqual(cruciblePoleVariants(physical), []);
  const coated = new THREE.MeshPhysicalMaterial();
  coated.clearcoat = 1;
  coated.alphaTest = 0.5;
  coated.side = 2;
  assert.deepEqual(cruciblePoleVariants(coated), []);

  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const marker = "direct.name = 'SF_CrucibleWarm_PaletteMesh'";
  const at = source.indexOf(marker);
  assert.ok(at > 0);
  const branch = source.slice(at - 800, at + 220);
  assert.match(
    branch,
    /if\s*\(\s*playerHullFile\s*\|\|\s*!redundantDirectSpecimen\(subject\.material\)\s*\)[\s\S]*SF_CrucibleWarm_PaletteMesh[\s\S]*holder\.add\(direct\)/,
  );
  geometry.dispose();
  plain.dispose();
  physical.dispose();
  hooked.dispose();
  glass.dispose();
  hashed.dispose();
  transmit.dispose();
  player.dispose();
  coated.dispose();
});

test('row 32 — pending admission holds the draw; flight does not read a control latch', async () => {
  const state = { seed: SEED, simTime: 1.5, rng: mulberry32(SEED) };
  state.rng();
  assert.equal(state.simTime, 1.5);
  assert.equal(openingAdmissionBlocksControl(3), true);
  assert.equal(openingAdmissionBlocksControl(0), false);
  const before = 8;
  assert.equal(openingAdmissionKeepsVisibleCohort(before, before), true);
  assert.equal(openingAdmissionKeepsVisibleCohort(before, before - 1), false);
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /reason: 'opening-admission-pending'/);
  assert.match(source, /if \(pendingAdmission > 0\)/);
  assert.doesNotMatch(source, /openingAdmissionKeepsVisibleCohort\(pendingAdmission,\s*pendingAdmission\)/);
  assert.doesNotMatch(source, /openingControlReady/);
});

test('row 39/141 — belt-tail starts match the decode budget and never exceed it', () => {
  for (const cores of [2, 4, 8, 16]) {
    const budget = resolveDecodeTaskBudgetLimit(cores);
    const starts = beltTailDecodeConcurrency(cores, budget);
    assert.equal(starts, budget);
    assert.ok(starts <= budget);
    assert.ok(starts >= 2);
  }
  assert.equal(beltTailDecodeConcurrency(16, 3), 3);
  assert.equal(ambientAdmissionShouldYield({ elapsedMs: 0, itemsDone: 0 }), false);
  assert.equal(ambientAdmissionShouldYield({ elapsedMs: 4, itemsDone: 1 }), true);
  assert.equal(ambientAdmissionShouldYield({ elapsedMs: 1, itemsDone: 1 }), false);
  assert.equal(ambientAdmissionShouldYield({ elapsedMs: 9, itemsDone: 1 }), true);
});

test('row 39 — ambient yield spends the slice, then waits for the next present', async () => {
  let now = 0;
  let presents = 0;
  const yieldToNext = createAmbientAdmissionYield(() => { presents += 1; }, () => now);
  await yieldToNext();
  assert.equal(presents, 0);
  now = 4;
  await yieldToNext();
  assert.equal(presents, 1);
  await yieldToNext();
  assert.equal(presents, 1);
});

test('row 45 — living-machine score keeps the player and glass ships awake, seed 4242', () => {
  const state = { seed: SEED, simTime: 12, rng: mulberry32(SEED) };
  assert.equal(state.seed, SEED);
  state.rng();
  assert.equal(livingMachineScore({ isPlayer: true, onGlass: false }), 1);
  assert.equal(livingMachineStaysInMotion(livingMachineScore({ isPlayer: true })), true);
  assert.equal(livingMachineScore({ onGlass: false, role: 'ship', speedWu: 80 }), 0);
  const stoppedShip = livingMachineScore({
    onGlass: true,
    role: 'ship',
    speedWu: 0,
    distanceWu: 900,
    glassRadiusWu: 400,
  });
  assert.ok(stoppedShip >= LIVING_MACHINE_FLOOR);
  assert.equal(livingMachineStaysInMotion(stoppedShip), true);
  const farRock = livingMachineScore({
    onGlass: true,
    role: 'asteroid',
    speedWu: 0,
    distanceWu: 2000,
    glassRadiusWu: 400,
  });
  assert.ok(farRock < LIVING_MACHINE_FLOOR);
  assert.equal(livingMachineStaysInMotion(farRock), false);
  assert.equal(state.simTime, 12);
});

test('row 139/MACH-08 — null residency cap is the governor ceiling and pinned roles stay', () => {
  const omitted = createAssetResidencyRegistry();
  const omittedDiag = omitted.diagnostics();
  assert.equal(omittedDiag.packageCacheOnlyMaxBytes, 64 * 1024 * 1024);
  assert.equal(omittedDiag.softResidentMaxBytes, 64 * 1024 * 1024);
  const governor = createResourceGovernor();
  assert.equal(governor.maxGpuBytes, GOVERNOR_RESIDENCY_BYTE_CEILING);
  assert.equal(governor.maxCpuBytes, GOVERNOR_CPU_RESIDENCY_BYTE_CEILING);
  assert.equal(GOVERNOR_RESIDENCY_BYTE_CEILING, 384 * 1024 * 1024);

  const uncapped = createAssetResidencyRegistry({
    maxPackageCacheOnlyBytes: null,
    maxSoftResidentBytes: null,
  });
  const uncappedDiag = uncapped.diagnostics();
  assert.equal(uncappedDiag.packageCacheOnlyMaxBytes, GOVERNOR_RESIDENCY_BYTE_CEILING);
  assert.equal(uncappedDiag.softResidentMaxBytes, GOVERNOR_RESIDENCY_BYTE_CEILING);
  const huge = gpuResource('soft-huge', GOVERNOR_RESIDENCY_BYTE_CEILING + 1);
  retain(uncapped, 'cache:huge', huge, 'runtime-cache');
  assert.equal(uncapped.diagnostics().residentAssets, 0);
  assert.equal(huge.disposals(), 1);

  const pinned = createAssetResidencyRegistry({ maxSoftResidentBytes: null });
  const shell = gpuResource('player-shell', GOVERNOR_RESIDENCY_BYTE_CEILING + 1);
  retain(pinned, 'shell:player', shell, 'player');
  assert.equal(pinned.diagnostics().residentAssets, 1);
  assert.equal(shell.disposals(), 0);
});

test('row 139 — visibility pin and eviction share the package key, seed 4242', () => {
  const state = { seed: SEED, simTime: 4, rng: mulberry32(SEED) };
  state.rng();
  const packageKey = 'render-package:ceres-hull';

  const missed = createAssetResidencyRegistry({ maxSoftResidentBytes: 10 });
  missed.handleContextRestored({ roster: ['41'], sectorId: 'ceres' });
  const gone = gpuResource('gone', 100);
  retain(missed, packageKey, gone, 'runtime-cache');
  assert.equal(gone.disposals(), 1, 'an entity id pin does not cover the package key');

  const owner = { kind: 'glass-boundary' };
  const live = createAssetResidencyRegistry({ maxSoftResidentBytes: 80 });
  const hull = gpuResource('hull', 40);
  live.registerAsset(packageKey, [hull.resource]);
  assert.equal(live.retain(packageKey, owner, { role: 'runtime-cache' }), true);
  assert.deepEqual(live.visibilityKeysForOwners([owner]), [packageKey]);
  live.beginVisibilityPresent();
  assert.equal(live.noteOwnerVisibility(owner, true), true);
  const squeeze = gpuResource('squeeze', 50);
  live.registerAsset('render-package:squeeze', [squeeze.resource]);
  live.retain('render-package:squeeze', { kind: 'other' }, { role: 'runtime-cache' });
  assert.equal(hull.disposals(), 0, 'the glass owner pin is the package key eviction checks');
  assert.equal(squeeze.disposals(), 1);

  const registry = createAssetResidencyRegistry({ maxSoftResidentBytes: 10 });
  registry.handleContextLost();
  const restored = registry.handleContextRestored({
    roster: [packageKey],
    sectorId: 'ceres',
  });
  assert.equal(restored, true);
  assert.equal(registry.diagnostics().currentSectorId, 'ceres');
  assert.equal(registry.diagnostics().contextGeneration, 1);
  const kept = gpuResource('kept', 100);
  retain(registry, packageKey, kept, 'runtime-cache');
  assert.equal(kept.disposals(), 0, 'a restored package-key pin is not evicted on the arrival present');

  for (let present = 0; present < VISIBILITY_OFF_GLASS_PRESENTS - 1; present++) {
    registry.beginVisibilityPresent();
    registry.advanceVisibilityHysteresis();
  }
  const still = gpuResource('still', 1);
  retain(registry, 'render-package:tick-early', still, 'runtime-cache');
  assert.equal(kept.disposals(), 0);

  registry.beginVisibilityPresent();
  registry.advanceVisibilityHysteresis();
  const late = gpuResource('late', 1);
  retain(registry, 'render-package:tick-late', late, 'runtime-cache');
  assert.equal(kept.disposals(), 1);
  assert.equal(state.seed, SEED);
});

test('row 140 — one publication per present, nearby limit; the edge tally does not consume sim input', () => {
  assert.equal(presentPublicationsForFrameDebt(4), 1);
  assert.equal(presentPublicationsForFrameDebt(0), 1);
  assert.equal(spatialInteractionLimit(3, 1000), 3);
  assert.notEqual(spatialInteractionLimit(3, 1000), 1000);
  const actions = { fire: { down: true } };
  const latch = Object.create(null);
  const present = 7;
  assert.equal(consumePresentInputEdge(latch, 'fire', actions.fire.down === true, present), true);
  assert.equal(actions.fire.down, true);
  assert.equal(consumePresentInputEdge(latch, 'fire', actions.fire.down === true, present), false);
  assert.equal(actions.fire.down, true);
  let edges = 1;
  for (let step = 0; step < 4; step++) {
    if (consumePresentInputEdge(latch, 'fire', true, present + 1 + step)) edges += 1;
  }
  assert.equal(edges, 1);
  assert.equal(consumePresentInputEdge(latch, 'fire', false, present + 5), false);
  assert.equal(consumePresentInputEdge(latch, 'fire', true, present + 6), true);
});

test('row 141 — a jump with no writer stays not reproduced and is not a fix', () => {
  const calm = attributePoseJump({ dx: 12, dz: -4 });
  assert.equal(calm.jumped, false);
  assert.equal(calm.reason, 'within-envelope');
  const recorded = attributePoseJump({ dx: POSE_JUMP_WU, dz: 0 });
  assert.equal(recorded.jumped, true);
  assert.equal(recorded.attributed, false);
  assert.equal(recorded.reason, 'not-reproduced');
  assert.notEqual(recorded.reason, 'writer');
});

test('row 259/MACH-07 — geometryPending is the queue count and falls to 0', () => {
  const renderState = {};
  assert.equal(publishGeometryPending(renderState, { queued: 4 }), 4);
  assert.equal(renderState.geometryPending, 4);
  assert.equal(publishGeometryPending(renderState, { queued: 0 }), 0);
  assert.equal(renderState.geometryPending, 0);
});

test('row 259/FB-097 — hitch ring reuses 16 slots and does not allocate a new one per hitch', () => {
  const ring = createHitchRing();
  assert.equal(ring.slots.length, HITCH_RING_LENGTH);
  const identities = ring.slots.slice();
  for (let present = 0; present < 40; present++) noteHitchRing(ring, present, 40);
  assert.equal(ring.count, HITCH_RING_LENGTH);
  for (let i = 0; i < identities.length; i++) assert.equal(ring.slots[i], identities[i]);
  noteHitchRing(ring, 41, 10);
  assert.equal(ring.count, HITCH_RING_LENGTH);
});

test('row 259/FB-098 — per-entity meshes still draw; no batch is built or published', async () => {
  const state = { seed: SEED, simTime: 0, rng: mulberry32(SEED) };
  state.rng();
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /createBatchedInstanceRenderer/);
  assert.doesNotMatch(source, /_batchedInstances\.build/);
  assert.doesNotMatch(source, /batchedArchetypeDraws/);
  assert.match(source, /noteHitchRing/);
  assert.equal(state.seed, SEED);
});

test('row 259/MACH-03 — seed 4242 roster reserve survives 600 presents with no power-of-two rebuild', () => {
  const state = { seed: SEED, simTime: 0, rng: mulberry32(SEED) };
  const roll = state.rng();
  assert.equal(roll, mulberry32(SEED)());
  const scene = new THREE.Scene();
  const pool = createAsteroidInstancePool(scene);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial();
  const rosterCount = 200;
  reserveAsteroidInstanceCapacity(pool, [rosterCount, 0, 0, 0, 0], {
    rosterCount,
    byteCeiling: GOVERNOR_RESIDENCY_BYTE_CEILING,
  });
  assert.equal(pool.variants[0].mesh, null);
  assert.ok(pool.variants[0].reservedCapacity >= rosterCount);
  assert.equal(pool.stats.reservedRosterCount, rosterCount);
  warmAsteroidInstanceVariants(pool, [{ variant: 0, geometry, material }], [rosterCount]);
  assert.ok(pool.variants[0].capacity >= rosterCount);
  assert.equal(pool.stats.powerOfTwoRebuilds, 0);
  for (let present = 0; present < 600; present++) {
    state.simTime += 1 / 60;
    warmAsteroidInstanceVariants(pool, [{ variant: 0, geometry, material }], [rosterCount]);
  }
  assert.equal(pool.stats.powerOfTwoRebuilds, 0);
  assert.ok(state.simTime > 9);

  const capped = createAsteroidInstancePool(new THREE.Scene());
  reserveAsteroidInstanceCapacity(capped, [1000, 1000, 0, 0, 0], {
    rosterCount: 2000,
    byteCeiling: 64 * 10,
  });
  const reserved = (capped.variants[0].reservedCapacity | 0) + (capped.variants[1].reservedCapacity | 0);
  assert.ok(reserved <= 10);
  assert.ok(reserved > 0);
});

test('row 259/FB-092 — seed 4242 arrival roster enumerates bodies and misses only unknowns inside 600 presents', () => {
  const state = { seed: SEED, simTime: 2, rng: mulberry32(SEED) };
  state.rng();
  const entities = [
    { id: 'player', type: 'ship', alive: true },
    { id: 'rock-1', type: 'asteroid', alive: true },
    { id: 'hub', type: 'station', alive: true },
    { id: 'bolt', type: 'projectile', alive: true },
    { id: 'dead', type: 'wreck', alive: false },
  ];
  const roster = buildArrivalRoster(entities, {
    sectorId: 'ceres',
    seed: state.seed,
    byteCeiling: GOVERNOR_RESIDENCY_BYTE_CEILING,
    presentOrigin: 10,
  });
  assert.equal(roster.seed, SEED);
  assert.equal(roster.sectorId, 'ceres');
  assert.equal(roster.count, 3);
  assert.deepEqual(roster.ids, ['player', 'rock-1', 'hub']);
  assert.ok(roster.idSample.length <= roster.ids.length);
  const renderState = { arrivalRosterMiss: 0 };
  const ids = new Set(roster.ids);
  noteArrivalRosterMiss(renderState, ids, 'rock-1', 20, roster.presentOrigin);
  assert.equal(renderState.arrivalRosterMiss, 0);
  noteArrivalRosterMiss(renderState, ids, 'stranger', 20, roster.presentOrigin);
  assert.equal(renderState.arrivalRosterMiss, 1);
  noteArrivalRosterMiss(renderState, ids, 'stranger', 10 + ARRIVAL_ROSTER_MISS_PRESENTS + 1, roster.presentOrigin);
  assert.equal(renderState.arrivalRosterMiss, 1);
});

test('rows 31-259 — renderer wires the picture policies and does not drop the roster twin', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /beltTailDecodeConcurrency/);
  assert.match(source, /started < decodeCap/);
  assert.doesNotMatch(source, /started < 2/);
  assert.match(source, /createAmbientAdmissionYield\(yieldToNextPresent\)/);
  assert.match(source, /reason: 'opening-admission-pending'/);
  assert.doesNotMatch(source, /openingControlReady/);
  assert.doesNotMatch(source, /openingAdmissionKeepsVisibleCohort\(pendingAdmission,\s*pendingAdmission\)/);
  assert.match(source, /playerHullFile \|\| !redundantDirectSpecimen\(subject\.material\)/);
  assert.match(source, /warmHullFilesForSpecs\(\[playerSpec\]\)/);
  assert.match(source, /SF_CrucibleWarm_PaletteMesh/);
  assert.match(source, /SF_CrucibleWarm_PaletteTwin/);
  assert.match(source, /SF_CrucibleWarm_Pole_/);
  assert.match(source, /SF_CrucibleWarm_InstanceTwin/);
  assert.match(source, /SF_CrucibleWarm_PoolWitness_A/);
  assert.match(source, /livingMachineScore/);
  assert.match(source, /livingMachineAwake/);
  assert.match(source, /const machineAwake = userData\.livingMachineAwake !== false/);
  assert.match(source, /typeName === 'station' && machineAwake/);
  assert.match(source, /typeName === 'place' && machineAwake/);
  assert.match(source, /publishGeometryPending/);
  assert.match(source, /buildArrivalRoster/);
  assert.match(source, /noteHitchRing/);
  assert.doesNotMatch(source, /selectNonPlayerArchetype/);
  assert.doesNotMatch(source, /batchedArchetypeDraws/);
  assert.match(source, /consumePresentInputEdge/);
  assert.match(source, /attributePoseJump\(\{ dx: poseDx, dz: poseDz \}\)/);
  assert.doesNotMatch(source, /attributePoseJump\(\{[^}]*writers/);
  assert.match(source, /GOVERNOR_RESIDENCY_BYTE_CEILING/);
  assert.match(source, /noteOwnerVisibility\(mesh, onLiveGlass\)/);
  assert.doesNotMatch(source, /noteVisibility\(entityId/);
  assert.match(source, /visibilityKeysForOwners/);
  assert.match(source, /firstPlayableFrameAt = typeof performance/);
  const projectionCalls = [...source.matchAll(/worldToScreen\(([^)]*)\)/g)].map((match) => match[1]);
  assert.ok(projectionCalls.length >= 1);
  for (const args of projectionCalls) assert.match(args, /out/);
});

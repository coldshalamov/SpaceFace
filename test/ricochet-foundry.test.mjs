import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3 } from 'three';

import {
  COLLISION_PROXY_MANIFESTS,
  proxyObbHalfExtents,
  proxyWorldPrimitives,
  validateCollisionProxyManifest,
} from '../src/data/collisionProxyManifests.js';
import {
  FOUNDRY_SURFACE_LIMIT,
  MIRRORJAW_ENEMY_ID,
  RICOCHET_FOUNDRY_ARENA_ID,
  RICOCHET_FOUNDRY_LAYOUT,
  foundryArenaCenterFromEntry,
  foundryProxyIdFor,
  foundryShutterOffset,
  foundryWorldPieces,
  mirrorjawPhaseFor,
} from '../src/data/ricochetFoundry.js';
import { SURVIVAL_WAVES } from '../src/data/survivalWaves.js';
import { SHIPS } from '../src/data/ships.js';
import { directionalSurfaceMaterial } from '../src/combat/attackHit.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { reflectVelocity } from '../src/core/surfaceContact.js';
import { core } from '../src/core/coreSystem.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { segmentCircleObbHitInto, segmentObbHitInto } from '../src/core/physics.js';
import { createRapierCollisionWorld } from '../src/core/rapierCollisionWorld.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { SpatialHash } from '../src/core/spatialHash.js';
import { ensureActivityClassified } from '../src/world/activityRuntime.js';
import {
  COMBAT_LAB_ENEMY_PACKAGES,
  COMBAT_LAB_STARTER_PACKAGES,
} from '../src/data/combatLabSetups.js';
import {
  attachMirrorjawForemanPresentation,
  createVisualFactory,
} from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import { enqueueMissingMeshBuilds, isEntityRenderRelevant } from '../src/render/renderer.js';
import { runSession } from '../src/systems/runSession.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { weapons } from '../src/systems/weapons.js';

function stubCanvas() {
  const context = {
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fillText() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { width: 256, height: 256, getContext: () => context };
}

globalThis.document ||= { createElement: () => stubCanvas() };

test('Foundry layout is bounded, authored around the entry bay, and names every collision proxy', () => {
  assert.equal(RICOCHET_FOUNDRY_LAYOUT.length, FOUNDRY_SURFACE_LIMIT);
  const center = foundryArenaCenterFromEntry({ x: 400, z: -120 });
  assert.deepEqual(center, { x: 400, z: 240 });
  const pieces = foundryWorldPieces(center);
  assert.equal(new Set(pieces.map((piece) => piece.id)).size, FOUNDRY_SURFACE_LIMIT);
  assert.equal(pieces.filter((piece) => piece.kind === 'plate').length, 2);
  assert.equal(pieces.filter((piece) => piece.kind === 'loose_plate').length, 2);
  assert.equal(pieces.filter((piece) => piece.kind === 'shutter').length, 2);
  assert.equal(pieces.filter((piece) => piece.kind === 'furnace').length, 1);
  const tutorialBank = pieces.find((piece) => piece.id === 'bank_west');
  assert.ok(Math.hypot(tutorialBank.x - 400, tutorialBank.z - (-120)) <= 150,
    'the first bank is centered inside the real opening camera, not merely radius-adjacent');
  const entryDx = 400 - tutorialBank.x;
  const entryDz = -120 - tutorialBank.z;
  const c = Math.cos(tutorialBank.rot);
  const s = Math.sin(tutorialBank.rot);
  const localX = c * entryDx + s * entryDz;
  const localZ = -s * entryDx + c * entryDz;
  const gapX = Math.max(0, Math.abs(localX) - tutorialBank.halfLength);
  const gapZ = Math.max(0, Math.abs(localZ) - tutorialBank.halfWidth);
  const entryClearance = Math.hypot(gapX, gapZ);
  const starterHull = SHIPS.find((ship) => ship.id === 'ship_drifter');
  const forwardHardpoint = starterHull.visuals.hardpoints.find((hardpoint) => hardpoint.facing === 'front');
  const muzzleReach = starterHull.collisionRadius
    * (Math.abs(forwardHardpoint.pos[0]) + 0.35)
    + 0.7;
  assert.ok(entryClearance > muzzleReach + 10,
    'the camera-visible bank must clear the starter hull, forward muzzle, projectile, and spawn margin');
  for (const id of [
    'ricochet_foundry_wall',
    'ricochet_foundry_plate',
    'ricochet_foundry_shutter',
    'ricochet_foundry_furnace',
  ]) {
    assert.equal(validateCollisionProxyManifest(COLLISION_PROXY_MANIFESTS[id]).ok, true, id);
  }
});

test('every Foundry collider derives the exact per-piece visible half extents', () => {
  for (const piece of RICOCHET_FOUNDRY_LAYOUT) {
    const manifest = COLLISION_PROXY_MANIFESTS[foundryProxyIdFor(piece.kind)];
    const entity = {
      radius: piece.halfLength,
      pos: { x: piece.x, z: piece.z },
      rot: piece.rot,
      data: { foundrySurface: { ...piece } },
    };
    const primitive = manifest.primitives[0];
    assert.deepEqual(proxyObbHalfExtents(entity, manifest, primitive), {
      hx: piece.halfLength,
      hy: piece.height * 0.5,
      hz: piece.halfWidth,
    }, piece.id);
    const [world] = proxyWorldPrimitives(entity, manifest);
    assert.equal(world.hx, piece.halfLength, `${piece.id} length`);
    assert.equal(world.hz, piece.halfWidth, `${piece.id} width`);
    assert.equal(world.x, piece.x, `${piece.id} x`);
    assert.equal(world.z, piece.z, `${piece.id} z`);
  }
});

test('oriented Foundry slab returns the real face normal and therefore the correct reflected velocity', () => {
  const hit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0 };
  const rot = Math.PI / 4;
  assert.equal(segmentObbHitInto(
    hit,
    { x: -180, z: 0 },
    { x: 180, z: 0 },
    { x: 0, z: 0 },
    rot,
    110,
    12,
  ), true);
  assert.ok(hit.t > 0 && hit.t < 1);
  assert.ok(Math.abs(Math.hypot(hit.nx, hit.nz) - 1) < 1e-9);
  const outgoing = reflectVelocity({ x: 300, z: 0 }, { x: hit.nx, z: hit.nz });
  assert.ok(Math.abs(outgoing.x) < 0.001, `unexpected x ${outgoing.x}`);
  assert.ok(Math.abs(Math.abs(outgoing.z) - 300) < 0.001, `unexpected z ${outgoing.z}`);
});

test('swept circular bodies use rounded OBB corners rather than invisible square corner hits', () => {
  const hit = { hit: false, t: 0, x: 0, z: 0, nx: 0, nz: 0 };
  assert.equal(segmentCircleObbHitInto(
    hit,
    { x: 12, z: 12 },
    { x: 20, z: 20 },
    { x: 0, z: 0 },
    0,
    10,
    10,
    2,
  ), false, 'the square-only expanded corner is outside the actual rounded collision footprint');

  assert.equal(segmentCircleObbHitInto(
    hit,
    { x: 20, z: 20 },
    { x: 0, z: 0 },
    { x: 0, z: 0 },
    0,
    10,
    10,
    2,
  ), true);
  assert.ok(Math.abs(hit.nx - Math.SQRT1_2) < 1e-6);
  assert.ok(Math.abs(hit.nz - Math.SQRT1_2) < 1e-6);
});

test('Rapier observer composes and resyncs Foundry OBB yaw with the entity pose', async () => {
  const makeSurface = (rot) => ({
    id: 1, alive: true, collides: true, type: 'station', radius: 20,
    pos: { x: 0, z: 0 }, rot,
    data: {
      collisionProxy: 'ricochet_foundry_plate',
      foundrySurface: { halfLength: 20, halfWidth: 2, height: 8 },
    },
  });
  const projectile = (x, z) => ({
    id: 2, alive: true, collides: true, type: 'projectile', radius: 1,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
  });

  const creationWorld = await createRapierCollisionWorld();
  try {
    creationWorld.syncFromEntities([makeSurface(Math.PI / 2), projectile(0, 10)]);
    creationWorld.step(1 / 60);
    assert.equal(creationWorld.diagnostics().collisionEvents, 1,
      'a newly-created observer body must compose entity yaw with its local OBB');
  } finally {
    creationWorld.dispose();
  }

  const syncWorld = await createRapierCollisionWorld();
  try {
    const surface = makeSurface(0);
    syncWorld.syncFromEntities([surface, projectile(10, 0)]);
    surface.rot = Math.PI / 2;
    syncWorld.syncFromEntities([surface, projectile(10, 0)]);
    syncWorld.step(1 / 60);
    assert.equal(syncWorld.diagnostics().collisionEvents, 0,
      'observer pose sync must rotate an existing body instead of retaining its original local axes');
  } finally {
    syncWorld.dispose();
  }
});

test('Foundry shutters use fixed kinematic SG-02 bodies with incremental spatial membership', async () => {
  const shutter = {
    id: 'shutter', alive: true, collides: true, type: 'station', radius: 20,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: Math.PI / 2, angVel: 0,
    prevPos: { x: 0, z: 0 }, prevRot: Math.PI / 2, flags: {},
    physicsBody: {
      schemaVersion: 1, dynamic: false, kinematic: true, ccd: false, material: 'reflective',
      mass: 1e9, inertiaY: 1e9, radius: 20,
    },
    data: {
      collisionProxy: 'ricochet_foundry_shutter',
      foundrySurface: { halfLength: 20, halfWidth: 2, height: 8 },
    },
  };
  const player = {
    id: 'player', alive: true, collides: true, type: 'ship', radius: 12,
    pos: { x: 0, z: 0 }, prevPos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    physicsBody: { schemaVersion: 1, dynamic: true, ccd: false, material: 'ship', mass: 1, inertiaY: 1, radius: 12 },
    data: {},
  };
  const state = createGameState(0x73302);
  state.mode = 'flight';
  state.playerId = player.id;
  state.entities = new Map([[player.id, player], [shutter.id, shutter]]);
  state.entityList = [player, shutter];
  const hash = new SpatialHash(8);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    let activity = ensureActivityClassified(state);
    hash.rebuildLayers(activity.spatialStatics, activity.spatialDynamics, activity.spatialStaticVersion);
    owner.syncFromEntityLayers(activity.physicsStatics, activity.physicsDynamics, activity.physicsStaticVersion);
    assert.ok(hash.queryRadius(0, 0, 1, []).includes(shutter));
    assert.equal(owner.records.get(shutter.id).body.translation().x, 0);
    assert.ok(activity.physicsStatics.includes(shutter), 'fixed shutter remains in SG-02 static records');
    assert.equal(activity.physicsDynamics.includes(shutter), false, 'fixed shutter never joins solver dynamic records');
    assert.ok(activity.spatialDynamics.includes(shutter), 'moving shutter uses incremental broadphase membership');
    assert.equal(owner.dynamicRecords.has(owner.records.get(shutter.id)), false, 'fixed shutter has no solver dynamic authority');
    assert.equal(owner.applyImpulse({ entityId: shutter.id, impulse: { x: 40, z: 0 } }), false,
      'fixed kinematic shutter rejects direct impulse authority');
    assert.equal(queuePhysicsImpulse(shutter, { x: 40, z: 0 }), false,
      'fixed kinematic shutter rejects queued impulse authority before SG-02 consumes it');
    assert.equal(owner.createAttachment({ attachmentId: 'shutter-line', ownerId: player.id, targetId: shutter.id }), false,
      'fixed kinematic shutter rejects Massline attachment authority');

    const initialPhysicsStaticVersion = activity.physicsStaticVersion;
    const initialSpatialStaticVersion = activity.spatialStaticVersion;
    const initialStaticRebuilds = hash.diagnostics.rebuilds;
    for (let tick = 1; tick <= 120; tick++) {
      // Core normally takes this snapshot before the arena mutates the kinematic pose.
      shutter.prevPos.x = shutter.pos.x;
      shutter.prevPos.z = shutter.pos.z;
      shutter.prevRot = shutter.rot;
      shutter.pos.x = tick;
      state.tick++;
      state.simTime += 1 / 60;
      activity = ensureActivityClassified(state);
      hash.rebuildLayers(activity.spatialStatics, activity.spatialDynamics, activity.spatialStaticVersion);
      owner.syncFromEntityLayers(activity.physicsStatics, activity.physicsDynamics, activity.physicsStaticVersion);
    }

    assert.equal(activity.physicsStaticVersion, initialPhysicsStaticVersion,
      'authored shutter motion does not invalidate all SG-02 statics');
    assert.equal(activity.spatialStaticVersion, initialSpatialStaticVersion,
      'authored shutter motion does not rebuild the spatial static layer');
    assert.equal(hash.diagnostics.rebuilds, initialStaticRebuilds,
      '120 pose updates avoid full static broadphase rebuilds');
    assert.ok(hash.queryRadius(120, 0, 1, []).includes(shutter), 'incremental broadphase follows final pose');
    assert.equal(owner.records.get(shutter.id).body.translation().x, 120, 'fixed OBB record follows final pose');
    assert.equal(shutter.prevPos.x, 119, 'preStep keeps a previous pose for smooth presentation interpolation');
  } finally {
    owner.dispose();
  }
});

test('shutter motion is deterministic, warned, bounded, and phase-distinct', () => {
  assert.equal(foundryShutterOffset('shutter_west', 'shutter_slow', 1), 0, 'warning quarter moved early');
  const a = foundryShutterOffset('shutter_west', 'shutter_slow', 5);
  const b = foundryShutterOffset('shutter_west', 'shutter_slow', 5);
  assert.equal(a, b);
  assert.ok(Math.abs(a) <= 118);
  assert.notEqual(a, foundryShutterOffset('shutter_west', 'shutter_alternating', 5));
  assert.equal(foundryShutterOffset('shutter_west', 'boss', 0), 118);
  assert.equal(foundryShutterOffset('shutter_east', 'boss', 0), -118);
});

test('the same ten-wave catalog culminates in Mirrorjaw only in the Ricochet Foundry', () => {
  const foundry = SURVIVAL_WAVES.filter((row) => row.arenaId === RICOCHET_FOUNDRY_ARENA_ID);
  assert.equal(foundry.length, 10);
  assert.deepEqual(foundry.map((row) => row.wave), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(foundry[9].packages[0].enemyId, MIRRORJAW_ENEMY_ID);
  const otherBosses = SURVIVAL_WAVES.filter((row) => row.arenaId !== RICOCHET_FOUNDRY_ARENA_ID && row.wave === 10);
  assert.ok(otherBosses.every((row) => row.packages[0].enemyId === 'dreadnought_boss'));
});

test('Combat Lab exposes Mirrorjaw through the same canonical enemy spawn definition', () => {
  const pkg = COMBAT_LAB_ENEMY_PACKAGES.find((entry) => entry.id === 'mirrorjaw_foreman');
  assert.ok(pkg, 'Mirrorjaw must be selectable through the public Combat Lab catalog');
  assert.deepEqual(pkg.entries, [{ enemyId: MIRRORJAW_ENEMY_ID, count: 1, level: 10 }]);
  assert.equal(pkg.maxConcurrent, 1);
});

test('Mirrorjaw spawn carries a reflective front, vulnerable rear, ram authorization, and three phases', () => {
  const boss = makeEnemySpawnSpec(MIRRORJAW_ENEMY_ID, 10, { x: 0, z: 0 });
  assert.equal(boss.data.bossProfile.id, MIRRORJAW_ENEMY_ID);
  assert.equal(boss.data.intent.ramPlate, true);
  assert.equal(directionalSurfaceMaterial(boss, { x: 40, z: 0 }), 'reflective');
  assert.equal(directionalSurfaceMaterial(boss, { x: -40, z: 0 }), null);
  assert.equal(mirrorjawPhaseFor(100, 100), 'reflective_ram');
  assert.equal(mirrorjawPhaseFor(50, 100), 'absorbent_screen');
  assert.equal(mirrorjawPhaseFor(20, 100), 'unmoored_reactor');
});

test('Mirrorjaw visual front and phase presentation agree with the gameplay surface frame', () => {
  const boss = makeEnemySpawnSpec(MIRRORJAW_ENEMY_ID, 10, { x: 0, z: 0 });
  boss.rot = 0;
  const root = createVisualFactory().build(boss);
  const localFrame = root.getObjectByName('mirrorjaw-foreman-local-frame');
  assert.ok(localFrame, 'Mirrorjaw must publish its legacy-model orientation boundary');
  assert.ok(Math.abs(localFrame.rotation.y - Math.PI / 2) < 1e-9,
    'the authored +Z jaw must rotate onto gameplay +X front');

  const mandibles = ['port', 'starboard'].map((side) => root.getObjectByName(`mirrorjaw-jaw-${side}`));
  assert.ok(mandibles.every(Boolean), 'Mirrorjaw must have two named mandible assemblies');
  for (const side of ['port', 'starboard']) {
    const assembly = root.getObjectByName(`mirrorjaw-jaw-${side}`);
    const plate = assembly.getObjectByName(`mirrorjaw-mandible-plate-${side}`);
    assert.equal(assembly.userData.mirrorjawRole, 'split-tapered-mandible');
    assert.equal(plate.userData.mirrorjawRole, 'tapered-mandible-leaf');
    assert.equal(plate.geometry.name, 'MirrorjawTaperedMandiblePrism');
    assert.ok(plate.geometry.getAttribute('position').count >= 26,
      'each mandible must use a real tapered prism, not a camera-facing card');
  }
  for (const side of ['port', 'starboard']) {
    const loadPath = root.getObjectByName(`mirrorjaw-side-load-path-${side}`);
    assert.ok(loadPath, `Mirrorjaw must expose a ${side} side load path`);
    assert.ok(loadPath.getObjectByName(`mirrorjaw-piston-${side}`));
    assert.ok(loadPath.getObjectByName(`mirrorjaw-piston-rod-${side}`));
    assert.ok(loadPath.getObjectByName(`mirrorjaw-piston-collar-${side}`));
  }
  const mirrorjawMeshes = [];
  root.traverse((node) => {
    if (node.isMesh && node.name.startsWith('mirrorjaw-')) mirrorjawMeshes.push(node);
  });
  assert.equal(mirrorjawMeshes.length, 12,
    'Mirrorjaw presentation must stay a bounded two-jaw/two-actuator/rear-cage assembly');
  assert.ok(new Set(mirrorjawMeshes.map((node) => node.material?.uuid)).size <= 4,
    'Mirrorjaw presentation must use a bounded material set');
  const rearCage = root.getObjectByName('mirrorjaw-rear-reactor-cage');
  const rearRing = root.getObjectByName('mirrorjaw-reactor-cage');
  const rearCore = root.getObjectByName('mirrorjaw-reactor-core');
  assert.ok(rearCage && rearRing && rearCore, 'rear reactor cage must be structurally named');
  assert.equal(rearCage.userData.mirrorjawFacing, 'rear');
  assert.equal(rearRing.userData.mirrorjawFacing, 'rear');
  assert.ok(Math.abs(rearRing.rotation.x) < 1e-9,
    'the reactor ring must face the rear axis instead of presenting a top-facing orange disc');
  assert.ok(rearCage.getObjectByName('mirrorjaw-reactor-rail-port'));
  assert.ok(rearCage.getObjectByName('mirrorjaw-reactor-rail-starboard'));

  const materials = new Map();
  root.traverse((node) => {
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) if (material?.name) materials.set(material.name, material);
  });
  const jaw = materials.get('SF_MirrorjawReflectiveFace');
  const reactor = materials.get('SF_MirrorjawReactor');
  assert.ok(jaw && reactor, 'phase-bearing jaw and reactor materials must survive presentation batching');

  const stableChildren = root.children.length;
  const stableJaw = { roughness: jaw.roughness, emissive: jaw.emissive.getHex() };
  const stableReactor = { intensity: reactor.emissiveIntensity, color: reactor.color.getHex() };
  root.userData.updateRuntimeState(boss);
  assert.equal(root.children.length, stableChildren, 'same-phase updates must not duplicate machinery');
  assert.deepEqual({ roughness: jaw.roughness, emissive: jaw.emissive.getHex() }, stableJaw);
  assert.deepEqual({ intensity: reactor.emissiveIntensity, color: reactor.color.getHex() }, stableReactor);

  boss.data.mirrorjawPhase = 'absorbent_screen';
  root.userData.updateRuntimeState(boss);
  assert.equal(root.userData.mirrorjawVisualPhase, 'absorbent_screen');
  assert.ok(jaw.roughness > 0.8, 'mid-phase jaw must visibly stop reading as reflective');

  boss.data.mirrorjawPhase = 'unmoored_reactor';
  root.userData.updateRuntimeState(boss);
  assert.equal(root.userData.mirrorjawVisualPhase, 'unmoored_reactor');
  assert.ok(reactor.emissiveIntensity > 2 && reactor.emissiveIntensity < 4,
    'final phase must expose a restrained rear reactor instead of an oversized bloom source');
});

test('live authored Mirrorjaw boundaries receive one phase-aware jaw/reactor overlay', () => {
  const boss = makeEnemySpawnSpec(MIRRORJAW_ENEMY_ID, 10, { x: 0, z: 0 });
  const liveFactory = createVisualFactory();
  installVisualOverrides(liveFactory, { directAuthoredMount: true });
  const authoredBoundary = liveFactory.build(boss);
  const overlay = authoredBoundary.getObjectByName('mirrorjaw-foreman-authored-overlay-frame');
  assert.ok(overlay);
  assert.equal(overlay.parent, authoredBoundary,
    'the overlay mounts on the stable boundary rather than a replaceable authored/LOD child');
  assert.equal(overlay.visible, false, 'the overlay does not float alone while authored admission is pending');
  assert.equal(overlay.name, 'mirrorjaw-foreman-authored-overlay-frame');
  assert.ok(Math.abs(overlay.rotation.y - Math.PI / 2) < 1e-9,
    'authored overlay rotates its +Z construction onto gameplay-local +X');
  assert.equal(attachMirrorjawForemanPresentation(authoredBoundary, boss), overlay,
    'repeated authored-swap notifications must not duplicate boss machinery');
  assert.equal(authoredBoundary.children.filter((child) => child === overlay).length, 1);

  authoredBoundary.userData.authoredAssetState = 'authored';
  authoredBoundary.userData.authoredVisualRoot = 'authored-root';
  boss.data.mirrorjawPhase = 'unmoored_reactor';
  authoredBoundary.userData.updateRuntimeState(boss);
  assert.equal(overlay.visible, true, 'the overlay publishes with the authored body');
  assert.equal(authoredBoundary.userData.mirrorjawVisualPhase, 'unmoored_reactor');
  const namedMaterials = [];
  overlay.traverse((node) => {
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) if (material?.name) namedMaterials.push(material);
  });
  assert.ok(namedMaterials.some((material) => (
    material.name === 'SF_MirrorjawReactor'
      && material.emissiveIntensity > 2
      && material.emissiveIntensity < 4
  )), 'the authored-route reactor must expose the final phase without an oversized bloom source');
});

test('Foundry visible body publishes the same half extents as its collision record', () => {
  const piece = RICOCHET_FOUNDRY_LAYOUT.find((row) => row.id === 'bank_west');
  const entity = {
    id: 'foundry-test',
    type: 'station',
    data: {
      arenaSurface: true,
      foundrySurface: { ...piece },
    },
  };
  const root = createVisualFactory().build(entity);
  assert.ok(root);
  assert.deepEqual(root.userData.visualCollisionBounds, {
    halfLength: piece.halfLength,
    halfWidth: piece.halfWidth,
  });
  const body = root.children.find((child) => child.userData && child.userData.collisionBody);
  assert.ok(body);
  body.geometry.computeBoundingBox();
  const box = body.geometry.boundingBox;
  assert.equal(box.max.x - box.min.x, piece.halfLength * 2);
  assert.equal(box.max.z - box.min.z, piece.halfWidth * 2);
  const fullVisual = new Box3().setFromObject(root);
  assert.ok(fullVisual.min.x >= -piece.halfLength - 1e-6
    && fullVisual.max.x <= piece.halfLength + 1e-6
    && fullVisual.min.z >= -piece.halfWidth - 1e-6
    && fullVisual.max.z <= piece.halfWidth + 1e-6,
  'visible clamps, slats, and fixtures must stay inside the authoritative collision footprint');
  assert.ok(root.children.filter((child) => child !== body && child.position.y > piece.height).length >= 3,
    'top-camera armor and warning fixtures sit above the collision body instead of being buried in it');
});

test('explicit Foundry room geometry is admitted into the loading composition', () => {
  const surface = {
    id: 8,
    type: 'station',
    alive: true,
    pos: { x: 250, z: 120 },
    radius: 110,
    data: {
      arenaSurface: true,
      foundrySurface: { id: 'bank_west', kind: 'plate' },
      render: { openingComposition: true },
    },
  };
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    isPlayer: true,
    pos: { x: 400, z: 0 },
    radius: 8,
    data: {},
  };
  const state = {
    mode: 'loading',
    playerId: player.id,
    entities: new Map([[player.id, player], [surface.id, surface]]),
    entityList: [player, surface],
  };
  assert.equal(isEntityRenderRelevant(surface, state), true);
  delete surface.data.render;
  assert.equal(isEntityRenderRelevant(surface, state), false,
    'procedural scenario geometry only widens loading composition by explicit owner request');
});

test('first-picture Foundry geometry jumps an existing bulk mesh backlog without raising the frame budget', () => {
  const oldWorld = [
    { id: 2, type: 'asteroid', alive: true, data: {} },
    { id: 3, type: 'station', alive: true, data: {} },
  ];
  const tutorialBank = {
    id: 9,
    type: 'station',
    alive: true,
    data: { render: { openingComposition: true } },
  };
  const queue = [100, 101, 102, 103];
  const queuedIds = new Set(queue);
  enqueueMissingMeshBuilds(
    [...oldWorld, tutorialBank],
    new Map(),
    queuedIds,
    queue,
    null,
    { priorityInsertAt: 2 },
  );
  assert.deepEqual(queue, [100, 101, tutorialBank.id, 102, 103, 2, 3]);
});

// This is intentionally a compact production-lifecycle run, not a synthetic “wave counter”.
// The real run session is the state writer; survivalRun plans/transitions; survivalWave admits the
// canonical enemy specs and owns the live cohort; weapons emits each shot; combat applies damage
// and the core lifetime sweep publishes the entity:destroyed receipts that clear a wave.
const FOUNDRY_RUN_SEED = 20260830;
const FOUNDRY_BUILD_IDS = Object.freeze([
  'foundry_direct',
  'foundry_bank',
  'foundry_smart_bank',
]);
const RUN_DT = 1 / 60;

function foundryBuild(id) {
  const build = COMBAT_LAB_STARTER_PACKAGES.find((entry) => entry.id === id);
  assert.ok(build, `missing production Combat Lab build ${id}`);
  return build;
}

function buildFittings(build) {
  // The Lab's loadout is production data. Reusing the ships owner keeps slot compatibility and
  // default-derived mount values on the exact same path a launched Lab ship takes.
  return fittingsFromDefaultModules(build.hullId, build.loadout.map((entry) => entry.defId));
}

function makeRunBus() {
  const raw = createBus();
  const events = [];
  return {
    events,
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      events.push({ event, payload });
      raw.emit(event, payload);
    },
    queue(event, payload) {
      events.push({ event, payload });
      raw.queue(event, payload);
    },
    flush: raw.flush.bind(raw),
  };
}

function bootFoundryRun(build, seed = FOUNDRY_RUN_SEED) {
  const state = createGameState(seed);
  state.mode = 'flight';
  const bus = makeRunBus();
  const helpers = {};
  const systems = {
    core: { ...core },
    budget: { ...spawnBudget },
    session: { ...runSession },
    run: { ...survivalRun },
    wave: { ...survivalWave },
    weapons: { ...weapons },
    combat: { ...combat },
  };
  const registry = {
    get(name) {
      return name === 'spawnBudget' ? systems.budget : null;
    },
  };
  const ctx = { state, bus, helpers, registry };
  systems.core.init(ctx);
  systems.budget.init(ctx);
  systems.session.init(ctx);
  systems.run.init(ctx);
  systems.wave.init(ctx);
  systems.weapons.init(ctx);
  systems.combat.init(ctx);
  helpers.spawnBudget.setMax(40);

  const player = helpers.spawnEntity(makeShipEntitySpec(build.hullId, {
    isPlayer: true,
    team: 0,
    pos: { x: 0, z: 0 },
    fittings: buildFittings(build),
  }));
  state.playerId = player.id;
  state.input.fire = true;
  return { state, bus, helpers, systems, player };
}

function stepFoundryRun(harness) {
  harness.systems.core.preStep(RUN_DT, harness.state);
  harness.systems.run.update(RUN_DT, harness.state);
  harness.systems.wave.update(RUN_DT, harness.state);
  harness.systems.core.lifetimeSweep(RUN_DT, harness.state);
}

function advanceTo(harness, predicate, label, limit = 1200) {
  for (let i = 0; i < limit; i++) {
    if (predicate()) return;
    stepFoundryRun(harness);
  }
  assert.fail(`${label}; phase=${harness.state.run?.phase} wave=${harness.state.run?.wave}`);
}

function newestProjectile(harness) {
  const projectiles = harness.state.entityList.filter((entity) => entity?.alive
    && entity.type === 'projectile' && entity.ownerId === harness.player.id);
  return projectiles.at(-1) || null;
}

function fireAt(harness, target, { bank = false, smart = false } = {}) {
  const player = harness.player;
  const mount = player.data.weapons.find((entry) => entry?.defId === 'wpn_pulse_laser_m');
  assert.ok(mount, 'Foundry build must expose its Pulse Laser mount');
  // Lab refills are a sanctioned debug seam; the test isolates the build/room/wave outcome rather
  // than turning the acceptance into a heat-endurance benchmark.
  player.cap = player.capMax;
  mount._heat = 0;
  mount._cooldown = 0;
  harness.state.input.aimAngle = Math.atan2(target.pos.z - player.pos.z, target.pos.x - player.pos.x);
  harness.systems.weapons.update(RUN_DT, harness.state);
  const projectile = newestProjectile(harness);
  assert.ok(projectile, 'weapons owner must emit a live Pulse Laser projectile');

  if (bank) {
    const liveSpec = harness.systems.weapons._attackLive.get(projectile.id)?.spec;
    assert.equal(liveSpec?.trajectory?.bounces, 1, 'fitted build must reach the live bank path');
    if (smart) assert.ok(liveSpec?.trajectory?.afterBounceSteer,
      'fitted build must reach the live Smart Bank path');
    const plate = harness.helpers.spawnEntity({
      type: 'station', team: -1, collides: true, alive: true,
      pos: { x: projectile.pos.x + 12, z: projectile.pos.z },
      radius: 5, hull: 1e9, hullMax: 1e9, shield: 0, shieldMax: 0,
      surfaceMaterial: 'reflective', data: { arenaSurface: true },
    });
    projectile.pos.x = plate.pos.x;
    projectile.pos.z = plate.pos.z;
    const bankHit = {
      targetId: plate.id,
      ownerId: player.id,
      weaponId: projectile.data.weaponId,
      damage: projectile.data.damage,
      damagePacket: projectile.data.damagePacket,
      pos: { ...plate.pos },
      normal: { x: -1, z: 0 },
    };
    harness.bus.emit('projectile:hit', bankHit);
    assert.equal(projectile.alive, true, 'a real reflected hit continues the same projectile body');
    assert.equal(bankHit.hasBounced, true,
      'the bank receipt remains on the causal hit passed to combat');
    plate.alive = false;
  }

  projectile.pos.x = target.pos.x;
  projectile.pos.z = target.pos.z;
  harness.bus.emit('projectile:hit', {
    targetId: target.id,
    ownerId: player.id,
    weaponId: projectile.data.weaponId,
    damage: projectile.data.damage,
    damagePacket: projectile.data.damagePacket,
    pos: { ...target.pos },
  });
  projectile.alive = false;
}

function killCohortWithBuild(harness, build) {
  const targets = harness.state.entityList.filter((entity) => entity?.alive
    && entity.data?.runCohort === 'survival' && entity.data.runWave === harness.state.run.wave);
  assert.ok(targets.length > 0, `wave ${harness.state.run.wave} must have real materialized hostiles`);
  const bank = build.id !== 'foundry_direct';
  const smart = build.id === 'foundry_smart_bank';
  for (const target of targets) {
    let shots = 0;
    while (target.alive) {
      fireAt(harness, target, { bank, smart });
      harness.systems.core.lifetimeSweep(RUN_DT, harness.state);
      // Mirrorjaw is the production wave-10 boss (4,488 hull plus layered defense), so its
      // deterministic perfect-hit lab harness legitimately needs far more than a light wave.
      assert.ok(++shots < 1800, `Pulse Laser could not resolve ${target.data?.lootTableId || target.id}`);
    }
  }
}

function completeFoundryBlock(build, seed = FOUNDRY_RUN_SEED) {
  const h = bootFoundryRun(build, seed);
  try {
    h.bus.emit('run:beginRequested', {
      kind: 'survival', ruleset: 'scored', seed, arenaId: RICOCHET_FOUNDRY_ARENA_ID,
    });
    h.bus.emit('run:loadoutReady', {});
    const cleared = [];
    for (let wave = 1; wave <= 10; wave++) {
      advanceTo(h, () => h.state.run.phase === 'active' && h.state.run.wave === wave,
        `wave ${wave} never became active`);
      const plan = planWave({ seed, arenaId: RICOCHET_FOUNDRY_ARENA_ID, wave });
      assert.equal(plan.ok, undefined, `wave ${wave} must use the production planner`);
      const plannedBatches = plan.schedule.length;
      advanceTo(h,
        () => h.bus.events.filter((entry) => entry.event === 'run:waveMaterialized'
          && entry.payload.wave === wave).length === plannedBatches,
        `wave ${wave} did not materialize its full production schedule`,
      );
      killCohortWithBuild(h, build);
      advanceTo(h,
        () => h.bus.events.some((entry) => entry.event === 'run:waveCleared'
          && entry.payload.wave === wave),
        `wave ${wave} never cleared from real entity destruction`,
      );
      cleared.push(wave);
      advanceTo(h,
        () => h.state.run.phase === 'draft' || h.state.run.phase === 'refit' || h.state.run.phase === 'victory',
        `wave ${wave} never settled through the production run owner`,
      );
      if (wave < 10 && h.state.run.phase === 'draft') h.bus.emit('run:draftResolved', {});
      if (wave < 10 && h.state.run.phase === 'refit') {
        h.bus.emit('run:refitClosed', {});
      }
    }
    // Survival is a thirty-wave arc. The closure contract asks for its first shared ten-wave
    // block, whose production completion boundary is the refit that follows wave ten.
    assert.equal(h.state.run.phase, 'refit');
    return {
      cleared,
      completionBoundary: h.state.run.phase,
      wave: h.state.run.wave,
      plans: h.bus.events.filter((entry) => entry.event === 'run:wavePlanned').map((entry) => entry.payload.plan.id),
    };
  } finally {
    h.systems.combat.destroy?.();
    h.systems.weapons.destroy?.();
    h.systems.wave.destroy?.();
    h.systems.run.destroy?.();
    h.systems.session.destroy?.();
    h.systems.budget.destroy?.();
    h.systems.core.destroy?.();
  }
}

test('direct, bank, and smart-bank production Pulse Laser builds deterministically clear the same Foundry ten-wave block', () => {
  const outcomes = FOUNDRY_BUILD_IDS.map((id) => {
    const build = foundryBuild(id);
    return completeFoundryBlock(build);
  });
  for (const outcome of outcomes) {
    assert.deepEqual(outcome.cleared, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(outcome.wave, 10);
    assert.equal(outcome.completionBoundary, 'refit');
  }
  assert.deepEqual(outcomes[1].plans, outcomes[0].plans);
  assert.deepEqual(outcomes[2].plans, outcomes[0].plans);
});

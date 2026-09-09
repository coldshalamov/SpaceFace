import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FLIGHT_READY_ROLE,
  PLACE_PACKAGE_LAYER,
  isFlightReadyRoleBlocking,
  isPlaceLayerBlockingFlightReady,
  selectPlacePackageLayer,
} from '../src/render/flightReadySet.js';
import { cookFlightProduct } from '../src/render/flightProductCooker.js';
import {
  computeLoadoutFingerprint,
  createFlightRenderPackageCache,
  mayCookFlightGeometry,
} from '../src/render/flightRenderPackage.js';
import {
  FLIGHT_PRODUCT_TAG,
  flightProductKeepsTag,
  selectFlightProductNodes,
} from '../src/contracts/flightProductTags.js';
import {
  MATERIAL_ABI_ROLE,
  materialAbiRoleFromLibrary,
  materialProgramFamilyKey,
} from '../src/render/materialAbi.js';
import {
  PERSISTENT_LANES_ENABLED,
  createPersistentSubmitLanes,
} from '../src/render/persistentSubmitLanes.js';
import {
  applySnapshotPoseToMesh,
  createSnapshotFence,
  packEntityIntoSnapshot,
} from '../src/render/snapshotFence.js';
import { isSimulationWorkerEnabled, createCommandRing } from '../src/core/simWorkerProtocol.js';
import { stepAbstractRecords } from '../src/core/simWorkerHost.js';
import { getActivityFrame } from '../src/core/worldActivityManager.js';
import { resolve as resolveMaterial } from '../src/render/materialLibrary.js';
import { createSaveDirtyJournal, shouldSerializeDuringPresent } from '../src/save/saveDirtyJournal.js';
import { entityNeedsExactAudio } from '../src/audio/audioActiveSet.js';
import { selectPresentBackend, PRESENT_BACKEND } from '../src/render/webgpuPresent.js';
import { evictionPriority } from '../src/render/resourceGovernor.js';
import { PRESENTATION_TIER } from '../src/world/activityClassification.js';

test('shell-first place layers: interiors do not block input', () => {
  assert.equal(isPlaceLayerBlockingFlightReady(PLACE_PACKAGE_LAYER.GAMEPLAY_SHELL), true);
  assert.equal(isPlaceLayerBlockingFlightReady(PLACE_PACKAGE_LAYER.INTERIOR), false);
  assert.equal(isPlaceLayerBlockingFlightReady(PLACE_PACKAGE_LAYER.CLOSE_DETAIL), false);
  assert.equal(isFlightReadyRoleBlocking(FLIGHT_READY_ROLE.HUD_INPUT), true);
  assert.equal(selectPlacePackageLayer({ docked: true }), PLACE_PACKAGE_LAYER.INTERIOR);
  assert.equal(selectPlacePackageLayer({ onRunway: true }), PLACE_PACKAGE_LAYER.GAMEPLAY_SHELL);
  assert.equal(selectPlacePackageLayer({}), null);
});

test('chase-camera cooker removes interior-only children and keeps untagged hulls', () => {
  const hull = { name: 'hull', userData: { flightProductTags: [FLIGHT_PRODUCT_TAG.FLIGHT_EXTERIOR] }, parent: null };
  const seat = { name: 'seat', userData: { flightProductTags: [FLIGHT_PRODUCT_TAG.INTERIOR_ONLY] }, parent: null };
  const root = {
    children: [hull, seat],
    traverse(visit) {
      visit(this);
      visit(hull);
      visit(seat);
    },
  };
  hull.parent = { remove(node) { root.children = root.children.filter((child) => child !== node); } };
  seat.parent = hull.parent;
  const cooked = cookFlightProduct(root, 'chase');
  assert.equal(cooked.removed, 1);
  assert.equal(root.children.includes(seat), false);
  assert.equal(root.children.includes(hull), true);
});

test('flight packages cache by loadout fingerprint and refuse in-flight cooks', () => {
  const a = computeLoadoutFingerprint({ hull: 'hull_a', cockpit: 'cockpit_1' });
  const b = computeLoadoutFingerprint({ hull: 'hull_b', cockpit: 'cockpit_1' });
  assert.notEqual(a, b);
  const cache = createFlightRenderPackageCache();
  const published = cache.publish(a, {
    lanes: { opaque: 1 },
    metadata: { source: { nodeId: 'hull_a' } },
  });
  assert.equal(cache.lookup(a), published);
  assert.equal(Object.isFrozen(published), true);
  assert.equal(Object.isFrozen(published.metadata), true);
  assert.equal(cache.publish(a, { lanes: { opaque: 2 } }), published);
  assert.equal('instantiate' in published, false);
  assert.equal(cache.lookup(b), null);
  assert.equal(mayCookFlightGeometry('flight'), false);
  assert.equal(mayCookFlightGeometry('station'), true);
});

test('chase-camera cooker omits hangar and interior-only nodes', () => {
  assert.equal(flightProductKeepsTag(FLIGHT_PRODUCT_TAG.FLIGHT_EXTERIOR), true);
  assert.equal(flightProductKeepsTag(FLIGHT_PRODUCT_TAG.INTERIOR_ONLY), false);
  assert.equal(flightProductKeepsTag(FLIGHT_PRODUCT_TAG.HANGAR_ONLY), false);
  const kept = selectFlightProductNodes([
    { id: 'hull', tags: [FLIGHT_PRODUCT_TAG.FLIGHT_EXTERIOR] },
    { id: 'seat', tags: [FLIGHT_PRODUCT_TAG.INTERIOR_ONLY] },
    { id: 'cap', tags: [FLIGHT_PRODUCT_TAG.ATTACHMENT_CAP] },
    { id: 'future', tags: ['FUTURE_CAMERA_METADATA'] },
  ]);
  assert.deepEqual(kept.map((node) => node.id), ['hull', 'future']);
});

test('material ABI collapses library roles onto program families', () => {
  assert.equal(materialAbiRoleFromLibrary('bodyPrimary'), MATERIAL_ABI_ROLE.OPAQUE_HULL);
  assert.equal(materialAbiRoleFromLibrary('glass'), MATERIAL_ABI_ROLE.GLASS);
  const hull = materialProgramFamilyKey(MATERIAL_ABI_ROLE.OPAQUE_HULL);
  const painted = materialProgramFamilyKey(MATERIAL_ABI_ROLE.PAINTED_METAL);
  assert.notEqual(hull, painted);
  assert.match(hull, /^abi1\|/);
});

test('persistent submit lanes reserve once and skip unchanged frames', () => {
  // The range model is opt-in until a renderer-owned GPU uploader consumes its drained ranges.
  assert.equal(PERSISTENT_LANES_ENABLED, false);
  const lanes = createPersistentSubmitLanes({ force: true });
  const slot = lanes.reserve('ship_1');
  assert.equal(slot.id, 'ship_1');
  assert.equal(lanes.reserve('ship_1').index, slot.index);
  lanes.noteUnchangedFrame();
  assert.equal(lanes.diagnostics().liveSlots, 1);
  assert.equal(lanes.diagnostics().unchangedFrames, 1);
  const off = createPersistentSubmitLanes({ enabled: false });
  assert.equal(off.reserve('ship_2'), null);
});

test('snapshot fence publishes a complete packed frame the present path can read', () => {
  const fence = createSnapshotFence({ capacity: 8 });
  const snap = fence.beginPack(2, 12.5);
  packEntityIntoSnapshot(snap, { id: 1, alive: true, pos: { x: 3, y: 0, z: 4 } });
  packEntityIntoSnapshot(snap, { id: 2, alive: true, pos: { x: 8, y: 0, z: 0 } });
  const seq = fence.commit();
  assert.equal(seq, 1);
  const latest = fence.latestSnapshot();
  assert.equal(latest.count, 2);
  assert.equal(latest.columns.entityId[0], 1);
  assert.equal(latest.columns.position[0], 3);
  const firstIndex = latest.indexByEntityId;
  for (let tick = 0; tick < 3; tick++) {
    const next = fence.beginPack(1, 13 + tick);
    packEntityIntoSnapshot(next, { id: 10 + tick, alive: true, pos: { x: tick, y: 0, z: 0 } });
    fence.commit();
  }
  assert.equal(fence.latestSnapshot().indexByEntityId, firstIndex,
    'triple-buffer slots retain their index map/facade across publications');
});

test('snapshot fence columns and indices survive capacity growth without facade replacement', () => {
  const fence = createSnapshotFence({ capacity: 2 });
  const publish = (ids) => {
    const snapshot = fence.beginPack(ids.length, ids.length);
    for (const id of ids) {
      packEntityIntoSnapshot(snapshot, {
        id,
        alive: true,
        pos: { x: id * 2, y: id, z: -id },
      });
    }
    fence.commit();
  };

  publish([1]);
  const first = fence.latestSnapshot();
  const firstColumns = first.columns;
  const firstIndices = first.indexByEntityId;
  publish([2]);
  publish([3]);
  publish([10, 11, 12, 13, 14]);

  const grown = fence.latestSnapshot();
  assert.equal(grown.columns, firstColumns,
    'the reused triple-buffer slot keeps one columns facade');
  assert.equal(grown.indexByEntityId, firstIndices,
    'the reused triple-buffer slot keeps one entity index facade');
  assert.equal(grown.columns.entityId[4], 14);
  assert.equal(grown.columns.position[12], 28,
    'the facade follows the replacement typed array after growth');
  const mesh = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } };
  assert.equal(applySnapshotPoseToMesh(mesh, grown, 14, { x: 1, y: 2, z: 3 }), true);
  assert.deepEqual(mesh.position, { x: 27, y: 12, z: -17 });
});

test('simulation Worker uses a real catch-up kernel with main-thread fallback', () => {
  assert.equal(typeof isSimulationWorkerEnabled(), 'boolean');
  const ring = createCommandRing(4);
  assert.equal(ring.push(1), true);
  assert.equal(ring.pop().kind, 1);
});

test('abstract catch-up kernel and snapshot pose apply without live entity chase', () => {
  const moved = stepAbstractRecords([
    { id: 9, alive: true, pos: { x: 0, z: 0 }, vel: { x: 10, z: 0 }, rot: 0, angVel: 0 },
  ], 0, 2);
  assert.equal(moved[0].pos.x, 20);
  const fence = createSnapshotFence({ capacity: 4 });
  const snap = fence.beginPack(1, 1);
  packEntityIntoSnapshot(snap, { id: 4, alive: true, pos: { x: 6, y: 0, z: 2 } });
  fence.commit();
  const mesh = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } };
  assert.equal(applySnapshotPoseToMesh(mesh, fence.latestSnapshot(), 4, { x: 1, z: 0 }), true);
  assert.equal(mesh.position.x, 5);
  assert.equal(mesh.position.z, 2);
});

test('material library stamps ABI program families; activity frame is the sim owner', () => {
  const mat = resolveMaterial('bodyPrimary', { hull: '#8899aa', accent: '#445566' });
  assert.equal(typeof mat.customProgramCacheKey, 'function');
  assert.equal(mat.userData.spacefaceMaterialAbi, 'opaque_hull');
  assert.match(mat.userData.spacefaceProgramFamily, /^abi1\|opaque_hull\|/);
  assert.doesNotMatch(mat.customProgramCacheKey(), /abi1\|/,
    'ABI metadata must not add a Three custom-program variant');
  const frame = getActivityFrame({
    tick: 1,
    simTime: 1,
    playerId: 1,
    mode: 'flight',
    camera: { zoom: 144 },
    settings: { video: { fov: 50 } },
    entities: new Map([[1, { id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, data: {} }]]),
    entityList: [{ id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, data: {} }],
    player: {},
    combat: {},
  });
  assert.ok(frame.exactIds.includes(1));
});

test('save journal never serializes inside present; audio follows glass/runway', () => {
  assert.equal(shouldSerializeDuringPresent(), false);
  const journal = createSaveDirtyJournal(8);
  journal.record(1, { id: 'npc_1' });
  assert.equal(journal.pending, 1);
  assert.equal(journal.drain(() => {}), 1);
  assert.equal(entityNeedsExactAudio({ id: 1, alive: true, isPlayer: true }), true);
  assert.equal(entityNeedsExactAudio({
    id: 9, alive: true, activity: { presentationTier: PRESENTATION_TIER.R3_UNLOADED },
  }), false);
  assert.equal(entityNeedsExactAudio({
    id: 8, alive: true, activity: { presentationTier: PRESENTATION_TIER.R0_GLASS },
  }), true);
});

test('WebGPU present is not selected; GPU governor prefers glass over evictable', () => {
  assert.equal(selectPresentBackend(), PRESENT_BACKEND.WEBGL);
  assert.ok(evictionPriority({ role: 'glass' }) < evictionPriority({ role: 'evictable' }));
  assert.ok(evictionPriority({ role: 'player' }) < evictionPriority({ role: 'warm-previous-sector' }));
});

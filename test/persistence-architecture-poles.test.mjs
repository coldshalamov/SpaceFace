import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FLIGHT_READY_ROLE,
  PLACE_PACKAGE_LAYER,
  isFlightReadyRoleBlocking,
  isPlaceLayerBlockingFlightReady,
} from '../src/render/flightReadySet.js';
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
import { createSnapshotFence, packEntityIntoSnapshot } from '../src/render/snapshotFence.js';
import { isSimulationWorkerEnabled, createCommandRing } from '../src/core/simWorkerProtocol.js';
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
});

test('flight packages cache by loadout fingerprint and refuse in-flight cooks', () => {
  const a = computeLoadoutFingerprint({ hull: 'hull_a', cockpit: 'cockpit_1' });
  const b = computeLoadoutFingerprint({ hull: 'hull_b', cockpit: 'cockpit_1' });
  assert.notEqual(a, b);
  const cache = createFlightRenderPackageCache();
  cache.publish(a, { lanes: { opaque: 1 } });
  assert.equal(cache.lookup(a).fingerprint, a);
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
  ]);
  assert.deepEqual(kept.map((node) => node.id), ['hull']);
});

test('material ABI collapses library roles onto program families', () => {
  assert.equal(materialAbiRoleFromLibrary('bodyPrimary'), MATERIAL_ABI_ROLE.OPAQUE_HULL);
  assert.equal(materialAbiRoleFromLibrary('glass'), MATERIAL_ABI_ROLE.GLASS);
  const hull = materialProgramFamilyKey(MATERIAL_ABI_ROLE.OPAQUE_HULL);
  const painted = materialProgramFamilyKey(MATERIAL_ABI_ROLE.PAINTED_METAL);
  assert.notEqual(hull, painted);
  assert.match(hull, /^abi1\|/);
});

test('persistent submit lanes stay off in production and do not plan every frame', () => {
  assert.equal(PERSISTENT_LANES_ENABLED, false);
  const off = createPersistentSubmitLanes();
  assert.equal(off.reserve('ship_1'), null);
  assert.equal(off.diagnostics().liveSlots, 0);
  const on = createPersistentSubmitLanes({ force: true });
  on.reserve('ship_1');
  on.noteUnchangedFrame();
  assert.equal(on.diagnostics().liveSlots, 1);
  assert.equal(on.diagnostics().unchangedFrames, 1);
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
});

test('simulation Worker stays disabled until the fence spike passes', () => {
  assert.equal(isSimulationWorkerEnabled(), false);
  const ring = createCommandRing(4);
  assert.equal(ring.push(1), true);
  assert.equal(ring.pop().kind, 1);
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
